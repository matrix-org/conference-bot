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
import {MatrixClient, MembershipEvent, PowerLevelsEventContent} from "matrix-bot-sdk";

export class CopyModeratorsCommand implements ICommand {
    public readonly prefixes = ["copymods", "copymoderators", "copy_mods", "copy_moderators"];

    constructor(private readonly client: MatrixClient) {}

    public async run(roomId: string, event: any, args: string[]) {
        if (args.length < 2) {
            return this.client.replyNotice(roomId, event, "Please specify two rooms");
        }
        const fromRoomId = await this.client.resolveRoom(args[0]);
        const toRoomId = await this.client.resolveRoom(args[1]);

        let fromPl: PowerLevelsEventContent = {}
        try {
            fromPl = await this.client.getRoomStateEvent(fromRoomId, "m.room.power_levels", "");
        }
        catch (error) {
            throw Error(`Error fetching or processing power level event from room ${fromRoomId}:`, {cause: error})
        }

        let toPl: PowerLevelsEventContent;
        try {
            toPl = await this.client.getRoomStateEvent(toRoomId, "m.room.power_levels", "");
        }
        catch (error) {
            throw Error(`Error fetching or processing power level event from room ${toRoomId}`, {cause: error})
        }

        if (!toPl) toPl = {};
        if (!toPl['users']) toPl['users'] = {};

        for (const [userId, pl] of Object.entries(fromPl?.['users'] || {})) {
            const existingPl = toPl['users'][userId];
            if (!existingPl || existingPl < pl) {
                toPl['users'][userId] = pl;
            }
        }

        try {
            await this.client.sendStateEvent(toRoomId, "m.room.power_levels", "", toPl);
        }
        catch (error) {
            throw Error(`Error sending new power level event into room ${toRoomId}`, {cause: error})
        }

        let state: any[] = []
        try {
            state = await this.client.getRoomState(toRoomId);
        }
        catch (error) {
            throw Error(`Error getting room state from room ${toRoomId}`, {cause: error})
        }
        const members = state.filter(s => s.type === "m.room.member").map(s => new MembershipEvent(s));
        const effectiveJoinedUserIds = members.filter(m => m.effectiveMembership === "join").map(m => m.membershipFor);
        for (const userId of Object.keys(toPl['users'])) {
            if (!effectiveJoinedUserIds.includes(userId)) {
                try {
                    await this.client.inviteUser(userId, toRoomId);
                }
                catch (error) {
                    throw Error(`Error inviting user ${userId} to room ${toRoomId}`, {cause: error})
                }
            }
        }

        await this.client.replyNotice(roomId, event, "Moderators copied and invited");
    }
}
