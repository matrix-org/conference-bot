import { E2ESetupTestTimeout, E2ETestEnv } from "./util/e2e-test";
import { describe, it, beforeEach, afterEach, expect } from "@jest/globals";

async function buildConference(testEnv: E2ETestEnv): Promise<void> {
  let spaceBuilt,
    supportRoomsBuilt,
    conferenceBuilt = false;
  const waitForFinish = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            `Build incomplete. spaceBuild: ${spaceBuilt}, supportRoomsBuilt: ${supportRoomsBuilt}, conferenceBuilt: ${conferenceBuilt}`
          )
        ),
      30000
    );
    testEnv.adminClient.on("room.message", (_, event) => {
      if (event.content.body.includes("Your conference's space is at")) {
        spaceBuilt = true;
      } else if (
        event.content.body.includes("Support rooms have been created")
      ) {
        supportRoomsBuilt = true;
      } else if (event.content.body.includes("CONFERENCE BUILT")) {
        conferenceBuilt = true;
      }

      if (spaceBuilt && supportRoomsBuilt && conferenceBuilt) {
        resolve();
        clearTimeout(timeout);
      }
    });
  });
  await testEnv.sendAdminCommand("!conference build");
  await waitForFinish;
}

function describeLocator(locator: any): string {
  let out = `(${locator.conferenceId}) ${locator.kind}`;
  for (let key of Object.keys(locator).sort()) {
    if (key !== "conferenceId" && key !== "kind") {
      out += ` ${key}=${locator[key]}`;
    }
  }
  return out;
}

describe("Basic test setup", () => {
  let testEnv: E2ETestEnv;
  beforeEach(async () => {
    testEnv = await E2ETestEnv.createTestEnv({
      fixture: "basic-conference",
    });
    const welcomeMsg = testEnv.waitForMessage();
    await testEnv.setUp();
    console.log((await welcomeMsg).event.content.body.startsWith("WECOME!"));
  }, E2ESetupTestTimeout);
  afterEach(() => {
    return testEnv?.tearDown();
  });
  it("should start up successfully", async () => {
    const { event } = await testEnv.sendAdminCommand("!conference status");
    console.log(event.content.body);
    // Check that we're generally okay.
    expect(event.content.body).toMatch("Scheduled tasks yet to run: 0");
    expect(event.content.body).toMatch("Schedule source healthy: true");
  });
  it("should be able to build successfully", async () => {
    await buildConference(testEnv);

    // Now test that all the expected rooms are there.
    // We will match against the 'locator' state events to identify the rooms.

    const joinedRoomIds = await testEnv.confbotClient.getJoinedRooms();
    console.debug("joined room IDs: ", joinedRoomIds);

    const allLocators: string[] = [];
    let roomsWithoutLocators = 0;

    for (const joinedRoomId of joinedRoomIds) {
      if (joinedRoomId == testEnv.opts.config?.managementRoom) {
        // The management room is not interesting
        continue;
      }
      try {
        const roomLocator = await testEnv.confbotClient.getRoomStateEvent(
          joinedRoomId,
          "org.matrix.confbot.locator",
          ""
        );
        allLocators.push(describeLocator(roomLocator));
      } catch (error) {
        // This room doesn't have a locator.
        roomsWithoutLocators += 1;
        console.warn("room without locator: ", joinedRoomId);
        try {
            // Get room state to help identify it from the logs
            const roomState = await testEnv.confbotClient.getRoomState(
                joinedRoomId,
            );
            console.debug("room ", joinedRoomId, " has state:\n", roomState);
        } catch (_) {
            // pass
        }
      }
    }

    expect(allLocators.sort()).toMatchInlineSnapshot(`
      [
        "(test-conf) auditorium auditoriumId=main_stream",
        "(test-conf) auditorium_backstage auditoriumId=main_stream",
        "(test-conf) conference",
        "(test-conf) conference_space",
        "(test-conf) talk talkId=1",
      ]
    `);

    // TODO understand/explain why there are rooms without locators
    expect(roomsWithoutLocators).toBe(5);
  });

  it("should invite the moderator users to relevant rooms", async () => {
    await buildConference(testEnv);

    // List of rooms that we expect the moderator user to be invited to
    const rooms = [
      // `#test-conf:${testEnv.homeserver.domain}`, -- not invited to the root space
      `#main_stream:${testEnv.homeserver.domain}`,
      // `#main_stream-backstage:${testEnv.homeserver.domain}` -- not invited to the backstage,
      `#talk-1:${testEnv.homeserver.domain}`,
    ];
    const moderatorUserId = `@modbot:${testEnv.homeserver.domain}`;

    for (let roomAlias of rooms) {
      const roomId = await testEnv.confbotClient.resolveRoom(roomAlias);
      let moderatorMembershipInRoom: any;
      try {
        moderatorMembershipInRoom =
          await testEnv.confbotClient.getRoomStateEvent(
            roomId,
            "m.room.member",
            moderatorUserId
          );
      } catch (err) {
        const state = JSON.stringify(
          await testEnv.confbotClient.getRoomState(roomId)
        );
        throw new Error(
          `No m.room.member for ${moderatorUserId} in ${roomId} (${roomAlias}): ${state}`
        );
      }
      expect(moderatorMembershipInRoom.membership).toBe("invite");
    }
  });
});
