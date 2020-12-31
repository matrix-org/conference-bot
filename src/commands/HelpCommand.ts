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
import { simpleHtmlReply } from "../utils";

export class HelpCommand implements ICommand {
    public readonly prefixes = ["help", "?"];

    public async run(client: MatrixClient, roomId: string, event: any, args: string[]) {
        const htmlHelp = "" +
            "<h1>Conference bot help</h1>" +
            "<h4>General:</h4>" +
            "<pre><code>" +
            "!events help                    - This menu.\n" +
            "!events create &lt;pentabarf url&gt;  - Creates a new event. If no event is currently active \n" +
            "                                  then this event will be made active.\n" +
            "</code></pre>" +
            "";
        return simpleHtmlReply(client, roomId, event, htmlHelp);
    }
}
