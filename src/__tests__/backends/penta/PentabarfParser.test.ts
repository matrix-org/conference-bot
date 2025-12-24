import { PentabarfParser } from "../../../backends/penta/PentabarfParser";
import { test, expect } from "@jest/globals";
import { IPrefixConfig } from "../../../config";

const fs = require("fs");
const path = require("path");

const prefixConfig: IPrefixConfig = {
    // Unused here.
    aliases: "", displayNameSuffixes: {}, suffixes: {},

    // Make all auditoria physical
    physicalAuditoriumRooms: [""],

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

function getFixture(fixtureFile: string) {
    return fs.readFileSync(path.join(__dirname, fixtureFile), 'utf8')
}

/*
 * A somewhat vague test that just loads in a basic file and checks a few things, comparing against the snapshots in
 * __snapshots__.
 */
test('parsing pentabarf XML: overview', () => {
    const xml = getFixture("pentabarf01_overview.xml");
    const p = new PentabarfParser(xml, prefixConfig);

    // TODO the auditorium id and slug look dodgy and not id-like or slug-like...
    expect(p.auditoriums).toMatchSnapshot("auditoriums");

    expect(p.conference).toMatchSnapshot("conference");

    expect(p.interestRooms).toMatchSnapshot("interestRooms");

    // NOTE Speakers don't have contact information: that's filled in by the PentaDb in the PentaBackend afterwards.
    expect(p.speakers).toMatchSnapshot("speakers");

    // NOTE I don't like that qa_startTime and livestream_endTime are 0 — they are updated in the PentaBackend
    //      using the PentaDb afterwards.
    expect(p.talks).toMatchSnapshot("talks");
});


test('duplicate events lead to errors', () => {
    const xml = getFixture("pentabarf03_duplicate_talk.xml");

    expect(() => new PentabarfParser(xml, prefixConfig)).toThrow(
        "Auditorium A.01 (Someroom): Talk E001: this talk already exists and is defined a second time."
    );
});

test("unrecognised prefixes don't create rooms", () => {
    const xml = getFixture("pentabarf04_unrecognised_prefix.xml");
    const p = new PentabarfParser(xml, prefixConfig);

    expect(p.auditoriums.length).toEqual(0);
    expect(p.talks.length).toEqual(0);
    expect(p.interestRooms.length).toEqual(0);
});

test("tracks that set a online qa value correctly apply to talks", () => {
    const xml = getFixture("pentabarf05_online_qa.xml");
    const p = new PentabarfParser(xml, prefixConfig);
    expect(p.talks).toMatchSnapshot("talks");
});