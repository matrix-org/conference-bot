import { test, expect } from "@jest/globals";
import { applyAllAliasPrefixes } from "../../utils/aliases";

test("applyAllAliasPrefixes", async () => {
    expect(applyAllAliasPrefixes("wombat", [])).toEqual(["wombat"]);
    expect(applyAllAliasPrefixes("wombat", [""])).toEqual(["wombat"]);
    expect(applyAllAliasPrefixes("wombat", "")).toEqual(["wombat"]);

    expect(applyAllAliasPrefixes("wombat", "a-")).toEqual(["a-wombat"]);
    expect(applyAllAliasPrefixes("wombat", ["a-"])).toEqual(["a-wombat"]);

    expect(applyAllAliasPrefixes("wombat", ["a-", "b-"])).toEqual(["a-wombat", "b-wombat"]);
});
