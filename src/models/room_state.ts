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

import { IConference, ITalk, IAuditorium, IInterestRoom, IPerson } from "./schedule";
import { objectFastClone, objectFastCloneWithout } from "../utils";
import { Space } from "matrix-bot-sdk";

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

export const RS_STORED_TALK = "org.matrix.confbot.talk";

export function makeStoredTalk(talk: ITalk): IStateEvent<ITalk> {
    return {
        type: RS_STORED_TALK,
        state_key: talk.id,
        content: talk,
    };
}

export const RS_STORED_PERSON = "org.matrix.confbot.person.v2";
export function makeStoredPerson(person: IPerson): IStateEvent<IPerson> {
    return {
        type: RS_STORED_PERSON,
        state_key: person.id.toString(),
        content: person,
    };
}

export const RS_STORED_AUDITORIUM = "org.matrix.confbot.auditorium";
export interface IStoredAuditorium extends Omit<IAuditorium, "talksByDate"> {
    conferenceId: string;
}
export function makeStoredAuditorium(confId: string, auditorium: IAuditorium): IStateEvent<IStoredAuditorium> {
    return {
        type: RS_STORED_AUDITORIUM,
        state_key: auditorium.id,
        content: {
            ...objectFastCloneWithout(auditorium, ['talksByDate']),
            conferenceId: confId,
        } as IStoredAuditorium,
    };
}

export const RS_STORED_CONFERENCE = "org.matrix.confbot.conference";
export interface IStoredConference extends Omit<IConference, "auditoriums"> {
    conferenceId: string;
}
export function makeStoredConference(confId: string, conference: IConference): IStateEvent<IStoredConference> {
    return {
        type: RS_STORED_CONFERENCE,
        state_key: "",
        content: {
            ...objectFastCloneWithout(conference, ['auditoriums']),
            conferenceId: confId,
        } as IStoredConference,
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

export const RS_STORED_ROLE = "org.matrix.confbot.role";
export interface IStoredRole {
    name: string;
    spaceRoomId: string;
}
export function makeStoredRole(name: string, space: Space): IStateEvent<IStoredRole> {
    return {
        type: RS_STORED_ROLE,
        state_key: name,
        content: {
            name: name,
            spaceRoomId: space.roomId,
        },
    };
}

export const RS_STORED_INTEREST_ROOM = "org.matrix.confbot.interest_room";
export interface IStoredInterestRoom extends IInterestRoom {
    conferenceId: string;
}
export function makeStoredInterestRoom(confId: string, interestRoom: IInterestRoom): IStateEvent<IStoredInterestRoom> {
    return {
        type: RS_STORED_INTEREST_ROOM,
        state_key: interestRoom.id,
        content: {
            ...objectFastClone(interestRoom),
            conferenceId: confId,
        } as IStoredInterestRoom,
    };
}
