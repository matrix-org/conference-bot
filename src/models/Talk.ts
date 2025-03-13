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
import { IPerson, ITalk } from "./schedule";

export class Talk extends MatrixRoom {
    constructor(roomId: string, private readonly definition: ITalk, client: MatrixClient, conference: Conference) {
        super(roomId, client, conference);
    }

    public getDefinition(): ITalk {
        return this.definition;
    }

    public getName(): string {
        return this.getDefinition().title;
    }

    public getId(): string {
        return this.getDefinition().id;
    }

    public getAuditoriumId(): string {
        return this.getDefinition().auditoriumId;
    }

    public getSpeakers(): IPerson[] {
        return this.getDefinition().speakers;
    }
}
