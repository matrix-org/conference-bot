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
import { invitePersonToRoom, ResolvedPersonIdentifier } from "../invites";
import { logMessage } from "../LogProxy";

export class JoinCommand implements ICommand {
    public readonly prefixes = ["join"];

    constructor(private readonly client: MatrixClient) {}

    public async run(roomId: string, event: any, args: string[]) {
        if (!args.length) {
            return this.client.replyNotice(roomId, event, "Please specify a room ID or alias");
        }

        await this.client.unstableApis.addReactionToEvent(roomId, event['event_id'], '⌛️');

        try {
            await this.client.joinRoom(args[0], []);
        }
        catch (error) {
            throw Error(`Error joining room ${args[0]}`, {cause:error})
        }

        await this.client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
    }
}
