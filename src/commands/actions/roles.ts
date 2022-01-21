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

import { doAuditoriumResolveAction, doInterestResolveAction, IAction } from "./people";
import { MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../../Conference";

export async function runRoleCommand(action: IAction, conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[], isInvite = true) {
    const backstageOnly = args.includes("backstage");
    const skipTalks = args.includes("notalks");

    if (args[0] && args[0] !== "backstage") {
        const aud = backstageOnly ? conference.getAuditoriumBackstage(args[0]) : conference.getAuditorium(args[0]);
        if (!aud) {
            const spiRoom = conference.getInterestRoom(args[0]);
            if (!spiRoom) return client.replyNotice(roomId, event, "Unknown auditorium/interest room");
            await doInterestResolveAction(action, client, spiRoom, conference, isInvite);
        } else {
            await doAuditoriumResolveAction(action, client, aud, conference, backstageOnly, skipTalks, isInvite);
        }
    } else {
        if (!args.includes("sionly")) {
            for (const auditorium of conference.storedAuditoriums) {
                await doAuditoriumResolveAction(action, client, auditorium, conference, backstageOnly, skipTalks, isInvite);
            }
        }
        if (!args.includes("nosi")) {
            for (const spiRoom of conference.storedInterestRooms) {
                await doInterestResolveAction(action, client, spiRoom, conference, isInvite);
            }
        }
    }
}
