import ical = require("ical");
import { RoomKind } from "../models/room_kinds";
import { IAuditorium, IConference, IInterestRoom, IPerson, ITalk, Role } from "../models/schedule";
import { ISchedule } from "./model";

export class ICSParser {
    public readonly parsed: ISchedule;

    public readonly conference: IConference;
    public readonly auditoriums: IAuditorium[];
    // public readonly talks: ITalk[];
    // public readonly speakers: IPerson[];
    public readonly interestRooms: IInterestRoom[];

    constructor(icsDescs: string[]) {
        this.auditoriums = [
            {
                id: "audit4",
                kind: RoomKind.Auditorium,
                name: "audit4",
                talksByDate: {
                    1: [{
                        id: "audit4-day1-talk1",
                        dateTs: new Date().getTime(),
                        startTime: Date.now() + 63 * 60000,
                        endTime: Date.now() + 90 * 60000,
                        qa_startTime: 0,
                        livestream_endTime: 0,
                        speakers: [
                            {
                                id: "mathieuv",
                                name: "mathieuv",
                                matrix_id: "@mathieuv:element.io",
                                email: "mathieuv@element.io",
                                role: Role.Speaker,
                            },
                            {
                                id: "thib",
                                name: "thib",
                                matrix_id: "@thib:ergaster.org",
                                email: "",
                                role: Role.Host,
                            }
                        ],
                        title: "Talk 1",
                        subtitle: "more",
                        slug: "talk1",
                        track: "track",
                        prerecorded: true,
                        conferenceId: "audit4",
                    }
                    // {
                    //     id: "day1-talk2",
                    //     dateTs: new Date().getTime(),
                    //     startTime: Date.now() + 65 * 60000,
                    //     endTime: Date.now() + 95 * 60000,
                    //     qa_startTime: 0,
                    //     livestream_endTime: 0,
                    //     speakers: [
                    //         {
                    //             id: "mathieuv",
                    //             name: "mathieuv",
                    //             matrix_id: "@mathieuv:element.io",
                    //             email: "mathieuv@element.io",
                    //             role: Role.Speaker,
                    //         },
                    //         {
                    //             id: "thib",
                    //             name: "thib",
                    //             matrix_id: "@thib:ergaster.org",
                    //             email: "",
                    //             role: Role.Host,
                    //         }
                    //     ],
                    //     title: "Talk 2",
                    //     subtitle: "more",
                    //     slug: "talk2",
                    //     track: "track",
                    //     prerecorded: true,
                    //     conferenceRoom: "audit1",
                    // },
                    // {
                    //     id: "day1-talk3",
                    //     dateTs: new Date().getTime(),
                    //     startTime: Date.now() + 105 * 60000,
                    //     endTime: Date.now() + 135 * 60000,
                    //     qa_startTime: 0,
                    //     livestream_endTime: 0,
                    //     speakers: [
                    //         {
                    //             id: "mathieuv",
                    //             name: "mathieuv",
                    //             matrix_id: "@mathieuv:element.io",
                    //             email: "mathieuv@element.io",
                    //             role: Role.Speaker,
                    //         },
                    //         {
                    //             id: "thib",
                    //             name: "thib",
                    //             matrix_id: "@thib:ergaster.org",
                    //             email: "",
                    //             role: Role.Host,
                    //         }
                    //     ],
                    //     title: "Talk 3",
                    //     subtitle: "more",
                    //     slug: "talk3",
                    //     track: "track",
                    //     prerecorded: true,
                    //     conferenceRoom: "audit1",
                    // }
                ]
                }
            }
        ];
        // this.talks = [];
        // this.speakers = [];
        this.interestRooms = [];
        this.conference = {
            title: "my conference",
            auditoriums: this.auditoriums,
            interestRooms: this.interestRooms,
        };

    }
}