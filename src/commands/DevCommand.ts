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
import config from "../config";
import { invitePersonToRoom, resolveIdentifiers } from "../invites";
import { IDbPerson, Role } from "../db/DbPerson";

export class DevCommand implements ICommand {
    public readonly prefixes = ["dev"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        const cmdRoomId = roomId;

        const idClient = await client.getIdentityServerClient(config.idServerDomain);
        idClient.brand = config.idServerBrand;
        await idClient.acceptAllTerms();

        const handleLookups = async (targets: IDbPerson[], roomId: string, ref: string) => {
            const gmailUsers = targets.filter(p => !p.matrix_id && p.email && p.email.toLowerCase().endsWith("@gmail.com"));
            const resolved = await resolveIdentifiers(gmailUsers);
            const notAccepted = resolved.filter(r => !r.mxid);
            if (notAccepted.length <= 0) return;

            // Send out the invites again
            for (const person of notAccepted) {
                await invitePersonToRoom(person, roomId);
            }
        };

        await client.sendNotice(cmdRoomId, "Fixing invites in auditoriums...");
        for (const auditorium of conference.storedAuditoriums) {
            const toInvite = await conference.getInviteTargetsForAuditorium(auditorium);
            await handleLookups(toInvite, auditorium.roomId, await auditorium.getId());
        }
        await client.sendNotice(cmdRoomId, "Fixing invites in auditorium backstages...");
        for (const auditorium of conference.storedAuditoriumBackstages) {
            const toInvite = await conference.getInviteTargetsForAuditorium(auditorium, true);
            await handleLookups(toInvite, auditorium.roomId, (await auditorium.getId()) + " (backstage)");
        }
        await client.sendNotice(cmdRoomId, "Fixing invites in speakers-support...");
        const allSpeakers = await (await conference.getPentaDb()).findAllPeopleWithRole(Role.Speaker);
        const speakerRoomId = await client.resolveRoom(config.conference.supportRooms.speakers);
        await handleLookups(allSpeakers, speakerRoomId, "speakers-support");

        await client.sendNotice(cmdRoomId, "Done!");
    }
}
