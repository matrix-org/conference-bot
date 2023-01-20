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

import { LogService, MatrixClient, Space } from "matrix-bot-sdk";
import { RS_ASSOCIATED_SPACE } from "./room_state";
import { Conference } from "../Conference";

export class MatrixRoom {
    protected space: Space;
    protected canonicalAlias: string;

    constructor(public readonly roomId: string, protected client: MatrixClient, protected conference: Conference) {
    }

    public async getAssociatedSpace(): Promise<Space> {
        if (this.space) {
            return this.space;
        }
        const spaceState = await this.client.getRoomStateEvent(this.roomId, RS_ASSOCIATED_SPACE, "");
        this.space = await this.client.getSpace(spaceState.roomId);
        return this.space;
    }

    public async getCanonicalAlias(): Promise<string | null> {
        if (this.canonicalAlias) {
            return this.canonicalAlias;
        }

        try {
            const ev = await this.client.getRoomStateEvent(this.roomId, "m.room.canonical_alias", "");
            if (ev['alias']) {
                this.canonicalAlias = ev['alias'];
                return this.canonicalAlias;
            }
        } catch (e) {
            LogService.warn("MatrixRoom", e);
        }

        return null;
    }
}

