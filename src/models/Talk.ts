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

import { LogService, MatrixClient } from "matrix-bot-sdk";
import { RS_STORED_PERSON, RS_STORED_TALK } from "./room_state";
import { Conference } from "../Conference";
import { MatrixRoom } from "./MatrixRoom";
import { RSC_AUDITORIUM_ID, RSC_TALK_ID } from "./room_kinds";
import { IPerson, ITalk } from "./schedule";

export class Talk extends MatrixRoom {
    private storedTalk: ITalk;
    private people: IPerson[] | null = null;

    constructor(roomId: string, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    public async getDefinition(): Promise<ITalk> {
        if (this.storedTalk) {
            return this.storedTalk;
        }

        const createEvent = await this.client.getRoomStateEvent(this.roomId, "m.room.create", "");
        const talkId = createEvent[RSC_TALK_ID];
        const auditoriumId = createEvent[RSC_AUDITORIUM_ID];
        this.storedTalk = await this.client.getRoomStateEvent(this.roomId, RS_STORED_TALK, talkId);
        if (auditoriumId != this.storedTalk.auditoriumId) {
            LogService.error("Talk", `In talk id=${talkId} auditoriumId from room state (${auditoriumId}) != ITalk.auditoriumId! (${this.storedTalk.auditoriumId})`)
        }
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

    public async getAuditoriumId(): Promise<string> {
        return (await this.getDefinition()).auditoriumId;
    }

    public async getSpeakers(): Promise<IPerson[]> {
        if (this.people !== null) {
            return this.people;
        }
        const state = await this.client.getRoomState(this.roomId);
        const speakers = state.filter(s => s.type === RS_STORED_PERSON);
        this.people = speakers.map(s => s.content).filter(s => !!s);
        return this.people;
    }
}
