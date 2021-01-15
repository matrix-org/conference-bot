/*
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

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

export class HelpCommand implements ICommand {
    public readonly prefixes = ["help", "?"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        const htmlHelp = "" +
            "<h1>Conference bot help</h1>" +
            "<h4>General:</h4>" +
            "<pre><code>" +
            "!conference help   - This menu.\n" +
            "!conference build  - Builds the basic conference structure needed to prepare the rest\n" +
            "                     of the conference. This is based off the bot's config.\n" +
            "</code></pre>" +
            "<h4>People management:</h4>" +
            "<pre><code>" +
            "!conference export roles  - Exports a YAML file in the bot's storage for all of the roles.\n" +
            "!conference import roles  - Imports the YAML file to set up structures.\n" +
            "!conference plumb-irc #irchannel !room:id    - Plumbs an IRC channel into a given room.\n" +
            "!conference verify &lt;aud&gt;  - Dumps information about who would be invited to which rooms when\n" +
            "                            the invite command is run for the auditorium.\n" +
            "!conference invite [aud]  - Issues invites to all the people to their relevant rooms. If an [aud] is\n" +
            "                            supplied, only that auditorium will receive invites.\n" +
            "!conference permissions   - Updates moderator status for everyone that is supposed to have it.\n" +
            "</code></pre>" +
            "";
        return client.replyHtmlNotice(roomId, event, htmlHelp);
    }
}
