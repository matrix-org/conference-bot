/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { ICommand } from "./ICommand";
import { LogLevel, LogService, MatrixClient, MentionPill, RichReply } from "matrix-bot-sdk";
import { Auditorium } from "../models/Auditorium";
import { ITalk } from "../models/schedule";
import config from "../config";
import { Conference } from "../Conference";
import { logMessage } from "../LogProxy";
import { editNotice } from "../utils";

export class BuildCommand implements ICommand {
    public readonly prefixes = ["build", "b"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        if (!args) args = [];

        await client.sendReadReceipt(roomId, event['event_id']);

        const backend = conference.backend;

        try {
            // Try to refresh the schedule first, to ensure we don't miss any updates.
            await backend.refresh();
        } catch (error) {
            await client.sendNotice(roomId, `Failed to refresh schedule: ${error.toString()}`)
            return;
        }

        try {
            // Try to reset our view of the state first, to ensure we don't miss anything (e.g. if we got invited to a room since bot startup).
            await conference.construct();
        } catch (error) {
            await client.sendNotice(roomId, `Failed to reset conference state: ${error.toString()}`)
            return;
        }

        if (!conference.isCreated) {
            await conference.createRootSpace();
            await conference.createDb(backend.conference);
        }

        const spacePill = await MentionPill.forRoom((await conference.getSpace()).roomId, client);
        const messagePrefix = "Conference prepared! Making rooms for later use (this will take a while)...";
        const reply = RichReply.createFor(roomId, event,
            messagePrefix + "\n\nYour conference's space is at " + spacePill.text,
            messagePrefix + "<br /><br />Your conference's space is at " + spacePill.html);
        reply["msgtype"] = "m.notice";
        await client.sendMessage(roomId, reply);

        // Create subspaces
        let subspacesCreated = 0;
        const subspacesConfig = Object.entries(config.conference.subspaces);
        const statusEventId = await client.sendNotice(
            roomId,
            `0/${subspacesConfig.length} subspaces have been created`,
        );
        try {
            for (const [subspaceId, subspaceConfig] of subspacesConfig) {
                await conference.createSubspace(
                    subspaceId, subspaceConfig.displayName, subspaceConfig.alias
                );
                subspacesCreated++;
                await editNotice(
                    client,
                    roomId,
                    statusEventId,
                    `${subspacesCreated}/${subspacesConfig.length} subspaces have been created`,
                );
            }
        } catch (error) {
            LogService.error("BuildCommand", JSON.stringify(error));
            await client.sendNotice(roomId, `Failed to build subspaces: ${error.toString()}`)
        }

        if (args[0] === "talk") {
            const audId = args[1];
            const talkId = args[2];

            const pentaAud = backend.auditoriums.get(audId);
            if (!pentaAud) return await logMessage(LogLevel.ERROR, "BuildCommand", `Cannot find auditorium: ${audId}`);

            const pentaTalk = pentaAud.talks.get(talkId);
            if (!pentaTalk) return await logMessage(LogLevel.ERROR, "BuildCommand", `Cannot find talk in room: ${audId} ${talkId}`);

            await conference.createAuditoriumBackstage(pentaAud);
            const aud = await conference.createAuditorium(pentaAud);
            await conference.createTalk(pentaTalk, aud);

            await client.sendNotice(roomId, "Talk room created");
            return;
        } else if (args[0] === "interest") {
            const interestId = args[1];

            const interestRoom = backend.interestRooms.get(interestId);
            if (interestRoom) {
                await conference.createInterestRoom(interestRoom);
                await client.sendNotice(roomId, "Interest room created");
            } else {
                await client.sendNotice(roomId, `Cannot find interest room ${interestId} in schedule`);
            }
            return;
        }

        // Create support rooms
        await conference.createSupportRooms();
        await client.sendNotice(roomId, "Support rooms have been created");

        if (!args.includes("sionly")) {
            let auditoriumsCreated = 0;
            const statusEventId = await client.sendNotice(
                roomId,
                `0/${backend.auditoriums.size} auditoriums have been created`,
            );
            if (args.includes("backstages")) {
                // Create auditorium backstages
                for (const auditorium of backend.auditoriums.values()) {
                    try {
                        await conference.createAuditoriumBackstage(auditorium);
                        auditoriumsCreated++;
                        editNotice(
                            client,
                            roomId,
                            statusEventId,
                            `${auditoriumsCreated}/${backend.auditoriums.size} auditoriums have been created`,
                        );
                    } catch (e) {
                        throw {
                            message: `Error whilst creating backstage for ${auditorium.id}: ${JSON.stringify(e?.body)}.`,
                            cause: e,
                        };
                    }

                }
            } else {
                // Create auditoriums
                const talks: [ITalk, Auditorium][] = [];
                for (const auditorium of backend.auditoriums.values()) {
                    try {
                        const confAud = await conference.createAuditorium(auditorium);
                        auditoriumsCreated++;
                        editNotice(
                            client,
                            roomId,
                            statusEventId,
                            `${auditoriumsCreated}/${backend.auditoriums.size} auditoriums have been created`,
                        );

                        for (let talk of auditorium.talks.values()) {
                            talks.push([talk, confAud]);
                        }
                    } catch (e) {
                        throw {
                            message: `Error whilst creating auditorium for ${auditorium.id}: ${JSON.stringify(e?.body)}.`,
                            cause: e,
                        };
                    }
                }

                if (!args.includes("notalks")) {
                    // Create talk rooms
                    let talksCreated = 0;
                    const statusEventId = await client.sendNotice(
                        roomId,
                        `0/${talks.length} talks have been created`,
                    );
                    for (const [talk, auditorium] of talks) {
                        try {
                            await conference.createTalk(talk, auditorium);
                            talksCreated++;
                            editNotice(
                                client,
                                roomId,
                                statusEventId,
                                `${talksCreated}/${talks.length} talks have been created`,
                            );
                        } catch (e) {
                            throw {
                                message: `Error whilst creating talk for ${talk.id}: ${JSON.stringify(e?.body)}.`,
                                cause: e,
                            };
                        }
                    }
                }
            }
        }

        if (!args.includes("nosi")) {
            // Create special interest rooms
            let specialInterestRoomsCreated = 0;
            const statusEventId = await client.sendNotice(roomId, `0/${backend.interestRooms.size} interest rooms have been created`);
            for (const siRoom of backend.interestRooms.values()) {
                try {
                    await conference.createInterestRoom(siRoom);
                    specialInterestRoomsCreated++;
                    await editNotice(
                        client,
                        roomId,
                        statusEventId,
                        `${specialInterestRoomsCreated}/${backend.interestRooms.size} interest rooms have been created`,
                    );
                } catch (e) {
                    throw {
                        message: `Error whilst creating interest room for ${siRoom.id}: ${JSON.stringify(e?.body)}.`,
                        cause: e,
                    };
                }
            }
        } else {
            await client.sendNotice(roomId, "Skipped special interest rooms");
        }

        await client.sendHtmlNotice(roomId, "" +
            "<h4>Conference built</h4>" +
            "<p>Now it's time to <a href='https://github.com/matrix-org/conference-bot/blob/main/docs/importing-people.md'>import your participants &amp; team</a>.</p>"
        );
    }
}
