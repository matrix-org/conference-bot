import { PentaDb } from "../../../backends/penta/db/PentaDb";
import { test, expect, jest } from "@jest/globals";
import { PentabarfParser } from "../../../backends/penta/PentabarfParser";
import { IPentaDbConfig, IPentaScheduleBackendConfig, IPrefixConfig } from "../../../config";
import { PentaBackend } from "../../../backends/penta/PentaBackend";
import { Role } from "../../../models/schedule";

const fs = require("fs");
const path = require("path");

const prefixConfig: IPrefixConfig = {
    // Unused here.
    aliases: "", displayNameSuffixes: {}, suffixes: {}, physicalAuditoriumRooms: [],

    auditoriumRooms: [
        "A.",
        "AQ.",
    ],
    qaAuditoriumRooms: [
        "AQ.",
    ],
    interestRooms: [
        "X."
    ],
    nameOverrides: {
        "A.special": "special-room",
    },
};

jest.mock('../../../backends/penta/db/PentaDb');

test("talks should be rehydrated from the database", async () => {
    const xml = fs.readFileSync(path.join(__dirname, "pentabarf02_withqa.xml"), 'utf8');
    const parser = new PentabarfParser(xml, prefixConfig);

    const fakeDb = {
        connect: jest.fn(PentaDb.prototype.connect).mockResolvedValue(),
        getTalk: jest.fn(PentaDb.prototype.getTalk).mockResolvedValue({
            event_id: "AAA",
            duration_seconds: 3600,
            end_datetime: 3600,
            livestream_end_datetime: 3560,
            livestream_start_datetime: 5,
            prerecorded: true,
            presentation_length_seconds: 300,
            qa_start_datetime: 305,
            start_datetime: 350,
            conference_room: "abc",
        }),
        findPeopleWithId: jest.fn(PentaDb.prototype.findPeopleWithId).mockResolvedValue([
            {
                id: "AAA",
                matrix_id: "@someone:example.org",
                email: "someone@example.org",
                name: "Someone Someoneus",
                role: Role.Speaker
            }
        ]),
        findAllPeopleForTalk: jest.fn(PentaDb.prototype.findAllPeopleForTalk).mockResolvedValue([]),
    } as any as PentaDb;

    const b = new PentaBackend(parser, fakeDb);
    await b.init();

    const talk = b.talks.get("E002")!;
    expect(talk).toBeDefined();

    expect(talk.qa_startTime).toEqual(305);
    expect(talk.livestream_endTime).toEqual(3560);
    expect(talk.speakers[0].email).toEqual("someone@example.org");
    expect(talk.speakers[0].matrix_id).toEqual("@someone:example.org");
});