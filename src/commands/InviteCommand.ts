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

export class InviteCommand implements ICommand {
    public readonly prefixes = ["invite", "inv"];

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference, private readonly config: IConfig) {}

    private async createInvites(people: IPerson[], alias: string) {
        const resolved = await resolveIdentifiers(this.client, people);

        let targetRoomId;
        try {
            targetRoomId = await this.client.resolveRoom(alias);
        }
        catch (error) {
            throw Error(`Error resolving room id for ${alias}`, {cause: error})
        }
        await this.ensureInvited(targetRoomId, resolved);
    }

    private async runSpeakersSupport(): Promise<void> {
        let people: IPerson[] = [];
        for (const aud of this.conference.storedAuditoriumBackstages) {
            people.push(...await this.conference.getInviteTargetsForAuditorium(aud, [Role.Speaker]));
        }
        const newPeople: IPerson[] = [];
        people.forEach(p => {
            if (!newPeople.some(n => n.id === p.id)) {
                newPeople.push(p);
            }
        });
        const speakersRoom = this.config.conference.supportRooms?.speakers;
        if (speakersRoom) {
            await this.createInvites(newPeople, speakersRoom);
        }
    }

    private async runCoordinatorsSupport(): Promise<void> {
        let people: IPerson[] = [];
        for (const aud of this.conference.storedAuditoriums) {
            // This hack was not wanted in 2023 or 2024.
            // if (!(await aud.getId()).startsWith("D.")) {
                // HACK: Only invite coordinators for D.* auditoriums.
                // TODO: Make invitations for support rooms more configurable.
                //       https://github.com/matrix-org/this.conference-bot/issues/76
            //     continue;
            // }

            const inviteTargets = await this.conference.getInviteTargetsForAuditorium(aud, [Role.Coordinator]);
            people.push(...inviteTargets);
        }
        const newPeople: IPerson[] = [];
        people.forEach(p => {
            if (!newPeople.some(n => n.id == p.id)) {
                newPeople.push(p);
            }
        });
        const coordinatorsRoom = this.config.conference.supportRooms?.coordinators;
        if (coordinatorsRoom) {
            await this.createInvites(newPeople, coordinatorsRoom);
        }
    }

    private async runSpecialInterestSupport(): Promise<void> {
        const people: IPerson[] = [];
        for (const sir of this.conference.storedInterestRooms) {
            people.push(...await this.conference.getInviteTargetsForInterest(sir));
        }
        const siRoom = this.config.conference.supportRooms?.specialInterest;
        if (siRoom) {
            await this.createInvites(people, siRoom);
        }
    }

    public async run(managementRoomId: string, event: any, args: string[]) {
        try {
            // Try to refresh the schedule first, to ensure we don't miss any updates.
            await this.conference.backend.refresh();
        } catch (error) {
            LogService.error(`StatusCommand`, `Failed to opportunistically refresh the backend (continuing invites anyway): ${error}`)
        }

        await this.client.replyNotice(managementRoomId, event, "Sending invites to participants. This might take a while.");

        // This is called invite but it's really membership sync in a way. We're iterating over
        // every possible room the bot knows about and making sure that we have the right people
        // in it. We don't remove anyone and don't care about extras - we just want to make sure
        // that a subset of people are joined.

        if (args[0] && args[0] === "speakers-support") {
            await this.runSpeakersSupport();
        } else if (args[0] && args[0] === "coordinators-support") {
            await this.runCoordinatorsSupport();
        } else if (args[0] && args[0] === "si-support") {
            await this.runSpecialInterestSupport();
        } else {
            await runRoleCommand((_client, room, people) => this.ensureInvited(room, people), this.conference, this.client, managementRoomId, event, args);

            if (args.length === 0) {
                // If no specific rooms are requested, then also handle invites to all support rooms.
                await this.runSpeakersSupport();
                await this.runCoordinatorsSupport();
                await this.runSpecialInterestSupport();
            }
        }

        await this.client.sendNotice(managementRoomId, "Invites sent!");
    }

    public async ensureInvited(roomId: string, people: ResolvedPersonIdentifier[]) {
        // We don't want to invite anyone we have already invited or that has joined though, so
        // avoid those people. We do this by querying the room state and filtering.
        let state: Awaited<ReturnType<MatrixClient["getRoomState"]>>
        try {
            state = await this.client.getRoomState(roomId);
        }
        catch (error) {
            throw Error(`Error fetching state for room ${roomId}`, {cause: error})
        }
        // List of IDs of people that have already been invited by e-mail
        const emailInvitePersonIds: string[] = state.filter(s => s.type === "m.room.third_party_invite").map(s => s.content?.[RS_3PID_PERSON_ID]).filter(i => !!i);
        // List of state events that are m.room.member events.
        const members: MembershipEvent[] = state.filter(s => s.type === "m.room.member").map(s => new MembershipEvent(s));
        // List of Matrix user IDs that have already joined
        const effectiveJoinedUserIds: string[] = members.filter(m => m.effectiveMembership === "join").map(m => m.membershipFor);
        for (const target of people) {
            if (target.mxid) {
                if (effectiveJoinedUserIds.includes(target.mxid)) continue;
            } else {
                // Notably: don't stop Matrix-inviting a user just because they had
                // previously been e-mail-invited
                if (emailInvitePersonIds.includes(target.person.id)) continue;
            }
            
            try {
                await invitePersonToRoom(this.client, target, roomId, this.config);
            } catch (e) {
                LogService.error("InviteCommand", e);
                await logMessage(LogLevel.ERROR, "InviteCommand", `Error inviting ${target.mxid}/${target.emails} / ${target.person.id} to ${roomId} - ignoring: ${e.message ?? e.statusMessage ?? '(see logs)'}`, this.client);
            }
        }
    }
}
