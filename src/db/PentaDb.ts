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

import { Client, Pool } from "pg";
import config from "../config";
import { IDbPerson, Role } from "./DbPerson";
import { LogService, UserID } from "matrix-bot-sdk";
import { objectFastClone } from "../utils";

const PEOPLE_SELECT = "SELECT event_id::text, person_id::text, event_role::text, name::text, email::text, matrix_id::text, conference_room::text FROM " + config.conference.database.tblPeople;
const NONEVENT_PEOPLE_SELECT = "SELECT DISTINCT 'ignore' AS event_id, person_id::text, event_role::text, name::text, email::text, matrix_id::text, conference_room::text FROM " + config.conference.database.tblPeople;

export class PentaDb {
    private client: Pool;
    private isConnected = false;

    constructor() {
        this.client = new Pool({
            host: config.conference.database.host,
            port: config.conference.database.port,
            user: config.conference.database.username,
            password: config.conference.database.password,
            database: config.conference.database.database,

            // sslmode parsing is largely interpreted from pg-connection-string handling
            ssl: config.conference.database.sslmode === 'disable' ? false : {
                rejectUnauthorized: config.conference.database.sslmode === 'no-verify',
            },
        });
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
            return this.sanitizeRecords(result.rows);
        } else {
            const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE person_id = $1`, [personId]);
            return this.sanitizeRecords(result.rows);
        }
    }

    public async findAllPeople(): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT}`);
        return this.sanitizeRecords(result.rows);
    }

    public async findAllPeopleForAuditorium(auditoriumId: string): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${NONEVENT_PEOPLE_SELECT} WHERE conference_room = $1`, [auditoriumId]);
        return this.sanitizeRecords(result.rows);
    }

    public async findAllPeopleForTalk(talkId: string): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE event_id = $1`, [talkId]);
        return this.sanitizeRecords(result.rows);
    }

    public async findAllPeopleWithRole(role: Role): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE event_role = $1`, [role]);
        return this.sanitizeRecords(result.rows);
    }

    private sanitizeRecords(rows: IDbPerson[]): IDbPerson[] {
        return rows.map(r => {
            r = objectFastClone(r);
            const userId = r.matrix_id;
            try {
                if (userId) {
                    // we use the variable even though it's a no-op just to avoid
                    // the compiler optimizing us out.
                    const parsed = new UserID(userId);
                    r.matrix_id = parsed.toString();
                }
            } catch (e) {
                LogService.warn("PentaDb", "Invalid user ID: " + userId, e);
                r.matrix_id = null; // force clear
            }
            return r;
        });
    }
}
