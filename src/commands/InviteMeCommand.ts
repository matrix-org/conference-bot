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
import { LiveWidget } from "../models/LiveWidget";
import { logMessage } from "../LogProxy";

export class InviteMeCommand implements ICommand {
    public readonly prefixes = ["inviteme", "inviteto"];

    private async inviteTo(client: MatrixClient, invitee: string, room: string): Promise<void> {
        const members = await client.getJoinedRoomMembers(room);
        if (members.includes(invitee)) return;
        await client.inviteUser(invitee, room);
    }

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        if (!args.length) {
            return client.replyNotice(roomId, event, "Please specify a room ID or alias");
        }
        const userId = args[1] || event['sender'];

        if (args[0] === "public") {
            for (const aud of conference.storedAuditoriums) {
                try {
                    await this.inviteTo(client, userId, aud.roomId);
                } catch (e) {
                    await logMessage(LogLevel.WARN, "InviteMeCommand", `Error inviting ${userId} to ${aud.roomId}: ${e?.message || e?.body?.message}`);
                }
            }
            for (const spi of conference.storedInterestRooms) {
                try {
                    await this.inviteTo(client, userId, spi.roomId);
                } catch (e) {
                    await logMessage(LogLevel.WARN, "InviteMeCommand", `Error inviting ${userId} to ${spi.roomId}: ${e?.message || e?.body?.message}`);
                }
            }
            await client.replyNotice(roomId, event, "Invite sent");
        } else {
            const targetRoomId = await client.resolveRoom(args[0]);
            await client.inviteUser(userId, targetRoomId);
            await client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
        }
    }
}
