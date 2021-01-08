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

import { IdentityClient } from "matrix-bot-sdk";
import { DbPerson } from "./models/DbPerson";
import config from "./config";
import { RS_3PID_PERSON_ID } from "./models/room_state";

let idClient: IdentityClient;

export interface ResolvedPersonIdentifier {
    mxid?: string;
    emails?: string[];
    person: DbPerson;
}

async function ensureIdentityClient() {
    if (!idClient) {
        idClient = await config.RUNTIME.client.getIdentityServerClient(config.idServerDomain);
        await idClient.acceptAllTerms();
    }
}

export async function resolveIdentifiers(people: DbPerson[]): Promise<ResolvedPersonIdentifier[]> {
    await ensureIdentityClient();

    const resolved: ResolvedPersonIdentifier[] = [];

    for (const person of people) {
        if (person.mxid) {
            resolved.push({mxid: person.mxid, person});
            continue;
        }

        const idLookups = person.emails.map(e => ({address: e, kind: "email"}));
        const results = await idClient.lookup(idLookups);
        const mxid = results.find(i => !!i);
        if (mxid) {
            resolved.push({mxid: mxid, person});
        } else {
            resolved.push({emails: person.emails, person});
        }
    }

    return resolved;
}

export async function invitePersonToRoom(resolvedPerson: ResolvedPersonIdentifier, roomId: string): Promise<void> {
    if (resolvedPerson.mxid) {
        return await config.RUNTIME.client.inviteUser(resolvedPerson.mxid, roomId);
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
            [RS_3PID_PERSON_ID]: resolvedPerson.person.definition.id,
        };
        const stateKey = idInvite.token; // not included in the content
        await config.RUNTIME.client.sendStateEvent(roomId, "m.room.third_party_invite", stateKey, content);
    }
}
