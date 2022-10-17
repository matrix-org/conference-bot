import { RoomKind } from "../models/room_kinds";
import { IAuditorium, IConference, IInterestRoom, IPerson, ITalk, Role } from "../models/schedule";
import { JSONSchedule, JSONSpeaker, JSONStream, JSONTalk } from "./jsontypes/JsonSchedule.schema";
import * as moment from "moment";

export class JsonScheduleLoader {
    public readonly conference: IConference;
    public readonly auditoriums: IAuditorium[];
    // public readonly talks: ITalk[];
    // public readonly speakers: IPerson[];
    public readonly interestRooms: IInterestRoom[];

    constructor(jsonDesc: object) {
        // TODO: Validate and give errors. Assuming it's correct is a bit cheeky.
        const jsonSchedule = jsonDesc as JSONSchedule;

        this.auditoriums = jsonSchedule.streams.map(aud => this.convertAuditorium(aud));

        // TODO: Interest rooms are currently not supported by the JSON schedule backend.
        this.interestRooms = [];

        // TODO Why the duplication?
        this.conference = {
            title: jsonSchedule.title,
            auditoriums: this.auditoriums,
            interestRooms: this.interestRooms
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

    private convertTalk(talk: JSONTalk): ITalk {
        const startMoment = moment.utc(talk.start, moment.ISO_8601, true);
        const endMoment = moment.utc(talk.end, moment.ISO_8601, true);

        return {
            id: talk.id.toString(), // TODO We have numbers on the rhs and a string on the lhs.
            title: talk.title,
            subtitle: talk.description, // TODO is this valid?
            slug: this.slugify(talk.title),

            conferenceId: "https://example.com?TODO",
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

    private convertAuditorium(stream: JSONStream): IAuditorium {
        const talksByDate: Record<number, ITalk[]> = Object.create(null);

        const allTalksSortedByStart: ITalk[] = stream.talks.map(talk => this.convertTalk(talk))
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
            id: this.slugify(stream.stream_name),
            slug: this.slugify(stream.stream_name),
            name: stream.stream_name,
            kind: RoomKind.Auditorium, // TODO!!!
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