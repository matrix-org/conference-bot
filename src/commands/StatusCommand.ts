/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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
import { Scheduler } from "../Scheduler";
import config from "../config";

export class StatusCommand implements ICommand {
    public readonly prefixes = ["status", "stat"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        let html = "<h4>Conference Bot Status</h4>";

        await client.sendReadReceipt(roomId, event['event_id']);

        const backend = conference.backend;

        let scheduleRefreshOk = false;
        try {
            // Try to refresh the schedule first, to ensure we don't miss any updates.
            await backend.refresh();
            scheduleRefreshOk = true;
        } catch (error) {}

        let roomStateBotResetOk = false;
        try {
            // Try to reset our view of the state first, to ensure we don't miss anything (e.g. if we got invited to a room since bot startup).
            await conference.construct();
            roomStateBotResetOk = true;
        } catch (error) {}

        ////////////////////////////////////////
        html += "<h5>Schedule</h5><ul>";
        html += `<li>Schedule source healthy: <strong>${(! backend.wasLoadedFromCache()) && scheduleRefreshOk}</strong></li>`;
        html += `<li>Conference ID: <code>${conference.id}</code></li>`;

        html += "</ul>";


        ////////////////////////////////////////
        html += "<h5>Rooms</h5><ul>";
        html += `<li>State reconstruct healthy: <strong>${roomStateBotResetOk}</strong></li>`;
        html += `<li>Conference space located: <strong>${conference.hasRootSpace}</strong></li>`;
        html += `<li>Conference 'database room' located: <strong>${conference.hasDbRoom}</strong></li>`;
        html += `<li>№ auditoriums located: <strong>${conference.storedAuditoriums.length}</strong></li>`;
        html += `<li>№ auditorium backstages located: <strong>${conference.storedAuditoriumBackstages.length}</strong></li>`;
        html += `<li>№ talk rooms located: <strong>${conference.storedTalks.length}</strong></li>`;

        html += "</ul>";


        ////////////////////////////////////////
        html += "<h5>Scheduler</h5><ul>";
        const scheduler: Scheduler = config.RUNTIME.scheduler;
        html += `<li>Scheduled tasks yet to run: <strong>${scheduler.inspect().length}</strong></li>`;

        html += "</ul>";


        await client.sendHtmlNotice(roomId, html);
    }
}
