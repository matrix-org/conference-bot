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

import { LogService, MatrixClient } from "matrix-bot-sdk";
import { ResolvedPersonIdentifier, resolveIdentifiers } from "../../invites";
import { Auditorium } from "../../models/Auditorium";
import { Conference } from "../../Conference";
import { asyncFilter } from "../../utils";
import { InterestRoom } from "../../models/InterestRoom";

export interface IAction {
    (client: MatrixClient, roomId: string, people: ResolvedPersonIdentifier[]): Promise<void>;
}

export async function doAuditoriumResolveAction(
    action: IAction,
    client: MatrixClient,
    aud: Auditorium,
    conference: Conference,
    backstageOnly = false,
    skipTalks = false,
    isInvite = true,
): Promise<void> {
    // We know that everyone should be in the backstage room, so resolve that list of people
    // to make the identity server lookup efficient.
    const backstagePeople = isInvite
        ? await conference.getInviteTargetsForAuditorium(aud, true)
        : await conference.getModeratorsForAuditorium(aud);
    LogService.info("backstagePeople", `${backstagePeople}`);
    const resolvedBackstagePeople = await resolveIdentifiers(backstagePeople);
    const backstage = conference.getAuditoriumBackstage(await aud.getId());

    LogService.info("resolvedBackstagePeople", `${resolvedBackstagePeople}`);

    const allPossiblePeople = isInvite
        ? resolvedBackstagePeople
        : await resolveIdentifiers(await conference.getInviteTargetsForAuditorium(aud, true));

    await action(client, backstage.roomId, resolvedBackstagePeople);

    if (backstageOnly) return;

    const realAud = conference.getAuditorium(await aud.getId());
    const audPeople = isInvite
        ? await conference.getInviteTargetsForAuditorium(realAud)
        : await conference.getModeratorsForAuditorium(realAud);
    const resolvedAudPeople = audPeople.map(p => allPossiblePeople.find(b => p.id === b.person.id));
    if (resolvedAudPeople.some(p => !p)) throw new Error("Failed to resolve all targets for auditorium");

    await action(client, realAud.roomId, resolvedAudPeople as ResolvedPersonIdentifier[]);

    if (!skipTalks) {
        const talks = await asyncFilter(
            conference.storedTalks,
            async t => (await t.getAuditoriumId()) === (await aud.getId()),
        );
        for (const talk of talks) {
            const talkPeople = isInvite
                ? await conference.getInviteTargetsForTalk(talk)
                : await conference.getModeratorsForTalk(talk);
            const resolvedTalkPeople = talkPeople.map(
                p => allPossiblePeople.find(b => p.id === b.person.id)
            );
            if (resolvedTalkPeople.some(p => !p)) {
                const unresolveable = talkPeople.filter(
                    p => allPossiblePeople.find(b => p.id === b.person.id) === undefined
                )
                throw new Error("Failed to resolve all targets for talk: " + JSON.stringify(unresolveable));
            }

            await action(client, talk.roomId, resolvedTalkPeople as ResolvedPersonIdentifier[]);
        }
    }
}

export async function doInterestResolveAction(action: IAction, client: MatrixClient, int: InterestRoom, conference: Conference, isInvite = true): Promise<void> {
    // We know that everyone should be in the backstage room, so resolve that list of people
    // to make the identity server lookup efficient.
    const people = isInvite
        ? await conference.getInviteTargetsForInterest(int)
        : await conference.getModeratorsForInterest(int);
    await action(client, int.roomId, await resolveIdentifiers(people));
}
