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

export class WidgetsCommand implements ICommand {
    public readonly prefixes = ["widgets"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        const aud = await conference.getAuditorium(args[0]);
        if (!aud) {
            return client.replyNotice(roomId, event, "Auditorium not found");
        }

        const audWidget = await LiveWidget.forAuditorium(aud, client);
        const audLayout = LiveWidget.layoutOf(audWidget);
        await client.sendStateEvent(aud.roomId, audWidget.type, audWidget.state_key, audWidget.content);
        await client.sendStateEvent(aud.roomId, audLayout.type, audLayout.state_key, audLayout.content);

        const talks = await asyncFilter(conference.storedTalks, async t => (await t.getAuditoriumId()) === (await aud.getId()));
        for (const talk of talks) {
            const talkWidget = await LiveWidget.forTalk(talk, client);
            const talkLayout = LiveWidget.layoutOf(talkWidget);
            await client.sendStateEvent(talk.roomId, talkWidget.type, talkWidget.state_key, talkWidget.content);
            await client.sendStateEvent(talk.roomId, talkLayout.type, talkLayout.state_key, talkLayout.content);
        }

        await client.replyNotice(roomId, event, "Widgets created");
    }
}
