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

import { ICommand } from "./ICommand";
import { Scheduler, getStartTime, sortTasks } from "../Scheduler";
import { MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { formatISO, intlFormatDistance } from "date-fns";

export class ScheduleCommand implements ICommand {
    public readonly prefixes = ["schedule"];

    constructor(private readonly client: MatrixClient, private readonly conference: Conference, private readonly scheduler: Scheduler) {}

    public async run(roomId: string, event: any, args: string[]) {
        if (args[0] === 'reset') {
            await this.scheduler.reset();
            await this.client.sendNotice(roomId, "Schedule processing has been reset.");
        } else if (args[0] === 'view') {
            await this.printUpcomingTasks(roomId);
        } else if (args[0] === 'debug') {
            await this.printUpcomingTasks(roomId);
            await this.printCompletedTasks(roomId);
        } else if (args[0] === 'execute') {
            await this.scheduler.execute(args[1]);
            await this.client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
        } else {
            await this.client.sendNotice(roomId, "Unknown schedule command.");
        }
    }

    private async printUpcomingTasks(roomId: string) {
        const upcoming = sortTasks(this.scheduler.inspect());
        let html = "Upcoming tasks:<ul>";
        for (const task of upcoming) {
            const hasTalkRoom = this.conference.getTalk(task.talk.id) !== undefined;
            
            const taskStart = getStartTime(task);
            
            const formattedTimestamp = taskStart === null ? '<not runnable>' : formatISO(taskStart, {format: 'extended'});
            const relativeTimestamp = taskStart === null ? '' : intlFormatDistance(taskStart, new Date());

            if (html.length > 20000) {
                // chunk up the message so we don't fail to send one very large event.
                html += "</ul>";
                await this.client.sendHtmlNotice(roomId, html);
                html = "…<ul>";
            }

            const hasRoomIndicator = hasTalkRoom ? 'has talk room' : 'no talk room';
            html += `<li>${formattedTimestamp}: <b>${task.type} on ${task.talk.title}</b> (<code>${task.id}</code>, ${hasRoomIndicator}) ${relativeTimestamp}</li>`;
        }
        html += "</ul>";
        await this.client.sendHtmlNotice(roomId, html);
    }

    private async printCompletedTasks(roomId: string) {
        const completed = this.scheduler.inspectCompleted();
        let html = "Completed tasks:<ul>";
        completed.sort();

        for (const taskId of completed) {
            if (html.length > 20000) {
                // chunk up the message so we don't fail to send one very large event.
                html += "</ul>";
                await this.client.sendHtmlNotice(roomId, html);
                html = "…<ul>";
            }

            html += `<li>${taskId}</li>`;
        }

        html += "</ul>";

        await this.client.sendHtmlNotice(roomId, html);
    }
}
