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
import { LogLevel, LogService, MatrixClient, MembershipEvent, RoomAlias } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { invitePersonToRoom, ResolvedPersonIdentifier, resolveIdentifiers } from "../invites";
import { RS_3PID_PERSON_ID } from "../models/room_state";
import { runRoleCommand } from "./actions/roles";
import { IDbPerson, Role } from "../db/DbPerson";
import config from "../config";
import { safeCreateRoom } from "../utils";
import { AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE, mergeWithCreationTemplate } from "../models/room_kinds";
import { logMessage } from "../LogProxy";

export class InviteCommand implements ICommand {
    public readonly prefixes = ["invite", "inv"];

    private async createInvites(client: MatrixClient, people: IDbPerson[], alias: string) {
        const resolved = await resolveIdentifiers(people);

        let targetRoomId: string;
        try {
            targetRoomId = await client.resolveRoom(alias);
        } catch (e) {
            // probably doesn't exist
            targetRoomId = await safeCreateRoom(client, mergeWithCreationTemplate(AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE, {
                room_alias_name: (new RoomAlias(alias)).localpart,
                invite: [config.moderatorUserId],
            }));
        }

        await InviteCommand.ensureInvited(client, targetRoomId, resolved);
    }

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.replyNotice(roomId, event, "Sending invites to participants. This might take a while.");

        // This is called invite but it's really membership sync in a way. We're iterating over
        // every possible room the bot knows about and making sure that we have the right people
        // in it. We don't remove anyone and don't care about extras - we just want to make sure
        // that a subset of people are joined.

        if (args[0] && args[0] === "speakers-support") {
            let people: IDbPerson[] = [];
            for (const aud of conference.storedAuditoriumBackstages) {
                people.push(...await conference.getInviteTargetsForAuditorium(aud, true));
            }
            people = people.filter(p => p.event_role === Role.Speaker);
            const newPeople: IDbPerson[] = [];
            people.forEach(p => {
                if (!newPeople.some(n => n.person_id === p.person_id)) {
                    newPeople.push(p);
                }
            });
            await this.createInvites(client, newPeople, config.conference.supportRooms.speakers);
        }else if (args[0] && args[0] === "coordinators-support") {
            let people: IDbPerson[] = [];
            for (const aud of conference.storedAuditoriumBackstages) {
                people.push(...await conference.getInviteTargetsForAuditorium(aud, true));
            }
            people = people.filter(p => p.event_role === Role.Coordinator);
            const newPeople: IDbPerson[] = [];
            people.forEach(p => {
                if (!newPeople.some(n => n.person_id === p.person_id)) {
                    newPeople.push(p);
                }
            });
            await this.createInvites(client, newPeople, config.conference.supportRooms.coordinators);
        } else if (args[0] && args[0] === "si-support") {
            const people: IDbPerson[] = [];
            for (const sir of conference.storedInterestRooms) {
                people.push(...await conference.getInviteTargetsForInterest(sir));
            }
            await this.createInvites(client, people, config.conference.supportRooms.specialInterest);
        } else {
            await runRoleCommand(InviteCommand.ensureInvited, conference, client, roomId, event, args);
        }

        await client.sendNotice(roomId, "Invites sent!");
    }

    public static async ensureInvited(client: MatrixClient, roomId: string, people: ResolvedPersonIdentifier[]) {
        // We don't want to invite anyone we have already invited or that has joined though, so
        // avoid those people. We do this by querying the room state and filtering.
        const state = await client.getRoomState(roomId);
        const emailInvitePersonIds = state.filter(s => s.type === "m.room.third_party_invite").map(s => s.content?.[RS_3PID_PERSON_ID]).filter(i => !!i);
        const members = state.filter(s => s.type === "m.room.member").map(s => new MembershipEvent(s));
        const effectiveJoinedUserIds = members.filter(m => m.effectiveMembership === "join").map(m => m.membershipFor);
        for (const target of people) {
            if (target.mxid && effectiveJoinedUserIds.includes(target.mxid)) continue;
            if (emailInvitePersonIds.includes(target.person.person_id)) continue;
            try {
                await invitePersonToRoom(target, roomId);
            } catch (e) {
                LogService.error("InviteCommand", e);
                await logMessage(LogLevel.ERROR, "InviteCommand", `Error inviting ${target.mxid} / ${target.person.person_id} to ${roomId} - ignoring`);
            }
        }
    }
}
