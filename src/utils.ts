/*
Copyright 2019, 2020, 2021 The Matrix.org Foundation C.I.C.

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
    TextualMessageEventContent,
    UserID
} from "matrix-bot-sdk";
import { logMessage } from "./LogProxy";
import * as htmlEscape from "escape-html";
import * as crypto from "crypto";
import config from "./config";

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

export function objectFastCloneWithout<T>(obj: T, keys: (keyof T)[]): T | Partial<T> {
    const repl = <T>{};
    for (const key of <(keyof T)[]>Object.keys(obj)) {
        if (keys.includes(key)) continue;
        repl[key] = obj[key];
    }
    return repl;
}

export function objectFastClone<T>(obj: T): T {
    const repl = <T>{};
    for (const key of <(keyof T)[]>Object.keys(obj)) {
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
        const searchPls = (objOrVal: any | number) => {
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

export interface IEncrypted {
    iv: string;
    content: string;
}

export async function asyncFind<T>(a: T[], fn: (i: T) => Promise<boolean>): Promise<T> {
    for (const i of a) {
        if (await fn(i)) {
            return i;
        }
    }
    return null;
}

export async function asyncFilter<T>(a: T[], fn: (i: T) => Promise<boolean>): Promise<T[]> {
    const r: T[] = [];
    for (const i of a) {
        if (await fn(i)) {
            r.push(i);
        }
    }
    return r;
}

export async function makeRoomPublic(roomId: string, client: MatrixClient) {
    await client.sendStateEvent(roomId, "m.room.guest_access", "", {guest_access: "can_join"});
    await client.sendStateEvent(roomId, "m.room.history_visibility", "", {history_visibility: "world_readable"});
    await client.sendStateEvent(roomId, "m.room.join_rules", "", {join_rule: "public"});
}

/**
 * Edits a previously sent notice.
 * @param client The matrix-bot-sdk client.
 * @param roomId The room containing the notice.
 * @param eventId The event ID of the notice to edit.
 * @param text The updated text of the notice.
 */
export async function editNotice(
    client: MatrixClient, roomId: string, eventId: string, text: string
) {
    await client.sendEvent(roomId, "m.room.message", {
        body: text,
        msgtype: "m.notice",
        "m.new_content": {
            "body": text,
            "msgtype": "m.notice"
        },
        "m.relates_to": {
            "rel_type": "m.replace",
            "event_id": eventId,
        }
    });
}

export function isEmojiVariant(expected: string, value: string): boolean {
    return expected.codePointAt(0) === value.codePointAt(0);
}

/**
 * Suffixes the given string according to the provided rules.
 * @param str The string to be suffixed.
 * @param identifier The identifier against which to evaluate the suffix rules.
 * @param suffixRules A mapping from identifier prefixes to string suffixes.
 * @returns The string, with any applicable suffixes applied.
 */
export function applySuffixRules(
    str: string, identifier: string, suffixRules: {[prefix: string]: string}
): string {
    for (const [prefix, suffix] of Object.entries(suffixRules)) {
        if (identifier.startsWith(prefix)) {
            str += suffix;
        }
    }
    return str;
}

/**
 * Formats the display name for a room according to the config.
 * @param name The base name of the room.
 * @param identifier The identifier of the room.
 * @returns The formatted display name for the room.
 */
export function makeDisplayName(name: string, identifier: string): string {
    return applySuffixRules(
        name, identifier, config.conference.prefixes.displayNameSuffixes
    );
}
