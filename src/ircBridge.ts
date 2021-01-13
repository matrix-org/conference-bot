import { MatrixClient, MatrixEvent } from "matrix-bot-sdk";
import irc from "irc-upd";

export interface IRCBridgeOpts {
    botNick: string;
    serverName: string;
    port: number;
    botUserId: string;
    channelPrefix: string;
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
    }

    public isChannelAllowed(channel: string) {
        return channel && channel.startsWith(this.config.channelPrefix);
    }

    public async plumbChannelToRoom(channel: string, roomId: string) {
        await this.mxClient.inviteUser(this.config.botUserId, roomId);
        const result = await this.executeCommand(`plumb ${roomId} ${this.config.serverName} ${channel}`);
        const resultText = result.content.body;
        if (resultText !== 'Room plumbed.') {
            throw Error(`IRC bridge gave an error: ${resultText}`);
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