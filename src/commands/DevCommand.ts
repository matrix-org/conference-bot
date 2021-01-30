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
import { PentabarfParser } from "../parsers/PentabarfParser";
import * as fetch from "node-fetch";
import { resolveIdentifiers } from "../invites";
import { IDbPerson, Role } from "../db/DbPerson";
import { RS_3PID_PERSON_ID } from "../models/room_state";

export class DevCommand implements ICommand {
    public readonly prefixes = ["dev"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        const beforeTime = 1611676800000;
        const cmdRoomId = roomId;

        const handleLookups = async (targets: IDbPerson[], roomId: string, ref: string) => {
            const gmailUsers = targets.filter(p => !p.matrix_id && p.email?.toLowerCase().endsWith("@gmail.com"));
            const resolved = await resolveIdentifiers(gmailUsers);
            const notAccepted = resolved.filter(r => !r.mxid);
            if (notAccepted.length <= 0) return;

            const roomState = await client.getRoomState(roomId);
            const inviteEvents = roomState.filter(e => e['type'] === 'm.room.third_party_invite' && e['origin_server_ts'] < beforeTime);
            const personIds = notAccepted.map(p => p.person.person_id);
            const invitesForPeople = inviteEvents.filter(e => personIds.includes(e['content']?.[RS_3PID_PERSON_ID]));

            if (args[0] === "2") {

            } else {
                await client.sendNotice(cmdRoomId, `${ref}: ${invitesForPeople.length}/${inviteEvents.length} gmail invites need to be resent`);
            }
        };

        for (const auditorium of conference.storedAuditoriums) {
            const toInvite = await conference.getInviteTargetsForAuditorium(auditorium);
            await handleLookups(toInvite, auditorium.roomId, await auditorium.getId());
        }
        for (const auditorium of conference.storedAuditoriumBackstages) {
            const toInvite = await conference.getInviteTargetsForAuditorium(auditorium, true);
            await handleLookups(toInvite, auditorium.roomId, (await auditorium.getId()) +" (backstage)");
        }
        const allSpeakers = await (await conference.getPentaDb()).findAllPeopleWithRole(Role.Speaker);
        const speakerRoomId = await client.resolveRoom(config.conference.supportRooms.speakers);
        await handleLookups(allSpeakers, speakerRoomId, "speakers-support");
    }
}
