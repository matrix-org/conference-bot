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
import config, { IPentaDbConfig } from "../../../config";
import { dbPersonToPerson, IDbPerson } from "./DbPerson";
import { LogService, UserID } from "matrix-bot-sdk";
import { objectFastClone } from "../../../utils";
import { IDbTalk, IRawDbTalk } from "./DbTalk";
import { IPerson, Role } from "../../../models/schedule";

const PEOPLE_SELECT = "SELECT event_id::text, person_id::text, event_role::text, name::text, email::text, matrix_id::text, conference_room::text, remark::text FROM " + config.conference.database?.tblPeople;
const NONEVENT_PEOPLE_SELECT = "SELECT DISTINCT 'ignore' AS event_id, person_id::text, event_role::text, name::text, email::text, matrix_id::text, conference_room::text FROM " + config.conference.database?.tblPeople;

const START_QUERY = "start_datetime AT TIME ZONE $1 AT TIME ZONE 'UTC'";
const QA_START_QUERY = "(start_datetime + presentation_length) AT TIME ZONE $1 AT TIME ZONE 'UTC'";
const END_QUERY = "(start_datetime + duration) AT TIME ZONE $1 AT TIME ZONE 'UTC'";
const SCHEDULE_SELECT = `SELECT DISTINCT event_id::text, conference_room::text, EXTRACT(EPOCH FROM ${START_QUERY}) * 1000 AS start_datetime, EXTRACT(EPOCH FROM duration) AS duration_seconds, EXTRACT(EPOCH FROM presentation_length) AS presentation_length_seconds, EXTRACT(EPOCH FROM ${END_QUERY}) * 1000 AS end_datetime, EXTRACT(EPOCH FROM ${QA_START_QUERY}) * 1000 AS qa_start_datetime, prerecorded FROM ` + config.conference.database?.tblSchedule;

export class PentaDb {
    private client: Pool;
    private isConnected = false;

    constructor(private readonly config: IPentaDbConfig) {
        this.client = new Pool({
            host: this.config.host,
            port: this.config.port,
            user: this.config.username,
            password: this.config.password,
            database: this.config.database,

            // sslmode parsing is largely interpreted from pg-connection-string handling
            ssl: this.config.sslmode === 'disable' ? false : {
                rejectUnauthorized: this.config.sslmode === 'no-verify',
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

    public async findPeopleWithId(personId: string): Promise<IPerson[]> {
        const numericPersonId = Number(personId);
        if (Number.isSafeInteger(numericPersonId)) {
            const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE person_id = $1 OR person_id = $2`, [personId, numericPersonId]);
            return this.sanitizeRecords(result.rows).map(dbPersonToPerson);
        } else {
            const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE person_id = $1`, [personId]);
            return this.sanitizeRecords(result.rows).map(dbPersonToPerson);
        }
    }

    public async findAllPeople(): Promise<IPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT}`);
        return this.sanitizeRecords(result.rows).map(dbPersonToPerson);
    }

    public async findAllPeopleForAuditorium(auditoriumId: string): Promise<IPerson[]> {
        const result = await this.client.query<IDbPerson>(`${NONEVENT_PEOPLE_SELECT} WHERE conference_room = $1`, [auditoriumId]);
        return this.sanitizeRecords(result.rows).map(dbPersonToPerson);
    }

    public async findAllPeopleForTalk(talkId: string): Promise<IPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE event_id = $1`, [talkId]);
        return this.sanitizeRecords(result.rows).map(dbPersonToPerson);
    }

    public async findAllPeopleWithRole(role: Role): Promise<IPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE event_role = $1`, [role]);
        return this.sanitizeRecords(result.rows).map(dbPersonToPerson);
    }

    public async findAllPeopleWithRemark(remark: string): Promise<IPerson[]> {
        const result = await this.client.query<IDbPerson>(`${PEOPLE_SELECT} WHERE remark = $1`, [remark]);
        return this.sanitizeRecords(result.rows).map(dbPersonToPerson);
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

        const qaStartDatetime = talk.qa_start_datetime + this.config.schedulePreBufferSeconds * 1000;
        let livestreamStartDatetime: number;
        if (talk.prerecorded) {
            // For prerecorded talks, a preroll is shown, followed by the talk recording, then an
            // interroll, then live Q&A.
            livestreamStartDatetime = qaStartDatetime;
        } else {
            // For live talks, both the preroll and interroll are shown, followed by the live talk.
            livestreamStartDatetime = talk.start_datetime + this.config.schedulePreBufferSeconds * 1000;
        }
        const livestreamEndDatetime = talk.end_datetime - this.config.schedulePostBufferSeconds * 1000;

        return {
            ...talk,

            qa_start_datetime: qaStartDatetime,
            livestream_start_datetime: livestreamStartDatetime,
            livestream_end_datetime: livestreamEndDatetime,
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
