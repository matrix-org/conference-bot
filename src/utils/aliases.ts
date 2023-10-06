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
import { applySuffixRules } from "../utils";
import { setDifference } from "./sets";

export interface ICanonicalAliasContent {
    alias: string | null;
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
        await logMessage(LogLevel.WARN, "utils/alias", `Non-fatal error trying to assign '${localpart}' as an alias to ${roomId} - ${e.message}`, client);
    }
}

export function makeLocalpart(localpart: string, identifier?: string): string {
    if (!identifier) {
        return localpart;
    }

    return applySuffixRules(localpart, identifier, config.conference.prefixes.suffixes);
}

export async function assignAliasVariations(client: MatrixClient, roomId: string, origLocalparts: string[], identifier?: string): Promise<void> {
    const localparts = new Set<string>();
    for (const origLocalpart of origLocalparts) {
        for (const localpart of calculateAliasVariations(origLocalpart, identifier)) {
            localparts.add(localpart);
        }
    }
    for (const lp of localparts) {
        await safeAssignAlias(client, roomId, lp);
    }
}

/**
 * Given the desired localpart of a room alias, generates variations of that room alias.
 *
 * Currently, this includes:
 * - the localpart itself
 * - lowercase
 * - uppercase
 *
 * @param localpart desired localpart of a room
 * @param identifier optionally, an identifier for evaluating suffix rules; see `applySuffixRules`.
 * @returns set of variations
 */
export function calculateAliasVariations(localpart: string, identifier?: string): Set<string> {
    localpart = makeLocalpart(localpart, identifier);
    return new Set([localpart, localpart.toLowerCase(), localpart.toUpperCase()]);
}

/**
 * Given a room alias, returns only the localpart.
 */
function stripAliasToLocalpart(alias: string): string {
    if (! alias.startsWith("#")) {
        throw new Error(`Alias does not start with '#': '${alias}; can't strip to localpart.`);
    }
    const colonPos = alias.indexOf(":");
    if (colonPos === -1) {
        throw new Error(`Alias does not contain ':': '${alias}; can't strip to localpart.`);
    }
    return alias.substring(1, colonPos);
}

/**
 * A type of state event, with state keys being localparts of room aliases.
 *
 * Any room alias present as a state key in this state event type is taken to be **managed** by the bot,
 * which means the bot is allowed to remove it later on.
 */
const STATE_EVENT_MANAGED_ALIAS: string = "org.matrix.confbot.managed_alias";

async function listManagedAliasLocalpartsInRoom(client: MatrixClient, roomId: string): Promise<Set<string>> {
    const localAliases = await client.doRequest("GET", "/_matrix/client/v3/rooms/" + encodeURIComponent(roomId) + "/aliases");
    const aliases: string[] = localAliases["aliases"];

    const presentLocalparts: Set<string> = new Set();

    for (const localpart of aliases.map(stripAliasToLocalpart)) {
        const event = await client.getRoomStateEvent(roomId, STATE_EVENT_MANAGED_ALIAS, localpart);
        if (event !== null && event.managed === true) {
            // This is a managed state event.
            presentLocalparts.add(localpart);
        }
    }

    return presentLocalparts;
}

export async function addAndDeleteManagedAliases(client: MatrixClient, roomId: string, desiredLocalparts: Set<string>): Promise<void> {
    const presentLocalparts: Set<string> = await listManagedAliasLocalpartsInRoom(client, roomId);

    const localpartsToBeAdded = setDifference(desiredLocalparts, presentLocalparts);
    const localpartsToBeRemoved = setDifference(presentLocalparts, desiredLocalparts);

    for (const localpart of localpartsToBeAdded) {
        // Create the state event marking the alias as managed first: this ensures we are allowed to remove it later on,
        // even if we don't succeed in creating the alias the first time around.
        await client.sendStateEvent(roomId, STATE_EVENT_MANAGED_ALIAS, localpart, {"managed": true});
        await safeAssignAlias(client, roomId, localpart);
    }

    for (const localpart of localpartsToBeRemoved) {
        // Delete the alias first of all; this ensures we don't lose 'management' status over the alias
        // if we fail to delete it.
        // But it does mean that we might have an orphaned 'managed alias' marker if we fail to remove the state event later...
        await client.deleteRoomAlias(`#${localpart}:${new UserID(await client.getUserId()).domain}`);
        await client.sendStateEvent(roomId, STATE_EVENT_MANAGED_ALIAS, localpart, {"managed": false, "notes": "deleted"});
    }
}

/**
 * Convert a string to something that is usable as a slug / ID.
 * The result only contains the characters in [a-z0-9-_.].
 */
export function slugify(input: string): string {
    return input.toLowerCase().replace(/[^0-9a-z-_.]+/g, "_");
}

/**
 * Given an unprefixed alias name and the configured list of alias prefixes, returns a list of all prefixed aliases.
 * @param name Unprefixed alias name.
 * @param prefixes List of (or single) string prefix(es). Likely to be taken from `IPrefixConfig.aliases`.
 * @returns
 */
export function applyAllAliasPrefixes(name: string, prefixes: string | string[]): string[] {
    if (typeof(prefixes) === "string") {
        // For legacy config compatibility, accept a single string in place of an array of strings:
        return [prefixes + name];
    }

    if (prefixes.length === 0) {
        // It seems undesirable to lose all aliases for a room, so assume this should have been 'no prefix' rather than 'no aliases'.
        return [name];
    }

    return prefixes.map(prefix => prefix + name);
}