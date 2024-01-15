import { IConfig, PretalxScheduleFormat } from "../src/config";
import { E2ESetupTestTimeout, E2ETestEnv } from "./util/e2e-test";
import { describe, it, beforeEach, afterEach, expect } from "@jest/globals";
import { fakePretalxServer } from "./util/fake-pretalx";

describe('Talks', () => {
    let testEnv: E2ETestEnv;
    let pretalxServ: Awaited<ReturnType<typeof fakePretalxServer>>;
    beforeEach(async () => {
        pretalxServ = await fakePretalxServer({
            matrixTalks: [],
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
        await testEnv.waitForMessage();
        await testEnv.setUp();
    }, E2ESetupTestTimeout);
    afterEach(async () => {
        await testEnv?.tearDown();
        pretalxServ.server.close();
    });
    it('should start up successfully', async () => {
        const { event } = await testEnv.sendAdminCommand('!conference build');
        console.log(event.content.body);
        // Check that we're generally okay.
        expect(event.content.body).toMatch('Scheduled tasks yet to run: 0');
        expect(event.content.body).toMatch('Schedule source healthy: true');
    });
});
