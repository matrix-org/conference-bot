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
import { LogLevel, MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { invitePersonToRoom, resolveIdentifiers } from "../invites";
import { logMessage } from "../LogProxy";
import { IPerson } from "../models/schedule";

export class FDMCommand implements ICommand {
    public readonly prefixes = ["fdm"];

    constructor(private readonly client: MatrixClient, private readonly conference: Conference) {}

    public async run(roomId: string, event: any, args: string[]) {
        const spi = this.conference.getInterestRoom("I.infodesk");
        const infBackstage = await this.client.resolveRoom("#infodesk-backstage:fosdem.org");
        const vol = await this.client.resolveRoom("#volunteers:fosdem.org");
        const volBackstage = await this.client.resolveRoom("#volunteers-backstage:fosdem.org");

        const db = await this.conference.getPentaDb();
        if (db === null) {
            await this.client.replyNotice(roomId, event, "Command not available as PentaDb is not enabled.");
            return;
        }

        let volunteers = await db.findAllPeopleWithRemark("volunteer");
        const dedupe: IPerson[] = [];
        for (const volunteer of volunteers) {
            if (!dedupe.some(p => p.id === volunteer.id)) {
                dedupe.push(volunteer);
            }
        }
        volunteers = dedupe;

        if (args[0] === 'verify') {
            let html = "<h3>Volunteers</h3><ul>";
            for (const person of volunteers) {
                html += `<li>${person.name}</li>`;
            }
            html += "</ul>";
            await this.client.sendHtmlNotice(roomId, html);
        } else if (args[0] === 'invite') {
            const infodesk = await this.conference.getInviteTargetsForInterest(spi);
            const infodeskResolved = await resolveIdentifiers(this.client, infodesk);
            const inBsJoined = await this.client.getJoinedRoomMembers(infBackstage);
            const volJoined = await this.client.getJoinedRoomMembers(vol);
            const volBsJoined = await this.client.getJoinedRoomMembers(volBackstage);
            for (const person of infodeskResolved) {
                try {
                    if (person.mxid && inBsJoined.includes(person.mxid)) continue;
                    await invitePersonToRoom(this.client, person, infBackstage);
                } catch (e) {
                    await logMessage(LogLevel.ERROR, "InviteCommand", `Error inviting ${person.mxid} / ${person.person.id} to ${infBackstage} - ignoring`, this.client);
                }
            }
            const volResolved = await resolveIdentifiers(this.client, volunteers);
            for (const person of volResolved) {
                try {
                    if (person.mxid && volJoined.includes(person.mxid)) continue;
                    await invitePersonToRoom(this.client, person, vol);
                } catch (e) {
                    await logMessage(LogLevel.ERROR, "InviteCommand", `Error inviting ${person.mxid} / ${person.person.id} to ${vol} - ignoring`, this.client);
                }
                try {
                    if (person.mxid && volBsJoined.includes(person.mxid)) continue;
                    await invitePersonToRoom(this.client, person, volBackstage);
                } catch (e) {
                    await logMessage(LogLevel.ERROR, "InviteCommand", `Error inviting ${person.mxid} / ${person.person.id} to ${volBackstage} - ignoring`, this.client);
                }
            }
            await this.client.sendNotice(roomId, "Invites sent");
        } else {
            await this.client.replyNotice(roomId, event, "Unknown command");
        }
    }
}
