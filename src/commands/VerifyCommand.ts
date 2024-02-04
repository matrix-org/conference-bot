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

    constructor(private readonly client: MatrixClient, private readonly conference: Conference) {}

    public async run(roomId: string, event: any, args: string[]) {
        let audId;
        let backstage = args[args.length - 1] === "backstage";
        if (backstage) {
            const aud_slice = args.slice(0, -1)
            audId = aud_slice.join(" ")
        }
        else {
            audId = args.join(" ");
        }

        let aud: PhysicalRoom = this.conference.getAuditorium(audId);
        if (backstage) {
            aud = this.conference.getAuditoriumBackstage(audId);
        }

        if (!aud) {
            aud = this.conference.getInterestRoom(audId);
            if (!aud) {
                return await this.client.replyNotice(roomId, event, `Unknown auditorium/interest room: ${audId}`);
            }
        }

        await this.client.replyNotice(roomId, event, "Calculating list of people...");

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
            audToInvite = await this.conference.getInviteTargetsForAuditorium(aud);
            audBackstageToInvite = await this.conference.getInviteTargetsForAuditorium(aud);
            audToMod = await this.conference.getModeratorsForAuditorium(aud);
        } else if (aud instanceof InterestRoom) {
            audToInvite = await this.conference.getInviteTargetsForInterest(aud);
            audBackstageToInvite = [];
            audToMod = await this.conference.getModeratorsForInterest(aud);
        } else {
            return await this.client.replyNotice(roomId, event, `Unknown room kind: ${aud}`);
        }

        const publicAud = this.conference.getAuditorium(audId);
        if (publicAud || !(aud instanceof Auditorium)) {
            html += "<b>Public-facing room:</b><ul>";
            appendPeople(audToInvite, audToMod);
        }

        if (aud instanceof Auditorium) {
            html += "</ul><b>Backstage room:</b><ul>";
            appendPeople(audBackstageToInvite, audToMod);
            html += "</ul>";

            const talks = await asyncFilter(this.conference.storedTalks, async t => (await t.getAuditoriumId()) === (await aud.getId()));
            for (const talk of talks) {
                const talkToInvite = await this.conference.getInviteTargetsForTalk(talk);
                const talkToMod = await this.conference.getModeratorsForTalk(talk);
                if (talkToMod.length || talkToInvite.length) {
                    html += `<b>Talk: ${await talk.getName()} (${await talk.getId()})</b><ul>`;
                    appendPeople(talkToInvite, talkToMod);
                    html += "</ul>";
                }
            }
        }

        await this.client.sendHtmlNotice(roomId, html);
    }
}
