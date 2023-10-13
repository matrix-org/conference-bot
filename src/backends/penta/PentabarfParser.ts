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

import { XMLParser } from "fast-xml-parser";
import { IAuditorium, IConference, IInterestRoom, IPerson, ITalk, Role } from "../../models/schedule";
import moment from "moment";
import { RoomKind } from "../../models/room_kinds";
import { IPrefixConfig } from "../../config";
import { LogService } from 'matrix-bot-sdk';
import { slugify } from '../../utils/aliases';

function arrayLike<T>(val: T | T[]): T[] {
    if (Array.isArray(val)) return val;
    return [val];
}

function simpleTimeParse(str: string): { hours: number, minutes: number } {
    const parts = str.split(':');
    return {hours: Number(parts[0]), minutes: Number(parts[1])};
}

/**
 * Given a event-room ID (not a Matrix ID; a room from the Pentabarf XML),
 * decodes that to figure out what type of event-room it is
 * and also returns the unprefixed version.
 */
export function decodePrefix(id: string, prefixConfig: IPrefixConfig): {kind: RoomKind, name: string} | null {
    const override = prefixConfig.nameOverrides[id];

    const auditoriumPrefix = prefixConfig.auditoriumRooms.find(p => id.startsWith(p));
    if (auditoriumPrefix) {
        if (prefixConfig.physicalAuditoriumRooms.find(p => id.startsWith(p))) {
            // For physical auditoriums: don't strip the prefix. For e.g. K.1.102 the `K` is a building name and is important!
            return {kind: RoomKind.Auditorium, name: override || id};
        }
        // TODO(FOSDEM 2023): don't strip the prefix, because on FOSDEM's end they are not stripped in the livestream IDs.
        //     It would be good to figure out why we wanted to strip prefixes originally and whether we need finer controls.
        //return {kind: RoomKind.Auditorium, name: override || id.substring(auditoriumPrefix.length)};
        return {kind: RoomKind.Auditorium, name: override || id };
    }

    const interestPrefix = prefixConfig.interestRooms.find(p => id.startsWith(p));
    if (interestPrefix) {
        return {kind: RoomKind.SpecialInterest, name: override || id.substring(interestPrefix.length)};
    }

    // Rooms in the schedule not matching a prefix should not be treated as special interests.
    return null;
}

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

export class PentabarfParser {
    private readonly parsed: IPentabarfSchedule;

    public readonly conference: IConference;
    public readonly auditoriums: IAuditorium[];
    public readonly talks: ITalk[];
    public readonly speakers: IPerson[];
    public readonly interestRooms: IInterestRoom[];

    constructor(rawXml: string, prefixConfig: IPrefixConfig) {
        const parser = new XMLParser({
            attributesGroupName: "attr",
            attributeNamePrefix : "@_",
            textNodeName: "#text",
            ignoreAttributes: false,
        });
        this.parsed = parser.parse(rawXml);

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

                const metadata = decodePrefix(pRoom.attr?.["@_name"] || "org.matrix.confbot.unknown", prefixConfig);
                if (metadata === null) {
                    LogService.info("PentabarfParser", "Ignoring unrecognised room name from schedule: ", pRoom.attr?.["@_name"]);
                    continue;
                }

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
                const audId = pRoom.attr?.["@_name"];
                const isPhysical = prefixConfig.physicalAuditoriumRooms.find(p => audId.startsWith(p)) !== undefined;
                let auditorium: IAuditorium = {
                    id: audId,
                    slug: slugify(metadata.name),
                    name: metadata.name,
                    kind: metadata.kind,
                    talks: new Map(),
                    isPhysical: isPhysical
                };
                const existingAuditorium = this.auditoriums.find(r => r.id === auditorium.id);
                if (existingAuditorium) {
                    auditorium = existingAuditorium;
                } else {
                    this.auditoriums.push(auditorium);
                }

                const qaEnabled = prefixConfig.qaAuditoriumRooms.find(p => auditorium.id.startsWith(p)) !== undefined;

                for (const pEvent of arrayLike(pRoom.event)) {
                    if (!pEvent) continue;

                    if (pEvent.title.startsWith("CANCELLED ")) {
                        // FOSDEM represents cancelled talks with a title prefix.
                        // There is currently no more 'proper' way to get this information.
                        LogService.info("PentabarfParser", `Talk '${pEvent.attr?.["@_id"]}' has CANCELLED in prefix of title: ignoring.`)
                        continue;
                    }

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
                        prerecorded: true,
                        auditoriumId: auditorium.id,
                        livestream_endTime: 0,
                        // 0 is populated later by consulting the PentaDb.
                        qa_startTime: qaEnabled ? 0 : null,
                    };
                    const existingTalk = this.talks.find(e => e.id === talk.id);
                    if (existingTalk) {
                        talk = existingTalk;
                    } else {
                        this.talks.push(talk);
                    }

                    if (auditorium.talks.has(talk.id)) {
                        throw new Error(`Auditorium ${auditorium.id}: Talk ${talk.id}: this talk already exists and is defined a second time.`);
                    } else {
                        auditorium.talks.set(talk.id, talk);
                    }

                    for (const pPerson of arrayLike(pEvent.persons?.person)) {
                        if (!pPerson) continue;

                        let person: IPerson = {
                            id: pPerson.attr?.["@_id"],
                            name: pPerson["#text"],
                            email: "",
                            matrix_id: "",
                            role: Role.Speaker,
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
