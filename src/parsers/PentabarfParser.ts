/*
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

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

import * as parser from 'fast-xml-parser';
import { IAuditorium, IConference, IInterestRoom, IPerson, ITalk } from "../models/schedule";
import * as moment from "moment";
import { RoomKind } from "../models/room_kinds";
import config from "../config";

export interface IPentabarfEvent {
    attr: {
        "@_id": string; // number
    };
    start: string;
    duration: string;
    room: string;
    slug: string;
    title: string;
    subtitle: string;
    track: string;
    type: "devroom";
    language: string;
    abstract: string;
    description: string;
    persons: {
        person: {
            attr: {
                "@_id": string; // number
            };
            "#text": string;
        }[];
    };
    attachments: unknown; // TODO
    links: {
        link: {
            attr: {
                "@_href": string;
            };
            "#text": string;
        }[];
    };
}

export interface IPentabarfSchedule {
    schedule: {
        conference: {
            title: string;
            subtitle: string;
            venue: string;
            city: string;
            start: string;
            end: string;
            days: number;
            day_change: string;
            timeslot_duration: string;
        };
        day: {
            attr: {
                "@_index": string; // number
                "@_date": string;
            };
            room: {
                attr: {
                    "@_name": string;
                };
                event: IPentabarfEvent[];
            }[];
        }[];
    };
}

function arrayLike<T>(val: T | T[]): T[] {
    if (Array.isArray(val)) return val;
    return [val];
}

function simpleTimeParse(str: string): { hours: number, minutes: number } {
    const parts = str.split(':');
    return {hours: Number(parts[0]), minutes: Number(parts[1])};
}

export function deprefix(id: string): {kind: RoomKind, name: string} {
    const override = config.conference.prefixes.nameOverrides[id];

    const auditoriumPrefix = config.conference.prefixes.auditoriumRooms.find(p => id.startsWith(p));
    if (auditoriumPrefix) {
        return {kind: RoomKind.Auditorium, name: override || id.substring(auditoriumPrefix.length)};
    }

    const interestPrefix = config.conference.prefixes.interestRooms.find(p => id.startsWith(p));
    if (interestPrefix) {
        return {kind: RoomKind.SpecialInterest, name: override || id.substring(interestPrefix.length)};
    }

    return {kind: RoomKind.SpecialInterest, name: override || id};
}

export class PentabarfParser {
    public readonly parsed: IPentabarfSchedule;

    public readonly conference: IConference;
    public readonly auditoriums: IAuditorium[];
    public readonly talks: ITalk[];
    public readonly speakers: IPerson[];
    public readonly interestRooms: IInterestRoom[];

    constructor(rawXml: string) {
        this.parsed = parser.parse(rawXml, {
            attrNodeName: "attr",
            textNodeName: "#text",
            ignoreAttributes: false,
        });

        this.auditoriums = [];
        this.talks = [];
        this.speakers = [];
        this.interestRooms = [];
        this.conference = {
            title: this.parsed.schedule?.conference?.title,
            auditoriums: this.auditoriums,
            interestRooms: this.interestRooms,
        };

        for (const day of arrayLike(this.parsed.schedule?.day)) {
            if (!day) continue;

            const dateTs = moment.utc(day.attr?.["@_date"], "YYYY-MM-DD").valueOf();
            for (const pRoom of arrayLike(day.room)) {
                if (!pRoom) continue;

                const metadata = deprefix(pRoom.attr?.["@_name"] || "org.matrix.confbot.unknown");
                if (metadata.kind === RoomKind.SpecialInterest) {
                    let spiRoom: IInterestRoom = {
                        id: pRoom.attr?.["@_name"],
                        name: metadata.name,
                        kind: metadata.kind,
                    };
                    const existingSpi = this.interestRooms.find(r => r.id === spiRoom.id);
                    if (!existingSpi) {
                        this.interestRooms.push(spiRoom);
                    }
                    continue;
                }
                if (metadata.kind !== RoomKind.Auditorium) continue;
                let auditorium: IAuditorium = {
                    id: pRoom.attr?.["@_name"],
                    name: metadata.name,
                    kind: metadata.kind,
                    talksByDate: {},
                };
                const existingAuditorium = this.auditoriums.find(r => r.id === auditorium.id);
                if (existingAuditorium) {
                    auditorium = existingAuditorium;
                } else {
                    this.auditoriums.push(auditorium);
                }

                for (const pEvent of arrayLike(pRoom.event)) {
                    if (!pEvent) continue;

                    const parsedStartTime = simpleTimeParse(pEvent.start);
                    const parsedDuration = simpleTimeParse(pEvent.duration);
                    const startTime = moment(dateTs).add(parsedStartTime.hours, 'hours').add(parsedStartTime.minutes, 'minutes');
                    const endTime = moment(startTime).add(parsedDuration.hours, 'hours').add(parsedDuration.minutes, 'minutes');
                    let talk: ITalk = {
                        id: pEvent.attr?.["@_id"],
                        dateTs: dateTs,
                        startTime: startTime.valueOf(),
                        endTime: endTime.valueOf(),
                        slug: pEvent.slug,
                        title: pEvent.title,
                        subtitle: pEvent.subtitle,
                        track: pEvent.track,
                        speakers: [],
                    };
                    const existingTalk = this.talks.find(e => e.id === talk.id);
                    if (existingTalk) {
                        talk = existingTalk;
                    } else {
                        this.talks.push(talk);
                    }

                    if (!auditorium.talksByDate[dateTs]) auditorium.talksByDate[dateTs] = [];
                    if (!auditorium.talksByDate[dateTs].includes(talk)) auditorium.talksByDate[dateTs].push(talk);

                    for (const pPerson of arrayLike(pEvent.persons?.person)) {
                        if (!pPerson) continue;

                        let person: IPerson = {
                            id: pPerson.attr?.["@_id"],
                            name: pPerson["#text"],
                        };
                        const existingPerson = this.speakers.find(s => s.id === person.id);
                        if (existingPerson) {
                            person = existingPerson;
                        } else {
                            this.speakers.push(person);
                        }

                        talk.speakers.push(person);
                    }
                }
            }
        }
    }
}
