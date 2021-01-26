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

import { LogLevel, LogService, MatrixClient, UserID } from "matrix-bot-sdk";
import { logMessage } from "../LogProxy";
import config from "../config";

export interface ICanonicalAliasContent {
    alias: string;
    alt_aliases: string[];
}

export async function getCanonicalAliasInfo(client: MatrixClient, roomId: string): Promise<ICanonicalAliasContent> {
    try {
        return await client.getRoomStateEvent(roomId, "m.room.canonical_alias", "");
    } catch (e) {
        // assume no state
        LogService.warn("utils/alias", e);
        return {alias: null, alt_aliases: []};
    }
}

export async function safeAssignAlias(client: MatrixClient, roomId: string, localpart: string): Promise<void> {
    try {
        // yes, we reuse the variable despite the contents changing. This is to make sure that the log message
        // gives a sense of what request failed.
        localpart = `#${localpart}:${new UserID(await client.getUserId()).domain}`;

        await client.createRoomAlias(localpart, roomId);

        const aliasInfo = await getCanonicalAliasInfo(client, roomId);
        if (!aliasInfo.alias) {
            aliasInfo.alias = localpart;
        }
        if (!aliasInfo.alt_aliases) {
            aliasInfo.alt_aliases = [];
        }
        aliasInfo.alt_aliases.push(localpart);
        await client.sendStateEvent(roomId, "m.room.canonical_alias", "", aliasInfo);
    } catch (e) {
        await logMessage(LogLevel.WARN, "utils/alias", `Non-fatal error trying to assign '${localpart}' as an alias to ${roomId} - ${e.message}`);
    }
}

export async function assignAliasVariations(client: MatrixClient, roomId: string, localpart: string, identifier?: string): Promise<void> {
    if (identifier && config.conference.prefixes.suffixes) {
        for (const [prefix, suffix] of Object.entries(config.conference.prefixes.suffixes)) {
            if (identifier.startsWith(prefix)) {
                localpart += suffix;
            }
        }
    }
    const localparts = new Set([localpart, localpart.toLowerCase(), localpart.toUpperCase()]);
    for (const lp of localparts) {
        await safeAssignAlias(client, roomId, lp);
    }
}
