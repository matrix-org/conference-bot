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
import { MatrixClient, MembershipEvent } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { invitePersonToRoom, resolveIdentifiers } from "../invites";
import { RS_3PID_PERSON_ID } from "../models/room_state";

export class InviteCommand implements ICommand {
    public readonly prefixes = ["invite", "inv"];

    public async run(conference: Conference, client: MatrixClient, roomId: string, event: any, args: string[]) {
        await client.replyNotice(roomId, event, "Sending invites to participants. This might take a while.");

        // This is called invite but it's really membership sync in a way. We're iterating over
        // every possible room the bot knows about and making sure that we have the right people
        // in it. We don't remove anyone and don't care about extras - we just want to make sure
        // that a subset of people are joined.
        //
        // The iteration is easy: take all the room kinds and dump them into a single array, then
        // iterate.
        const allRoomIds = [
            ...conference.storedAuditoriumBackstages.map(r => r.roomId),
            ...conference.storedAuditoriums.map(r => r.roomId),
            ...conference.storedTalks.map(r => r.roomId),
            // TODO: Special interest rooms
        ];

        for (const roomId of allRoomIds) {
            const meta = await conference.getMetaFor(roomId);
            if (!meta) continue;

            // Locate all the people we need to invite
            const inviteRoles = meta.meta.mxInvite.filter(i => !!i.role).map(i => i.role);
            const invitePeople = meta.meta.mxInvite.filter(i => !!i.person).map(i => i.person);
            const resolvedPeople = invitePeople.map(i => conference.getPerson(i));
            for (const role of inviteRoles) {
                const peopleInRole = conference.getPeopleInRole(role);
                resolvedPeople.push(...peopleInRole);
            }

            // Dedupe and remove any lookup failures
            const inviteMap = {}; // personId => person
            for (const person of resolvedPeople) {
                if (!person) continue;
                inviteMap[person.definition.id] = person;
            }

            // Resolve to invite targets
            const inviteTargets = await resolveIdentifiers(Object.values(inviteMap));

            // and finally, do the invite. We don't want to invite anyone we have already
            // invited or that has joined though, so avoid those people. We do this by querying
            // the room state and filtering.
            const state = await client.getRoomState(roomId);
            const emailInvitePersonIds = state.filter(s => s.type === "m.room.third_party_invite").map(s => s.content?.[RS_3PID_PERSON_ID]).filter(i => !!i);
            const members = state.filter(s => s.type === "m.room.member").map(s => new MembershipEvent(s));
            const effectiveJoinedUserIds = members.filter(m => m.effectiveMembership === "join").map(m => m.membershipFor);
            for (const target of inviteTargets) {
                if (target.mxid && effectiveJoinedUserIds.includes(target.mxid)) continue;
                if (emailInvitePersonIds.includes(target.person.definition.id)) continue;
                await invitePersonToRoom(target, roomId);
            }
        }

        await client.sendNotice(roomId, "Invites sent!");
    }
}
