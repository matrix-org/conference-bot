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
import { LogService, MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { ResolvedPersonIdentifier } from "../invites";
import { runRoleCommand } from "./actions/roles";
import { ConferenceMatrixClient } from "../ConferenceMatrixClient";

export class PermissionsCommand implements ICommand {
    public readonly prefixes = ["permissions", "perms"];

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference) {}

    public async run(roomId: string, event: any, args: string[]) {
        await this.client.replyNotice(roomId, event, "Updating member permissions. This might take a while.");

        // Much like the invite command, we iterate over pretty much every room and promote anyone
        // we think should be promoted. We don't remove people from power levels (that's left to the
        // existing room moderators/admins to deal with).

        await runRoleCommand(PermissionsCommand.ensureModerator, this.conference, this.client, roomId, event, args, false);

        await this.client.sendNotice(roomId, "Member permissions updated");
    }

    public static async ensureModerator(client: MatrixClient, roomId: string, people: ResolvedPersonIdentifier[]) {
        let powerLevels;
        try {
             powerLevels = await client.getRoomStateEvent(roomId, "m.room.power_levels", "");
        }
        catch (error) {
            throw Error(`Error fetching power levels for room ${roomId}`, {cause:error})
        }

        for (const person of people) {
            if (!person.mxid) continue;

            if (! /^@[^:]+:[^.]+\..+$/.test(person.mxid)) {
                LogService.warn("PermissionsCommand", `ignoring invalid MXID ${person.mxid}`);
                continue;
            }

            if (powerLevels['users'][person.mxid]) continue;
            powerLevels['users'][person.mxid] = 50;
        }

        try {
            await client.sendStateEvent(roomId, "m.room.power_levels", "", powerLevels);
        }
        catch (error) {
            throw Error(`Error sending powerlevels event into room ${roomId}`, {cause:error})
        }
    }
}
