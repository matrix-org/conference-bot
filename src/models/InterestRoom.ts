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

import { MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { MatrixRoom } from "./MatrixRoom";
import { RSC_SPECIAL_INTEREST_ID } from "./room_kinds";
import { deprefix } from "../parsers/PentabarfParser";
import { PhysicalRoom } from "./PhysicalRoom";

export class InterestRoom extends MatrixRoom implements PhysicalRoom {
    private id: string;
    private name: string;

    constructor(roomId: string, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    private async doFetch() {
        if (this.id || this.name) return;

        const createEvent = await this.client.getRoomStateEvent(this.roomId, "m.room.create", "");
        this.id = createEvent[RSC_SPECIAL_INTEREST_ID];
        this.name = deprefix(this.id).name;
    }

    public async getName(): Promise<string> {
        await this.doFetch();
        return this.name;
    }

    public async getId(): Promise<string> {
        await this.doFetch();
        return this.id;
    }
}
