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

import { LogService, MatrixClient } from "matrix-bot-sdk";
import AwaitLock from "await-lock";
import {promises as fs} from "fs";
import * as path from "path";
import { IConfig } from "./config";

interface ICheckin {
    expires: number;
}

const CHECKIN_TIME = 4 * 60 * 60 * 1000; // 4 hours

export class CheckInMap {
    private checkedIn: { [userId: string]: ICheckin } = {};
    private lock = new AwaitLock();

    constructor(client: MatrixClient, private readonly config: IConfig) {
        client.on('room.event', async (roomId: string, event: any) => {
            if (!this.checkedIn[event['sender']]) return;

            if (event['type'] === 'm.room.message' || event['type'] === 'm.reaction') {
                await this.lock.acquireAsync();
                try {
                    this.checkedIn[event['sender']] = {expires: (new Date()).getTime() + CHECKIN_TIME};
                    await this.persist();
                } finally {
                    this.lock.release();
                }
            }
        });
        this.load();
    }

    private async persist() {
        await fs.writeFile(path.join(this.config.dataPath, "checkins.json"), JSON.stringify(this.checkedIn), "utf-8");
    }

    private async load() {
        try {
            await this.lock.acquireAsync();
            const str = await fs.readFile(path.join(this.config.dataPath, "checkins.json"), "utf-8");
            this.checkedIn = JSON.parse(str || "{}");
        } catch (e) {
            LogService.error("CheckInMap", e);
        } finally {
            this.lock.release();
        }
    }

    public async expectCheckinFrom(userIds: string[]) {
        await this.lock.acquireAsync();
        try {
            for (const userId of userIds) {
                if (this.checkedIn[userId]) continue;
                this.checkedIn[userId] = {expires: 0};
            }
            await this.persist();
        } finally {
            this.lock.release();
        }
    }

    public async extendCheckin(userId: string) {
        await this.lock.acquireAsync();
        try {
            if (!this.checkedIn[userId]) return;
            this.checkedIn[userId] = {expires: (new Date()).getTime() + CHECKIN_TIME};
            await this.persist();
        } finally {
            this.lock.release();
        }
    }

    public isCheckedIn(userId: string): boolean {
        const checkin = this.checkedIn[userId];
        return checkin && checkin.expires >= (new Date()).getTime();
    }
}
