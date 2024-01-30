import { E2ESetupTestTimeout, E2ETestEnv } from "./util/e2e-test";
import { describe, it, beforeEach, afterEach, expect } from "@jest/globals";

describe('Basic test setup', () => {
    let testEnv: E2ETestEnv;
    beforeEach(async () => {
        testEnv = await E2ETestEnv.createTestEnv({
            fixture: 'basic-conference.json',
        });
        const welcomeMsg = testEnv.waitForMessage();
        await testEnv.setUp();
        console.log((await welcomeMsg).event.content.body.startsWith('WECOME!'));
    }, E2ESetupTestTimeout);
    afterEach(() => {
        return testEnv?.tearDown();
    });
    it('should start up successfully', async () => {
        const { event } = await testEnv.sendAdminCommand('!conference status');
        // Check that we're generally okay.
        expect(event.content.body).toMatch('Scheduled tasks yet to run: 0');
        expect(event.content.body).toMatch('Schedule source healthy: true');
    });
    it('should be able to build successfully', async () => {
        let spaceBuilt, supportRoomsBuilt, conferenceBuilt = false;
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
        // TODO: Now test that all the expected rooms are there.
    });
});
