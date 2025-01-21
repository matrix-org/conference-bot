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
import { resolveIdentifiers } from "../invites";
import { COLOR_GREEN, COLOR_RED } from "../models/colors";
import { IPerson } from "../models/schedule";
import { ConferenceMatrixClient } from "../ConferenceMatrixClient";

const BROKEN_WARNING = "<a href='https://github.com/matrix-org/conference-bot/issues/245'>This command is somewhat broken/misleading.</a> Accepted = percentage of invites that are Matrix and accepted. Emails = percentage of invites that are e-mail (regardless of whether they are accepted or not).";

export class AttendanceCommand implements ICommand {
    public readonly prefixes = ["attendance"];

    constructor(private readonly client: ConferenceMatrixClient, private readonly conference: Conference) {}

    public async run(roomId: string, event: any, args: string[]) {
        await this.client.sendNotice(roomId, "Calculating...");

        let totalEmails = 0;
        let totalJoined = 0;
        let totalInvites = 0;

        const targetAudId = args[0];

        const htmlNum = (n: number, invert = false): string => {
            if (Number.isNaN(n)) {
                n = 0;
            }
            if (invert ? (n > 30) : (n < 75)) {
                return `<b><font color='${COLOR_RED}'>${n}%</font></b>`;
            } else {
                return `<b><font color='${COLOR_GREEN}'>${n}%</font></b>`;
            }
        }

        let html = BROKEN_WARNING + "<ul>";
        const append = async (invitePeople: IPerson[], bsPeople: IPerson[] | null, name: string, roomId: string, bsRoomId: string | null, withHtml: boolean) => {
            // all persons that are to be invited to this room
            const inviteTargets = await resolveIdentifiers(this.client, invitePeople);

            // all Matrix members of the room
            const joinedMembers = await this.client.getJoinedRoomMembers(roomId);

            // all invite targets that were e-mail invited, by virtue of not having a registered MXID
            const emailInvites = inviteTargets.filter(i => !i.mxid).length;
            // all Matrix targets that have also joined
            const joined = inviteTargets.filter(i => i.mxid && joinedMembers.includes(i.mxid)).length;

            // percentage of invites that are both Matrix and accepted
            const acceptedPct = Math.round((joined / inviteTargets.length) * 100);
            // percentage of invites that are e-mail invites. Regardless of whether they are accepted.
            const emailPct = Math.round((emailInvites / inviteTargets.length) * 100);

            totalInvites += inviteTargets.length;
            totalJoined += joined;
            totalEmails += emailInvites;

            if (withHtml) html += `<li><b>${name}</b> ${htmlNum(acceptedPct)} have joined, ${htmlNum(emailPct, true)} have emails waiting`;

            if (bsRoomId) {
                if (!bsPeople) {
                    throw new Error(`the auditorium ${name} has a backstage room id but no backstage people set!`);
                }
                const bsInviteTargets = await resolveIdentifiers(this.client, bsPeople);
                const bsJoinedMembers = await this.client.getJoinedRoomMembers(bsRoomId);
                const bsEmailInvites = bsInviteTargets.filter(i => !i.mxid).length;
                const bsJoined = bsInviteTargets.filter(i => i.mxid && bsJoinedMembers.includes(i.mxid)).length;
                const bsAcceptedPct = Math.round((bsJoined / bsInviteTargets.length) * 100);
                const bsEmailPct = Math.round((bsEmailInvites / bsInviteTargets.length) * 100);

                if (withHtml)  html += ` (backstage: ${htmlNum(bsAcceptedPct)} joined, ${htmlNum(bsEmailPct, true)}% emails)`;

                totalInvites += bsInviteTargets.length;
                totalJoined += bsJoined;
                totalEmails += bsEmailInvites;
            }

            if (withHtml) html += "</li>";
        };
        for (const auditorium of this.conference.storedAuditoriums) {
            const doAppend = !!targetAudId && (targetAudId === "all" || targetAudId === await auditorium.getId());
            const bs = this.conference.getAuditoriumBackstage(await auditorium.getId());
            const inviteTargets = await this.conference.getInviteTargetsForAuditorium(auditorium);
            const bsInviteTargets = await this.conference.getInviteTargetsForAuditorium(auditorium);
            try {
                await append(inviteTargets, bsInviteTargets, await auditorium.getId(), auditorium.roomId, bs.roomId, doAppend);
            }
            catch (error) {
                throw new Error(`Error calculating invite acceptance in auditorium ${auditorium}`, {cause: error})
            }
        }
        for (const spiRoom of this.conference.storedInterestRooms) {
            const doAppend = !!targetAudId && (targetAudId === "all" || targetAudId === await spiRoom.getId());
            const inviteTargets = await this.conference.getInviteTargetsForInterest(spiRoom);
            try {
                await append(inviteTargets, null, await spiRoom.getId(), spiRoom.roomId, null, doAppend);
            }
            catch (error) {
                throw new Error(`Error calculating invite acceptance in special interest room ${spiRoom}`, {cause:error})
            }
        }
        html += "</ul>";

        if (!targetAudId) {
            html = "";
        }

        const acceptedPct = Math.round((totalJoined / totalInvites) * 100);
        const emailPct = Math.round((totalEmails / totalInvites) * 100);

        html = `<b>Summary:</b> ${htmlNum(acceptedPct)} have joined, ${htmlNum(emailPct, true)} have pending emails. ${targetAudId ? '<hr />' : ''}${html}`;

        await this.client.replyHtmlNotice(roomId, event, html);
    }
}
