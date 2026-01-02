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
import { LiveWidget } from "../models/LiveWidget";
import { Auditorium } from "../models/Auditorium";
import { IConfig } from "../config";

export class WidgetsCommand implements ICommand {
    constructor(private readonly client: MatrixClient, private readonly conference: Conference, private readonly config: IConfig) {}

    public readonly prefixes = ["widgets"];

    private async addToRoom(aud: Auditorium) {
        const avatar = this.config.livestream.widgetAvatar;
        const baseUrl = this.config.webserver.publicBaseUrl;
        const audWidget = await LiveWidget.forAuditorium(aud, this.client, avatar, baseUrl);
        const audLayout = LiveWidget.layoutForAuditorium(audWidget);
        const audSchedule = await LiveWidget.scheduleForAuditorium(aud, this.client, avatar, this.config.livestream.scheduleUrl);

        try {
            await this.client.sendStateEvent(aud.roomId, audWidget.type, audWidget.state_key, audWidget.content);
        }
        catch (error) {
            throw Error(`Error sending state event for auditorium widget into room ${aud.roomId}`, {cause:error})
        }

        try {
            await this.client.sendStateEvent(aud.roomId, audSchedule.type, audSchedule.state_key, audSchedule.content);
        }
        catch (error) {
            throw Error(`Error sending state event for schedule widget into room ${aud.roomId}`, {cause:error})
        }

        try {
            await this.client.sendStateEvent(aud.roomId, audLayout.type, audLayout.state_key, audLayout.content);
        }
        catch (error) {
            throw Error(`Error sending state event for layout widget into room ${aud.roomId}`, {cause:error})
        }

        // Add a Q&A scoreboard to the backstage room, so that an organiser can read off
        // any questions if necessary.
        const backstage = this.conference.getAuditoriumBackstage(aud.getId());
        const audScoreboardWidget = await LiveWidget.scoreboardForAuditorium(aud, this.client, avatar, baseUrl);
        const backstageLayout = LiveWidget.layoutForPhysicalAudBackstage(audScoreboardWidget);

        try {
            await this.client.sendStateEvent(backstage.roomId, audScoreboardWidget.type, audScoreboardWidget.state_key, audScoreboardWidget.content);
        }
        catch (error) {
            throw Error(`Error sending state event for backstage scoreboard widget into room ${backstage.roomId}`, {cause:error})
        }

        try {
            await this.client.sendStateEvent(backstage.roomId, backstageLayout.type, backstageLayout.state_key, backstageLayout.content);
        }
        catch (error) {
            throw Error(`Error sending state event for layout widget into room ${backstage.roomId}`, {cause:error})
        }
    }

    public async run(roomId: string, event: any, args: string[]) {
        if (args[0] === 'all') {
            for (const aud of this.conference.storedAuditoriums) {
                await this.addToRoom(aud);
            }
        } else {
            const aud = await this.conference.getAuditorium(args[0]);
            if (!aud) {
                return this.client.replyNotice(roomId, event, "Auditorium not found");
            }
            await this.addToRoom(aud);
        }

        await this.client.replyNotice(roomId, event, "Widgets created");
    }
}
