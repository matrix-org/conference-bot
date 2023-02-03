import { PentaDb } from "../../../backends/penta/db/PentaDb";
import { test, expect, jest } from "@jest/globals";
import { PentabarfParser } from "../../../backends/penta/PentabarfParser";
import { IPentaDbConfig, IPentaScheduleBackendConfig, IPrefixConfig } from "../../../config";
import { PentaBackend } from "../../../backends/penta/PentaBackend";
import { Role } from "../../../models/schedule";
import { CachingBackend } from "../../../backends/CachingBackend";

import * as utils from "../../../utils";

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

const backendConfig: IPentaScheduleBackendConfig = {
    backend: "penta",
    database: {} as any as IPentaDbConfig,
    scheduleDefinition: "xyz.xml"
};

const actualUtils = jest.requireActual("../../../utils") as any;
jest.mock("../../../utils");

test("the cache should restore the same talks that were saved", async () => {
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

    async function newPentaBackend(): Promise<PentaBackend> {
        const b = new PentaBackend(backendConfig, parser, fakeDb);
        await b.init();
        return b;
    }
    // A pretend backend which is broken: trying to open it just leads to an error.
    async function newBrokenBackend(): Promise<PentaBackend> {
        throw "this backend is broken";
    }

    const readJsonFileAsync = utils.readJsonFileAsync as jest.MockedFunction<any>;
    const writeJsonFileAsync = utils.writeJsonFileAsync as jest.MockedFunction<any>;
    const fsRename = fs.rename as jest.MockedFunction<any>;
    // We don't want this function to be mocked, so return it to its original implementation:
    (utils.jsonReplacerMapToObject as jest.MockedFunction<any>).mockImplementation(actualUtils.jsonReplacerMapToObject);


    // Open the backend, this time with a working PentaBackend
    expect(writeJsonFileAsync).toHaveBeenCalledTimes(0);
    const cachePath = "/tmp/cachebackend_should_not_exist.json";
    const cache1 = await CachingBackend.new(newPentaBackend, cachePath);
    expect(writeJsonFileAsync).toHaveBeenCalledTimes(1);
    expect(writeJsonFileAsync.mock.calls[0][0]).toEqual(cachePath);
    const writtenContent = writeJsonFileAsync.mock.calls[0][1];
    const replacerFunc = writeJsonFileAsync.mock.calls[0][2];
    // Encode and then decode the content through JSON and then return it to the reader
    readJsonFileAsync.mockResolvedValue(JSON.parse(JSON.stringify(writtenContent, replacerFunc)));

    // Open the backend again, but this time the underlying backend can't be created,
    // so we should fall back to the cache
    expect(readJsonFileAsync).toHaveBeenCalledTimes(0);
    const cache2 = await CachingBackend.new(newBrokenBackend, cachePath);
    expect(readJsonFileAsync).toHaveBeenCalledTimes(1);
    expect(readJsonFileAsync.mock.calls[0][0]).toEqual(cachePath);

    // Expect the live and cache schedule to be exactly the same
    expect(cache1.conference).toStrictEqual(cache2.conference);
    expect(cache1.auditoriums).toStrictEqual(cache2.auditoriums);
    expect(cache1.interestRooms).toStrictEqual(cache2.interestRooms);
    expect(cache1.talks).toStrictEqual(cache2.talks);
});