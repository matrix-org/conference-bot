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
            "Hint: For all commands, instead of !conference you can also use a tab-completed mention pill of the bot's name!\n" +
            "<h4>General:</h4>" +
            "<pre><code>" +
            "!conference help                                          - This menu.\n" +
            "!conference build                                         - Builds the basic conference structure needed to prepare the rest\n" +
            "                                                            of the conference. This is based off the bot's config.\n" +
            "!conference build [sionly] [backstages] [notalks] [nosi]  - The same as !conference build.\n" +
            "                                                            'sionly' restricts the build to special interest rooms only.\n" +
            "                                                            'backstages' excludes auditorium spaces, rooms and talk rooms.\n" +
            "                                                            'notalks' excludes talk rooms.\n" +
            "                                                            'nosi' excludes special interest rooms.\n" +
            "!conference build talk &lt;aud&gt; &lt;talk-id&gt;                    - Builds the auditorium and room for a single talk.\n" +
            "!conference build interest &lt;interest-id&gt;                  - Builds a single interest room.\n" +
            "!conference run &lt;aud&gt;                                     - Runs the schedule in the given auditorium. If 'all' is used,\n" +
            "                                                            then all auditoriums will be run.\n" +
            "!conference stop                                          - Halts all scheduling, resetting the bot back to no watched auditoriums.\n" +
            "</code></pre>" +
            "<h4>People management:</h4>" +
            "<pre><code>" +
            "!conference verify &lt;aud&gt;  - Dumps information about who would be invited to which rooms when\n" +
            "                            the invite command is run for the auditorium.\n" +
            "!conference invite [aud]  - Issues invites to all the people to their relevant rooms. If an [aud] is\n" +
            "                            supplied, only that auditorium will receive invites.\n" +
            "!conference permissions   - Updates moderator status for everyone that is supposed to have it.\n" +
            "!conference attendance    - Checks the status of invites across the conference.\n" +
            "</code></pre>" +
            "<h4>Bridge management:</h4>" +
            "<pre><code>" +
            "!conference plumb-irc all               - Plumbs all auditoriums into IRC channels.\n" +
            "!conference plumb-irc &lt;channel&gt; &lt;room&gt;  - Plumbs an IRC channel into a given room.\n" +
            "</code></pre>" +
            "<h4>General management:</h4>" +
            "<pre><code>" +
            "!conference inviteme &lt;room&gt;         - Asks the bot to invite you to the given room.\n" +
            "!conference inviteto &lt;room&gt; &lt;user&gt;  - Asks the bot to invite the given user to the given room.\n" +
            "!conference join &lt;room&gt;             - Makes the bot join the given room.\n"
            "!conference copymods &lt;from&gt; &lt;to&gt;    - Copies the moderators from one room to another.\n" +
            "!conference widgets &lt;aud&gt;           - Creates all widgets for the auditorium and its talks.\n" +
            "</code></pre>" +
            "";
        return client.replyHtmlNotice(roomId, event, htmlHelp);
    }
}
