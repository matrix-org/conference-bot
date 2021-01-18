import { MatrixClient, MatrixEvent } from "matrix-bot-sdk";
import * as irc from "irc-upd";
import { Auditorium } from "./models/Auditorium";

export interface IRCBridgeOpts {
    botNick: string;
    botPassword?: string;
    serverName: string;
    port: number;
    botUserId: string;
    channelPrefix: string;
    moderationBotNick: string;
    ircBridgeNick: string;
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

    public async deriveChannelName(auditorium: Auditorium) {
        const name = await auditorium.getName();
        if (!name) {
            throw Error('Auditorium name is empty');
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
            userName: 'mx-conf-bot',
            realName: 'matrix-conference-bot',
        });
        this.ircClient.on("error", (...args) => {
            console.warn("irc client got an error:", args)
        });
    }

    public isChannelAllowed(channel: string) {
        return channel && channel.startsWith(this.config.channelPrefix);
    }

    public async plumbChannelToRoom(channel: string, roomId: string) {
        await this.mxClient.inviteUser(this.config.botUserId, roomId);
        await this.ircClient.join(channel);
        const result = await this.executeCommand(`plumb ${roomId} ${this.config.serverName} ${channel}`);
        const resultText = result.content.body;
        if (resultText !== 'Room plumbed.') {
            throw Error(`IRC bridge gave an error: ${resultText}`);
        }
        await this.ircClient.send("MODE", channel, "+o", this.config.ircBridgeNick);
        await this.ircClient.send("MODE", channel, "+o", this.config.moderationBotNick);
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
                if (event.content && event.content["m.relates_to"] && event.content["m.relates_to"]["m.in_reply_to"].event_id === requestEventId) {
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