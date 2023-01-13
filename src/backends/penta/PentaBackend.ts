import config, { IPentaScheduleBackendConfig } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import { PentaDb } from "./db/PentaDb";
import { PentabarfParser } from "./PentabarfParser";
import * as fetch from "node-fetch";


export class PentaBackend implements IScheduleBackend {
    constructor(private cfg: IPentaScheduleBackendConfig, parser: PentabarfParser, public db: PentaDb) {
        this.updateFromParser(parser);
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

    wasLoadedFromCache(): boolean {
        // Penta backend doesn't support using a cache.
        return false;
    }

    static async new(cfg: IPentaScheduleBackendConfig): Promise<PentaBackend> {
        const xml = await fetch(cfg.scheduleDefinition).then(r => r.text());
        const parsed = new PentabarfParser(xml, config.conference.prefixes);
        const db = new PentaDb(cfg.database);
        await db.connect();
        return new PentaBackend(cfg, parsed, db);
    }

    refresh(): Promise<void> {
        throw new Error("refresh() not implemented for Penta backend.");
    }

    conference: IConference;
    talks: Map<TalkId, ITalk>;
    auditoriums: Map<AuditoriumId, IAuditorium>;
    interestRooms: Map<InterestId, IInterestRoom>;
}