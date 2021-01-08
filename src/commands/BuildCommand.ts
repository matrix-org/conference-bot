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
import { MatrixClient, MentionPill, RichReply } from "matrix-bot-sdk";
import * as fetch from "node-fetch";
import { PentabarfParser } from "../parsers/PentabarfParser";
import { ITalk } from "../models/schedule";
import config from "../config";
import { Conference } from "../Conference";
import { COLOR_RED } from "../models/colors";

export class BuildCommand implements ICommand {
    public readonly prefixes = ["build", "b"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.sendReadReceipt(roomId, event['event_id']);

        const xml = await fetch(config.conference.pentabarfDefinition).then(r => r.text());
        const parsed = new PentabarfParser(xml);

        if (!conference.isCreated) {
            await conference.createDb(parsed.conference);
        } else if (!args[0]) {
            // TODO: We should just support incremental changes
            return await client.replyHtmlNotice(roomId, event, "" +
                `<h4><span data-mx-color='${COLOR_RED}'>Conference already built</span></h4>` +
                "<p>Now it's time to <a href='https://github.com/matrix-org/conference-bot/blob/main/docs/importing-people.md'>import your participants &amp; team</a>.</p>"
            );
        }

        const spacePill = await MentionPill.forRoom((await conference.getSpace()).roomId, client);
        const messagePrefix = "Conference initialized! Preparing rooms for later use (this will take a while)...";
        const reply = RichReply.createFor(roomId, event,
            messagePrefix + "\n\nYour conference's space is at " + spacePill.text,
            messagePrefix + "<br /><br />Your conference's space is at " + spacePill.html);
        reply["msgtype"] = "m.notice";
        await client.sendMessage(roomId, reply);

        let auditoriumsCreated = 0;
        let talksCreated = 0;
        for (const auditorium of parsed.auditoriums) {
            const confAud = await conference.createAuditorium(auditorium);
            auditoriumsCreated++;

            if (args[0] !== "notalks") { // easter egg
                const allTalks: ITalk[] = [];
                Object.values(auditorium.talksByDate).forEach(ea => allTalks.push(...ea));
                for (const talk of allTalks) {
                    await conference.createTalk(talk, confAud);
                    talksCreated++;
                }
            }
        }

        await client.sendNotice(roomId, `${auditoriumsCreated} auditoriums have been created`);
        await client.sendNotice(roomId, `${talksCreated} talks have been created`);
        await client.sendHtmlNotice(roomId, "" +
            "<h4>Conference built</h4>" +
            "<p>Now it's time to <a href='https://github.com/matrix-org/conference-bot/blob/main/docs/importing-people.md'>import your participants &amp; team</a>.</p>"
        );
    }
}
