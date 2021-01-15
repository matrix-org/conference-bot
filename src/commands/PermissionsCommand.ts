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
import { MatrixClient, MembershipEvent } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { invitePersonToRoom, resolveIdentifiers } from "../invites";
import { RS_3PID_PERSON_ID } from "../models/room_state";

export class PermissionsCommand implements ICommand {
    public readonly prefixes = ["permissions", "perms"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.replyNotice(roomId, event, "Updating member permissions. This might take a while.");

        // // Much like the invite command, we iterate over pretty much every room and promote anyone
        // // we think should be promoted. Everyone else gets removed from the power levels.
        //
        // const allRoomIds = [
        //     ...conference.storedAuditoriumBackstages.map(r => r.roomId),
        //     ...conference.storedAuditoriums.map(r => r.roomId),
        //     ...conference.storedTalks.map(r => r.roomId),
        //     // TODO: Special interest rooms
        // ];
        //
        // for (const roomId of allRoomIds) {
        //     await conference.fixPermissionsIn(roomId);
        // }

        await client.sendNotice(roomId, "Member permissions updated");
    }
}
