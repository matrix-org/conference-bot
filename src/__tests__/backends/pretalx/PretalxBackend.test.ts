import { test, expect, afterEach, beforeEach, describe } from "@jest/globals";
import { PretalxScheduleBackend } from "../../../backends/pretalx/PretalxBackend";
import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";
import { IPrefixConfig, PretalxScheduleFormat } from "../../../config";

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

const matrixPersons = [{
    person_id: 2,
    name: "AnyConf Staff",
    email: "staff@anyconf.example.com",
    matrix_id: "",
    event_role: "coordinator",
},{
    person_id: 1324,
    name: "Alice AnyConf",
    email: "alice@anyconf.example.com",
    matrix_id: "@alice:anyconf.example.com",
    event_role: "host",
}];

const matrixTalks = [{
    event_id: 1235,
    title: "Welcome to AnyConf 2024",
    persons: matrixPersons,
    conference_room: "janson",
    start_datetime: "2024-02-03T09:00:00+01:00",
    duration: 1500.00,
    track_id: 325,
},{
    event_id: 1234,
    title: "Welcome to AnyConf 2024",
    persons: matrixPersons,
    conference_room: "janson",
    start_datetime: "2024-02-04T09:00:00+01:00",
    duration: 1500.00,
    track_id: 325,
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
        } else if (req.url === '/p/matrix/') {
            res.writeHead(200);
            res.end(JSON.stringify({talks: matrixTalks}));
        } else {
            console.log(req.url);
            res.writeHead(404);
            res.end("Not found");
        }
    }).listen(undefined, '127.0.0.1', undefined, () => {
        resolve(server);
    })});
}

const prefixConfig: IPrefixConfig = {
    // Unused here.
    aliases: "", displayNameSuffixes: {}, suffixes: {},

    // Make all auditoria physical
    physicalAuditoriumRooms: [""],

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
            scheduleFormat: PretalxScheduleFormat.Pretalx,
            scheduleDefinition: path.join(__dirname, 'anyconf.json'),
            pretalxAccessToken: "123456",
            pretalxApiEndpoint: `http://127.0.0.1:${(pretalxServ.address() as AddressInfo).port}`,
        }, prefixConfig);
        expect(backend.conference.title).toBe('AnyConf 2024');
        expect(backend.conference.auditoriums).toHaveLength(7);
    });

    test.only("can parse a FOSDEM format", async () => {
        const pretalxServ = await fakePretalxServer();
        const backend = await PretalxScheduleBackend.new("/dev/null", {
            backend: "pretalx",
            scheduleDefinition: path.join(__dirname, 'fosdemformat.xml'),
            scheduleFormat: PretalxScheduleFormat.FOSDEM,
            pretalxAccessToken: "123456",
            pretalxApiEndpoint: `http://127.0.0.1:${(pretalxServ.address() as AddressInfo).port}`,
        }, prefixConfig);
        expect(backend.conference.title).toBe('AnyConf 2024');
        expect(backend.conference.auditoriums).toHaveLength(1);
        const talks = [...backend.conference.auditoriums[0].talks.values()];
        // Check that we got the information correctly.
        expect(talks[0].speakers).toEqual([{
            "email": "staff@anyconf.example.com",
            "id": "2",
            "matrix_id": "",
            "name": "AnyConf Staff",
            "role": "coordinator"
        }, {
            "email": "alice@anyconf.example.com",
            "id": "1324",
            "matrix_id": "@alice:anyconf.example.com",
            "name": "Alice AnyConf",
            "role": "host"
        }]);
    });
});
