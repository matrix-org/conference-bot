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

import { MatrixClient, MSC1772Space } from "matrix-bot-sdk";
import { IStoredRole } from "./room_state";
import { Conference } from "../Conference";
import { MatrixRoom } from "./MatrixRoom";

export class Role extends MatrixRoom {
    constructor(private storedRole: IStoredRole, roomId: string, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    public get name(): string {
        return this.storedRole.name;
    }

    public async getSpace(): Promise<MSC1772Space> {
        if (this.space) {
            return this.space;
        }

        this.space = await this.client.unstableApis.getSpace(this.storedRole.spaceRoomId);
        return this.space;
    }
}
