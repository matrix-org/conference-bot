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

import { Pool } from "pg";
import config from "../config";
import { IDbPerson, Role } from "./DbPerson";
import { LogService, UserID } from "matrix-bot-sdk";
import { objectFastClone } from "../utils";
import { IDbTalk, IRawDbTalk } from "./DbTalk";

const PEOPLE_SELECT = "SELECT event_id::text, person_id::text, event_role::text, name::text, email::text, matrix_id::text, conference_room::text, remark::text FROM " + config.conference.database.tblPeople;
const NONEVENT_PEOPLE_SELECT = "SELECT DISTINCT 'ignore' AS event_id, person_id::text, event_role::text, name::text, email::text, matrix_id::text, conference_room::text FROM " + config.conference.database.tblPeople;

const START_QUERY = "start_datetime AT TIME ZONE $1 AT TIME ZONE 'UTC'";
const QA_START_QUERY = "(start_datetime + presentation_length) AT TIME ZONE $1 AT TIME ZONE 'UTC'";
const END_QUERY = "(start_datetime + duration) AT TIME ZONE $1 AT TIME ZONE 'UTC'";
const SCHEDULE_SELECT = `SELECT DISTINCT event_id::text, conference_room::text, EXTRACT(EPOCH FROM ${START_QUERY}) * 1000 AS start_datetime, EXTRACT(EPOCH FROM duration) AS duration_seconds, EXTRACT(EPOCH FROM presentation_length) AS presentation_length_seconds, EXTRACT(EPOCH FROM ${END_QUERY}) * 1000 AS end_datetime, EXTRACT(EPOCH FROM ${QA_START_QUERY}) * 1000 AS qa_start_datetime, prerecorded FROM ` + config.conference.database.tblSchedule;

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

    public async findAllPeopleWithRemark(remark: string): Promise<IDbPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE remark = $1`, [remark]);
        return this.sanitizeRecords(result.rows);
    }

    public async getUpcomingTalkStarts(inNextMinutes: number, minBefore: number): Promise<IDbTalk[]> {
        return this.getTalksWithin(START_QUERY, inNextMinutes, minBefore);
    }

    public async getUpcomingQAStarts(inNextMinutes: number, minBefore: number): Promise<IDbTalk[]> {
        return this.getTalksWithin(QA_START_QUERY, inNextMinutes, minBefore);
    }

    public async getUpcomingTalkEnds(inNextMinutes: number, minBefore: number): Promise<IDbTalk[]> {
        return this.getTalksWithin(END_QUERY, inNextMinutes, minBefore);
    }

    /**
     * Gets the record for a talk.
     * @param talkId The talk ID.
     * @returns The record for the talk, if it exists; `null` otherwise.
     */
    public async getTalk(talkId: string): Promise<IDbTalk | null> {
        const result = await this.client.query(
            `${SCHEDULE_SELECT} WHERE event_id::text = $2`,
            [config.conference.timezone, talkId]);
        return result.rowCount > 0 ? this.postprocessDbTalk(result.rows[0]) : null;
    }

    private async getTalksWithin(timeQuery: string, inNextMinutes: number, minBefore: number): Promise<IDbTalk[]> {
        const now = "NOW() AT TIME ZONE 'UTC'";
        const result = await this.client.query(
            `${SCHEDULE_SELECT} WHERE ${timeQuery} >= (${now} - MAKE_INTERVAL(mins => $2)) AND ${timeQuery} <= (${now} + MAKE_INTERVAL(mins => $3))`,
            [config.conference.timezone, minBefore, inNextMinutes]);
        return this.postprocessDbTalks(result.rows);
    }

    private postprocessDbTalk(talk: IRawDbTalk): IDbTalk {
        const qaStartDatetime = talk.qa_start_datetime + config.conference.database.scheduleBufferSeconds * 1000;
        let livestreamStartDatetime: number;
        if (talk.prerecorded) {
            // For prerecorded talks, a preroll is shown, followed by the talk recording, then an
            // interroll, then live Q&A.
            livestreamStartDatetime = qaStartDatetime;
        } else {
            // For live talks, both the preroll and interroll are shown, followed by the live talk.
            livestreamStartDatetime = talk.start_datetime + config.conference.database.scheduleBufferSeconds * 1000;
        }

        return {
            ...talk,

            qa_start_datetime: qaStartDatetime,
            livestream_start_datetime: livestreamStartDatetime,
        };
    }

    private postprocessDbTalks(rows: IRawDbTalk[]): IDbTalk[] {
        return rows.map(this.postprocessDbTalk);
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
                    r.matrix_id = parsed.toString().trim();
                }
            } catch (e) {
                LogService.warn("PentaDb", "Invalid user ID: " + userId, e);
                r.matrix_id = null; // force clear
            }
            return r;
        });
    }
}
