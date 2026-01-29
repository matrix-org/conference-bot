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
import { LogLevel } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { logMessage } from "../LogProxy";
import { ConferenceMatrixClient } from "../ConferenceMatrixClient";

export class InviteMeCommand implements ICommand {

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference) {}

    public readonly prefixes = ["inviteme", "inviteto"];

    private async tryInviteTo(invitees: string[], room: string): Promise<void> {
        let members: string[];
        try {
            members = await this.client.getJoinedRoomMembers(room);
        }
        catch (error) {
            throw Error(`Error getting joined members from room ${room}`, {cause:error})
        }

        for (const invitee of invitees) {
            if (members.includes(invitee)) {
                continue;
            }

            try {
                await this.client.inviteUser(invitee, room);
            } catch (e) {
                await logMessage(LogLevel.WARN, "InviteMeCommand", `Error inviting ${invitee} to ${room}: ${e?.message || e?.body?.message}`, this.client);
            }
        }
    }

    /**
     * Returns a map of room 'groups'. These are named groups of rooms corresponding to various roles.
     */
    public async roomGroups(): Promise<Map<string, Set<string>>> {
        const groups: Map<string, Set<string>> = new Map();

        function addToGroup(groupName: string, roomId: string) {
            if (!groups.has(groupName)) {
                groups.set(groupName, new Set());
            }
            groups.get(groupName)!.add(roomId);
        }

        for (const aud of this.conference.storedAuditoriums) {
            addToGroup("auditorium", aud.roomId);
            const audSlug = aud.getSlug();
            addToGroup(`${audSlug}:*`, aud.roomId);
            addToGroup(`${audSlug}:public`, aud.roomId);
            addToGroup("public", aud.roomId);
            addToGroup("*", aud.roomId);
        }

        for (const audBack of this.conference.storedAuditoriumBackstages) {
            addToGroup("auditorium_backstage", audBack.roomId);
            const audSlug = audBack.getSlug();
            addToGroup(`${audSlug}:*`, audBack.roomId);
            addToGroup(`${audSlug}:private`, audBack.roomId);
            addToGroup("private", audBack.roomId);
            addToGroup("*", audBack.roomId);
        }

        for (const spi of this.conference.storedInterestRooms) {
            addToGroup("interest", spi.roomId);
            addToGroup("public", spi.roomId);
            addToGroup("*", spi.roomId);
        }

        return groups;
    }

    /**
     * Render a (somewhat) pretty list of group names.
     */
    public prettyGroupNameList(roomGroups: Map<string, Set<string>>) {
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

    public async run(roomId: string, event: any, args: string[]) {
        const roomGroups = await this.roomGroups();

        if (!args.length) {
            return this.client.replyHtmlNotice(roomId, event, "Please specify a room ID or alias, or one of the room groups:\n" + this.prettyGroupNameList(roomGroups));
        }

        // Support specifying the User ID(s) to be invited,
        // but default to the command user.
        let userIds: string[] = args.slice(1);
        if (userIds.length === 0) {
            userIds = [event['sender']];
        }

        const obviouslyInvalidUserIds = userIds.filter(user_id => !user_id.startsWith("@") || user_id.indexOf(":") === -1);
        if (obviouslyInvalidUserIds.length > 0) {
            return this.client.replyHtmlNotice(roomId, event, `Invalid user ID(s): ${obviouslyInvalidUserIds.join(', ')}`);
        }

        let roomIds: Set<string>;

        if (roomGroups.has(args[0])) {
            roomIds = roomGroups.get(args[0])!;
            // Show some feedback on the number of rooms
            await this.client.unstableApis.addReactionToEvent(roomId, event['event_id'], 'rooms: ' + roomIds.size);
        } else {
            // Invite to one particular room.
            try {
                const targetRoomId = await this.client.resolveRoom(args[0]);
                roomIds = new Set([targetRoomId]);
            } catch (error) {
                throw Error(`Error resolving room ${args[0]}`, { cause: error })
            }
        }

        for (const roomId of roomIds) {
            await this.tryInviteTo(userIds, roomId);
        }

        await this.client.unstableApis.addReactionToEvent(roomId, event['event_id'], '✅');
    }
}
