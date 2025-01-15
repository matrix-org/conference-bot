import { test, expect, afterEach, beforeEach, describe } from "@jest/globals";
import { Server, createServer } from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";
import * as fs from "fs";
import { IConfig, JsonScheduleFormat } from "../../../config";
import { JsonScheduleBackend } from "../../../backends/json/JsonScheduleBackend";

function getFixture(fixtureFile: string) {
  return fs.readFileSync(path.join(__dirname, fixtureFile), "utf8");
}

function jsonScheduleServer() {
  return new Promise<Server>((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === "/schedule.json") {
        res.writeHead(200);
        const json = getFixture("original_democon.json");
        res.end(json);
      } else if (req.url === "/fosdem/p/matrix") {
        res.writeHead(200);
        const json = getFixture("fosdem_democon.json");
        res.end(json);
      } else {
        console.log(req.url);
        res.writeHead(404);
        res.end("Not found");
      }
    }).listen(undefined, "127.0.0.1", undefined, () => {
      resolve(server);
    });
  });
}

describe("JsonScheduleBackend", () => {
  let serv;
  beforeEach(async () => {
    serv = await jsonScheduleServer();
  });
  afterEach(async () => {
    serv.close();
  });

  test("can parse a FOSDEM JSON format", async () => {
    const globalConfig = { conference: { name: "DemoCon" } } as IConfig;
    const backend = await JsonScheduleBackend.new(
      "/dev/null",
      {
        backend: "json",
        scheduleFormat: JsonScheduleFormat.FOSDEM,
        scheduleDefinition: `http://127.0.0.1:${
          (serv.address() as AddressInfo).port
        }/fosdem/p/matrix`,
      },
      globalConfig
    );
    expect(backend.conference.title).toBe("DemoCon");
    expect(backend.auditoriums).toMatchSnapshot("auditoriums");
    expect(backend.talks).toMatchSnapshot("talks");
    expect(backend.interestRooms.size).toBe(0);
  });
});
