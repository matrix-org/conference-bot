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
import { decodePrefix } from "../backends/penta/PentabarfParser";
import { PhysicalRoom } from "./PhysicalRoom";
import { IPrefixConfig } from "../config";

/**
 * Represents an interest room.
 *
 * Interest rooms may be new rooms created by the bot, or existing rooms created by another user.
 * As such, they do not necessarily have any special state events.
 */
export class InterestRoom extends MatrixRoom implements PhysicalRoom {
    private id: string;
    private name: string;

    constructor(roomId: string, client: MatrixClient, conference: Conference, id: string, prefixes: IPrefixConfig) {
        super(roomId, client, conference);

        this.id = id;
        this.name = decodePrefix(id, prefixes)!.name;
    }

    public getName(): string {
        return this.name;
    }

    public getId(): string {
        return this.id;
    }
}
