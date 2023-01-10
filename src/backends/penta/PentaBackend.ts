import config, { IPentaScheduleBackendConfig } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom, IPerson } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import { PentaDb } from "./db/PentaDb";
import { PentabarfParser } from "./PentabarfParser";
import * as fetch from "node-fetch";


export class PentaBackend implements IScheduleBackend {
    constructor(private cfg: IPentaScheduleBackendConfig, parser: PentabarfParser, public db: PentaDb) {
        this.updateFromParser(parser);
    }

    /**
     * We need an async version of the constructor.
     * Must be called right after construction.
     */
    async init() {
        await this.hydrateFromDatabase();
    }

    private updateFromParser(parser: PentabarfParser): void {
        const conference = parser.conference;
        const talks = new Map();
        const auditoriums = new Map();
        const interestRooms = new Map();

        for (let auditorium of parser.auditoriums) {
            if (auditoriums.has(auditorium.id)) {
                throw `Conflict in auditorium ID «${auditorium.id}»!`;
            }
            auditoriums.set(auditorium.id, auditorium);

            for (let talk of auditorium.talks.values()) {
                if (talks.has(talk.id)) {
                    const conflictingTalk = talks.get(talk.id);
                    throw `Talk ID ${talk.id} is not unique — occupied by both «${talk.title}» and «${conflictingTalk.title}»!`;
                }
                talks.set(talk.id, talk);
            }
        }

        for (let interest of parser.interestRooms) {
            if (interestRooms.has(interest.id)) {
                throw `Conflict in interest ID «${interest.id}»!`;
            }
        }

        // Update all at the end, to prevent non-atomic updates in the case of a failure.
        this.conference = conference;
        this.talks = talks;
        this.auditoriums = auditoriums;
        this.interestRooms = interestRooms;
    }

    private async hydrateFromDatabase(): Promise<void> {
        for (let talk of this.talks.values()) {
            this.hydrateTalk(talk);

            for (let person of talk.speakers) {
                this.hydratePerson(person);
            }
        }

        // TODO do we need to hydrate any other objects?
    }

    private async hydrateTalk(talk: ITalk): Promise<void> {
        const dbTalk = await this.db.getTalk(talk.id);
        if (dbTalk === null) return;

        if (talk.qa_startTime !== null) {
            // hydrate Q&A time if enabled
            talk.qa_startTime = dbTalk.qa_start_datetime;
        }
        talk.livestream_endTime = dbTalk.livestream_end_datetime;
    }

    private async hydratePerson(person: IPerson): Promise<void> {
        const dbPeople = await this.db.findPeopleWithId(person.id);
        if (dbPeople.length == 0) return;

        if (dbPeople.length > 1) {
            throw new Error(`Person ID '${person.id}' has ${dbPeople.length} different people associated with it!`);
        }

        const dbPerson = dbPeople[0];
        person.matrix_id = dbPerson.matrix_id;
        person.email = dbPerson.email;
    }

    wasLoadedFromCache(): boolean {
        // Penta backend doesn't support using a cache.
        return false;
    }

    static async new(cfg: IPentaScheduleBackendConfig): Promise<PentaBackend> {
        const xml = await fetch(cfg.scheduleDefinition).then(r => r.text());
        const parsed = new PentabarfParser(xml, config.conference.prefixes);
        const db = new PentaDb(cfg.database);
        await db.connect();
        const backend = new PentaBackend(cfg, parsed, db);
        await backend.init();
        return backend;
    }

    refresh(): Promise<void> {
        throw new Error("refresh() not implemented for Penta backend.");
    }

    conference: IConference;
    talks: Map<TalkId, ITalk>;
    auditoriums: Map<AuditoriumId, IAuditorium>;
    interestRooms: Map<InterestId, IInterestRoom>;
}