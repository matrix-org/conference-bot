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
import { editNotice, sleep } from "../utils";

type InviteOptions = {
    /**
     * If true, then no actual invites will be sent.
     */
    dryRun: boolean;

    /**
     * Called for every invite that was sent.
     * Still called during dry-run.
     */
    onInviteSent: () => Promise<void>;
}

export class InviteCommand implements ICommand {
    public readonly prefixes = ["invite", "inv"];

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference, private readonly config: IConfig) {}

    /*
     * Invite the given people to the room pointed to by the given room alias.
     *
     * @param {IPerson[]} people - The list of people to invite.
     * @param {string} alias - The alias of the room to invite people to.
     *
     * @returns {number} The number of invites that were sent out.
     * @throws An exception if the room alias failed to be resolved, or we're unable to
     *     fetch the state of the room.
     */
    private async createInvites(people: IPerson[], alias: string, options: InviteOptions): Promise<void> {
        const resolved = await resolveIdentifiers(this.client, people);

        let targetRoomId;
        try {
            targetRoomId = await this.client.resolveRoom(alias);
        }
        catch (error) {
            throw Error(`Error resolving room id for ${alias}`, {cause: error})
        }
        await this.ensureInvited(targetRoomId, resolved, options);
    }

    private async runSpeakersSupport(options: InviteOptions): Promise<void> {
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
            await this.createInvites(newPeople, speakersRoom, options);
        }
    }

    private async runCoordinatorsSupport(options: InviteOptions): Promise<void> {
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
            await this.createInvites(newPeople, coordinatorsRoom, options);
        }
    }

    private async runSpecialInterestSupport(options: InviteOptions): Promise<void> {
        const people: IPerson[] = [];
        for (const sir of this.conference.storedInterestRooms) {
            people.push(...await this.conference.getInviteTargetsForInterest(sir));
        }
        const siRoom = this.config.conference.supportRooms?.specialInterest;
        if (siRoom) {
            await this.createInvites(people, siRoom, options);
        }
    }

    public async run(managementRoomId: string, event: any, args: string[]) {
        try {
            // Try to refresh the schedule first, to ensure we don't miss any updates.
            await this.conference.backend.refresh();
        } catch (error) {
            LogService.error(`StatusCommand`, `Failed to opportunistically refresh the backend (continuing invites anyway): ${error}`)
        }


        // This is called invite but it's really membership sync in a way. We're iterating over
        // every possible room the bot knows about and making sure that we have the right people
        // in it. We don't remove anyone and don't care about extras - we just want to make sure
        // that a subset of people are joined.

        // Before we do anything, let's do a dry-run to figure out how many invites we're expecting to send.
        let invitesToSend = 0;
        await this.runWithOptions(managementRoomId, event, args, {
            dryRun: true,
            onInviteSent: async () => {
                ++invitesToSend;
            },
        });

        let invitesSent = 0;

        const makeProgressMessage = () => `Sending invites: ${invitesSent}/${invitesToSend}...`;

        // Send an event and periodically update it to show progress.
        const progressEvent = await this.client.replyNotice(managementRoomId, event, makeProgressMessage());

        let lastSentProgressMillis = Date.now();
        const SEND_UPDATES_EVERY_MILLIS = 60_000;

        // Now we're ready to start inviting whilst sending progress messages now and again.
        await this.runWithOptions(managementRoomId, event, args, {
            dryRun: false,
            onInviteSent: async () => {
                ++invitesSent;

                // Send a progress update if one is overdue.
                if (Date.now() - lastSentProgressMillis > SEND_UPDATES_EVERY_MILLIS) {
                    await editNotice(
                        this.client,
                        managementRoomId,
                        progressEvent,
                        makeProgressMessage(),
                    );
                    lastSentProgressMillis = Date.now();
                }
            },
        });

        // Make it obvious we are finished now
        await editNotice(
            this.client,
            managementRoomId,
            progressEvent,
            `${invitesSent} invites sent!`
        );
    }

    /**
     * Handle the actual argument handling and inviting logic.
     * Should not send messages to the room.
     *
     * @param args - The arguments to this command.
     * @param options - Options for running the invites.
     */
    private async runWithOptions(managementRoomId: string, event: any, args: string[], options: InviteOptions): Promise<void> {
        if (args[0] && args[0] === "speakers-support") {
            await this.runSpeakersSupport(options);
        } else if (args[0] && args[0] === "coordinators-support") {
            await this.runCoordinatorsSupport(options);
        } else if (args[0] && args[0] === "si-support") {
            await this.runSpecialInterestSupport(options);
        } else {
            await runRoleCommand(async (_client, room, people) => {
                await this.ensureInvited(room, people, options);
            }, this.conference, this.client, managementRoomId, event, args);

            if (args.length === 0) {
                // If no specific rooms are requested, then also handle invites to all support rooms.
                await this.runSpeakersSupport(options);
                await this.runCoordinatorsSupport(options);
                await this.runSpecialInterestSupport(options);
            }
        }
    }

    /**
     * Ensure that a person is invited to the room. Skips people that are already joined to the room.
     *
     * @returns {number} The number of invites that were sent out.
     * @throws An exception if we're unable to fetch the state of the room.
     */
    public async ensureInvited(roomId: string, people: ResolvedPersonIdentifier[], options: InviteOptions): Promise<void> {
        // We don't want to invite anyone we have already invited or that has joined though, so
        // avoid those people. We do this by querying the room state and filtering.
        let state: Awaited<ReturnType<MatrixClient["getRoomState"]>>;
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
                // The user does not have an MXID on record. If we've already
                // invited them by email, continue to the next user.
                if (emailInvitePersonIds.includes(target.person.id)) continue;
            }

            // Notably, we DO try to invite users by MXID (when known) even if
            // we've already invited them by email.

            for (let attempt = 0; attempt < 3; ++attempt) {
                try {
                    if (!options.dryRun) {
                        await invitePersonToRoom(this.client, target, roomId, this.config);
                    }
                    await options.onInviteSent();
                } catch (e) {
                    if (e.statusCode === 429) {
                        // Retry after ratelimits
                        // Add 1 second to the ratelimit just to ensure we don't retry too quickly
                        // due to clock drift or a very small requested wait.
                        // If no retry time set, use 5 minutes.
                        let delay = (e.retryAfterMs ?? 300_000) + 1_000;

                        await sleep(delay);
                        continue;
                    }

                    LogService.error("InviteCommand", e);
                    await logMessage(LogLevel.ERROR, "InviteCommand", `Error inviting ${target.mxid}/${target.emails} / ${target.person.id} to ${roomId} - ignoring: ${e.message ?? e.statusMessage ?? '(see logs)'}`, this.client);
                }
                break;
            }
        }
    }
}
