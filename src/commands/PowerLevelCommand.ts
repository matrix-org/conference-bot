/*
Copyright 2024 The Matrix.org Foundation C.I.C.

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
import { Conference } from "../Conference";
import {ConferenceMatrixClient} from "../ConferenceMatrixClient";
import {InviteMeCommand} from "./InviteMeCommand";

export class PowerLevelCommand implements ICommand {

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference) {
    }

    public readonly prefixes = ["powerlevels"];

    public async run(managementRoomId: string, event: any, args: string[]) {
        let targetId = args[0]
        let pl = args[2]

        const IM = new InviteMeCommand(this.client, this.conference);
        const roomGroups = await IM.roomGroups();
        console.log(roomGroups)

        if (!args.length) {
            return this.client.replyHtmlNotice(managementRoomId, event, "Please specify a room ID or alias, or one of the room groups:\n" + IM.prettyGroupNameList(roomGroups));
        }

        if (roomGroups.has(args[1])) {
            const group = roomGroups.get(args[1])!;
            for (const roomId of group) {
                try {
                    await this.client.setUserPowerLevel(targetId, roomId, Number(pl));
                }
                catch (e) {
                    throw new Error(`Error setting power levels: in room ${roomId}, ${e.body}`)
                }
                await this.client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
            }
        } else {
            let targetRoomId;
            try {
                targetRoomId = await this.client.resolveRoom(args[1]);
            }
            catch (error) {
                throw Error(`Error resolving room ${args[1]}`, {cause:error})
            }
            try {
                await this.client.setUserPowerLevel(targetRoomId, targetRoomId, Number(pl));
            }
            catch (e) {
                throw new Error(`Error setting power levels in room ${targetRoomId}: ${e.body}`)
            }
        }

        return this.client.replyHtmlNotice(managementRoomId, event, "Power levels sent")
    }

}



