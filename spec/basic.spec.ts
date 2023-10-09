import { E2ETestEnv } from "./util/e2e-test";
import { describe, it, beforeEach, afterEach } from "@jest/globals";


describe('Basic test setup', () => {
    let testEnv: E2ETestEnv;
    beforeEach(async () => {
        testEnv = await E2ETestEnv.createTestEnv({
            matrixLocalparts: ['alice'],
        });
        await testEnv.setUp();
    }, 90000);
    afterEach(() => {
        return testEnv?.tearDown();
    }, 50000);
    it('should start up successfully', async () => {
        //
    });
});
