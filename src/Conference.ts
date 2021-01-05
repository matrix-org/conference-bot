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

import { MatrixClient, MSC1772Space } from "matrix-bot-sdk";
import {
    AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE,
    AUDITORIUM_CREATION_TEMPLATE,
    CONFERENCE_ROOM_CREATION_TEMPLATE,
    mergeWithCreationTemplate,
    RoomKind,
    RSC_AUDITORIUM_ID,
    RSC_CONFERENCE_ID,
    RSC_ROOM_KIND_FLAG,
    RSC_SPECIAL_INTEREST_ID,
    RSC_TALK_ID,
    TALK_CREATION_TEMPLATE
} from "./models/room_kinds";
import { IAuditorium, IConference, ITalk } from "./models/schedule";
import {
    makeParentRoom,
    makeStoredAuditorium,
    makeStoredConference,
    makeStoredPerson,
    makeStoredSpace,
    makeStoredTalk
} from "./models/room_state";
import { safeCreateRoom } from "./utils";
import { assignAliasVariations } from "./utils/aliases";
import config from "./config";
import { MatrixRoom } from "./models/MatrixRoom";
import { Auditorium, AuditoriumBackstage } from "./models/Auditorium";
import { Talk } from "./models/Talk";
import { LiveWidget } from "./models/LiveWidget";

export class Conference {
    private dbRoom: MatrixRoom;
    private auditoriums: {
        [auditoriumId: string]: Auditorium;
    } = {};
    private auditoriumBackstages: {
        [auditoriumId: string]: AuditoriumBackstage;
    } = {};
    private talks: {
        [talkId: string]: Talk;
    } = {};
    private interestRooms: {
        [interestId: string]: MatrixRoom;
    } = {};

    constructor(public readonly id: string, private client: MatrixClient) {
    }

    public get isCreated(): boolean {
        return !!this.dbRoom;
    }

    public async construct() {
        // Locate all the rooms for the conference
        const rooms = await this.client.getJoinedRooms();
        for (const room of rooms) {
            const createEvent = await this.client.getRoomStateEvent(room, "m.room.create", "");
            if (createEvent[RSC_CONFERENCE_ID] === this.id) {
                switch (createEvent[RSC_ROOM_KIND_FLAG]) {
                    case RoomKind.Conference:
                        this.dbRoom = new MatrixRoom(room, this.client, this);
                        break;
                    case RoomKind.Auditorium:
                        this.auditoriums[createEvent[RSC_AUDITORIUM_ID]] = new Auditorium(room, this.client, this);
                        break;
                    case RoomKind.Talk:
                        this.talks[createEvent[RSC_TALK_ID]] = new Talk(room, this.client, this);
                        break;
                    case RoomKind.SpecialInterest:
                        this.interestRooms[createEvent[RSC_SPECIAL_INTEREST_ID]] = new MatrixRoom(room, this.client, this);
                        break;
                    default:
                        break;
                }
            }
        }
    }

    public async createDb(conference: IConference) {
        if (this.dbRoom) {
            throw new Error("Conference has already been created");
        }

        const space = await this.client.unstableApis.createSpace({
            isPublic: true,
            localpart: config.conference.id,
            name: config.conference.name,
        });

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(CONFERENCE_ROOM_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
            },
            name: `[DB] Conference ${conference.title}`,
            initial_state: [
                makeStoredConference(this.id, conference),
                makeStoredSpace(space.roomId),
            ],
        }));

        this.dbRoom = new MatrixRoom(roomId, this.client, this);
    }

    public async getSpace(): Promise<MSC1772Space> {
        return this.dbRoom.getSpace();
    }

    public async createAuditorium(auditorium: IAuditorium): Promise<Auditorium> {
        if (this.auditoriums[auditorium.id]) {
            return this.auditoriums[auditorium.id];
        }

        const audSpace = await this.client.unstableApis.createSpace({
            localpart: "space-" + config.conference.prefixes.aliases + auditorium.name,
            isPublic: true,
            name: auditorium.name,
        });
        await (await this.getSpace()).addChildSpace(audSpace);

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(AUDITORIUM_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_AUDITORIUM_ID]: auditorium.id,
            },
            initial_state: [
                makeStoredAuditorium(this.id, auditorium),
                makeParentRoom(this.dbRoom.roomId),
                makeStoredSpace(audSpace.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + auditorium.name);
        await this.dbRoom.addDirectChild(roomId);
        this.auditoriums[auditorium.id] = new Auditorium(roomId, this.client, this);

        const widget = await LiveWidget.forAuditorium(this.auditoriums[auditorium.id], this.client);
        await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        await audSpace.addChildRoom(roomId);

        // Now create the backstage
        await this.createAuditoriumBackstage(auditorium, audSpace);

        return this.auditoriums[auditorium.id];
    }

    private async createAuditoriumBackstage(auditorium: IAuditorium, space: MSC1772Space): Promise<AuditoriumBackstage> {
        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_AUDITORIUM_ID]: auditorium.id,
            },
            initial_state: [
                makeStoredAuditorium(this.id, auditorium),
                makeParentRoom(this.dbRoom.roomId),
                makeStoredSpace(space.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + auditorium.name + "-backstage");
        await this.dbRoom.addDirectChild(roomId);
        this.auditoriumBackstages[auditorium.id] = new AuditoriumBackstage(roomId, this.client, this);

        await space.addChildRoom(roomId);

        return this.auditoriumBackstages[auditorium.id];
    }

    public async createTalk(talk: ITalk, auditorium: Auditorium): Promise<MatrixRoom> {
        if (this.talks[talk.id]) {
            return this.talks[talk.id];
        }

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(TALK_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_TALK_ID]: talk.id,
            },
            initial_state: [
                makeStoredTalk(this.id, talk),
                ...talk.speakers.map(s => makeStoredPerson(this.id, s)),
                makeParentRoom(auditorium.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + (await auditorium.getName()) + '-' + talk.slug);
        await auditorium.addDirectChild(roomId);
        this.talks[talk.id] = new Talk(roomId, this.client, this);

        const widget = await LiveWidget.forTalk(this.talks[talk.id], this.client);
        await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        await (await auditorium.getSpace()).addChildRoom(roomId);

        return this.talks[talk.id];
    }
}
