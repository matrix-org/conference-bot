import { RoomKind } from "../../models/room_kinds";
import { IAuditorium, IConference, IInterestRoom, IPerson, ITalk, Role } from "../../models/schedule";
import { FOSDEMSpecificJSONSchedule, FOSDEMPerson, FOSDEMTrack, FOSDEMTalk } from "./jsontypes/FosdemJsonSchedule.schema";
import { AuditoriumId, InterestId, TalkId } from "../IScheduleBackend";
import { IConfig } from "../../config";
import { addMinutes, getTime, getUnixTime, parseISO, startOfDay } from "date-fns";

/**
 * Loader and holder for FOSDEM-specific JSON schedules, acquired from the
 * custom `/p/matrix` endpoint on the Pretalx instance.
 */
export class FosdemJsonScheduleLoader {
    public readonly conference: IConference;
    public readonly auditoriums: Map<AuditoriumId, IAuditorium>;
    public readonly talks: Map<TalkId, ITalk>;
    public readonly interestRooms: Map<InterestId, IInterestRoom>;
    public readonly conferenceId: string;

    constructor(jsonDesc: object, globalConfig: IConfig) {
        // TODO: Validate and give errors. Assuming it's correct is a bit cheeky.
        const jsonSchedule = jsonDesc as FOSDEMSpecificJSONSchedule;

        this.auditoriums = new Map();

        for (let rawTrack of jsonSchedule.tracks) {
            // Tracks are now (since 2025) mapped 1:1 to auditoria
            const auditorium = this.convertAuditorium(rawTrack);
            if (this.auditoriums.has(auditorium.id)) {
                throw `Conflict in auditorium ID «${auditorium.id}»!`;
            }
            this.auditoriums.set(auditorium.id, auditorium);
        }

        this.talks = new Map();

        for (let rawTalk of jsonSchedule.talks) {
            const talk = this.convertTalk(rawTalk);
            if (this.talks.has(talk.id)) {
                const conflictingTalk = this.talks.get(talk.id)!;
                throw `Talk ID ${talk.id} is not unique — occupied by both «${talk.title}» and «${conflictingTalk.title}»!`;
            }
            const auditorium = this.auditoriums.get(talk.auditoriumId);
            if (!auditorium) {
                throw `Talk ID ${talk.id} relies on non-existent auditorium ${talk.auditoriumId}`;
            }
            auditorium.talks.set(talk.id, talk);
            this.talks.set(talk.id, talk);
        }

        // TODO: Interest rooms are currently not supported by the JSON schedule backend.
        this.interestRooms = new Map();

        this.conference = {
            title: globalConfig.conference.name,
            auditoriums: Array.from(this.auditoriums.values()),
            interestRooms: Array.from(this.interestRooms.values())
        };
    }

    private convertPerson(person: FOSDEMPerson): IPerson {
        if (! Object.values<string>(Role).includes(person.event_role)) {
            throw new Error("unknown role: " + person.event_role);
        }
        return {
            id: person.person_id.toString(),
            name: person.name,
            matrix_id: person.matrix_id,
            email: person.email,
            // safety: checked above
            role: person.event_role as Role,
        };
    }

    private convertTalk(talk: FOSDEMTalk): ITalk {
        const auditoriumId = talk.track.id.toString();
        const startInstant = parseISO(talk.start_datetime);
        const endInstant = addMinutes(startInstant, talk.duration);
        const dateTs = getTime(startOfDay(startInstant));

        return {
            id: talk.event_id.toString(),
            title: talk.title,

            // Pretalx does not support this concept. FOSDEM 2024 ran with empty strings. From 2025 we hardcode this as empty for now.
            subtitle: "",

            auditoriumId,

            // Hardcoded: all talks are now live from FOSDEM 2025
            prerecorded: false,

            // This is sketchy, but the QA start-time is not applicable except to prerecorded talks.
            // Even then, it's not clear why it would be different from the end of the talk?
            // This is overall a messy concept, but the only thing that matters now is whether this is
            // null (Q&A disabled) or non-null (Q&A enabled, with reminder 5 minutes before the end of the talk slot).
            // TODO overhaul replace with a boolean instead...?
            qa_startTime: talk.track.online_qa ? 0 : null,

            // Since the talks are not pre-recorded, the livestream is considered ended when the event ends.
            livestream_endTime: getTime(endInstant),

            speakers: talk.persons.map(person => this.convertPerson(person)),

            dateTs,
            startTime: getTime(startInstant),
            endTime: getTime(endInstant),
        };
    }

    private convertAuditorium(track: FOSDEMTrack): IAuditorium {
        const extraPeople: IPerson[] = track.managers.map(person => this.convertPerson(person));
        return {
            id: track.id.toString(),
            slug: track.slug,
            name: track.name,
            kind: RoomKind.Auditorium,
            // This will be populated afterwards
            talks: new Map(),
            // Hardcoded: FOSDEM is always physical now.
            isPhysical: true,
            extraPeople,
        };
    }
}
