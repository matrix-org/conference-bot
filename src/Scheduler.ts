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
import { IDbTalk } from "./db/DbTalk";
import AwaitLock from "await-lock";
import { logMessage } from "./LogProxy";
import config from "./config";
import { LogLevel, LogService, MatrixClient, MentionPill } from "matrix-bot-sdk";
import { makeRoomPublic } from "./utils";
import { Scoreboard } from "./Scoreboard";
import { LiveWidget } from "./models/LiveWidget";
import { ResolvedPersonIdentifier, resolveIdentifiers } from "./invites";
import { Role } from "./db/DbPerson";

export enum ScheduledTaskType {
    TalkStart = "talk_start",
    TalkEnd = "talk_end",
    TalkQA = "talk_q&a",
    TalkStart5M = "talk_start_5m",
    TalkStart1H = "talk_start_1h",
    TalkQA5M = "talk_q&a_5m",
    TalkEnd5M = "talk_end_5m",
    TalkEnd1M = "talk_end_1m",

    TalkCheckin45M = "talk_checkin_45m",
    TalkCheckin30M = "talk_checkin_30m",
    TalkCheckin15M = "talk_checkin_15m",
}

const SKIPPABLE_TASKS = [
    ScheduledTaskType.TalkStart1H,
    ScheduledTaskType.TalkCheckin45M,
    ScheduledTaskType.TalkCheckin30M,
];

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
    talk: IDbTalk;
}

function makeTaskId(type: ScheduledTaskType, talk: IDbTalk): string {
    return `${type}::${talk.event_id}::${talk.conference_room}`;
}

export function getStartTime(task: ITask): number {
    switch (task.type) {
        case ScheduledTaskType.TalkStart1H:
            return task.talk.start_datetime - (60 * 60 * 1000);
        case ScheduledTaskType.TalkStart5M:
            return task.talk.start_datetime - (5 * 60 * 1000);
        case ScheduledTaskType.TalkCheckin45M:
            return task.talk.start_datetime - (45 * 60 * 1000);
        case ScheduledTaskType.TalkCheckin30M:
            return task.talk.start_datetime - (30 * 60 * 1000);
        case ScheduledTaskType.TalkCheckin15M:
            return task.talk.start_datetime - (15 * 60 * 1000);
        case ScheduledTaskType.TalkStart:
            return task.talk.start_datetime;
        case ScheduledTaskType.TalkEnd5M:
            return task.talk.end_datetime - (5 * 60 * 1000);
        case ScheduledTaskType.TalkEnd1M:
            return task.talk.end_datetime - (1 * 60 * 1000);
        case ScheduledTaskType.TalkEnd:
            return task.talk.end_datetime;
        case ScheduledTaskType.TalkQA5M:
            return (task.talk.qa_start_datetime + (config.conference.database.scheduleBufferSeconds * 1000)) - (5 * 60 * 1000);
        case ScheduledTaskType.TalkQA:
            return task.talk.qa_start_datetime + (config.conference.database.scheduleBufferSeconds * 1000);
        default:
            throw new Error("Unknown task type for getStartTime(): " + task.type);
    }
}

export function sortTasks(tasks: ITask[]): ITask[] {
    const implicitTaskOrder = [
        // Unconventionally, we order this backwards so the messages show up as
        // concluding a talk before starting a new one.
        ScheduledTaskType.TalkEnd5M,
        ScheduledTaskType.TalkEnd1M,
        ScheduledTaskType.TalkEnd,
        ScheduledTaskType.TalkQA5M,
        ScheduledTaskType.TalkQA,
        ScheduledTaskType.TalkStart1H,
        ScheduledTaskType.TalkCheckin45M,
        ScheduledTaskType.TalkCheckin30M,
        ScheduledTaskType.TalkCheckin15M,
        ScheduledTaskType.TalkStart5M,
        ScheduledTaskType.TalkStart,
    ];
    tasks.sort((a, b) => {
        const diff = getStartTime(a) - getStartTime(b);
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

    constructor(private client: MatrixClient, private conference: Conference, private scoreboard: Scoreboard) {
    }

    public async prepare() {
        const schedulerData = await this.client.getSafeAccountData<ISchedulerAccountData>(ACD_SCHEDULER, {
            completed: [],
            inAuditoriums: [],
        });
        this.completedIds.push(...(schedulerData?.completed || []));
        this.inAuditoriums.push(...(schedulerData?.inAuditoriums || []));

        if (this.inAuditoriums.length) {
            await this.client.sendNotice(config.managementRoom, `Running schedule in auditoriums: ${this.inAuditoriums.join(', ')}`);
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

    private async persistProgress() {
        const completedIds = this.completedIds.slice().reverse().slice(0, KEEP_LAST_TASKS).reverse();
        await this.client.setAccountData(ACD_SCHEDULER, {
            completed: completedIds,
            inAuditoriums: this.inAuditoriums,
        });
    }

    private async runTasks() {
        try {
            const now = (new Date()).getTime();
            const pentaDb = await this.conference.getPentaDb();
            await this.lock.acquireAsync();
            LogService.info("Scheduler", "Scheduling tasks");
            try {
                const minVar = config.conference.lookaheadMinutes;
                const upcomingTalks = await pentaDb.getUpcomingTalkStarts(minVar, minVar);
                const upcomingQA = await pentaDb.getUpcomingQAStarts(minVar, minVar);
                const upcomingEnds = await pentaDb.getUpcomingTalkEnds(minVar, minVar);

                const scheduleAll = (talks: IDbTalk[], type: ScheduledTaskType) => {
                    talks.filter(e => !this.completedIds.includes(makeTaskId(type, e)))
                        .forEach(e => this.tryScheduleTask(type, e));

                    if (type === ScheduledTaskType.TalkStart) {
                        talks.filter(e => !this.completedIds.includes(makeTaskId(ScheduledTaskType.TalkStart5M, e)))
                            .forEach(e => this.tryScheduleTask(ScheduledTaskType.TalkStart5M, e));
                    } else if (type === ScheduledTaskType.TalkQA) {
                        talks.filter(e => !this.completedIds.includes(makeTaskId(ScheduledTaskType.TalkQA5M, e)))
                            .forEach(e => this.tryScheduleTask(ScheduledTaskType.TalkQA5M, e));
                    } else if (type === ScheduledTaskType.TalkEnd) {
                        talks.filter(e => !this.completedIds.includes(makeTaskId(ScheduledTaskType.TalkEnd5M, e)))
                            .forEach(e => this.tryScheduleTask(ScheduledTaskType.TalkEnd5M, e));
                        talks.filter(e => !this.completedIds.includes(makeTaskId(ScheduledTaskType.TalkEnd1M, e)))
                            .forEach(e => this.tryScheduleTask(ScheduledTaskType.TalkEnd1M, e));
                    }
                };

                scheduleAll(upcomingTalks, ScheduledTaskType.TalkStart);
                scheduleAll(upcomingQA, ScheduledTaskType.TalkQA);
                scheduleAll(upcomingEnds, ScheduledTaskType.TalkEnd);

                const earlyWarnings = await pentaDb.getUpcomingTalkStarts(75, 15);
                scheduleAll(earlyWarnings, ScheduledTaskType.TalkStart1H);
                scheduleAll(earlyWarnings, ScheduledTaskType.TalkCheckin15M);
                scheduleAll(earlyWarnings, ScheduledTaskType.TalkCheckin30M);
                scheduleAll(earlyWarnings, ScheduledTaskType.TalkCheckin45M);
            } catch (e) {
                LogService.error("Scheduler", e);
                try {
                    await logMessage(LogLevel.ERROR, "Scheduler", `Error scheduling tasks: ${e?.message || 'unknown error'}`);
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
                    if (startTime > now) continue;
                    if (SKIPPABLE_TASKS.includes(task.type) && (now - startTime) > 10 * 60 * 1000) continue;
                    toExec.push(task);
                }
                sortTasks(toExec);
                let didAction = false;
                for (const task of toExec) {
                    const taskId = task.id;
                    LogService.info("Scheduler", "Running task: " + taskId);
                    try {
                        await this.execute(task);
                    } catch (e) {
                        LogService.error("Scheduler", e);
                        await logMessage(LogLevel.ERROR, "Scheduler", `Error running task ${taskId}: ${e?.message || 'unknown error'}`);
                    }
                    delete this.pending[taskId];
                    this.completedIds.push(taskId);
                    didAction = true;
                }
                if (didAction) await this.persistProgress();
            } catch (e) {
                LogService.error("Scheduler", e);
                try {
                    await logMessage(LogLevel.ERROR, "Scheduler", `Error running tasks: ${e?.message || 'unknown error'}`);
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
        setTimeout(() => this.runTasks(), RUN_INTERVAL_MS);
    }

    private async execute(task: ITask) {
        const confTalk = this.conference.getTalk(task.talk.event_id);
        const confAud = this.conference.getAuditorium(task.talk.conference_room);
        const confAudBackstage = this.conference.getAuditoriumBackstage(task.talk.conference_room);

        if (!confAud || !confTalk || !confAudBackstage) {
            // probably a special interest room
            LogService.warn("Scheduler", `Skipping task ${task.id} - Unknown auditorium or talk`);
            return;
        }

        if (task.type === ScheduledTaskType.TalkStart) {
            await this.scoreboard.resetScoreboard(confAud.roomId);
            if (!task.talk.prerecorded) {
                await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk is not pre-recorded.</h3><p>You are entering the Q&A for your talk's duration now.</p>`);
                await this.client.sendHtmlText(confAud.roomId, `<h3>${await confTalk.getName()}</h3><p><b>There is no video for this talk.</b> Ask your questions here and they'll try to answer them!</p>`);
                return;
            }
            await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk is starting shortly.</h3>`);
            await this.client.sendHtmlText(confAud.roomId, `<h3>Up next: ${await confTalk.getName()}</h3><p>Ask your questions here for the Q&A at the end of the talk.</p>`);
        } else if (task.type === ScheduledTaskType.TalkQA) {
            if (!task.talk.prerecorded) return;
            await this.client.sendHtmlText(
                confTalk.roomId,
                `<h3>Your Q&A is starting NOW</h3>` +
                `<p>Remember that the broadcast feed is buffered and lags many seconds behind. ` +
                `Do not wait for it to finish, otherwise you will create a long pause!</p>`,
            );
            await this.client.sendHtmlText(confAud.roomId, `<h3>Q&A is starting shortly</h3><p>Feel free to continue asking questions in this room for the speakers - the conversation will continue in the hallway after the Q&A.</p>`);
        } else if (task.type === ScheduledTaskType.TalkEnd) {
            await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk has ended - opening up this room to all attendees.</h3><p>@room - They won't see the history in this room.</p>`);
            const widget = await LiveWidget.forTalk(confTalk, this.client);
            const layout = await LiveWidget.layoutForTalk(widget, null);
            const scoreboard = await LiveWidget.scoreboardForTalk(confTalk, this.client);
            await this.client.sendStateEvent(confTalk.roomId, widget.type, widget.state_key, widget.content);
            await this.client.sendStateEvent(confTalk.roomId, scoreboard.type, scoreboard.state_key, {});
            await this.client.sendStateEvent(confTalk.roomId, layout.type, layout.state_key, layout.content);
            await makeRoomPublic(confTalk.roomId, this.client);
            const talkPill = await MentionPill.forRoom(confTalk.roomId, this.client);
            await this.client.sendHtmlText(confAud.roomId, `<h3>The talk will end shortly</h3><p>If the speakers are available, they'll be hanging out in ${talkPill.html}</p>`);
        } else if (task.type === ScheduledTaskType.TalkStart1H) {
            if (!task.talk.prerecorded) {
                await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk starts in about 1 hour</h3><p><b>Your talk is not pre-recorded.</b> You will have your talk's full duration be Q&A.</p>`);
            } else {
                await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk starts in about 1 hour</h3><p>Please say something (anything) in this room to check in.</p>`);

                const userIds = await this.conference.getInviteTargetsForTalk(confTalk);
                const resolved = (await resolveIdentifiers(userIds)).filter(p => p.mxid).map(p => p.mxid);
                await config.RUNTIME.checkins.expectCheckinFrom(resolved);
            }
        } else if (task.type === ScheduledTaskType.TalkStart5M) {
            if (!task.talk.prerecorded) {
                await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk starts in about 5 minutes</h3><p><b>Your talk is not pre-recorded.</b> Your talk's full duration will be Q&A.</p>`);
            } else {
                await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk starts in about 5 minutes</h3><p>Please join the Jitsi conference at the top of this room to prepare for your Q&A.</p>`);
            }
        } else if (task.type === ScheduledTaskType.TalkQA5M) {
            if (!task.talk.prerecorded) return;
            await this.client.sendHtmlText(
                confTalk.roomId,
                `<h3>Your Q&A starts in 5 minutes</h3>` +
                `<p>The upvoted questions appear in the "Upvoted messages" widget next to the Jitsi conference. Prepare your answers!</p>` +
                `<p>Remember that the broadcast feed is buffered and lags many seconds behind. ` +
                `Do not wait for it to finish, otherwise you will create a long pause!</p>`,
            );
        } else if (task.type === ScheduledTaskType.TalkEnd5M) {
            await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk ends in about 5 minutes</h3><p>The next talk will start automatically after yours. In 5 minutes, this room will be opened up for anyone to join. They will not be able to see history.</p>`);
            await this.client.sendHtmlText(confAud.roomId, `<h3>This talk ends in about 5 minutes</h3><p>Ask questions here for the speakers!</p>`);
        } else if (task.type === ScheduledTaskType.TalkEnd1M) {
            await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk ends in about 1 minute!</h3><p>The next talk will start automatically after yours. Wrap it up!</p>`);
            await this.client.sendHtmlText(confAud.roomId, `<h3>This talk ends in about 1 minute!</h3><p>Last question!</p>`);
        } else if (task.type === ScheduledTaskType.TalkCheckin45M) {
            if (!task.talk.prerecorded) return;
            const userIds = await this.conference.getInviteTargetsForTalk(confTalk);
            const resolved = await resolveIdentifiers(userIds);
            const speakers = resolved.filter(p => p.person.event_role === Role.Speaker);
            const hosts = resolved.filter(p => p.person.event_role === Role.Host);
            const coordinators = resolved.filter(p => p.person.event_role === Role.Coordinator);

            const required = [...speakers, ...hosts];
            const missing: ResolvedPersonIdentifier[] = [];
            for (const person of required) {
                if (!person.mxid) {
                    missing.push(person);
                } else if (!config.RUNTIME.checkins.isCheckedIn(person.mxid)) {
                    missing.push(person);
                } else {
                    await config.RUNTIME.checkins.extendCheckin(person.mxid);
                }
            }
            if (missing.length > 0) {
                const pills: string[] = [];
                for (const person of missing) {
                    if (person.mxid) {
                        pills.push((await MentionPill.forUser(person.mxid, confTalk.roomId, this.client)).html);
                    } else {
                        pills.push(`<b>${person.person.name}</b>`);
                    }
                }

                await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk starts in about 45 minutes</h3><p>${pills.join(', ')} - Please say something (anything) in this room to check in.</p>`);

                const userIds = await this.conference.getInviteTargetsForTalk(confTalk);
                const resolved = (await resolveIdentifiers(userIds)).filter(p => p.mxid).map(p => p.mxid);
                await config.RUNTIME.checkins.expectCheckinFrom(resolved);
            }
        } else if (task.type === ScheduledTaskType.TalkCheckin30M) {
            if (!task.talk.prerecorded) return;
            const userIds = await this.conference.getInviteTargetsForTalk(confTalk);
            const resolved = await resolveIdentifiers(userIds);
            const speakers = resolved.filter(p => p.person.event_role === Role.Speaker);
            const hosts = resolved.filter(p => p.person.event_role === Role.Host);
            const coordinators = resolved.filter(p => p.person.event_role === Role.Coordinator);

            const required = [...speakers, ...hosts];
            const missing: ResolvedPersonIdentifier[] = [];
            for (const person of required) {
                if (!person.mxid) {
                    missing.push(person);
                } else if (!config.RUNTIME.checkins.isCheckedIn(person.mxid)) {
                    missing.push(person);
                } else {
                    await config.RUNTIME.checkins.extendCheckin(person.mxid);
                }
            }
            if (missing.length > 0) {
                const pills: string[] = [];
                for (const person of missing) {
                    if (person.mxid) {
                        pills.push((await MentionPill.forUser(person.mxid, confTalk.roomId, this.client)).html);
                    } else {
                        pills.push(`<b>${person.person.name}</b>`);
                    }
                }
                await this.client.sendHtmlText(confTalk.roomId, `<h3>Please check in.</h3><p>${pills.join(', ')} - It does not appear as though you are present for your talk. Please say something in this room.</p>`);
                await this.client.sendHtmlText(confAudBackstage.roomId, `<h3>Required persons not checked in for upcoming talk</h3><p>Please track down the speakers for <b>${await confTalk.getName()}</b>.</p><p>Missing: ${pills.join(', ')}</p>`);

                const userIds = await this.conference.getInviteTargetsForTalk(confTalk);
                const resolved = (await resolveIdentifiers(userIds)).filter(p => p.mxid).map(p => p.mxid);
                await config.RUNTIME.checkins.expectCheckinFrom(resolved);
            } // else no complaints
        } else if (task.type === ScheduledTaskType.TalkCheckin15M) {
            if (!task.talk.prerecorded) return;
            const userIds = await this.conference.getInviteTargetsForTalk(confTalk);
            const resolved = await resolveIdentifiers(userIds);
            const speakers = resolved.filter(p => p.person.event_role === Role.Speaker);
            const hosts = resolved.filter(p => p.person.event_role === Role.Host);
            const coordinators = resolved.filter(p => p.person.event_role === Role.Coordinator);

            const required = [...speakers, ...hosts];
            const missing: ResolvedPersonIdentifier[] = [];
            for (const person of required) {
                if (!person.mxid) {
                    missing.push(person);
                } else if (!config.RUNTIME.checkins.isCheckedIn(person.mxid)) {
                    missing.push(person);
                } else {
                    await config.RUNTIME.checkins.extendCheckin(person.mxid);
                }
            }
            if (missing.length > 0) {
                const pills: string[] = [];
                for (const person of missing) {
                    if (person.mxid) {
                        pills.push((await MentionPill.forUser(person.mxid, confTalk.roomId, this.client)).html);
                    } else {
                        pills.push(`<b>${person.person.name}</b>`);
                    }
                }
                const roomPill = await MentionPill.forRoom(confTalk.roomId, this.client);
                await this.client.sendHtmlText(config.managementRoom, `<h3>Talk is missing speakers</h3><p>${roomPill.html} is missing one or more speakers: ${pills.join(', ')}</p><p>The talk starts in about 15 minutes.</p>`);
                await this.client.sendHtmlText(confTalk.roomId, `<h3>@room - please check in.</h3><p>${pills.join(', ')} - It does not appear as though you are present for your talk. Please say something in this room. The conference staff have been notified.</p>`);
                await this.client.sendHtmlText(confAudBackstage.roomId, `<h3>Required persons not checked in for upcoming talk</h3><p>Please track down the speakers for <b>${await confTalk.getName()}</b>. The conference staff have been notified.</p><p>Missing: ${pills.join(', ')}</p>`);

                const userIds = await this.conference.getInviteTargetsForTalk(confTalk);
                const resolved = (await resolveIdentifiers(userIds)).filter(p => p.mxid).map(p => p.mxid);
                await config.RUNTIME.checkins.expectCheckinFrom(resolved);
            } // else no complaints
        } else {
            await logMessage(LogLevel.WARN, "Scheduler", `Unknown task type for execute(): ${task.type}`);
        }
    }

    public async tryScheduleTask(type: ScheduledTaskType, talk: IDbTalk) {
        const id = makeTaskId(type, talk);
        const existingTask = this.pending[id];
        if (existingTask) return;

        await this.lock.acquireAsync();
        try {
            const isCompleted = this.completedIds.includes(id);
            if (!isCompleted && this.isWatchingAuditorium(talk.conference_room)) {
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
        try {
            this.pending = {};
            this.inAuditoriums = [];
            await this.persistProgress();
        } finally {
            this.lock.release();
        }
    }
}
