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
import { ResolvedPersonIdentifier } from "../invites";
import { runRoleCommand } from "./actions/roles";

export class PermissionsCommand implements ICommand {
    public readonly prefixes = ["permissions", "perms"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.replyNotice(roomId, event, "Updating member permissions. This might take a while.");

        // Much like the invite command, we iterate over pretty much every room and promote anyone
        // we think should be promoted. We don't remove people from power levels (that's left to the
        // existing room moderators/admins to deal with).

        await runRoleCommand(PermissionsCommand.ensureModerator, conference, client, roomId, event, args, false);

        await client.sendNotice(roomId, "Member permissions updated");
    }

    public static async ensureModerator(client: MatrixClient, roomId: string, people: ResolvedPersonIdentifier[]) {
        const powerLevels = await client.getRoomStateEvent(roomId, "m.room.power_levels", "");
        for (const person of people) {
            if (!person.mxid) continue;
            if (powerLevels['users'][person.mxid]) continue;
            powerLevels['users'][person.mxid] = 50;
        }
        await client.sendStateEvent(roomId, "m.room.power_levels", "", powerLevels);
    }
}
