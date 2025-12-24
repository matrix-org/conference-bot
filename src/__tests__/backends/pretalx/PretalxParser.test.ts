import path from "node:path";
import { test, expect } from "@jest/globals";
import { parseFromJSON } from "../../../backends/pretalx/PretalxParser";
import { readFile } from "node:fs/promises";
import { IPrefixConfig } from "../../../config";

const prefixConfig: IPrefixConfig = {
    // Unused here.
    aliases: "", displayNameSuffixes: {}, suffixes: {},

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

test("can parse a standard XML format", async () => {
    const xml = await readFile(path.join(__dirname, "anyconf.json"), 'utf-8');
    const { title, talks } = await parseFromJSON(xml, prefixConfig);
    expect(talks.size).toBe(2);
    expect(title).toBe('AnyConf 2024');
});
