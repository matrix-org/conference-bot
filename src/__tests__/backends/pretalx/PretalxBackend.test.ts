import { test, expect, afterEach, beforeEach, describe } from "@jest/globals";
import { PretalxScheduleBackend } from "../../../backends/pretalx/PretalxBackend";
import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";

const pretalxSpeakers = [{
    code: "37RA83",
    name: "AnyConf Staff",
    biography: null,
    avatar: "",
    email: "staff@anyconf.example.com",
},{
    code: "YT3EFD",
    name: "Alice AnyConf",
    biography: "Alice is a test user with a big robotic brain.",
    avatar: "",
    email: "alice@anyconf.example.com",
}];

const pretalxTalks = [{
    "code": "GK99DE",
    "speakers": pretalxSpeakers,
}, {
    "code": "ABCDEF",
    "speakers": pretalxSpeakers,
}];

function fakePretalxServer() {
    return new Promise<Server>(resolve => { const server = createServer((req, res) => {
        if (req.url?.startsWith('/talks/?')) {
            res.writeHead(200);
            res.end(JSON.stringify({
                count: pretalxTalks.length,
                next: null,
                previous: null,
                results: pretalxTalks,
            }));
        } else if (req.url?.startsWith('/talks/')) {
            const talkCode = req.url.slice('/talks/'.length);
            const talk = pretalxTalks.find(s => s.code === talkCode);
            if (talk) {
                res.writeHead(200);
                res.end(talk);
            } else {
                res.writeHead(404);
                res.end(`Talk "${talkCode}" not found`);
            }
        } else {
            console.log(req.url);
            res.writeHead(404);
            res.end("Not found");
        }
    }).listen(undefined, '127.0.0.1', undefined, () => {
        resolve(server);
    })});
}

const prefixConfig = {
    // Unused here.
    aliases: "", displayNameSuffixes: {}, suffixes: {}, physicalAuditoriumRooms: [],

    auditoriumRooms: [
        "AW1.",
        "D.",
        "H.",
        "Janson",
        "K.",
        "M.",
        "UA2.",
        "UB2.252A",
        "UB4.",
        "UB5.",
        "UD2."
    ],
    qaAuditoriumRooms: [
        "AQ.",
    ],
    interestRooms: [
        "I."
    ],
    nameOverrides: {
        "A.special": "special-room",
    },
};
describe('PretalxBackend', () => {
    let pretalxServ;
    beforeEach(async () => {
        pretalxServ = await fakePretalxServer();
    });
    afterEach(async () => {
        pretalxServ.close();
    });

    test("can parse a standard JSON format", async () => {
        const pretalxServ = await fakePretalxServer();
        const backend = await PretalxScheduleBackend.new("/dev/null", {
            backend: "pretalx",
            scheduleDefinition: path.join(__dirname, 'anyconf.json'),
            pretalxAccessToken: "123456",
            pretalxApiEndpoint: `http://127.0.0.1:${(pretalxServ.address() as AddressInfo).port}`,
        }, prefixConfig);
        expect(backend.conference.title).toBe('AnyConf 2024');
        expect(backend.conference.auditoriums).toHaveLength(7);
    });
});
