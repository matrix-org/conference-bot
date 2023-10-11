import { ComplementHomeServer, createHS, destroyHS } from "./homerunner";
import { MatrixClient, PowerLevelsEventContent } from "matrix-bot-sdk";
import dns from 'node:dns';
import { mkdtemp, rm } from "node:fs/promises";
import { IConfig } from "../../src/config";
import { ConferenceBot } from "../../src/index";

// Needed to make tests work on GitHub actions. Node 17+ defaults
// to IPv6, and the homerunner domain resolves to IPv6, but the
// runtime doesn't actually support IPv6 🤦
dns.setDefaultResultOrder('ipv4first');

const WAIT_EVENT_TIMEOUT = 10000;
export const E2ESetupTestTimeout = 60000;

interface Opts {
    matrixLocalparts?: string[];
    timeout?: number;
    config?: Partial<IConfig>,
    traceToFile?: boolean,
}

export class E2ETestMatrixClient extends MatrixClient {

    public async waitForPowerLevel(
        roomId: string, expected: Partial<PowerLevelsEventContent>,
    ): Promise<{roomId: string, data: {
        sender: string, type: string, state_key?: string, content: PowerLevelsEventContent, event_id: string,
    }}> {
        return this.waitForEvent('room.event', (eventRoomId: string, eventData: {
            sender: string, type: string, content: Record<string, unknown>, event_id: string, state_key: string,
        }) => {
            if (eventRoomId !== roomId) {
                return undefined;
            }

            if (eventData.type !== "m.room.power_levels") {
                return undefined;
            }

            if (eventData.state_key !== "") {
                return undefined;
            }

            // Check only the keys we care about
            for (const [key, value] of Object.entries(expected)) {
                const evValue = eventData.content[key] ?? undefined;
                const sortOrder = value !== null && typeof value === "object" ? Object.keys(value).sort() : undefined;
                const jsonLeft = JSON.stringify(evValue, sortOrder);
                const jsonRight = JSON.stringify(value, sortOrder);
                if (jsonLeft !== jsonRight) {
                    return undefined;
                }
            }

            console.info(
                // eslint-disable-next-line max-len
                `${eventRoomId} ${eventData.event_id} ${eventData.sender}`
            );
            return {roomId: eventRoomId, data: eventData};
        }, `Timed out waiting for powerlevel from in ${roomId}`)
    }

    public async waitForRoomEvent<T extends object = Record<string, unknown>>(
        opts: {eventType: string, sender: string, roomId?: string, stateKey?: string, body?: string}
    ): Promise<{roomId: string, data: {
        sender: string, type: string, state_key?: string, content: T, event_id: string,
    }}> {
        const {eventType, sender, roomId, stateKey} = opts;
        return this.waitForEvent('room.event', (eventRoomId: string, eventData: {
            sender: string, type: string, state_key?: string, content: T, event_id: string,
        }) => {
            if (eventData.sender !== sender) {
                return undefined;
            }
            if (eventData.type !== eventType) {
                return undefined;
            }
            if (roomId && eventRoomId !== roomId) {
                return undefined;
            }
            if (stateKey !== undefined && eventData.state_key !== stateKey) {
                return undefined;
            }
            const body = 'body' in eventData.content && eventData.content.body;
            if (opts.body && body !== opts.body) {
                return undefined;
            }
            console.info(
                // eslint-disable-next-line max-len
                `${eventRoomId} ${eventData.event_id} ${eventData.type} ${eventData.sender} ${eventData.state_key ?? body ?? ''}`
            );
            return {roomId: eventRoomId, data: eventData};
        }, `Timed out waiting for ${eventType} from ${sender} in ${roomId || "any room"}`)
    }

    public async waitForRoomInvite(
        opts: {sender: string, roomId?: string}
    ): Promise<{roomId: string, data: unknown}> {
        const {sender, roomId} = opts;
        return this.waitForEvent('room.invite', (eventRoomId: string, eventData: {
            sender: string
        }) => {
            const inviteSender = eventData.sender;
            console.info(`Got invite to ${eventRoomId} from ${inviteSender}`);
            if (eventData.sender !== sender) {
                return undefined;
            }
            if (roomId && eventRoomId !== roomId) {
                return undefined;
            }
            return {roomId: eventRoomId, data: eventData};
        }, `Timed out waiting for invite to ${roomId || "any room"} from ${sender}`)
    }

    public async waitForEvent<T>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        emitterType: string, filterFn: (...args: any[]) => T|undefined, timeoutMsg: string)
    : Promise<T> {
        return new Promise((resolve, reject) => {
            // eslint-disable-next-line prefer-const
            let timer: NodeJS.Timeout;
            const fn = (...args: unknown[]) => {
                const data = filterFn(...args);
                if (data) {
                    clearTimeout(timer);
                    resolve(data);
                }
            };
            timer = setTimeout(() => {
                this.removeListener(emitterType, fn);
                reject(new Error(timeoutMsg));
            }, WAIT_EVENT_TIMEOUT);
            this.on(emitterType, fn)
        });
    }
}

export class E2ETestEnv {
    static async createTestEnv(opts: Opts = {}): Promise<E2ETestEnv> {
        const workerID = parseInt(process.env.JEST_WORKER_ID ?? '0');
        const { matrixLocalparts, config: providedConfig  } = opts;
        const tmpDir = await mkdtemp('confbot-test');
        const homeserver = await createHS(["conf_bot", ...matrixLocalparts || []], workerID);
        const confBotOpts = homeserver.users.find(u => u.userId === `@conf_bot:${homeserver.domain}`);
        if (!confBotOpts) {
            throw Error('No conf_bot setup on homeserver');
        }
        const mgmntRoom = await confBotOpts.client.createRoom();
        const config = {
            ...providedConfig,
            conference: {
                schedule: {
                    backend: 'dummy',
                },
            },
            webserver: {
                additionalAssetsPath: '/dev/null'
            },
            ircBridge: null,
            homeserverUrl: homeserver.url,
            accessToken: confBotOpts.accessToken,
            userId: confBotOpts.userId,
            dataPath: tmpDir,
            managementRoom: mgmntRoom,
        } as IConfig;
        const conferenceBot = await ConferenceBot.start(config);
        return new E2ETestEnv(homeserver, conferenceBot, opts, tmpDir);
    }

    private constructor(
        public readonly homeserver: ComplementHomeServer,
        public confBot: ConferenceBot,
        public readonly opts: Opts,
        private readonly dataDir: string,
    ) { }

    public async setUp(): Promise<void> {
        await this.confBot.main();
    }

    public async tearDown(): Promise<void> {
        await this.confBot.stop();
        this.homeserver.users.forEach(u => u.client.stop());
        await destroyHS(this.homeserver.id);
        await rm(this.dataDir, { recursive: true, force: true })
    }
}
