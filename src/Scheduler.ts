/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Conference } from "./Conference";
import AwaitLock from "await-lock";
import { logMessage } from "./LogProxy";
import { LogLevel, LogService } from "matrix-bot-sdk";
import { Scoreboard } from "./Scoreboard";
import { ITalk } from "./models/schedule";
import { CheckInMap } from "./CheckInMap";
import { ConferenceMatrixClient } from "./ConferenceMatrixClient";
import { IConfig } from "./config";
import { Gauge } from "prom-client";

const schedulerLastRunGauge = new Gauge({ name: "confbot_scheduler_last_run", help: "The last time the Scheduler ran its tasks."});

export enum ScheduledTaskType {
    TalkStart = "talk_start",
    TalkEnd = "talk_end",
    TalkQA = "talk_q&a",
    TalkQA5M = "talk_q&a_5m",
    TalkEnd5M = "talk_end_5m",
}

const KEEP_LAST_TASKS = 200;
const ACD_SCHEDULER = "org.matrix.confbot.scheduler_info";

// Run tasks often. Note that this also controls the lookahead timing and must be smaller than
// the config value. Given this is hardcoded, it should be somewhat low.
const RUN_INTERVAL_MS = 8000;

interface ISchedulerAccountData {
    completed: string[];
    inAuditoriums: string[];
}

interface ITask {
    id: string;
    type: ScheduledTaskType;
    talk: ITalk;
}

function makeTaskId(type: ScheduledTaskType, talk: ITalk): string {
    return `${type}::${talk.auditoriumId}::${talk.id}`;
}

/**
 * Given a task, returns the time at which the task is supposed to start.
 *
 * Returns null if the task should not run.
 */
export function getStartTime(task: ITask): number | null {
    switch (task.type) {
        case ScheduledTaskType.TalkStart:
            return task.talk.startTime;
        case ScheduledTaskType.TalkEnd5M:
            return task.talk.endTime - (5 * 60 * 1000);
        case ScheduledTaskType.TalkEnd:
            return task.talk.endTime;
        case ScheduledTaskType.TalkQA5M:
            if (task.talk.qa_startTime === null) return null;
            return task.talk.qa_startTime - (5 * 60 * 1000);
        case ScheduledTaskType.TalkQA:
            if (task.talk.qa_startTime === null) return null;
            return task.talk.qa_startTime;
        default:
            throw new Error(`Unknown task type for getStartTime(): ${task.type}`);
    }
}

export function sortTasks(tasks: ITask[]): ITask[] {
    const implicitTaskOrder = [
        // Unconventionally, we order this backwards so the messages show up as
        // concluding a talk before starting a new one.
        ScheduledTaskType.TalkEnd5M,
        ScheduledTaskType.TalkEnd,
        ScheduledTaskType.TalkQA5M,
        ScheduledTaskType.TalkQA,
        ScheduledTaskType.TalkStart,
    ];
    tasks.sort((a, b) => {
        // start times can't be null here because the task has already been checked to have a start time
        const diff = getStartTime(a)! - getStartTime(b)!;
        if (diff === 0) {
            const ai = implicitTaskOrder.indexOf(a.type);
            const bi = implicitTaskOrder.indexOf(b.type);
            return ai - bi;
        }
        return diff;
    });
    return tasks;
}

export class Scheduler {
    private completedIds: string[] = [];
    private inAuditoriums: string[] = [];
    private pending: { [taskId: string]: ITask } = {};
    private lock = new AwaitLock();
    private nextTaskTimeout?: NodeJS.Timeout;

    constructor(private readonly client: ConferenceMatrixClient,
        private readonly conference: Conference,
        private readonly scoreboard: Scoreboard,
        private readonly checkins: CheckInMap,
        private readonly config: IConfig) {
    }

    public async prepare() {
        const schedulerData = await this.client.getSafeAccountData<ISchedulerAccountData>(ACD_SCHEDULER, {
            completed: [],
            inAuditoriums: [],
        });
        this.completedIds.push(...(schedulerData?.completed || []));
        this.inAuditoriums.push(...(schedulerData?.inAuditoriums || []));

        if (this.inAuditoriums.length) {
            await this.client.sendNotice(this.config.managementRoom, `Running schedule in auditoriums: ${this.inAuditoriums.join(', ')}`);
        }

        await this.runTasks();
    }

    public async reset() {
        await this.lock.acquireAsync();
        try {
            this.completedIds = [];
        } finally {
            this.lock.release();
        }
    }

    public inspect(): ITask[] {
        return Object.values(this.pending);
    }

    /**
     * Return a list of completed task IDs.
     */
    public inspectCompleted(): string[] {
        // slice() is just to clone the array to prevent mutations
        return this.completedIds.slice();
    }

    private async persistProgress() {
        const completedIds = this.completedIds.slice().reverse().slice(0, KEEP_LAST_TASKS).reverse();
        await this.client.setAccountData(ACD_SCHEDULER, {
            completed: completedIds,
            inAuditoriums: this.inAuditoriums,
        });
    }

    private async runTasks() {
        try {
            const now = Date.now();
            schedulerLastRunGauge.set(now);
            await this.lock.acquireAsync();
            LogService.info("Scheduler", "Scheduling tasks");
            try {
                const minVar = this.config.conference.lookaheadMinutes;
                try {
                    // Refresh upcoming parts of our schedule to ensure it's really up to date.
                    // Rationale: Sometimes schedules get changed at short notice, so we try our best to accommodate that.
                    // Rationale for adding 1 minute: so we don't cut it too close to the wire; whilst processing the refresh,
                    //     time may slip forward.
                    await this.conference.backend.refreshShortTerm?.((minVar + 1) * 60);
                } catch (e) {
                    LogService.error("Scheduler", `Failed short-term schedule refresh: ${e.message ?? e}\n${e.stack ?? '?'}`);
                }

                const upcomingTalks = await this.conference.getUpcomingTalkStarts(minVar, minVar);
                const upcomingQA = await this.conference.getUpcomingQAStarts(minVar, minVar);
                const upcomingEnds = await this.conference.getUpcomingTalkEnds(minVar, minVar);

                const scheduleAll = (talks: ITalk[], type: ScheduledTaskType) => {
                    talks.filter(e => !this.completedIds.includes(makeTaskId(type, e)))
                        .forEach(e => this.tryScheduleTask(type, e));

                   if (type === ScheduledTaskType.TalkQA) {
                        talks.filter(e => !this.completedIds.includes(makeTaskId(ScheduledTaskType.TalkQA5M, e)))
                            .forEach(e => this.tryScheduleTask(ScheduledTaskType.TalkQA5M, e));
                    } else if (type === ScheduledTaskType.TalkEnd) {
                        talks.filter(e => !this.completedIds.includes(makeTaskId(ScheduledTaskType.TalkEnd5M, e)))
                            .forEach(e => this.tryScheduleTask(ScheduledTaskType.TalkEnd5M, e));
                    }
                };

                scheduleAll(upcomingTalks, ScheduledTaskType.TalkStart);
                scheduleAll(upcomingQA, ScheduledTaskType.TalkQA);
                scheduleAll(upcomingEnds, ScheduledTaskType.TalkEnd);
            } catch (e) {
                LogService.error("Scheduler", e);
                try {
                    await logMessage(LogLevel.ERROR, "Scheduler", `Error scheduling tasks: ${e?.message || 'unknown error'}`, this.client);
                } catch (e) {
                    LogService.error("Scheduler", e);
                }
            } finally {
                this.lock.release();
            }
            await this.lock.acquireAsync();
            LogService.info("Scheduler", "Running tasks");
            try {
                const taskIds = Object.keys(this.pending);
                const toExec: ITask[] = [];
                for (const taskId of taskIds) {
                    if (this.completedIds.includes(taskId)) {
                        delete this.pending[taskId];
                        continue;
                    }
                    const task = this.pending[taskId];
                    const startTime = getStartTime(task);
                    if (startTime === null) {
                        // likely unreachable
                        continue;
                    }
                    if (startTime > now) continue;
                    toExec.push(task);
                }
                sortTasks(toExec);
                let didAction = false;
                for (const task of toExec) {
                    const taskId = task.id;
                    LogService.info("Scheduler", `Running task: ${taskId}`);
                    try {
                        await this._execute(task);
                    } catch (e) {
                        LogService.error("Scheduler", e);
                        await logMessage(LogLevel.ERROR, "Scheduler", `Error running task ${taskId}: ${e?.message || 'unknown error'}`, this.client);
                    }
                    delete this.pending[taskId];
                    this.completedIds.push(taskId);
                    didAction = true;
                }
                if (didAction) await this.persistProgress();
            } catch (e) {
                LogService.error("Scheduler", e);
                try {
                    await logMessage(LogLevel.ERROR, "Scheduler", `Error running tasks: ${e?.message || 'unknown error'}`, this.client);
                } catch (e) {
                    LogService.error("Scheduler", e);
                }
            } finally {
                this.lock.release();
            }
            LogService.info("Scheduler", "Done running tasks");
        } catch (e) {
            LogService.error("Scheduler", e);
        }
        this.nextTaskTimeout = setTimeout(() => this.runTasks(), RUN_INTERVAL_MS);
    }

    /**
     * Executes the specified task for debugging.
     *
     * Does not mark the task as completed, so that it can be executed more than once.
     * @param taskId The ID of the task to be executed.
     * @throws {Error} The specified task does not exist or is no longer pending.
     */
    public async execute(taskId: string) {
        await this.lock.acquireAsync();
        try {
            const task = this.pending[taskId];
            if (!task) {
                throw Error(`Task does not exist or is no longer pending: ${taskId}`);
            }
            await this._execute(task);
        } finally {
            this.lock.release();
        }
    }

    private async _execute(task: ITask) {
        const confAud = this.conference.getAuditorium(task.talk.auditoriumId);
        const confAudBackstage = this.conference.getAuditoriumBackstage(task.talk.auditoriumId);

        if (!confAud || !confAudBackstage) {
            // probably a special interest room
            LogService.warn("Scheduler", `Skipping task ${task.id} - Cannot find auditorium or auditorium backstage room`);
            return;
        }

        if (task.type === ScheduledTaskType.TalkStart) {
            await this.scoreboard.resetScoreboard(confAud.roomId);
            if (!task.talk.prerecorded) {
                await this.client.sendHtmlText(
                    confAud.roomId,
                    `<h3>${task.talk.title}</h3>` +
                    (task.talk.qa_startTime !== null ? `Ask your questions here and they'll try to answer them! ` +
                    `The questions with the most 👍 votes are most visible to the speaker.` : ''),
                );
                return;
            }
            await this.client.sendHtmlText(
                confAud.roomId,
                `<h3>Up next: ${task.talk.title}</h3>` +
                (task.talk.qa_startTime !== null ? `<p>During the talk, you can ask questions here for the Q&A at the end. ` +
                `The questions with the most 👍 votes are most visible to the speaker.</p>` : ''),
            );
        } else if (task.type === ScheduledTaskType.TalkQA) {
            if (!task.talk.prerecorded) return;
            await this.client.sendHtmlText(
                confAud.roomId,
                `<h3>Q&A is starting shortly</h3>` +
                `<p>Ask questions in this room for the speakers - the questions with the most 👍 votes are most visible to the speaker.</p>`,
            );
        } else if (task.type === ScheduledTaskType.TalkEnd) {
            await this.client.sendHtmlText(confAud.roomId, `<h3>The talk will end shortly</h3>`);
        } else if (task.type === ScheduledTaskType.TalkQA5M) {
            if (getStartTime(task)! < task.talk.startTime) {
                // Don't do anything if this talk hasn't started yet, otherwise things get confusing
                // for the previous talk. The Q&A scoreboard will not show a countdown for this
                // talk, which is unfortunate. However the talk widget next to it will still show
                // a correct countdown.
                return;
            }

            if (!task.talk.prerecorded) return;
            await this.scoreboard.showQACountdown(confAud.roomId, task.talk.qa_startTime!);
        } else if (task.type === ScheduledTaskType.TalkEnd5M) {
            await this.client.sendHtmlText(confAud.roomId, `<h3>This talk ends in about 5 minutes</h3>` + (task.talk.qa_startTime !== null ? `<p>Ask questions here for the speakers!</p>`: ''));
        } else {
            await logMessage(LogLevel.WARN, "Scheduler", `Unknown task type for execute(): ${task.type}`, this.client);
        }
    }

    public async tryScheduleTask(type: ScheduledTaskType, talk: ITalk) {
        const id = makeTaskId(type, talk);
        const existingTask = this.pending[id];
        if (existingTask) return;

        await this.lock.acquireAsync();
        try {
            const isCompleted = this.completedIds.includes(id);
            if (!isCompleted && this.isWatchingAuditorium(talk.auditoriumId)) {
                this.pending[id] = {id, type, talk};
                LogService.debug("Scheduler", `Task ${id} scheduled`);
            } else {
                if (isCompleted) LogService.debug("Scheduler", `Ignoring re-scheduled completed task: ${id}`);
                else LogService.warn("Scheduler", `Ignoring task in unwatched auditorium: ${id}`);
            }
        } finally {
            this.lock.release();
        }
    }

    public async addAuditorium(audId: string) {
        this.inAuditoriums.push(audId);

        await this.lock.acquireAsync();
        try {
            await this.persistProgress();
        } finally {
            this.lock.release();
        }
    }

    public isWatchingAuditorium(audId: string) {
        return this.inAuditoriums.includes(audId) || this.inAuditoriums.includes("all");
    }

    public async stop() {
        await this.lock.acquireAsync();
        LogService.warn("Scheduler", "Stopping scheduler...");
        if (this.nextTaskTimeout) {
            clearTimeout(this.nextTaskTimeout);
        }
        try {
            this.pending = {};
            this.inAuditoriums = [];
            await this.persistProgress();
        } finally {
            this.lock.release();
        }
    }
}
