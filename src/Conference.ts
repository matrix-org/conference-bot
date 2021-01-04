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

import { MatrixClient } from "matrix-bot-sdk";
import {
    CONFERENCE_ROOM_CREATION_TEMPLATE,
    mergeWithCreationTemplate,
    RoomKind,
    RSC_CONFERENCE_ID,
    RSC_ROOM_KIND_FLAG,
    RSC_SPECIAL_INTEREST_ID,
    RSC_STAGE_ID,
    RSC_TALK_ID,
    STAGE_CREATION_TEMPLATE,
    TALK_CREATION_TEMPLATE
} from "./models/room_kinds";
import { IConference, IStage, ITalk } from "./models/schedule";
import { makeParentRoom, makeStoredConference, makeStoredStage, makeStoredTalk } from "./models/room_state";
import { safeCreateRoom } from "./utils";
import { assignAliasVariations } from "./utils/aliases";
import config from "./config";
import { MatrixRoom } from "./models/MatrixRoom";
import { Stage } from "./models/Stage";
import { Talk } from "./models/Talk";
import { LiveWidget } from "./models/LiveWidget";

export class Conference {
    private dbRoom: MatrixRoom;
    private stages: {
        [stageId: string]: Stage;
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
                    case RoomKind.Stage:
                        this.stages[createEvent[RSC_STAGE_ID]] = new Stage(room, this.client, this);
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

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(CONFERENCE_ROOM_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
            },
            name: `[DB] Conference ${conference.title}`,
            initial_state: [
                makeStoredConference(this.id, conference),
            ],
        }));

        this.dbRoom = new MatrixRoom(roomId, this.client, this);
    }

    public async createStage(stage: IStage): Promise<Stage> {
        if (this.stages[stage.id]) {
            return this.stages[stage.id];
        }
        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(STAGE_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_STAGE_ID]: stage.id,
            },
            initial_state: [
                makeStoredStage(this.id, stage),
                makeParentRoom(this.dbRoom.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + stage.name);
        await this.dbRoom.addDirectChild(roomId);
        this.stages[stage.id] = new Stage(roomId, this.client, this);

        const widget = await LiveWidget.forAuditorium(this.stages[stage.id], this.client);
        await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        return this.stages[stage.id];
    }

    public async createTalk(talk: ITalk, stage: Stage): Promise<MatrixRoom> {
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
                makeParentRoom(stage.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + (await stage.getName()) + '-' + talk.slug);
        await stage.addDirectChild(roomId);
        this.talks[talk.id] = new Talk(roomId, this.client, this);

        const widget = await LiveWidget.forTalk(this.talks[talk.id], this.client);
        await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        return this.talks[talk.id];
    }
}
