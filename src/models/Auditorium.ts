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
import { PhysicalRoom } from "./PhysicalRoom";
import { IAuditorium } from "./schedule";

export class Auditorium extends MatrixRoom implements PhysicalRoom {
    constructor(roomId: string, private readonly definition: IAuditorium, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    public async getDefinition(): Promise<IAuditorium> {
        return this.definition;
    }

    public async getName(): Promise<string> {
        return (await this.getDefinition()).name;
    }

    public async getSlug(): Promise<string> {
        return (await this.getDefinition()).slug;
    }

    public async getId(): Promise<string> {
        return (await this.getDefinition()).id;
    }
}

// It's the same but different
export class AuditoriumBackstage extends Auditorium {
    constructor(roomId: string, definition: IAuditorium, client: MatrixClient, conference: Conference) {
        super(roomId, definition, client, conference);
    }
}
