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

import { IdentityClient, LogLevel } from "matrix-bot-sdk";
import config from "./config";
import { RS_3PID_PERSON_ID } from "./models/room_state";
import { logMessage } from "./LogProxy";
import { IPerson } from "./models/schedule";

let idClient: IdentityClient;

const MAX_EMAILS_PER_BATCH = 1000;

export interface ResolvedPersonIdentifier {
    mxid?: string;
    emails?: string[];
    person: IPerson;
}

async function ensureIdentityClient() {
    if (!idClient) {
        idClient = await config.RUNTIME.client.getIdentityServerClient(config.idServerDomain);
        await idClient.acceptAllTerms();
        idClient.brand = config.idServerBrand;
    }
}

async function resolveBatch(batch: IPerson[]): Promise<ResolvedPersonIdentifier[]> {
    if (batch.length <= 0) return [];
    const results = await idClient.lookup(batch.map(p => ({address: p.email, kind: "email"})));
    const resolved: ResolvedPersonIdentifier[] = [];
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const person = batch[i];
        resolved.push({
            person: person,
            emails: [person.email],
            mxid: result,
        });
    }
    return resolved;
}

export async function resolveIdentifiers(people: IPerson[]): Promise<ResolvedPersonIdentifier[]> {
    await ensureIdentityClient();

    const resolved: ResolvedPersonIdentifier[] = [];

    const pendingLookups: IPerson[] = [];

    const doResolve = async () => {
        const results = await resolveBatch(pendingLookups);
        resolved.push(...results);
    };

    for (const person of people) {
        if (person.matrix_id) {
            resolved.push({mxid: person.matrix_id, person});
            continue;
        }
        if (!person.email) {
            await logMessage(LogLevel.WARN, "invites", `No email or Matrix ID for person ${person.id} (${person.role}) - ${person.name}`);
            continue;
        }

        pendingLookups.push(person);
        if (pendingLookups.length >= MAX_EMAILS_PER_BATCH) {
            await doResolve();
        }
    }

    await doResolve(); // just in case we have a partial batch
    return resolved;
}

export async function invitePersonToRoom(resolvedPerson: ResolvedPersonIdentifier, roomId: string): Promise<void> {
    if (resolvedPerson.mxid) {
        return await config.RUNTIME.client.inviteUser(resolvedPerson.mxid.trim(), roomId);
    }

    await ensureIdentityClient();

    for (const email of resolvedPerson.emails) {
        const idInvite = await idClient.makeEmailInvite(email, roomId);
        const content = {
            display_name: idInvite.display_name,
            // XXX: https://github.com/matrix-org/matrix-doc/issues/2948
            key_validity_url: `${idClient.serverUrl}/_matrix/identity/v2/pubkey/ephemeral/isvalid`,
            public_key: idInvite.public_key,
            public_keys: idInvite.public_keys,
            [RS_3PID_PERSON_ID]: resolvedPerson.person.id,
        };
        const stateKey = idInvite.token; // not included in the content
        await config.RUNTIME.client.sendStateEvent(roomId, "m.room.third_party_invite", stateKey, content);
    }
}
