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
import { MatrixClient, LogService } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { IRCBridge } from "../ircBridge";

const PLUMB_WAIT_MS = 1000;
export class IrcPlumbCommand implements ICommand {
    constructor(private readonly ircBridge: IRCBridge) {

    }

    public readonly prefixes = ["plumb-irc"];

    private async plumbAll(conference: Conference, client: MatrixClient, roomId: string) {
        for (const auditorium of conference.storedAuditoriums) {
            const channelName = await this.ircBridge.deriveChannelName(auditorium);
            try {
                await this.ircBridge.plumbChannelToRoom(channelName, auditorium.roomId);
                // Wait before plumbing the next one so as to not overwhelm the poor bridge.
                await new Promise(r => setTimeout(r, PLUMB_WAIT_MS));
            } catch (ex) {
                LogService.warn(`Could not plumb channel ${channelName} to ${roomId}:`, ex);
                return client.sendNotice(roomId, `Could not plumb ${channelName} to ${roomId}. See logs for details`);
            }
        }
    }

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.sendReadReceipt(roomId, event['event_id']);
        const [channel, requestedRoomIdOrAlias] = args;
        if (channel === 'all') {
            try {
                await this.plumbAll(conference, client, roomId);
            } catch (ex) {
                return client.sendNotice(roomId, "Failed to bridge all auditorums, see logs");
            }
            return;
        }
        if (!this.ircBridge.isChannelAllowed(channel)) {
            return client.sendNotice(roomId, "Sorry, that channel is not allowed");
        }
        let resolvedRoomId: string;
        try {
            resolvedRoomId = await client.resolveRoom(requestedRoomIdOrAlias);
        } catch (ex) {
            return client.sendNotice(roomId, "Sorry, that alias could not be resolved");
        }
        try {
            await client.joinRoom(requestedRoomIdOrAlias);
        } catch (ex) {
            return client.sendNotice(roomId, "Could not join that room, is the bot invited?");
        }
        try {
            await this.ircBridge.plumbChannelToRoom(channel, resolvedRoomId);
        } catch (ex) {
            console.log(ex);
            return client.sendNotice(roomId, "Could not plumb channel. See logs for details");
        }
        return client.sendNotice(roomId, "Plumbed channel");
    }
}
