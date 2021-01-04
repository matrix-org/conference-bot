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
import { IStoredTalk, RS_STORED_TALK } from "./room_state";
import { Conference } from "../Conference";
import { MatrixRoom } from "./MatrixRoom";
import { RSC_TALK_ID } from "./room_kinds";

export class Talk extends MatrixRoom {
    private storedTalk: IStoredTalk;

    constructor(roomId: string, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    public async getDefinition(): Promise<IStoredTalk> {
        if (this.storedTalk) {
            return this.storedTalk;
        }

        const createEvent = await this.client.getRoomStateEvent(this.roomId, "m.room.create", "");
        const talkId = createEvent[RSC_TALK_ID];
        this.storedTalk = await this.client.getRoomStateEvent(this.roomId, RS_STORED_TALK, talkId);
        return this.storedTalk;
    }

    public async getName(): Promise<string> {
        return (await this.getDefinition()).title;
    }

    public async getId(): Promise<string> {
        return (await this.getDefinition()).id;
    }

    public async getConferenceId(): Promise<string> {
        return (await this.getDefinition()).conferenceId;
    }
}
