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

import { AuditoriumId, InterestId, TalkId } from "../backends/IScheduleBackend";
import { RoomKind, RSC_ROOM_KIND_FLAG, RS_LOCATOR } from "./room_kinds";
import { IPerson } from "./schedule";

export interface IStateEvent<T> {
    type: string;
    state_key: string;
    content: T;
}

/**
 * The event type for a subspace state event.
 */
export const RS_STORED_SUBSPACE = "org.matrix.confbot.subspace";
/**
 * The content of a subspace state event.
 *
 * Subspace state events are stored in the root conference room and link a subspace defined in the
 * bot config to a created space.
 */
export interface IStoredSubspace {
    /**
     * The room id of the subspace.
     */
    roomId: string;
}

export const RS_3PID_PERSON_ID = "org.matrix.confbot.person.v2";

export const RS_STORED_PERSON = "org.matrix.confbot.person.v2";
/**
 * This allows us to create a state event, to be stored in the Database room,
 * which represents an override of a person from their underlying representation in the schedule.
 *
 * This is used when a person accepts an e-mail invite and therefore we learn of their
 * Matrix ID, despite them not having one in the schedule.
 *
 * Note that the returned object contains private information and as such must not be
 * stored in any public rooms.
 */
export function makeStoredPersonOverride(person: IPerson): IStateEvent<IPerson> {
    return {
        type: RS_STORED_PERSON,
        state_key: person.id.toString(),
        content: person,
    };
}

export const RS_PARENT_ROOM = "org.matrix.confbot.parent";
export interface IParentRoom {
    roomId: string;
}
export function makeParentRoom(roomId: string): IStateEvent<IParentRoom> {
    return {
        type: RS_PARENT_ROOM,
        state_key: "",
        content: {roomId: roomId},
    };
}

export const RS_CHILD_ROOM = "org.matrix.confbot.child";
export interface IChildRoom {
    roomId: string;
}
export function makeChildRoom(roomId: string): IStateEvent<IChildRoom> {
    return {
        type: RS_CHILD_ROOM,
        state_key: roomId,
        content: {roomId: roomId},
    };
}

export const RS_STORED_SPACE = "org.matrix.confbot.space";
export interface IStoredSpace {
    roomId: string;
}
export function makeStoredSpace(roomId: string): IStateEvent<IStoredSpace> {
    return {
        type: RS_STORED_SPACE,
        state_key: "",
        content: {roomId: roomId},
    };
}

/**
 * See RS_LOCATOR.
 */
export type ILocator = IDbLocator | ITalkLocator | IAuditoriumLocator | IInterestLocator

export interface IDbLocator {
    [RSC_ROOM_KIND_FLAG]: RoomKind.ConferenceDb;
    conferenceId: string;
}
export interface ITalkLocator {
    [RSC_ROOM_KIND_FLAG]: RoomKind.Talk;
    conferenceId: string;
    talkId: TalkId;
}
export interface IAuditoriumLocator {
    [RSC_ROOM_KIND_FLAG]: RoomKind.Auditorium | RoomKind.AuditoriumBackstage;
    conferenceId: string;
    auditoriumId: AuditoriumId;
}
export interface IInterestLocator {
    [RSC_ROOM_KIND_FLAG]: RoomKind.SpecialInterest;
    conferenceId: string;
    interestId: InterestId;
}


export function makeDbLocator(conferenceId: string): IStateEvent<IDbLocator> {
    return {
        type: RS_LOCATOR,
        state_key: "",
        content: {
            [RSC_ROOM_KIND_FLAG]: RoomKind.ConferenceDb,
            conferenceId,
        },
    };
}

export function makeTalkLocator(conferenceId: string, talkId: TalkId): IStateEvent<ITalkLocator> {
    return {
        type: RS_LOCATOR,
        state_key: "",
        content: {
            [RSC_ROOM_KIND_FLAG]: RoomKind.Talk,
            conferenceId,
            talkId,
        },
    };
}

export function makeAuditoriumLocator(conferenceId: string, auditoriumId: AuditoriumId): IStateEvent<IAuditoriumLocator> {
    return {
        type: RS_LOCATOR,
        state_key: "",
        content: {
            [RSC_ROOM_KIND_FLAG]: RoomKind.Auditorium,
            conferenceId,
            auditoriumId,
        },
    };
}

export function makeAuditoriumBackstageLocator(conferenceId: string, auditoriumId: AuditoriumId): IStateEvent<IAuditoriumLocator> {
    return {
        type: RS_LOCATOR,
        state_key: "",
        content: {
            [RSC_ROOM_KIND_FLAG]: RoomKind.AuditoriumBackstage,
            conferenceId,
            auditoriumId,
        },
    };
}

export function makeInterestLocator(conferenceId: string, interestId: InterestId): IStateEvent<IInterestLocator> {
    return {
        type: RS_LOCATOR,
        state_key: "",
        content: {
            [RSC_ROOM_KIND_FLAG]: RoomKind.SpecialInterest,
            conferenceId,
            interestId,
        },
    };
}
