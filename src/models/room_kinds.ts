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

import { RoomCreateOptions } from "matrix-bot-sdk";


export const KickPowerLevel = 50;

export const PUBLIC_ROOM_POWER_LEVELS_TEMPLATE = (moderatorUserIds: string[]) => ({
    ban: 50,
    events_default: 0,
    invite: 50,
    kick: KickPowerLevel,
    redact: 50,
    state_default: 50,
    users_default: 0,
    events: {
        "im.vector.modular.widgets": 50,
        "m.room.avatar": 50,
        "m.room.canonical_alias": 100,
        "m.room.history_visibility": 100,
        "m.room.join_rules": 100,
        "m.room.guest_access": 100,
        "m.room.name": 100,
        "m.room.power_levels": 100,
        "m.room.topic": 100,
        "m.space.parent": 100,
        "m.space.child": 100,
    },
    users: Object.fromEntries(moderatorUserIds.map(moderator => [moderator, 100])),
});

export const PRIVATE_ROOM_POWER_LEVELS_TEMPLATE = {
    ...PUBLIC_ROOM_POWER_LEVELS_TEMPLATE,
    invite: 0,
};

/**
 * Key in a RS_LOCATOR event that identifies what kind of room it is.
 * Not namespaced because the event type is already privately namespaced for the bot.
 */
export const RSC_ROOM_KIND_FLAG = "kind";
export enum RoomKind {
    /**
     * The value is a misnomer: 'conference' is the kind of the conference's *database* room.
     * This is *not* the public space for the conference.
     */
    ConferenceDb = "conference",
    ConferenceSpace = "conference_space", // TODO
    Auditorium = "auditorium",
    AuditoriumBackstage = "auditorium_backstage",
    Talk = "talk",
    SpecialInterest = "other",
}

/**
 * Type of state event used to identify rooms that the bot has created.
 */
export const RS_LOCATOR = "org.matrix.confbot.locator";

export const RSC_CONFERENCE_ID = "conferenceId";
export const RSC_AUDITORIUM_ID = "auditoriumId";
export const RSC_TALK_ID = "talkId";
export const RSC_SPECIAL_INTEREST_ID = "interestId";

export const CONFERENCE_ROOM_CREATION_TEMPLATE: RoomCreateOptions = {
    preset: 'private_chat',
    visibility: 'private',
    initial_state: [
        {type: "m.room.guest_access", state_key: "", content: {guest_access: "forbidden"}},
        {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "shared"}},
    ],
    creation_content: {
        [RSC_ROOM_KIND_FLAG]: RoomKind.ConferenceDb,
    },
};

export const AUDITORIUM_CREATION_TEMPLATE = (moderatorUserIds: string[]) => ({
    preset: 'public_chat',
    visibility: 'public',
    initial_state: [
        {type: "m.room.guest_access", state_key: "", content: {guest_access: "can_join"}},
        {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "world_readable"}},
    ],
    creation_content: {
        [RSC_ROOM_KIND_FLAG]: RoomKind.Auditorium,
    },
    power_level_content_override: PUBLIC_ROOM_POWER_LEVELS_TEMPLATE(moderatorUserIds),
    invite: moderatorUserIds,
} satisfies RoomCreateOptions);

export const AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE: RoomCreateOptions = {
    preset: 'private_chat',
    visibility: 'private',
    initial_state: [
        {type: "m.room.guest_access", state_key: "", content: {guest_access: "forbidden"}},
        {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "shared"}},
    ],
    creation_content: {
        [RSC_ROOM_KIND_FLAG]: RoomKind.AuditoriumBackstage,
    },
    power_level_content_override: PRIVATE_ROOM_POWER_LEVELS_TEMPLATE,
};

export const TALK_CREATION_TEMPLATE = (moderatorUserIds: string[]) => ({ // before being opened up to the public
    preset: 'private_chat',
    visibility: 'private',
    initial_state: [
        {type: "m.room.guest_access", state_key: "", content: {guest_access: "forbidden"}},
        {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "invited"}},
    ],
    creation_content: {
        [RSC_ROOM_KIND_FLAG]: RoomKind.Talk,
    },
    power_level_content_override: PUBLIC_ROOM_POWER_LEVELS_TEMPLATE(moderatorUserIds),
    invite: moderatorUserIds,
} satisfies RoomCreateOptions);

export const SPECIAL_INTEREST_CREATION_TEMPLATE = (moderatorUserIds: string[]) => {
    let template = PUBLIC_ROOM_POWER_LEVELS_TEMPLATE(moderatorUserIds);
    return ({
        preset: 'public_chat',
        visibility: 'public',
        initial_state: [
            {type: "m.room.guest_access", state_key: "", content: {guest_access: "can_join"}},
            {type: "m.room.history_visibility", state_key: "", content: {history_visibility: "world_readable"}},
        ],
        creation_content: {
            [RSC_ROOM_KIND_FLAG]: RoomKind.SpecialInterest,
        },
        power_level_content_override: {
            ...template,
            events: {
                ...template.events,
                "m.room.power_levels": 50,
            },
        },
        invite: moderatorUserIds,
    } satisfies RoomCreateOptions);
};

export function mergeWithCreationTemplate(template: RoomCreateOptions, addlProps: any): any {
    const result = {...template};
    template.initial_state = template.initial_state?.slice(); // clone to prevent mutation by accident
    for (const prop of Object.keys(addlProps)) {
        switch (prop) {
            case 'initial_state':
                result.initial_state?.push(...addlProps.initial_state);
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
