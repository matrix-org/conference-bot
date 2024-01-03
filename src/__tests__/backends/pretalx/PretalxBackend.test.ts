import { test, expect, afterEach, beforeEach, describe } from "@jest/globals";
import { PretalxScheduleBackend } from "../../../backends/pretalx/PretalxBackend";
import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";

const pretalxSpeakers = [{
    code: "37RA83",
    name: "AnyConf Staff",
    biography: null,
    submissions: [],
    avatar: "",
    answers: [],
    email: "staff@anyconf.example.com",
    availabilities: [],
},{
    code: "YT3EFD",
    name: "Alice AnyConf",
    biography: "Alice is a test user with a big robotic brain.",
    submissions: [],
    avatar: "",
    answers: [],
    email: "alice@anyconf.example.com",
    availabilities: [],
}];

function fakePretalxServer() {
    return new Promise<Server>(resolve => { const server = createServer((req, res) => {
        if (req.url?.startsWith('/speakers/?')) {
            res.writeHead(200);
            res.end(JSON.stringify({
                count: pretalxSpeakers.length,
                next: null,
                previous: null,
                results: pretalxSpeakers,
            }));
        } else if (req.url?.startsWith('/speakers/')) {
            const speakerCode = req.url.slice('/speakers/'.length);
            const speaker = pretalxSpeakers.find(s => s.code === speakerCode);
            if (speaker) {
                res.writeHead(200);
                res.end(speaker);
            } else {
                res.writeHead(404);
                res.end(`Speaker "${speakerCode}" not found`);
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
            pretalxApiEndpoint: `http://localhost:${(pretalxServ.address() as AddressInfo).port}`,
        }, prefixConfig);
        expect(backend.conference.title).toBe('AnyConf 2024');
        expect(backend.conference.auditoriums).toHaveLength(7);
    });
});
