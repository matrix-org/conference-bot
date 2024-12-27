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

import { TalkId } from "../backends/IScheduleBackend";
import { RoomKind } from "./room_kinds";

export enum Role {
    Speaker = "speaker",
    Host = "host",
    Coordinator = "coordinator",
}

export interface IPerson {
    id: string;
    name: string;
    role: Role;

    /**
     * Matrix ID of the person or empty string if unknown.
     */
    matrix_id: string;

    /**
     * E-mail address of the person or empty string if unknown.
     */
    email: string;
}

export interface ITalk {
    id: string;
    /**
     * Timestamp, in milliseconds, corresponding to the start of the day.
     */
    dateTs: number; // ms
    startTime: number; // ms
    endTime: number; // ms
    /**
     * Start time of Q&A as a unix timestamp in ms, or null if Q&A is disabled for this talk.
     */
    qa_startTime: number | null;
    livestream_endTime: number;
    title: string;
    subtitle: string;
    /**
     * MISNOMER: This variable contains ALL people for the talk, NOT JUST speakers.
     * TODO rename (at a time when it's a less risky change to do...)
     */
    speakers: IPerson[];
    prerecorded: boolean;
    /**
     * ID of the auditorium that this talk belongs to.
     */
    auditoriumId: string;
}

export interface IAuditorium {
    id: string;
    /**
     * Identifier safe for use in room aliases.
     */
    slug: string;
    name: string;
    kind: RoomKind;
    talks: Map<TalkId, ITalk>;
    /**
     * People, in addition to those mentioned in individual talks.
     * People may be specified here, in talks, or in both.
     *
     * The motivation for this field is to allow coordinators to exist in the
     * conference, even before any talks have been scheduled.
     */
    extraPeople: IPerson[];
    /**
     * If true, this auditorium is just a virtual representation of a real-world physical auditorium.
     */
    isPhysical: boolean;

    /**
     * A 'type' of track that this auditorium is in.
     * May be an empty string if there is no concept of types.
     * This string will not be human-readable.
     */
    trackType: string;
}

export interface IConference {
    title: string;
    auditoriums: IAuditorium[];
    interestRooms: IInterestRoom[];
}

export interface IInterestRoom {
    id: string;
    name: string;
    kind: RoomKind;
}
