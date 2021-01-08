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

import { MatrixClient } from "matrix-bot-sdk";
import { IStateEvent, RS_STORED_DB_PERSON } from "./room_state";
import { Conference } from "../Conference";
import { decrypt, encrypt, IEncrypted, objectFastCloneWithout } from "../utils";
import { YamlPerson } from "../RolesYaml";

export interface RSDbPerson {
    id: string;
    name: string;
    mxid?: IEncrypted;
    emails?: IEncrypted; // encrypted array of strings
    pentabarfId: string;
    roles: string[];
}

export class DbPerson {
    constructor(private person: RSDbPerson, private client: MatrixClient, private conference: Conference) {
    }

    public get definition(): RSDbPerson {
        return this.person;
    }

    public get yaml(): YamlPerson {
        return {
            ...objectFastCloneWithout(this.person, ['mxid', 'emails']),
            mxid: this.mxid,
            emails: this.emails,
        } as YamlPerson;
    }

    public get emails(): string[] {
        if (this.person.emails) {
            return JSON.parse(decrypt(this.person.emails));
        }
        return null;
    }

    public get mxid(): string {
        if (this.person.mxid) {
            return decrypt(this.person.mxid);
        }
        return null;
    }

    public get stateEvent(): IStateEvent<RSDbPerson> {
        return {
            type: RS_STORED_DB_PERSON,
            state_key: this.person.id,
            content: objectFastCloneWithout(this.person, []) as RSDbPerson,
        };
    }

    public static fromYaml(person: YamlPerson): RSDbPerson {
        const encEmail = person.emails ? encrypt(JSON.stringify(person.emails)) : null;
        const encMxid = person.mxid ? encrypt(person.mxid) : null;
        return {
            ...objectFastCloneWithout(person, ['mxid', 'emails']),
            mxid: encMxid,
            emails: encEmail,
        } as RSDbPerson;
    }
}
