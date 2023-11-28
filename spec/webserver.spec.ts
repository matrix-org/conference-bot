import { AddressInfo } from "net";
import { RunMode } from "../src/config";
import { E2ESetupTestTimeout, E2ETestEnv } from "./util/e2e-test";
import { describe, it, beforeEach, afterEach, expect } from "@jest/globals";
import * as fetch from "node-fetch";

describe('Webserver', () => {
    let testEnv: E2ETestEnv;
    beforeEach(async () => {
        testEnv = await E2ETestEnv.createTestEnv({
            fixture: 'basic-conference',
            config: {
                mode: RunMode.webserver,
            }
        });
        await testEnv.setUp();
    }, E2ESetupTestTimeout);
    afterEach(() => {
        return testEnv?.tearDown();
    });
    it('should start up successfully', async () => {
        const serverAddress = testEnv.confBot.webServer?.address() as AddressInfo;
        const req = await fetch(`http://${serverAddress.address}:${serverAddress.port}/healthz`);
        expect(req.status).toBe(200);
    });
});
