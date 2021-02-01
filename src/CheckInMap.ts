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

import { MatrixClient } from "../../matrix-js-bot-sdk";
import AwaitLock from "await-lock";
import { Conference } from "./Conference";
import { isEmojiVariant } from "./utils";

interface ICheckin {
    expires: number;
}

const CHECKIN_TIME = 4 * 60 * 60 * 1000; // 4 hours

export class CheckInMap {
    private checkedIn: {[userId: string]: ICheckin} = {};
    private lock = new AwaitLock();

    constructor(private client: MatrixClient, private conference: Conference) {
        client.on('room.event', async (roomId: string, event: any) => {
            const confTalk = conference.storedTalks.find(t => t.roomId === roomId);
            if (!confTalk) return;
            if (!this.checkedIn[event['sender']]) return;

            if (event['type'] === 'm.room.message') {
                if (!isEmojiVariant('👋', event['content']?.['body'] || '')) {
                    return;
                }
            } else if (event['type'] === 'm.reaction') {
                const emoji = event['content']?.['m.relates_to']?.['key'] || '';
                if (!isEmojiVariant('👋', emoji)) {
                    return;
                }
            } else {
                return;
            }

            await this.lock.acquireAsync();
            try {
                this.checkedIn[event['sender']] = {expires: (new Date()).getTime() + CHECKIN_TIME};
            } finally {
                this.lock.release();
            }
        });
    }

    public async expectCheckinFrom(userIds: string[]) {
        await this.lock.acquireAsync();
        try {
            for (const userId of userIds) {
                if (this.checkedIn[userId]) continue;
                this.checkedIn[userId] = {expires: 0};
            }
        } finally {
            this.lock.release();
        }
    }

    public isCheckedIn(userId: string): boolean {
        const checkin = this.checkedIn[userId];
        return checkin && checkin.expires >= (new Date()).getTime();
    }
}
