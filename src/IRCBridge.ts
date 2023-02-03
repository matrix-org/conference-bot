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

import { MatrixClient, MatrixError, MatrixEvent } from "matrix-bot-sdk";
import * as irc from "irc-upd";
import { Auditorium } from "./models/Auditorium";
import { InterestRoom } from "./models/InterestRoom";
import config from "./config";
import { makeLocalpart } from "./utils/aliases";

export interface IRCBridgeOpts {
    botNick: string;
    botUsername?: string;
    botPassword?: string;
    serverName: string;
    sasl?: boolean;
    port: number;
    botUserId: string;
    channelPrefix: string;
    moderationBotNick: string|string[];
    ircBridgeNick: string;
    secure: boolean;
}

interface IrcBridgeData {
    roomId: string;
}

const COMMAND_TIMEOUT_MS = 60000;

export class IRCBridge {

    private botRoomId?: string;
    private ircClient: any;
    constructor(private readonly config: IRCBridgeOpts, private readonly mxClient: MatrixClient) {
        if (!config.botNick || !config.botUserId || !config.channelPrefix || !config.port || !config.serverName) {
            throw Error('Missing configuration options for IRC bridge');
        }
    }

    public get botUserId() {
        return this.config.botUserId;
    }

    public async deriveChannelName(auditorium: Auditorium) {
        const name = await auditorium.getName();
        if (!name) {
            throw Error('Auditorium name is empty');
        }
        return `${this.config.channelPrefix}${name}`;
    }

    public async deriveChannelNameSI(interest: InterestRoom) {
        const name = makeLocalpart(await interest.getName(), await interest.getId());
        if (!name) {
            throw Error('Special interest name is empty');
        }
        return `${this.config.channelPrefix}${name}`;
    }

    public async setup() {
        // Ensure we have a PM with the bridge
        const data = await this.mxClient.getSafeAccountData<IrcBridgeData>("org.matrix.conference-bot.irc-bridge");
        if (!data) {
            const roomId = await this.mxClient.createRoom({
                preset: "private_chat",
                invite: [this.config.botUserId],
                is_direct: true,
            });
            this.mxClient.setAccountData("org.matrix.conference-bot.irc-bridge", {
                roomId,
            } as IrcBridgeData);
            this.botRoomId = roomId;
        } else {
            this.botRoomId = data.roomId;
        }

        // This should timeout if the connection is broken
        await this.executeCommand("bridgeversion");

        this.ircClient = new irc.Client(this.config.serverName, this.config.botNick, {
            port: this.config.port,
            password: this.config.botPassword,
            sasl: this.config.sasl || false,
            userName: this.config.botUsername || "mx-conf-bot",
            realName: 'matrix-conference-bot',
            secure: this.config.secure !== undefined ? this.config.secure : true, // Default to true
        });
        this.ircClient.on("error", (...args) => {
            console.warn("irc client got an error:", args)
        });
    }

    public isChannelAllowed(channel: string) {
        return channel && channel.startsWith(this.config.channelPrefix);
    }

    public async shouldInviteBot(roomId: string) {
        try {
            const currentMemberState = await this.mxClient.getRoomStateEvent(roomId, 'm.room.member', this.config.botUserId);
            return !['join','invite'].includes(currentMemberState.membership);
        } catch (ex) {
            return ex instanceof MatrixError && ex.errcode === "M_NOT_FOUND";
        }
    }

    public async plumbChannelToRoom(channel: string, roomId: string) {
        if (await this.shouldInviteBot(roomId)) {
            await this.ircClient.join(channel);
        }
        await this.ircClient.join(channel);
        const result = await this.executeCommand(`plumb ${roomId} ${this.config.serverName} ${channel}`);
        const resultText = result.content.body;
        if (resultText !== 'Room plumbed.') {
            throw Error(`IRC bridge gave an error: ${resultText}`);
        }
        await this.ircClient.send("MODE", channel, "+o", this.config.ircBridgeNick);
        const moderatorNicks = Array.isArray(this.config.moderationBotNick) ? this.config.moderationBotNick : [this.config.moderationBotNick];
        for (const nick of moderatorNicks) {
            await this.ircClient.send("MODE", channel, "+o", nick);
        }
    }

    public async executeCommand(command: string): Promise<MatrixEvent<any>> {
        if (!this.botRoomId) {
            throw Error('No botRoomId defined. Was start() called?');
        }
        let requestEventId: string;
        const promise = new Promise<MatrixEvent<any>>((resolve, reject) => {
            let timeout: NodeJS.Timeout;
            const handlerFn = (roomId, event) => {
                if (roomId !== this.botRoomId) {
                    return;
                }
                if (event.content?.["m.relates_to"]?.["m.in_reply_to"]?.event_id === requestEventId) {
                    resolve(new MatrixEvent(event));
                    clearTimeout(timeout);
                }
            };
            timeout = setTimeout(() => {
                this.mxClient.removeListener("room.message", handlerFn);
                reject(new Error('Timed out waiting for bridge response'));
            }, COMMAND_TIMEOUT_MS);
            this.mxClient.on("room.message", handlerFn);
        });
        requestEventId = await this.mxClient.sendText(this.botRoomId, `!${command}`);
        return promise;
    }
}
