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

export class WidgetsCommand implements ICommand {
    public readonly prefixes = ["widgets"];

    private async addToRoom(aud: Auditorium, client: MatrixClient, conference: Conference) {
        const audWidget = await LiveWidget.forAuditorium(aud, client);
        const audLayout = LiveWidget.layoutForAuditorium(audWidget);
        const audSchedule = await LiveWidget.scheduleForAuditorium(aud, client);
        await client.sendStateEvent(aud.roomId, audWidget.type, audWidget.state_key, audWidget.content);
        await client.sendStateEvent(aud.roomId, audSchedule.type, audSchedule.state_key, audSchedule.content);
        await client.sendStateEvent(aud.roomId, audLayout.type, audLayout.state_key, audLayout.content);

        const talks = await asyncFilter(conference.storedTalks, async t => (await t.getAuditoriumId()) === (await aud.getId()));
        for (const talk of talks) {
            const talkWidget = await LiveWidget.forTalk(talk, client);
            const scoreboardWidget = await LiveWidget.scoreboardForTalk(talk, client);
            const talkLayout = LiveWidget.layoutForTalk(talkWidget, scoreboardWidget);
            await client.sendStateEvent(talk.roomId, talkWidget.type, talkWidget.state_key, talkWidget.content);
            await client.sendStateEvent(talk.roomId, scoreboardWidget.type, scoreboardWidget.state_key, scoreboardWidget.content);
            await client.sendStateEvent(talk.roomId, talkLayout.type, talkLayout.state_key, talkLayout.content);
        }

        if ((await aud.getDefinition()).isPhysical) {
            // For physical auditoriums, the talks don't have anywhere to display a Q&A scoreboard.
            // So what we do instead is add a Q&A scoreboard to the backstage room, so that an organiser can read off
            // any questions if necessary.
            const backstage = conference.getAuditoriumBackstage(await aud.getId());
            const audScoreboardWidget = await LiveWidget.scoreboardForAuditorium(aud, client);
            const backstageLayout = LiveWidget.layoutForPhysicalAudBackstage(audScoreboardWidget);
            await client.sendStateEvent(backstage.roomId, audScoreboardWidget.type, audScoreboardWidget.state_key, audScoreboardWidget.content);
            await client.sendStateEvent(backstage.roomId, backstageLayout.type, backstageLayout.state_key, backstageLayout.content);
        }
    }

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        if (args[0] === 'all') {
            for (const aud of conference.storedAuditoriums) {
                await this.addToRoom(aud, client, conference);
            }
        } else {
            const aud = await conference.getAuditorium(args[0]);
            if (!aud) {
                return client.replyNotice(roomId, event, "Auditorium not found");
            }
            await this.addToRoom(aud, client, conference);
        }

        await client.replyNotice(roomId, event, "Widgets created");
    }
}
