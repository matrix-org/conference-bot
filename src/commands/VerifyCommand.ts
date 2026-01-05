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
import { Conference } from "../Conference";
import { asyncFilter } from "../utils";
import { Auditorium } from "../models/Auditorium";
import { PhysicalRoom } from "../models/PhysicalRoom";
import { InterestRoom } from "../models/InterestRoom";
import { IPerson } from "../models/schedule";
import { resolveIdentifiers } from "../invites";
import { ConferenceMatrixClient } from "../ConferenceMatrixClient";
import { RS_3PID_PERSON_ID } from "../models/room_state";
import { LogService, MembershipEvent } from "matrix-bot-sdk";

interface PersonState {
    // what's the best contact method we have for the person?
    bestKind: 'matrix' | 'e-mail' | 'uncontactable',
    
    // what's the current state of this person in this room?
    membership: 'invited' | 'joined' | 'missing' | 'invited-but-by-e-mail'
}

export class VerifyCommand implements ICommand {
    public readonly prefixes = ["verify", "v"];

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference) {}

    public async run(controlRoomId: string, event: any, args: string[]) {
        let targetIdOrSlug: string;
        let backstage = args[args.length - 1] === "backstage";
        if (backstage) {
            const aud_slice = args.slice(0, -1)
            targetIdOrSlug = aud_slice.join(" ")
        }
        else {
            targetIdOrSlug = args.join(" ");
        }

        let room: PhysicalRoom | null = this.conference.getAuditoriumOrInterestByIdOrSlug(targetIdOrSlug);
        if (backstage && room !== null) {
            room = this.conference.getAuditoriumBackstage(room.getId());
        }

        if (!room) {
            return await this.client.replyNotice(controlRoomId, event, `Unknown auditorium/interest room: ${targetIdOrSlug}`);
        }

        await this.client.replyNotice(controlRoomId, event, "Calculating list of people...");

        let html = `<h1>${room.getName()} (${room.getId()})</h1>`;

        const appendPeople = (invite: IPerson[], mods: IPerson[], peopleToStates: Map<string, PersonState>) => {
            for (const target of invite) {
                const isMod = mods.some(m => m.id === target.id);
                html += `<li>${target.name} (${target.role}${isMod ? ' + room moderator' : ''})`;

                let state = peopleToStates.get(target.id);
                if (state) {
                    html += ` (best method: <u>${state.bestKind}</u>; membership: <u>${state.membership}</u>)`;
                } else {
                    html += " (unknown state)";
                }
                
                html += `</li>`;
            }
        };

        let audToInvite: IPerson[];
        let audBackstageToInvite: IPerson[];
        let audToMod: IPerson[];

        if (room instanceof Auditorium) {
            audToInvite = await this.conference.getInviteTargetsForAuditorium(room);
            audBackstageToInvite = await this.conference.getInviteTargetsForAuditorium(room);
            audToMod = await this.conference.getModeratorsForAuditorium(room);
        } else if (room instanceof InterestRoom) {
            audToInvite = await this.conference.getInviteTargetsForInterest(room);
            audBackstageToInvite = [];
            audToMod = await this.conference.getModeratorsForInterest(room);
        } else {
            return await this.client.replyNotice(controlRoomId, event, `Unknown room kind: ${room}`);
        }

        const publicAud = this.conference.getAuditorium(targetIdOrSlug);
        if (publicAud || !(room instanceof Auditorium)) {
            html += "<b>Public-facing room:</b><ul>";
            appendPeople(audToInvite, audToMod, new Map());
        }

        if (room instanceof Auditorium) {
            // Calculate some debug info, all based on the invite logic
            let peopleToStates: Map<string, PersonState> = new Map();
            try {
                const resolved = await resolveIdentifiers(this.client, audBackstageToInvite);
                let state: any[];
                try {
                    state = await this.client.getRoomState(room.roomId);
                }
                catch (error) {
                    throw Error(`Error fetching state for room ${room.roomId}`, {cause: error})
                }
                // List of IDs of people that have already been invited by e-mail
                const emailInvitePersonIds: string[] = state.filter(s => s.type === "m.room.third_party_invite").map(s => s.content?.[RS_3PID_PERSON_ID]).filter(i => !!i);
                // List of state events that are m.room.member events.
                const members: MembershipEvent[] = state.filter(s => s.type === "m.room.member").map(s => new MembershipEvent(s));
                // List of Matrix user IDs that have already joined
                const effectiveJoinedUserIds: string[] = members.filter(m => m.effectiveMembership === "join").map(m => m.membershipFor);
                // List of Matrix user IDs that have been invited by MXID
                const effectiveInvitedUserIds: string[] = members.filter(m => m.effectiveMembership === "invite").map(m => m.membershipFor);
                for (const person of resolved) {
                    let bestKind: 'matrix' | 'e-mail' | 'uncontactable' = 'uncontactable';
                    let state: 'invited' | 'joined' | 'missing' | 'invited-but-by-e-mail' = 'missing';

                    if (person.mxid) {
                        bestKind = 'matrix';
                        if (effectiveJoinedUserIds.includes(person.mxid)) {
                            state = 'joined';
                        } else if (effectiveInvitedUserIds.includes(person.mxid)) {
                            state = 'invited';
                        } else if (emailInvitePersonIds.includes(person.person.id)) {
                            state = 'invited-but-by-e-mail';
                        }
                    } else if (person.emails) {
                        bestKind = 'e-mail';
                        if (emailInvitePersonIds.includes(person.person.id)) {
                            state = 'invited';
                        }
                    }

                    peopleToStates.set(person.person.id, {bestKind, membership: state});
                }
            } catch (error) {
                await this.client.replyNotice(controlRoomId, event, "Failed to calculate people states");
                LogService.error("VerifyCommand", "Error trying calculate people states:", error);
            }

            html += "</ul><b>Backstage room:</b><ul>";
            appendPeople(audBackstageToInvite, audToMod, peopleToStates);
            html += "</ul>";

            const talks = await asyncFilter(this.conference.storedTalks, async t => t.getAuditoriumId() === room!.getId());
            for (const talk of talks) {
                const talkToInvite = await this.conference.getInviteTargetsForTalk(talk);
                const talkToMod = await this.conference.getModeratorsForTalk(talk);
                if (talkToMod.length || talkToInvite.length) {
                    html += `<b>Talk: ${talk.getName()} (${talk.getId()})</b><ul>`;
                    appendPeople(talkToInvite, talkToMod, new Map());
                    html += "</ul>";
                }
            }
        }

        await this.client.sendHtmlNotice(controlRoomId, html);
    }
}
