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
import { LogLevel, MatrixClient } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { logMessage } from "../LogProxy";

export class InviteMeCommand implements ICommand {
    public readonly prefixes = ["inviteme", "inviteto"];

    private async inviteTo(client: MatrixClient, invitee: string, room: string): Promise<void> {
        const members = await client.getJoinedRoomMembers(room);
        if (members.includes(invitee)) return;
        await client.inviteUser(invitee, room);
    }

    /**
     * Returns a map of room 'groups'. These are named groups of rooms corresponding to various roles.
     */
    public async roomGroups(conference: Conference): Promise<Map<string, Set<string>>> {
        const groups: Map<string, Set<string>> = new Map();

        function addToGroup(groupName: string, roomId: string) {
            if (!groups.has(groupName)) {
                groups.set(groupName, new Set());
            }
            groups.get(groupName)!.add(roomId);
        }

        for (const aud of conference.storedAuditoriums) {
            addToGroup("auditorium", aud.roomId);
            const audSlug = await aud.getSlug();
            addToGroup(audSlug + ":*", aud.roomId);
            addToGroup(audSlug + ":public", aud.roomId);
            addToGroup("public", aud.roomId);
            addToGroup("*", aud.roomId);

            // Auditoriums have a wrapping space, which should be auto-invited if needed.
            const space = await aud.getAssociatedSpace();
            addToGroup(audSlug + ":*", space.roomId);
            addToGroup(audSlug + ":public", space.roomId);
            addToGroup(audSlug + ":space", space.roomId);
            addToGroup("public", space.roomId);
            addToGroup("*", space.roomId);
        }

        for (const audBack of conference.storedAuditoriumBackstages) {
            addToGroup("auditorium_backstage", audBack.roomId);
            const audSlug = await audBack.getSlug();
            addToGroup(audSlug + ":*", audBack.roomId);
            addToGroup(audSlug + ":private", audBack.roomId);
            addToGroup("private", audBack.roomId);
            addToGroup("*", audBack.roomId);
        }

        for (const talk of conference.storedTalks) {
            addToGroup("talk", talk.roomId);
            const audSlug = await conference.getAuditorium(await talk.getAuditoriumId()).getSlug();
            addToGroup(audSlug + ":talk", talk.roomId);
            addToGroup(audSlug + ":*", talk.roomId);
            addToGroup(audSlug + ":private", talk.roomId);
            addToGroup("private", talk.roomId);
            addToGroup("*", talk.roomId);
        }

        for (const spi of conference.storedInterestRooms) {
            addToGroup("interest", spi.roomId);
            addToGroup("public", spi.roomId);
            addToGroup("*", spi.roomId);
        }

        return groups;
    }

    /**
     * Render a (somewhat) pretty list of group names.
     */
    private prettyGroupNameList(roomGroups: Map<string, Set<string>>) {
        const bySection = new Map<string, string[]>();

        // organise the groups into sections
        Array.from(roomGroups.keys()).forEach(group => {
            const section = group.split(":")[0];
            if (!bySection.has(section)) {
                bySection.set(section, []);
            }
            bySection.get(section)!.push(group);
        });

        const sections = Array.from(bySection.entries());
        sections.sort(([aSection], [bSection]) => aSection.localeCompare(bSection));

        return "<ul>" + sections.map(([_sectionName, groups]) => {
            groups.sort();
            return "<li>" + groups.map(x => `<code>${x}</code>`).join(", ") + "</li>";
        }).join("\n") + "</ul>";
    }

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        const roomGroups = await this.roomGroups(conference);

        if (!args.length) {
            return client.replyHtmlNotice(roomId, event, "Please specify a room ID or alias, or one of the room groups:\n" + this.prettyGroupNameList(roomGroups));
        }
        const userId = args[1] || event['sender'];

        if (roomGroups.has(args[0])) {
            const group = roomGroups.get(args[0])!;
            await client.unstableApis.addReactionToEvent(roomId, event['event_id'], 'Joining ' + group.size);

            for (const roomId of group) {
                try {
                    await this.inviteTo(client, userId, roomId);
                } catch (e) {
                    await logMessage(LogLevel.WARN, "InviteMeCommand", `Error inviting ${userId} to ${roomId}: ${e?.message || e?.body?.message}`);
                }
            }

            await client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
        } else {
            // Invite to one particular room.
            const targetRoomId = await client.resolveRoom(args[0]);
            await client.inviteUser(userId, targetRoomId);
            await client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
        }
    }
}
