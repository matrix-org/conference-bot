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
        let targetIdOrSlug: string;
        let backstage = args[args.length - 1] === "backstage";
        if (backstage) {
            const aud_slice = args.slice(0, -1)
            targetIdOrSlug = aud_slice.join(" ")
        }
        else {
            targetIdOrSlug = args.join(" ");
        }

        let room: PhysicalRoom | null = this.conference.getAuditoriumOrInterestByIdOrSlug(targetIdOrSlug);
        if (backstage && room !== null) {
            room = this.conference.getAuditoriumBackstage(room.getId());
        }

        if (!room) {
            return await this.client.replyNotice(roomId, event, `Unknown auditorium/interest room: ${targetIdOrSlug}`);
        }

        await this.client.replyNotice(roomId, event, "Calculating list of people...");

        let html = `<h1>${room.getName()} (${room.getId()})</h1>`;

        const appendPeople = (invite: IPerson[], mods: IPerson[]) => {
            for (const target of invite) {
                const isMod = mods.some(m => m.id === target.id);
                html += `<li>${target.name} (${target.role}${isMod ? ' + room moderator' : ''})</li>`;
            }
        };

        let audToInvite: IPerson[];
        let audBackstageToInvite: IPerson[];
        let audToMod: IPerson[];

        if (room instanceof Auditorium) {
            audToInvite = await this.conference.getInviteTargetsForAuditorium(room);
            audBackstageToInvite = await this.conference.getInviteTargetsForAuditorium(room);
            audToMod = await this.conference.getModeratorsForAuditorium(room);
        } else if (room instanceof InterestRoom) {
            audToInvite = await this.conference.getInviteTargetsForInterest(room);
            audBackstageToInvite = [];
            audToMod = await this.conference.getModeratorsForInterest(room);
        } else {
            return await this.client.replyNotice(roomId, event, `Unknown room kind: ${room}`);
        }

        const publicAud = this.conference.getAuditorium(targetIdOrSlug);
        if (publicAud || !(room instanceof Auditorium)) {
            html += "<b>Public-facing room:</b><ul>";
            appendPeople(audToInvite, audToMod);
        }

        if (room instanceof Auditorium) {
            html += "</ul><b>Backstage room:</b><ul>";
            appendPeople(audBackstageToInvite, audToMod);
            html += "</ul>";

            const talks = await asyncFilter(this.conference.storedTalks, async t => t.getAuditoriumId() === room!.getId());
            for (const talk of talks) {
                const talkToInvite = await this.conference.getInviteTargetsForTalk(talk);
                const talkToMod = await this.conference.getModeratorsForTalk(talk);
                if (talkToMod.length || talkToInvite.length) {
                    html += `<b>Talk: ${talk.getName()} (${talk.getId()})</b><ul>`;
                    appendPeople(talkToInvite, talkToMod);
                    html += "</ul>";
                }
            }
        }

        await this.client.sendHtmlNotice(roomId, html);
    }
}
