import { RoomKind } from "../../models/room_kinds";
import { IAuditorium, IConference, IInterestRoom, IPerson, ITalk, Role } from "../../models/schedule";
import { JSONSchedule, JSONSpeaker, JSONStream, JSONTalk } from "./jsontypes/JsonSchedule.schema";
import * as moment from "moment";
import { AuditoriumId, InterestId, TalkId } from "../IScheduleBackend";

/**
 * Loader and holder for JSON schedules.
 * Maybe a misnomer; perhaps 'JsonSchedule' is better? :/
 */
export class JsonScheduleLoader {
    public readonly conference: IConference;
    public readonly auditoriums: Map<AuditoriumId, IAuditorium>;
    public readonly talks: Map<TalkId, ITalk>;
    public readonly interestRooms: Map<InterestId, IInterestRoom>;
    public readonly conferenceId: string;
    //public readonly speakers: IPerson[];

    constructor(jsonDesc: object) {
        // TODO: Validate and give errors. Assuming it's correct is a bit cheeky.
        const jsonSchedule = jsonDesc as JSONSchedule;

        this.conferenceId = ""; // TODO What's this?
        this.auditoriums = new Map();

        for (let aud of jsonSchedule.streams) {
            const auditorium = this.convertAuditorium(aud, this.conferenceId);
            if (this.auditoriums.has(auditorium.id)) {
                throw `Conflict in auditorium ID «${auditorium.id}»!`;
            }
            this.auditoriums.set(auditorium.id, auditorium);

            for (let talksOnDate of Object.values(auditorium.talksByDate)) {
                for (let talk of talksOnDate) {
                    if (this.talks.has(talk.id)) {
                        const conflictingTalk = this.talks.get(talk.id);
                        throw `Talk ID ${talk.id} is not unique — occupied by both «${talk.title}» and «${conflictingTalk.title}»!`;
                    }
                    this.talks.set(talk.id, talk);
                }
            }
        }

        // TODO: Interest rooms are currently not supported by the JSON schedule backend.
        this.interestRooms = new Map();

        this.conference = {
            title: jsonSchedule.title,
            auditoriums: Array.from(this.auditoriums.values()),
            interestRooms: Array.from(this.interestRooms.values())
        };
    }

    private convertSpeaker(speaker: JSONSpeaker): IPerson {
        return {
            id: this.slugify(speaker.display_name),
            name: speaker.display_name,
            matrix_id: speaker.matrix_id,
            email: speaker.email,
            role: Role.Speaker
        };
    }

    private convertTalk(talk: JSONTalk, conferenceId: string, auditoriumId: string): ITalk {
        const startMoment = moment.utc(talk.start, moment.ISO_8601, true);
        const endMoment = moment.utc(talk.end, moment.ISO_8601, true);

        return {
            id: talk.id.toString(), // TODO We have numbers on the rhs and a string on the lhs.
            title: talk.title,
            subtitle: talk.description, // TODO is this valid?
            slug: this.slugify(talk.title),

            conferenceId,
            auditoriumId,
            prerecorded: true, // TODO
            qa_startTime: null, // TODO
            livestream_endTime: endMoment.valueOf(), // TODO is this right?
            speakers: talk.speakers.map(speaker => this.convertSpeaker(speaker)),
            track: "", // TODO we have multiple of them!!!

            // Must .clone() here because .startOf() mutates the moment(!)
            dateTs: startMoment.clone().startOf("day").valueOf(),
            startTime: startMoment.valueOf(),
            endTime: endMoment.valueOf(),
        };
    }

    private convertAuditorium(stream: JSONStream, conferenceId: string): IAuditorium {
        const talksByDate: Record<number, ITalk[]> = Object.create(null);

        const auditoriumId = this.slugify(stream.stream_name);

        const allTalksSortedByStart: ITalk[] = stream.talks.map(talk => this.convertTalk(talk, conferenceId, auditoriumId))
            .sort((a, b) => a.startTime - b.startTime);

        if (allTalksSortedByStart.length > 0) {
            const firstDate = allTalksSortedByStart[0].dateTs;
            const MS_IN_DAY = 86400_000;

            for (const talk of allTalksSortedByStart) {
                const dayNumber = 1 + Math.floor((talk.dateTs - firstDate) / MS_IN_DAY);

                if (! (dayNumber in talksByDate)) {
                    talksByDate[dayNumber] = [];
                }
                talksByDate[dayNumber].push(talk);
            }
        }

        return {
            id: auditoriumId,
            slug: this.slugify(stream.stream_name),
            name: stream.stream_name,
            kind: RoomKind.Auditorium,
            talksByDate
        };
    }

    /**
     * Convert a string to something that is usable as a slug / ID.
     * The result only contains the characters in [a-z0-9-_].
     */
    private slugify(input: string): string {
        return input.toLowerCase().replace(/[^0-9a-z-_]+/g, "_");
    }
}