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
import { LogLevel, LogService, MatrixClient, MembershipEvent } from "matrix-bot-sdk";
import { Conference } from "../Conference";
import { invitePersonToRoom, ResolvedPersonIdentifier, resolveIdentifiers } from "../invites";
import { RS_3PID_PERSON_ID } from "../models/room_state";
import { runRoleCommand } from "./actions/roles";
import { logMessage } from "../LogProxy";
import { IPerson, Role } from "../models/schedule";
import { ConferenceMatrixClient } from "../ConferenceMatrixClient";
import { IConfig } from "../config";
import { sleep } from "../utils";

export class InviteCommand implements ICommand {
    public readonly prefixes = ["invite", "inv"];

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference, private readonly config: IConfig) {}

    private async createInvites(people: IPerson[], alias: string): Promise<number> {
        const resolved = await resolveIdentifiers(this.client, people);

        let targetRoomId;
        try {
            targetRoomId = await this.client.resolveRoom(alias);
        }
        catch (error) {
            throw Error(`Error resolving room id for ${alias}`, {cause: error})
        }
        return await this.ensureInvited(targetRoomId, resolved);
    }

    public async run(managementRoomId: string, event: any, args: string[]) {
        await this.client.replyNotice(managementRoomId, event, "Sending invites to participants. This might take a while.");

        // This is called invite but it's really membership sync in a way. We're iterating over
        // every possible room the bot knows about and making sure that we have the right people
        // in it. We don't remove anyone and don't care about extras - we just want to make sure
        // that a subset of people are joined.

        let invitesSent = 0;

        if (args[0] && args[0] === "speakers-support") {
            let people: IPerson[] = [];
            for (const aud of this.conference.storedAuditoriumBackstages) {
                people.push(...await this.conference.getInviteTargetsForAuditorium(aud, true));
            }
            people = people.filter(p => p.role === Role.Speaker);
            const newPeople: IPerson[] = [];
            people.forEach(p => {
                if (!newPeople.some(n => n.id === p.id)) {
                    newPeople.push(p);
                }
            });
            invitesSent += await this.createInvites(newPeople, this.config.conference.supportRooms.speakers);
        } else if (args[0] && args[0] === "coordinators-support") {
            let people: IPerson[] = [];
            for (const aud of this.conference.storedAuditoriums) {
                // This hack was not wanted in 2023 or 2024. 
                // if (!(await aud.getId()).startsWith("D.")) {
                    // HACK: Only invite coordinators for D.* auditoriums.
                    // TODO: Make invitations for support rooms more configurable.
                    //       https://github.com/matrix-org/this.conference-bot/issues/76
                //     continue;
                // }

                const inviteTargets = await this.conference.getInviteTargetsForAuditorium(aud, true);
                people.push(...inviteTargets.filter(i => i.role === Role.Coordinator));
            }
            const newPeople: IPerson[] = [];
            people.forEach(p => {
                if (!newPeople.some(n => n.id == p.id)) {
                    newPeople.push(p);
                }
            });
            invitesSent += await this.createInvites(newPeople, this.config.conference.supportRooms.coordinators);
        } else if (args[0] && args[0] === "si-support") {
            const people: IPerson[] = [];
            for (const sir of this.conference.storedInterestRooms) {
                people.push(...await this.conference.getInviteTargetsForInterest(sir));
            }
            invitesSent += await this.createInvites(people, this.config.conference.supportRooms.specialInterest);
        } else {
            await runRoleCommand(async (_client, room, people) => {
                invitesSent += await this.ensureInvited(room, people);
            }, this.conference, this.client, managementRoomId, event, args);
        }

        await this.client.sendNotice(managementRoomId, `${invitesSent} invites sent!`);
    }

    public async ensureInvited(roomId: string, people: ResolvedPersonIdentifier[]): Promise<number> {
        // We don't want to invite anyone we have already invited or that has joined though, so
        // avoid those people. We do this by querying the room state and filtering.
        let invitesSent = 0;
        let state: any[];
        try {
            state = await this.client.getRoomState(roomId);
        }
        catch (error) {
            throw Error(`Error fetching state for room ${roomId}`, {cause: error})
        }
        const emailInvitePersonIds = state.filter(s => s.type === "m.room.third_party_invite").map(s => s.content?.[RS_3PID_PERSON_ID]).filter(i => !!i);
        const members = state.filter(s => s.type === "m.room.member").map(s => new MembershipEvent(s));
        const effectiveJoinedUserIds = members.filter(m => m.effectiveMembership === "join").map(m => m.membershipFor);
        for (const target of people) {
            if (target.mxid && effectiveJoinedUserIds.includes(target.mxid)) continue;
            if (emailInvitePersonIds.includes(target.person.id)) continue;
            for (let attempt = 0; attempt < 3; ++attempt) {
                try {
                    await invitePersonToRoom(this.client, target, roomId, this.config);
                    ++invitesSent;
                } catch (e) {
                    if (e.statusCode === 429) {
                        // HACK Retry after ratelimits
                        await sleep(301_000);
                        continue;
                    }
                    LogService.error("InviteCommand", e);
                    await logMessage(LogLevel.ERROR, "InviteCommand", `Error inviting ${target.mxid}/${target.emails} / ${target.person.id} to ${roomId} - ignoring: ${e.message ?? e.statusMessage ?? '(see logs)'}`, this.client);
                }
                break;
            }
        }

        return invitesSent;
    }
}
