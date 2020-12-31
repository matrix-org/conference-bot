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

import { IConference, ITalk, IPerson, IStage } from "./schedule";
import { objectFastCloneWithout } from "../utils";

export interface IStateEvent<T> {
    type: string;
    state_key: string;
    content: T;
}

export const RS_STORED_PERSON = "org.matrix.confbot.person";
export interface IStoredPerson extends IPerson {
    conferenceId: string;
}
export function makeStoredPerson(confId: string, person: IPerson): IStateEvent<IStoredPerson> {
    return {
        type: RS_STORED_PERSON,
        state_key: person.id,
        content: {
            ...objectFastCloneWithout(person, []),
            conferenceId: confId,
        } as IStoredPerson,
    };
}

export const RS_STORED_TALK = "org.matrix.confbot.talk";
export interface IStoredTalk extends Omit<ITalk, "speakers"> {
    conferenceId: string;
}
export function makeStoredTalk(confId: string, talk: ITalk): IStateEvent<IStoredTalk> {
    return {
        type: RS_STORED_TALK,
        state_key: talk.id,
        content: {
            ...objectFastCloneWithout(talk, ['speakers']),
            conferenceId: confId,
        } as IStoredTalk,
    };
}

export const RS_STORED_STAGE = "org.matrix.confbot.stage";
export interface IStoredStage extends Omit<IStage, "talksByDate"> {
    conferenceId: string;
}
export function makeStoredStage(confId: string, stage: IStage): IStateEvent<IStoredStage> {
    return {
        type: RS_STORED_STAGE,
        state_key: stage.id,
        content: {
            ...objectFastCloneWithout(stage, ['talksByDate']),
            conferenceId: confId,
        } as IStoredStage,
    };
}

export const RS_STORED_CONFERENCE = "org.matrix.confbot.conference";
export interface IStoredConference extends Omit<IConference, "stages"> {
    conferenceId: string;
}
export function makeStoredConference(confId: string, conference: IConference): IStateEvent<IStoredConference> {
    return {
        type: RS_STORED_CONFERENCE,
        state_key: "",
        content: {
            ...objectFastCloneWithout(conference, ['stages']),
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
