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
import { IStoredAuditorium, RS_STORED_AUDITORIUM } from "./room_state";
import { Conference } from "../Conference";
import { MatrixRoom } from "./MatrixRoom";
import { RSC_AUDITORIUM_ID } from "./room_kinds";

export class Auditorium extends MatrixRoom {
    private storedAud: IStoredAuditorium;

    constructor(roomId: string, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    public async getDefinition(): Promise<IStoredAuditorium> {
        if (this.storedAud) {
            return this.storedAud;
        }

        const createEvent = await this.client.getRoomStateEvent(this.roomId, "m.room.create", "");
        const audId = createEvent[RSC_AUDITORIUM_ID];
        this.storedAud = await this.client.getRoomStateEvent(this.roomId, RS_STORED_AUDITORIUM, audId);
        return this.storedAud;
    }

    public async getName(): Promise<string> {
        return (await this.getDefinition()).name;
    }

    public async getId(): Promise<string> {
        return (await this.getDefinition()).id;
    }

    public async getConferenceId(): Promise<string> {
        return (await this.getDefinition()).conferenceId;
    }
}

// It's the same but different
export class AuditoriumBackstage extends Auditorium {
    constructor(roomId: string, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }
}
