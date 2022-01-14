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
import AwaitLock from "await-lock";
import { isEmojiVariant } from "./utils";

export interface RoomMessage {
    eventId: string;
    text: string;
    senderId: string;
    senderName?: string;
    senderHttpUrl?: string;
    activeUpvoteIds: string[];
    activeDownvoteIds: string[];
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
    /**
     * The start time of the current talk's Q&A session, as a Unix timestamp in milliseconds.
     *
     * When provided, a countdown or in-progress indicator is shown on the scoreboard.
     */
    qaStartTime: number | null;
    messages: RoomMessage[];
}

export interface CachedScoreboard {
    /**
     * The start time of the current talk's Q&A session, as a Unix timestamp in milliseconds.
     *
     * When provided, a countdown or in-progress indicator is shown on the scoreboard.
     */
    qaStartTime: number | null;
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
    private lock = new AwaitLock();

    constructor(private conference: Conference, private client: MatrixClient) {
        this.client.on("room.event", async (roomId: string, event: any) => {
            if (event['type'] === 'm.reaction') {
                await this.tryAddReaction(roomId, event);
            } else if (event['type'] === 'm.room.redaction') {
                await this.tryRemoveReaction(roomId, event);
                await this.tryRemoveMessage(roomId, event);
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

    public async resetScoreboard(roomId: string) {
        await this.lock.acquireAsync();
        try {
            this.byRoom[roomId] = {
                qaStartTime: null,
                messages: [],
            };
            await this.calculateRoom(roomId);
        } finally {
            this.lock.release();
        }
    }

    /**
     * Shows the countdown or in-progress indicator for a Q&A session.
     * @param roomId The auditorium's room ID.
     * @param qaStartTime The start time of the Q&A session, as a Unix timestamp in milliseconds.
     */
    public async showQACountdown(roomId: string, qaStartTime: number) {
        await this.lock.acquireAsync();
        try {
            if (!(roomId in this.byRoom)) {
                this.byRoom[roomId] = {
                    qaStartTime: null,
                    messages: [],
                }
            }

            this.byRoom[roomId].qaStartTime = qaStartTime;

            await this.calculateRoom(roomId);
        } finally {
            this.lock.release();
        }
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
                upvotes: message.activeUpvoteIds.length - message.activeDownvoteIds.length,
            };
            messages.push(m);
        }
        messages.sort((a, b) => {
            return b.upvotes - a.upvotes;
        });
        this.byRoomCached[roomId] = {
            qaStartTime: scoreboard.qaStartTime,
            ordered: messages,
        };
    }

    private async tryAddReaction(roomId: string, event: any) {
        const isAuditorium = this.conference.storedAuditoriums.some(a => a.roomId === roomId);
        if (!isAuditorium) return; // irrelevant

        const relation = event['content']?.['m.relates_to'];
        if (!relation) return;

        if (relation['rel_type'] !== 'm.annotation') return;

        const isUpvote = isEmojiVariant('👍', relation['key']);
        const isDownvote = isEmojiVariant('👎', relation['key']);

        if (!isUpvote && !isDownvote) return;
        if (typeof (relation['event_id']) !== 'string') return;

        await this.lock.acquireAsync();
        try {
            // First see if we already know about it
            let scoreboard = this.byRoom[roomId];
            if (!scoreboard) {
                this.byRoom[roomId] = {
                    qaStartTime: null,
                    messages: [],
                };
                scoreboard = this.byRoom[roomId];
            }
            const message = scoreboard.messages.find(m => m.eventId === relation['event_id']);
            if (message) {
                (isUpvote ? message.activeUpvoteIds : message.activeDownvoteIds).push(event['event_id']);
            } else {
                // We don't know about it. Check the message
                const targetEv = await this.client.getEvent(roomId, relation['event_id']);
                if (targetEv?.['type'] !== 'm.room.message') return;
                if (targetEv?.['content']?.['msgtype'] !== "m.text") return;
                if (typeof (targetEv?.['content']?.['body']) !== 'string') return;

                const message: RoomMessage = {
                    activeUpvoteIds: [],
                    activeDownvoteIds: [],
                    eventId: relation['event_id'],
                    senderId: targetEv['sender'],
                    text: targetEv['content']['body'],
                };
                (isUpvote ? message.activeUpvoteIds : message.activeDownvoteIds).push(event['event_id']);

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
        } finally {
            this.lock.release();
        }
    }

    private async tryRemoveReaction(roomId: string, event: any) {
        const isAuditorium = this.conference.storedAuditoriums.some(a => a.roomId === roomId);
        if (!isAuditorium) return; // irrelevant

        if (!event['redacts']) return;

        await this.lock.acquireAsync();
        try {
            const scoreboard = this.byRoom[roomId];
            if (!scoreboard) return;

            const upvoteMessage = scoreboard.messages.find(m => m.activeUpvoteIds.includes(event['redacts']));
            const downvoteMessage = scoreboard.messages.find(m => m.activeDownvoteIds.includes(event['redacts']));
            if (!upvoteMessage && !downvoteMessage) return;

            if (upvoteMessage) {
                const idx = upvoteMessage.activeUpvoteIds.findIndex(i => i === event['redacts']);
                if (idx >= 0) upvoteMessage.activeUpvoteIds.splice(idx, 1);
            }
            if (downvoteMessage) {
                const idx = downvoteMessage.activeDownvoteIds.findIndex(i => i === event['redacts']);
                if (idx >= 0) downvoteMessage.activeDownvoteIds.splice(idx, 1);
            }

            await this.calculateRoom(roomId);
        } finally {
            this.lock.release();
        }
    }

    private async tryRemoveMessage(roomId: string, event: any) {
        const isAuditorium = this.conference.storedAuditoriums.some(a => a.roomId === roomId);
        if (!isAuditorium) return; // irrelevant

        if (!event['redacts']) return;

        await this.lock.acquireAsync();
        try {
            const scoreboard = this.byRoom[roomId];
            if (!scoreboard) return;

            const toRemove = scoreboard.messages.find(m => m.eventId === event['redacts']);
            if (!toRemove) return;

            const idx = scoreboard.messages.indexOf(toRemove);
            if (idx >= 0) scoreboard.messages.splice(idx, 1);

            await this.calculateRoom(roomId);
        } finally {
            this.lock.release();
        }
    }
}
