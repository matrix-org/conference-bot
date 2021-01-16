/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import {Client} from "pg";
import config from "../config";
import { IDbPerson } from "./DbPerson";

const PEOPLE_SELECT = "SELECT event_id::text, person_id::text, event_role::text, name::text, email::text, matrix_id::text, conference_room::text FROM " + config.conference.database.tblPeople;

export class PentaDb {
    private client: Client;
    private isConnected = false;

    constructor() {
        this.client = new Client(config.conference.database.connectionString);
    }

    public async connect() {
        if (this.isConnected) return;
        await this.client.connect();
        this.isConnected = true;
    }

    public async disconnect() {
        if (!this.isConnected) return;
        await this.client.end();
        this.isConnected = false;
    }

    public async findPeopleWithId(personId: string): Promise<IDbPerson[]> {
        const numericPersonId = Number(personId);
        if (Number.isSafeInteger(numericPersonId)) {
            const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE person_id = $1 OR person_id = $2`, [personId, numericPersonId]);
            return result.rows;
        } else {
            const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE person_id = $1`, [personId]);
            return result.rows;
        }
    }

    public async findAllPeople(): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT}`);
        return result.rows;
    }

    public async findAllPeopleForAuditorium(auditoriumId: string): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE conference_room = $1`, [auditoriumId]);
        return result.rows;
    }

    public async findAllPeopleForTalk(talkId: string): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE event_id = $1`, [talkId]);
        return result.rows;
    }
}
