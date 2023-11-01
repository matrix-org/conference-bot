/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import { ICommand } from "./ICommand";
import { MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { Scheduler } from "../Scheduler";

export class RunCommand implements ICommand {
    public readonly prefixes = ["run"];

    constructor(private readonly client: MatrixClient, private readonly conference: Conference, private readonly scheduler: Scheduler) {}

    public async run(roomId: string, event: any, args: string[]) {
        const audId = args[0];
        if (audId === "all") {
            await this.scheduler.addAuditorium("all");
        } else {
            const aud = this.conference.getAuditorium(audId);
            if (!aud) return await this.client.replyHtmlNotice(roomId, event, "Unknown auditorium");

            await this.scheduler.addAuditorium(await aud.getId());
        }

        await this.client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
    }
}
