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

export function encrypt(str: string): IEncrypted {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-ctr", config.secretKey, iv);
    const encrypted = Buffer.concat([cipher.update(str), cipher.final()]);
    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex'),
    };
}

export function decrypt(enc: IEncrypted): string {
    const decipher = crypto.createDecipheriv("aes-256-ctr", config.secretKey, Buffer.from(enc.iv, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(enc.content, 'hex')), decipher.final()]);
    return decrypted.toString();
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

export function sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(), ms);
    });
}
