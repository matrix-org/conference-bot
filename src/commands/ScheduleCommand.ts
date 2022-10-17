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
import { MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import config from "../config";
import { getStartTime, ScheduledTaskType, sortTasks } from "../Scheduler";
import moment = require("moment");

export class ScheduleCommand implements ICommand {
    public readonly prefixes = ["schedule"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        if (args[0] === 'reset') {
            await config.RUNTIME.scheduler.reset();
            await client.sendNotice(roomId, "Schedule processing has been reset.");
        } else if (args[0] === 'view') {
            const upcoming = sortTasks(config.RUNTIME.scheduler.inspect());
            let html = "Upcoming tasks:<ul>";
            for (const task of upcoming) {
                const talkRoom = conference.getTalk(task.talk.id);
                if (!talkRoom) continue;
                const taskStart = moment(getStartTime(task));
                const formattedTimestamp = taskStart.format("YYYY-MM-DD HH:mm:ss [UTC]ZZ");

                if (html.length > 20000) {
                    // chunk up the message so we don't fail to send one very large event.
                    html += "</ul>";
                    await client.sendHtmlNotice(roomId, html);
                    html = "…<ul>";
                }

                html += `<li>${formattedTimestamp}: <b>${task.type} on ${await talkRoom.getName()}</b> (<code>${task.id}</code>) ${taskStart.fromNow()}</li>`;
            }
            html += "</ul>";
            await client.sendHtmlNotice(roomId, html);
        } else if (args[0] === 'execute') {
            await config.RUNTIME.scheduler.execute(args[1]);
            await client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
        } else {
            await client.sendNotice(roomId, "Unknown schedule command.");
        }
    }
}
