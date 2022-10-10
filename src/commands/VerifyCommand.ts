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
import { asyncFilter } from "../utils";
import { Auditorium } from "../models/Auditorium";
import { PhysicalRoom } from "../models/PhysicalRoom";
import { InterestRoom } from "../models/InterestRoom";
import { IPerson } from "../models/schedule";

export class VerifyCommand implements ICommand {
    public readonly prefixes = ["verify", "v"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        const audId = args[0];

        let aud: PhysicalRoom = conference.getAuditorium(audId);
        if (args.includes("backstage")) {
            aud = conference.getAuditoriumBackstage(audId);
        }

        if (!aud) {
            aud = conference.getInterestRoom(audId);
            if (!aud) {
                return await client.replyNotice(roomId, event, "Unknown auditorium/interest room");
            }
        }

        await client.replyNotice(roomId, event, "Calculating list of people...");

        let html = `<h1>${await aud.getName()} (${await aud.getId()})</h1>`;

        const appendPeople = (invite: IPerson[], mods: IPerson[]) => {
            for (const target of invite) {
                const isMod = mods.some(m => m.id === target.id);
                html += `<li>${target.name} (${target.role}${isMod ? ' + room moderator' : ''})</li>`;
            }
        };

        let audToInvite: IPerson[];
        let audBackstageToInvite: IPerson[];
        let audToMod: IPerson[];

        if (aud instanceof Auditorium) {
            audToInvite = await conference.getInviteTargetsForAuditorium(aud);
            audBackstageToInvite = await conference.getInviteTargetsForAuditorium(aud, true);
            audToMod = await conference.getModeratorsForAuditorium(aud);
        } else if (aud instanceof InterestRoom) {
            audToInvite = await conference.getInviteTargetsForInterest(aud);
            audBackstageToInvite = [];
            audToMod = await conference.getModeratorsForInterest(aud);
        } else {
            return await client.replyNotice(roomId, event, "Unknown room kind");
        }

        const publicAud = conference.getAuditorium(audId);
        if (publicAud || !(aud instanceof Auditorium)) {
            html += "<b>Public-facing room:</b><ul>";
            appendPeople(audToInvite, audToMod);
        }

        if (aud instanceof Auditorium) {
            html += "</ul><b>Backstage room:</b><ul>";
            appendPeople(audBackstageToInvite, audToMod);
            html += "</ul>";

            const talks = await asyncFilter(conference.storedTalks, async t => (await t.getAuditoriumId()) === (await aud.getId()));
            for (const talk of talks) {
                const talkToInvite = await conference.getInviteTargetsForTalk(talk);
                const talkToMod = await conference.getModeratorsForTalk(talk);
                if (talkToMod.length || talkToInvite.length) {
                    html += `<b>Talk: ${await talk.getName()} (${await talk.getId()})</b><ul>`;
                    appendPeople(talkToInvite, talkToMod);
                    html += "</ul>";
                }
            }
        }

        await client.sendHtmlNotice(roomId, html);
    }
}
