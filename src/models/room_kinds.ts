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

export const RSC_ROOM_KIND_FLAG = "org.matrix.confbot.kind";
export enum RoomKind {
    Conference = "conference",
    VirtualRoom = "virtual_room",
    Talk = "talk",
    Other = "other",
}

export const CONFERENCE_ROOM_CREATION_TEMPLATE = {
    preset: 'private_chat',
    visibility: 'private',
    initial_state: [
        {type: "m.room.guest_access", state_key: "", content: {guest_access: "forbidden"}},
        {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "shared"}},
    ],
    creation_content: {
        [RSC_ROOM_KIND_FLAG]: RoomKind.Conference,
    },
};

export const PRIMARY_ROOM_CREATION_TEMPLATE = {
    preset: 'public_chat',
    visibility: 'public',
    initial_state: [
        {type: "m.room.guest_access", state_key: "", content: {guest_access: "can_join"}},
        {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "world_readable"}},
    ],
    creation_content: {
        [RSC_ROOM_KIND_FLAG]: RoomKind.VirtualRoom,
    },
};

export const INITIAL_EVENT_ROOM_CREATION_TEMPLATE = {
    preset: 'private_chat',
    visibility: 'private',
    initial_state: [
        {type: "m.room.guest_access", state_key: "", content: {guest_access: "forbidden"}},
        {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "invited"}},
    ],
    creation_content: {
        [RSC_ROOM_KIND_FLAG]: RoomKind.Talk,
    },
}

export function mergeWithCreationTemplate(template: any, addlProps: any): any {
    const result = {...template};
    template.initial_state = template.initial_state.slice(); // clone to prevent mutation by accident
    for (const prop of Object.keys(addlProps)) {
        switch (prop) {
            case 'initial_state':
                result.initial_state.push(...addlProps.initial_state);
                break;
            case 'creation_content':
                result.creation_content = {...result.creation_content, ...addlProps.creation_content};
                break;
            default:
                result[prop] = addlProps[prop];
                break;
        }
    }
    return result;
}