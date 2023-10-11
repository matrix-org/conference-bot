import { E2ESetupTestTimeout, E2ETestEnv } from "./util/e2e-test";
import { describe, it, beforeEach, afterEach } from "@jest/globals";


describe('Basic test setup', () => {
    let testEnv: E2ETestEnv;
    beforeEach(async () => {
        testEnv = await E2ETestEnv.createTestEnv({
            matrixLocalparts: ['alice'],
        });
        await testEnv.setUp();
    }, E2ESetupTestTimeout);
    afterEach(() => {
        return testEnv?.tearDown();
    });
    it('should start up successfully', async () => {
        //
    });
});
