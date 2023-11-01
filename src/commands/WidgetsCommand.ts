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
import { asyncFilter } from "../utils";
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
        const audSchedule = await LiveWidget.scheduleForAuditorium(aud, this.client, avatar, baseUrl);
        await this.client.sendStateEvent(aud.roomId, audWidget.type, audWidget.state_key, audWidget.content);
        await this.client.sendStateEvent(aud.roomId, audSchedule.type, audSchedule.state_key, audSchedule.content);
        await this.client.sendStateEvent(aud.roomId, audLayout.type, audLayout.state_key, audLayout.content);

        const talks = await asyncFilter(this.conference.storedTalks, async t => (await t.getAuditoriumId()) === (await aud.getId()));
        for (const talk of talks) {
            const talkWidget = await LiveWidget.forTalk(talk, this.client, avatar, baseUrl);
            const scoreboardWidget = await LiveWidget.scoreboardForTalk(talk, this.client, this.conference, avatar, baseUrl);
            const talkLayout = LiveWidget.layoutForTalk(talkWidget, scoreboardWidget);
            await this.client.sendStateEvent(talk.roomId, talkWidget.type, talkWidget.state_key, talkWidget.content);
            await this.client.sendStateEvent(talk.roomId, scoreboardWidget.type, scoreboardWidget.state_key, scoreboardWidget.content);
            await this.client.sendStateEvent(talk.roomId, talkLayout.type, talkLayout.state_key, talkLayout.content);
        }

        if ((await aud.getDefinition()).isPhysical) {
            // For physical auditoriums, the talks don't have anywhere to display a Q&A scoreboard.
            // So what we do instead is add a Q&A scoreboard to the backstage room, so that an organiser can read off
            // any questions if necessary.
            const backstage = this.conference.getAuditoriumBackstage(await aud.getId());
            const audScoreboardWidget = await LiveWidget.scoreboardForAuditorium(aud, this.client, avatar, baseUrl);
            const backstageLayout = LiveWidget.layoutForPhysicalAudBackstage(audScoreboardWidget);
            await this.client.sendStateEvent(backstage.roomId, audScoreboardWidget.type, audScoreboardWidget.state_key, audScoreboardWidget.content);
            await this.client.sendStateEvent(backstage.roomId, backstageLayout.type, backstageLayout.state_key, backstageLayout.content);
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
