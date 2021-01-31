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

export enum ScheduledTaskType {
    TalkStart = "talk_start",
    TalkEnd = "talk_end",
    TalkQA = "talk_q&a",

    // TODO: tasks for "talks starts in 1 hr" and other timing points (tie into scoreboard)
    // TODO: tasks for "please check in" and "$person hasn't checked in"
}

const KEEP_LAST_TASKS = 200;
const ACD_SCHEDULER = "org.matrix.confbot.scheduler_info";
const RUN_INTERVAL_MS = 15000; // run tasks somewhat often (not overlapping)

interface ISchedulerAccountData {
    completed: string[];
}

interface ITask {
    id: string;
    type: ScheduledTaskType;
    talk: IDbTalk;
}

function makeTaskId(type: ScheduledTaskType, talk: IDbTalk): string {
    return `${type}::${talk.event_id}::${talk.conference_room}`;
}

function getStartTime(task: ITask): number {
    switch (task.type) {
        case ScheduledTaskType.TalkStart:
            return task.talk.start_datetime;
        case ScheduledTaskType.TalkEnd:
            return task.talk.end_datetime;
        case ScheduledTaskType.TalkQA:
            return task.talk.qa_start_datetime + (config.conference.database.scheduleBufferSeconds * 1000);
        default:
            throw new Error("Unknown task type for getStartTime(): " + task.type);
    }
}

export class Scheduler {
    private completedIds: string[] = [];
    private pending: { [taskId: string]: ITask } = {};
    private lock = new AwaitLock();

    constructor(private client: MatrixClient, private conference: Conference) {
    }

    public async prepare() {
        const schedulerData = await this.client.getSafeAccountData<ISchedulerAccountData>(ACD_SCHEDULER, {
            completed: [],
        });
        // TODO: ENABLE BEFORE RELEASE
        //this.completedIds.push(...(schedulerData?.completed || []));

        await this.runTasks();
    }

    private async persistProgress() {
        const completedIds = this.completedIds.slice().reverse().slice(0, KEEP_LAST_TASKS).reverse();
        await this.client.setAccountData(ACD_SCHEDULER, {
            completed: completedIds,
        });
    }

    private async runTasks() {
        const now = (new Date()).getTime();
        await this.lock.acquireAsync();
        LogService.info("Scheduler", "Running tasks");
        try {
            // TODO: Order scheduled tasks to prevent "Talk Starting -> Talk Over" confusion
            const taskIds = Object.keys(this.pending);
            let didAction = false;
            for (const taskId of taskIds) {
                if (this.completedIds.includes(taskId)) {
                    delete this.pending[taskId];
                    continue;
                }
                const task = this.pending[taskId];
                const startTime = getStartTime(task);
                if (startTime > now) continue;
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
            await logMessage(LogLevel.ERROR, "Scheduler", `Error running tasks: ${e?.message || 'unknown error'}`);
        } finally {
            this.lock.release();
        }
        LogService.info("Scheduler", "Done running tasks");
        setTimeout(() => this.runTasks(), RUN_INTERVAL_MS);
    }

    private async execute(task: ITask) {
        const confTalk = this.conference.getTalk(task.talk.event_id);
        const confAud = this.conference.getAuditorium(task.talk.conference_room);
        const confAudBackstage = this.conference.getAuditoriumBackstage(task.talk.conference_room);

        console.log(task);

        if (task.type === ScheduledTaskType.TalkStart) {
            await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk is starting shortly.</h3>`);
            await this.client.sendHtmlText(confAud.roomId, `<h3>Up next: ${await confTalk.getName()}</h3><p>Ask your questions here for the Q&A at the end of the talk.</p>`);
        } else if (task.type === ScheduledTaskType.TalkQA) {
            await this.client.sendHtmlText(confTalk.roomId, `<h3>Your Q&A is starting shortly.</h3>`);
            await this.client.sendHtmlText(confAud.roomId, `<h3>Q&A is starting shortly</h3><p>Feel free to continue asking questions for the speakers - the conversation will continue in the hallway after the Q&A.</p>`);
        } else if (task.type === ScheduledTaskType.TalkEnd) {
            await this.client.sendHtmlText(confTalk.roomId, `<h3>Your talk has ended - opening up this room to all attendees.</h3><p>They won't see the history in this room.</p>`);
            // TODO: Make room public
            const talkPill = await MentionPill.forRoom(confTalk.roomId, this.client);
            const html = `<h3>The talk will end shortly</h3><p>If the speakers are available, they'll be hanging out in ${talkPill.html}</p>`;
            const text = `The talk will end shortly\nIf the speakers are available, they'll be hanging out in ${talkPill.text}`;
            await this.client.sendMessage(confAud.roomId, {
                msgtype: "m.text",
                format: "org.matrix.custom.html",
                formatted_body: html,
                body: text,
            });
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
            this.pending[id] = {id, type, talk};
        } finally {
            this.lock.release();
        }
        LogService.debug("Scheduler", `Task ${id} scheduled`);
    }
}
