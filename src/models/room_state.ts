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

import { IConference, IEvent, IPerson, IRoom } from "./schedule";
import { objectFastCloneWithout } from "../utils";

export interface IStateEvent<T> {
    eventType: string;
    stateKey: string;
    content: T;
}

export const RS_STORED_PERSON = "org.matrix.confbot.person";
export interface IStoredPerson extends IPerson {
    conferenceId: string;
}
export function makeStoredPerson(confId: string, person: IPerson): IStateEvent<IStoredPerson> {
    return {
        eventType: RS_STORED_PERSON,
        stateKey: person.id,
        content: {
            ...objectFastCloneWithout(person, []),
            conferenceId: confId,
        } as IStoredPerson,
    };
}

export const RS_STORED_EVENT = "org.matrix.confbot.event";
export interface IStoredEvent extends Omit<IEvent, "speakers"> {
    conferenceId: string;
}
export function makeStoredEvent(confId: string, event: IEvent): IStateEvent<IStoredEvent> {
    return {
        eventType: RS_STORED_EVENT,
        stateKey: event.id,
        content: {
            ...objectFastCloneWithout(event, ['speakers']),
            conferenceId: confId,
        } as IStoredEvent,
    };
}

export const RS_STORED_ROOM = "org.matrix.confbot.room";
export interface IStoredRoom extends Omit<IRoom, "eventsByDate"> {
    conferenceId: string;
}
export function makeStoredRoom(confId: string, room: IRoom): IStateEvent<IStoredRoom> {
    return {
        eventType: RS_STORED_ROOM,
        stateKey: room.id,
        content: {
            ...objectFastCloneWithout(room, ['eventsByDate']),
            conferenceId: confId,
        } as IStoredRoom,
    };
}

export const RS_STORED_CONFERENCE = "org.matrix.confbot.conference";
export interface IStoredConference extends Omit<IConference, "rooms"> {
    conferenceId: string;
}
export function makeStoredConference(confId: string, conference: IConference): IStateEvent<IStoredConference> {
    return {
        eventType: RS_STORED_CONFERENCE,
        stateKey: "",
        content: {
            ...objectFastCloneWithout(conference, ['rooms']),
            conferenceId: confId,
        } as IStoredConference,
    };
}

export const RSC_CONFERENCE_ROOM_FLAG = "org.matrix.confbot.conference";
export const RS_PARENT_ROOM = "org.matrix.confbot.parent";
export interface IParentRoom {
    roomId: string;
}
export function makeParentRoom(roomId: string): IStateEvent<IParentRoom> {
    return {
        eventType: RS_PARENT_ROOM,
        stateKey: "",
        content: {roomId: roomId},
    };
}

export const RS_CHILD_ROOM = "org.matrix.confbot.child";
export interface IChildRoom {
    roomId: string;
}
export function makeChildRoom(roomId: string): IStateEvent<IChildRoom> {
    return {
        eventType: RS_CHILD_ROOM,
        stateKey: roomId,
        content: {roomId: roomId},
    };
}

export function dtoToInitialState(dto: IStateEvent<any>): any {
    return {
        type: dto.eventType,
        state_key: dto.stateKey,
        content: dto.content,
    };
}
