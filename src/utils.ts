/*
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

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

// Borrowed in part from Mjolnir

import {
    LogLevel,
    LogService,
    MatrixClient,
    MessageType,
    Permalinks,
    RichReply,
    TextualMessageEventContent,
    UserID
} from "matrix-bot-sdk";
import { logMessage } from "./LogProxy";
import * as htmlEscape from "escape-html";
import { htmlToText } from "html-to-text";
import * as crypto from "crypto";

export async function replaceRoomIdsWithPills(client: MatrixClient, text: string, roomIds: string[] | string, msgtype: MessageType = "m.text"): Promise<TextualMessageEventContent> {
    if (!Array.isArray(roomIds)) roomIds = [roomIds];

    const content: TextualMessageEventContent = {
        body: text,
        formatted_body: htmlEscape(text),
        msgtype: msgtype,
        format: "org.matrix.custom.html",
    };

    const escapeRegex = (v: string): string => {
        return v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    };

    const viaServers = [(new UserID(await client.getUserId())).domain];
    for (const roomId of roomIds) {
        let alias = roomId;
        try {
            alias = (await client.getPublishedAlias(roomId)) || roomId;
        } catch (e) {
            // This is a recursive call, so tell the function not to try and call us
            await logMessage(LogLevel.WARN, "utils", `Failed to resolve room alias for ${roomId} - see console for details`, null, true);
            LogService.warn("utils", e);
        }
        const regexRoomId = new RegExp(escapeRegex(roomId), "g");
        content.body = content.body.replace(regexRoomId, alias);
        content.formatted_body = content.formatted_body.replace(regexRoomId, `<a href="${Permalinks.forRoom(alias, viaServers)}">${alias}</a>`);
    }

    return content;
}

export async function simpleReply(client: MatrixClient, roomId: string, event: any, text: string) {
    const reply = RichReply.createFor(roomId, event, text, htmlEscape(text));
    reply['msgtype'] = 'm.notice';
    return await client.sendMessage(roomId, reply);
}

export async function simpleHtmlReply(client: MatrixClient, roomId: string, event: any, html: string) {
    const reply = RichReply.createFor(roomId, event, htmlToText(html, {wordwrap: false}), html);
    reply['msgtype'] = 'm.notice';
    return await client.sendMessage(roomId, reply);
}

export function htmlMessage(msgtype: string, html: string): any {
    return {
        body: htmlToText(html, {wordwrap: false}),
        msgtype: msgtype,
        format: "org.matrix.custom.html",
        formatted_body: html,
    };
}

export function objectFastCloneWithout<T>(obj: T, keys: (keyof T)[]): T | Partial<T> {
    const repl = <T>{};
    for (const key of <(keyof T)[]>Object.keys(obj)) {
        if (keys.includes(key)) continue;
        repl[key] = obj[key];
    }
    return repl;
}

export async function safeCreateRoom(client: MatrixClient, opts: any): Promise<string> {
    if (opts) {
        opts = JSON.parse(JSON.stringify(opts)); // clone for safety
    }
    if (opts?.power_level_content_override) {
        if (!opts.power_level_content_override.users) {
            opts.power_level_content_override.users = {};
        }

        let maxPl = 100;
        const searchPls = (objOrVal:any|number) => {
            if (!Number.isInteger(objOrVal)) {
                for (const val of Object.values(objOrVal)) {
                    searchPls(val);
                }
            } else {
                if (objOrVal > maxPl) {
                    maxPl = objOrVal;
                }
            }
        };
        searchPls(opts.power_level_content_override);

        opts.power_level_content_override.users[await client.getUserId()] = maxPl;
    }
    return await client.createRoom(opts);
}

export function sha256(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex');
}
