/*
Copyright 2020 The Matrix.org Foundation C.I.C.

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
import { IConference, IEvent, IPerson, IRoom } from "../models/schedule";
import * as moment from "moment";

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

export class PentabarfParser {
    public readonly parsed: IPentabarfSchedule;

    public readonly conference: IConference;
    public readonly rooms: IRoom[];
    public readonly events: IEvent[];
    public readonly speakers: IPerson[];

    constructor(rawXml: string) {
        this.parsed = parser.parse(rawXml, {
            attrNodeName: "attr",
            textNodeName: "#text",
            ignoreAttributes: false,
        });

        this.rooms = [];
        this.events = [];
        this.speakers = [];
        this.conference = {
            title: this.parsed.schedule?.conference?.title,
            rooms: this.rooms,
        };

        for (const day of arrayLike(this.parsed.schedule?.day)) {
            if (!day) continue;

            const dateTs = moment.utc(day.attr?.["@_date"], "YYYY-MM-DD").valueOf();
            for (const pRoom of arrayLike(day.room)) {
                if (!pRoom) continue;

                let room: IRoom = {
                    id: pRoom.attr?.["@_name"],
                    eventsByDate: {},
                };
                const existingRoom = this.rooms.find(r => r.id === room.id);
                if (existingRoom) {
                    room = existingRoom;
                } else {
                    this.rooms.push(room);
                }

                for (const pEvent of arrayLike(pRoom.event)) {
                    if (!pEvent) continue;

                    const parsedStartTime = simpleTimeParse(pEvent.start);
                    const parsedDuration = simpleTimeParse(pEvent.duration);
                    const startTime = moment(dateTs).add(parsedStartTime.hours, 'hours').add(parsedStartTime.minutes, 'minutes');
                    const endTime = moment(startTime).add(parsedDuration.hours, 'hours').add(parsedDuration.minutes, 'minutes');
                    let event: IEvent = {
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
                    const existingEvent = this.events.find(e => e.id === event.id);
                    if (existingEvent) {
                        event = existingEvent;
                    } else {
                        this.events.push(event);
                    }

                    if (!room.eventsByDate[dateTs]) room.eventsByDate[dateTs] = [];
                    if (!room.eventsByDate[dateTs].includes(event)) room.eventsByDate[dateTs].push(event);

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

                        event.speakers.push(person);
                    }
                }
            }
        }
    }
}
