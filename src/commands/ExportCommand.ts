/*
Copyright 2020 The Matrix.org Foundation C.I.C.

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
import { htmlMessage, simpleHtmlReply, simpleReply } from "../utils";
import { Conference } from "../Conference";
import { RolesYaml } from "../RolesYaml";

export class ExportCommand implements ICommand {
    public readonly prefixes = ["export", "e"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.sendReadReceipt(roomId, event['event_id']);

        switch (args[0]) {
            case "roles":
                await this.exportRoles(conference, client, roomId, event, args);
                break;
            default:
                return await simpleReply(client, roomId, event, "Unknown command - try !conference help");
        }
    }

    private async exportRoles(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        const fpath = await (new RolesYaml(conference)).save();
        return await simpleHtmlReply(client, roomId, event, `Roles exported to <code>${fpath}</code>`);
    }
}
