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

import { Conference } from "./Conference";
import { LogService, MatrixClient, Permalinks, UserID } from "matrix-bot-sdk";

export interface RoomMessage {
    eventId: string;
    text: string;
    senderId: string;
    senderName?: string;
    senderHttpUrl?: string;
    activeUpvoteIds: string[];
}

export interface CachedMessage {
    permalink: string;
    text: string;
    upvotes: number;
    senderId: string;
    senderName?: string;
    senderAvatarHttpUrl?: string;
}

export interface RoomScoreboard {
    messages: RoomMessage[];
}

export interface CachedScoreboard {
    ordered: CachedMessage[];
}

export class Scoreboard {
    private byRoom: {
        [roomId: string]: RoomScoreboard;
    } = {};

    private byRoomCached: {
        [roomId: string]: CachedScoreboard;
    } = {};

    private domain: string;

    constructor(private conference: Conference, private client: MatrixClient) {
        this.client.on("room.event", (roomId: string, event: any) => {
            if (event['type'] === 'm.reaction') {
                return this.tryAddReaction(roomId, event);
            } else if (event['type'] === 'm.redaction') {
                return this.tryRemoveReaction(roomId, event);
            }
        });

        this.client.getUserId().then(uid => {
            const parsed = new UserID(uid);
            this.domain = parsed.domain;
        });
    }

    public getScoreboard(roomId: string): CachedScoreboard {
        return this.byRoomCached[roomId];
    }

    private async calculateRoom(roomId: string) {
        LogService.info("Scoreboard", `Recalculating scoreboard for ${roomId}`);
        const scoreboard = this.byRoom[roomId];
        const messages: CachedMessage[] = [];
        for (const message of scoreboard.messages) {
            const m: CachedMessage = {
                permalink: Permalinks.forEvent(roomId, message.eventId, [this.domain]),
                senderAvatarHttpUrl: message.senderHttpUrl,
                senderName: message.senderName,
                senderId: message.senderId,
                text: message.text,
                upvotes: message.activeUpvoteIds.length,
            };
            messages.push(m);
        }
        messages.sort((a, b) => {
            return b.upvotes - a.upvotes;
        });
        this.byRoomCached[roomId] = {ordered: messages};
    }

    private async tryAddReaction(roomId: string, event: any) {
        const isAuditorium = this.conference.storedAuditoriums.some(a => a.roomId === roomId);
        if (!isAuditorium) return; // irrelevant

        const relation = event['content']?.['m.relates_to'];
        if (!relation) return;

        if (relation['rel_type'] !== 'm.annotation') return;
        if (relation['key'] !== '👍' && relation['key'] !== '👍️') return;
        if (typeof (relation['event_id']) !== 'string') return;

        // First see if we already know about it
        let scoreboard = this.byRoom[roomId];
        if (!scoreboard) {
            this.byRoom[roomId] = {
                messages: [],
            };
            scoreboard = this.byRoom[roomId];
        }
        const message = scoreboard.messages.find(m => m.eventId === relation['event_id']);
        if (message) {
            message.activeUpvoteIds.push(event['event_id']);
        } else {
            // We don't know about it. Check the message
            const targetEv = await this.client.getEvent(roomId, relation['event_id']);
            if (targetEv?.['type'] !== 'm.room.message') return;
            if (targetEv?.['content']?.['msgtype'] !== "m.text") return;
            if (typeof (targetEv?.['content']?.['body']) !== 'string') return;

            const message: RoomMessage = {
                activeUpvoteIds: [event['event_id']],
                eventId: relation['event_id'],
                senderId: targetEv['sender'],
                text: targetEv['content']['body'],
            };

            try {
                const profile = await this.client.getUserProfile(message.senderId);
                if (profile['displayname']) message.senderName = profile['displayname'];
                if (profile['avatar_url'] && profile['avatar_url'].startsWith('mxc://')) {
                    const parts = profile['avatar_url'].substring('mxc://'.length).split('/');
                    message.senderHttpUrl = `${this.client.homeserverUrl}/_matrix/media/r0/thumbnail/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}?method=crop&width=64&height=64`;
                }
            } catch (e) {
                // ignore
            }

            scoreboard.messages.push(message);
        }

        await this.calculateRoom(roomId);
    }

    private async tryRemoveReaction(roomId: string, event: any) {
        const isAuditorium = this.conference.storedAuditoriums.some(a => a.roomId === roomId);
        if (!isAuditorium) return; // irrelevant

        if (!event['redacts']) return;

        const scoreboard = this.byRoom[roomId];
        if (!scoreboard) return;

        const message = scoreboard.messages.find(m => m.activeUpvoteIds.includes(event['redacts']));
        if (!message) return;

        const idx = message.activeUpvoteIds.findIndex(i => i === event['redacts']);
        if (idx >= 0) message.activeUpvoteIds.splice(idx, 1);

        await this.calculateRoom(roomId);
    }
}
