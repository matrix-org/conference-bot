import { ComplementHomeServer, createHS, destroyHS } from "./homerunner";
import { MatrixClient, PowerLevelsEventContent, RoomEvent, TextualMessageEventContent } from "matrix-bot-sdk";
import dns from 'node:dns';
import { mkdtemp, rm } from "node:fs/promises";
import { IConfig } from "../../src/config";
import { ConferenceBot } from "../../src/index";
import path from "node:path";

const WAIT_EVENT_TIMEOUT = 10000;
export const E2ESetupTestTimeout = 60000;

interface Opts {
    matrixLocalparts?: string[];
    fixture: string;
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
    static async createTestEnv(opts): Promise<E2ETestEnv> {
        const workerID = parseInt(process.env.JEST_WORKER_ID ?? '0');
        const { matrixLocalparts, config: providedConfig  } = opts;
        const tmpDir = await mkdtemp('confbot-test');

        // Configure homeserver and bots
        const homeserver = await createHS(["conf_bot", "admin", "modbot", ...matrixLocalparts || []], workerID);
        const confBotOpts = homeserver.users.find(u => u.userId === `@conf_bot:${homeserver.domain}`);
        if (!confBotOpts) {
            throw Error('No conf_bot setup on homeserver');
        }
        const adminUser = homeserver.users.find(u => u.userId === `@admin:${homeserver.domain}`);
        if (!adminUser) {
            throw Error('No admin setup on homeserver');
        }
        const mgmntRoom = await confBotOpts.client.createRoom({ invite: [adminUser.userId]});
        await adminUser.client.joinRoom(mgmntRoom);

        // Configure JSON schedule
        const scheduleDefinition = path.resolve(__dirname, '..', 'fixtures', opts.fixture + ".json");

        const config = {
            ...providedConfig,
            conference: {
                id: 'test-conf',
                name: 'Test Conf',
                supportRooms: {
                    speakers: `#speakers:${homeserver.domain}`,
                    coordinators: `#coordinators:${homeserver.domain}`,
                    specialInterest: `#specialInterest:${homeserver.domain}`,
                },
                prefixes: {
                    auditoriumRooms: ["D."],
                    interestRooms: ["S.", "B."],
                    aliases: "",
                    displayNameSuffixes: {},
                    suffixes: {},
                },
                schedule: {
                    backend: 'json',
                    scheduleDefinition,
                },
                subspaces: {
                    mysubspace: {
                        displayName: 'My Subspace',
                        alias: 'mysubspace',
                        prefixes: []
                    }
                },
            },
            moderatorUserId: `@modbot:${homeserver.domain}`,
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
        return new E2ETestEnv(homeserver, conferenceBot, adminUser.client, opts, tmpDir, config);
    }

    private constructor(
        public readonly homeserver: ComplementHomeServer,
        public confBot: ConferenceBot,
        public readonly adminClient: MatrixClient,
        public readonly opts: Opts,
        private readonly dataDir: string,
        private readonly config: IConfig,
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

    public async sendAdminCommand(cmd: string) {
        const response = new Promise<{roomId: string, event: RoomEvent<TextualMessageEventContent>}>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timed out waiting for admin response")), 5000);
            this.adminClient.on('room.message', (roomId, event) => {
                if (event.sender === this.config.userId) {
                    resolve({roomId, event: new RoomEvent(event)});
                    clearTimeout(timeout);
                }
            });
        });
        await this.adminClient.sendText(this.config.managementRoom, cmd);
        return response;
    }
}
