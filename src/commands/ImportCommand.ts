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
import { LogService, MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { RolesYaml } from "../RolesYaml";

export class ImportCommand implements ICommand {
    public readonly prefixes = ["import", "i"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.sendReadReceipt(roomId, event['event_id']);

        switch (args[0]) {
            case "roles":
                await this.importRoles(conference, client, roomId, event, args);
                break;
            default:
                return await client.replyNotice(roomId, event, "Unknown command - try !conference help");
        }
    }

    private async importRoles(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        try {
            await client.replyNotice(roomId, event, "Importing YAML... This could be a while.");
            await (new RolesYaml(conference)).load();
            await client.replyNotice(roomId, event, "Imported and ready for invites!");
        } catch (e) {
            LogService.error("ImportCommand", e);
            return await client.replyNotice(roomId, event, `Error processing YAML: ${e.message}`);
        }
    }
}
