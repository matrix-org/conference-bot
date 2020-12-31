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
import { IStoredStage, RS_STORED_STAGE } from "./room_state";
import { Conference } from "../Conference";
import { MatrixRoom } from "./MatrixRoom";
import { RSC_STAGE_ID } from "./room_kinds";

export class Stage extends MatrixRoom {
    private storedStage: IStoredStage;

    constructor(roomId: string, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    public async getDefinition(): Promise<IStoredStage> {
        if (this.storedStage) {
            return this.storedStage;
        }

        const createEvent = await this.client.getRoomStateEvent(this.roomId, "m.room.create", "");
        const stageId = createEvent[RSC_STAGE_ID];
        this.storedStage = await this.client.getRoomStateEvent(this.roomId, RS_STORED_STAGE, stageId);
        return this.storedStage;
    }

    public async getName(): Promise<string> {
        return (await this.getDefinition()).name;
    }
}
