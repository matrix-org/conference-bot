/*
Copyright 2024 The Matrix.org Foundation C.I.C.

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

import { IInterestRoom, IAuditorium, ITalk, Role } from "../../models/schedule";
import { decodePrefix } from "../penta/PentabarfParser";
import { IPrefixConfig } from "../../config";
import { simpleTimeParse } from "../common";
import { RoomKind } from "../../models/room_kinds";
import { slugify } from "../../utils/aliases";
import { LogService } from "matrix-bot-sdk";

interface PretalxRoom {
    name: string,
    guid: null,
    description: string,
    capacity: number,
}

interface PretalxPerson {
    id: number,
    code: string,
    public_name: string,
    biography: string|null,
    answers: string[],
}

interface PretalxTalk {
    id: number,
    date: string,
    start: string,
    duration: string,
    room: string,
    slug: string,
    url: string,
    recording_license: string,
    do_not_record: boolean,
    title: string,
    subtitle: string,
    type: string,
    language: string,
    abstract: string,
    description: string,
    logo: string,
    persons: PretalxPerson[],
    links: string[],
    attachments: string[],
}

interface PretalxDay {
    index: number,
    date: string,
    day_start: string,
    day_end: string,
    rooms: Record<string, PretalxTalk[]>,
}

/**
 * Schema for an exported Pretalx schedule.
 * @note May differ from standard format as based on https://pretalx.fosdem.org/fosdem-2024/schedule/export/schedule.xml
 */
export interface PretalxData {
    schedule: {
        version: string,
        base_url: string,
        conference: {
            acronym: string,
            title: string,
            start: string,
            end: string,
            daysCount: string,
            timeslot_duration: string,
            time_zone_name: string,
            rooms: PretalxRoom[],
            days: PretalxDay[]
        },
    }
}


export interface PretalxSchema {
    /**
     * room.id -> IInterestRoom
     */
    interestRooms: Map<string, IInterestRoom>;
    /**
     * room.name -> IAuditorium
     */
    auditoriums: Map<string, IAuditorium>;
    /**
     * eventId -> ITalk
     */
    talks: Map<string, ITalk>;
    title: string;
}

/**
 * This will parse a schedule JSON file and attempt to fill in some of the fields. As the JSON
 * only contains some (public) data, consumers should expect to find additional information through
 * the API.
 * @param rawXml 
 * @returns 
 */
export async function parseFromJSON(rawJson: string, prefixConfig: IPrefixConfig): Promise<PretalxSchema> {
    const { conference } = (JSON.parse(rawJson) as PretalxData).schedule;
    const interestRooms = new Map<string, IInterestRoom>();
    const auditoriums = new Map<string, IAuditorium&{qaEnabled: boolean}>();
    const talks = new Map<string, ITalk>();

    for (const room of conference.rooms) {
        const {kind, name: description} = decodePrefix(room.description, prefixConfig) ?? { kind: null, name: null };
        if (kind === null) {
            LogService.info("PretalxParser", "Ignoring unrecognised room name from schedule", room);
        }
        if (kind === RoomKind.SpecialInterest) {
            const spiRoom: IInterestRoom = {
                id: room.name,
                name: description,
                kind: kind,
            };
            interestRooms.set(spiRoom.id, spiRoom);
        } else if (kind === RoomKind.Auditorium) {
            const isPhysical = prefixConfig.physicalAuditoriumRooms.some(p => room.description.startsWith(p));
            const qaEnabled = prefixConfig.qaAuditoriumRooms.some(p => room.description.startsWith(p));
            const auditorium = {
                id: room.name,
                slug: slugify(room.name),
                name: description,
                kind: kind,
                talks: new Map(),
                isPhysical: isPhysical,
                qaEnabled: qaEnabled,
            };
            auditoriums.set(room.name, auditorium);
        }
    }

    for (const day of conference.days) {
        const dayStart = new Date(day.day_start);
        for (const [roomName, events] of Object.entries(day.rooms)) {
            const auditorium = auditoriums.get(roomName);
            if (!auditorium) {
                // Skipping event, not mapped to an auditorium.
                continue;
            }
            for (const event of events) {
                const eventDate = new Date(event.date);
                // This assumes your event does not span multiple days
                const { hours: durationHours, minutes:durationMinutes } = simpleTimeParse(event.duration);
                const endTime = new Date(
                    eventDate.getTime() +
                    (durationHours * 1000 * 60 * 60)
                    + (durationMinutes * 1000 * 60)
                );
                
                if (event.type === 'Talk') {
                    // Tediously, we need the "code" to map to pretalx. The "code"
                    // is only available via the URL.
                    const eventCode = event.url.split('/').reverse()[1];
                    if (!eventCode) {
                        throw Error('Could not determine code for event');
                    }
                    const talk: ITalk = {
                        dateTs: dayStart.getTime(),
                        endTime: endTime.getTime(),
                        id: eventCode,
                        livestream_endTime: 0,
                        qa_startTime: auditorium.qaEnabled ? 0 : null,
                        startTime: eventDate.getTime(),
                        subtitle: event.subtitle,
                        title: event.title,
                        prerecorded: false,
                        speakers: event.persons.map(p => ({
                            id: p.code,
                            name: p.public_name,
                            // TODO: Assuming speaker,
                            role: Role.Speaker,
                            // TODO: Lookup
                            email: '',
                            matrix_id: '',
                        })), //event.persons,
                        // TODO: Unsure?
                        auditoriumId: roomName,
                        slug: event.slug,
                    };
                    talks.set(eventCode, talk);
                    auditorium?.talks.set(eventCode, talk);
                }
            }
        }
    }

    return {
        title: conference.title,
        interestRooms,
        auditoriums,
        talks,
    }
}