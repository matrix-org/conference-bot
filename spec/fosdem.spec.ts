import { IConfig, PretalxScheduleFormat } from "../src/config";
import { E2ESetupTestTimeout, E2ETestEnv } from "./util/e2e-test";
import { describe, it, beforeEach, afterEach, expect } from "@jest/globals";
import { fakePretalxServer } from "./util/fake-pretalx";
import { Role } from "../src/models/schedule";

describe('Talks', () => {
    let testEnv: E2ETestEnv;
    let pretalxServ: Awaited<ReturnType<typeof fakePretalxServer>>;
    beforeEach(async () => {
        pretalxServ = await fakePretalxServer({
            matrixTalks: [{
                event_id: 1234,
                title: 'Welcome to AnyConf 2024',
                conference_room: 'Janson',
                start_datetime: '2024-02-04T09:00:00+01:00',
                duration: 25,
                track_id: 1,
                persons:[{
                    person_id: 2,
                    event_role: Role.Coordinator,
                    name: 'AnyConf Staff',
                    email: '',
                    matrix_id: '',
                },{
                    person_id: 2,
                    event_role: Role.Speaker,
                    name: 'AnyConf Staff',
                    email: 'alice@confbot.example.com',
                    matrix_id: '@alice:confbot',
                }]
            }],
        });
        testEnv = await E2ETestEnv.createTestEnv({
            fixture: 'physical-conf.xml',
            matrixLocalparts: ['alice'],
            config: {
                conference: {
                    schedule: {
                        backend: "pretalx",
                        scheduleFormat: PretalxScheduleFormat.FOSDEM,
                        pretalxAccessToken: "abcdef",
                        pretalxApiEndpoint: pretalxServ.url,
                    } as IConfig["conference"]["schedule"]
                } as IConfig["conference"]
            }
        });
        await testEnv.setUp();
    }, E2ESetupTestTimeout);
    afterEach(async () => {
        await testEnv?.tearDown();
        pretalxServ.server.close();
    });
    it('should start up successfully', async () => {
        const { event } = await testEnv.sendAdminCommand('!conference status');
        // Check that we're generally okay.
        expect(event.content.body).toMatch('Scheduled tasks yet to run: 0');
        expect(event.content.body).toMatch('Schedule source healthy: true');
    });

    it.only('should be able to build a FOSDEM conference', async () => {
        let spaceBuilt, supportRoomsBuilt, conferenceBuilt = false;
        const alice = testEnv.getUser('alice');
        const waitForFinish = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(
                `Build incomplete. spaceBuild: ${spaceBuilt}, supportRoomsBuilt: ${supportRoomsBuilt}, conferenceBuilt: ${conferenceBuilt}`
            )), 30000);
            testEnv.adminClient.on('room.message', (_, event) => {
                if (event.content.body.includes("Your conference's space is at")) {
                    spaceBuilt = true;
                } else if (event.content.body.includes("Support rooms have been created")) {
                    supportRoomsBuilt = true;
                } else if (event.content.body.includes("CONFERENCE BUILT")) {
                    conferenceBuilt = true;
                }

                if (spaceBuilt && supportRoomsBuilt && conferenceBuilt) {
                    resolve();
                    clearTimeout(timeout);
                }
            })
        });
        await testEnv.sendAdminCommand('!conference build');
        await waitForFinish;
        console.log('Conf built!');
        const { adminClient } = testEnv;
        // const spaceRoomId = await adminClient.joinRoom(`#test-conf:confbot`);
        // const space = await adminClient.getSpace(spaceRoomId);
        // const spaceEntities = await Promise.allSettled(Object.entries((await space.getChildEntities()))
        //     .map(async ([roomId, spaceData]) => {
        //         console.log(roomId, spaceData);
        //         await adminClient.joinRoom(roomId);
        //         await adminClient.getRoomState(roomId)
        //     }));
        const invite = alice.waitForRoomInvite({ sender: "@conf_bot:confbot"});
        await testEnv.sendAdminCommand('!conference invite speakers-support');
        console.log(await invite);
    }, E2ESetupTestTimeout);
});
