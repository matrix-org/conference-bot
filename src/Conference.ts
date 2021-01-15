/*
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

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

import { MatrixClient, MSC1772Space } from "matrix-bot-sdk";
import {
    AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE,
    AUDITORIUM_CREATION_TEMPLATE,
    CONFERENCE_ROOM_CREATION_TEMPLATE,
    mergeWithCreationTemplate,
    RoomKind,
    RSC_AUDITORIUM_ID,
    RSC_CONFERENCE_ID,
    RSC_ROOM_KIND_FLAG,
    RSC_SPECIAL_INTEREST_ID,
    RSC_TALK_ID,
    TALK_CREATION_TEMPLATE
} from "./models/room_kinds";
import { IAuditorium, IConference, ITalk } from "./models/schedule";
import {
    IStoredPerson,
    makeParentRoom,
    makeStoredAuditorium,
    makeStoredConference,
    makeStoredPerson,
    makeStoredSpace,
    makeStoredTalk,
    RS_STORED_PERSON,
} from "./models/room_state";
import { objectFastClone, safeCreateRoom } from "./utils";
import { assignAliasVariations } from "./utils/aliases";
import config from "./config";
import { MatrixRoom } from "./models/MatrixRoom";
import { Auditorium, AuditoriumBackstage } from "./models/Auditorium";
import { Talk } from "./models/Talk";
import { ResolvedPersonIdentifier } from "./invites";
import { IDbPerson, Role } from "./db/DbPerson";
import { PentaDb } from "./db/PentaDb";

export class Conference {
    private dbRoom: MatrixRoom;
    private pentaDb = new PentaDb();
    private auditoriums: {
        [auditoriumId: string]: Auditorium;
    } = {};
    private auditoriumBackstages: {
        [auditoriumId: string]: AuditoriumBackstage;
    } = {};
    private talks: {
        [talkId: string]: Talk;
    } = {};
    private interestRooms: {
        [interestId: string]: MatrixRoom;
    } = {};
    private people: {
        [personId: string]: IStoredPerson;
    } = {};

    constructor(public readonly id: string, public readonly client: MatrixClient) {
    }

    public get isCreated(): boolean {
        return !!this.dbRoom;
    }

    public get storedTalks(): Talk[] {
        return Object.values(this.talks);
    }

    public get storedAuditoriums(): Auditorium[] {
        return Object.values(this.auditoriums);
    }

    public get storedAuditoriumBackstages(): AuditoriumBackstage[] {
        return Object.values(this.auditoriumBackstages);
    }

    public get storedPeople(): IStoredPerson[] {
        return Object.values(this.people);
    }

    private reset() {
        this.dbRoom = null;
        this.auditoriums = {};
        this.auditoriumBackstages = {};
        this.talks = {};
        this.interestRooms = {};
        this.people = {};
    }

    public async construct() {
        this.reset();

        // Locate all the rooms for the conference
        const rooms = await this.client.getJoinedRooms();
        for (const room of rooms) {
            const createEvent = await this.client.getRoomStateEvent(room, "m.room.create", "");
            if (createEvent[RSC_CONFERENCE_ID] === this.id) {
                switch (createEvent[RSC_ROOM_KIND_FLAG]) {
                    case RoomKind.Conference:
                        this.dbRoom = new MatrixRoom(room, this.client, this);
                        break;
                    case RoomKind.Auditorium:
                        this.auditoriums[createEvent[RSC_AUDITORIUM_ID]] = new Auditorium(room, this.client, this);
                        break;
                    case RoomKind.AuditoriumBackstage:
                        this.auditoriumBackstages[createEvent[RSC_AUDITORIUM_ID]] = new AuditoriumBackstage(room, this.client, this);
                        break;
                    case RoomKind.Talk:
                        this.talks[createEvent[RSC_TALK_ID]] = new Talk(room, this.client, this);
                        break;
                    case RoomKind.SpecialInterest:
                        this.interestRooms[createEvent[RSC_SPECIAL_INTEREST_ID]] = new MatrixRoom(room, this.client, this);
                        break;
                    default:
                        break;
                }
            }
        }

        // Locate other metadata in the room
        if (!this.dbRoom) return;
        const dbState = (await this.client.getRoomState(this.dbRoom.roomId)).filter(s => !!s.content);

        const people = dbState.filter(s => s.type === RS_STORED_PERSON).map(s => s.content as IStoredPerson);
        for (const person of people) {
            this.people[person.pentaId] = person;
        }
    }

    public async createDb(conference: IConference) {
        if (this.dbRoom) {
            throw new Error("Conference has already been created");
        }

        const space = await this.client.unstableApis.createSpace({
            isPublic: true,
            localpart: config.conference.id,
            name: config.conference.name,
        });

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(CONFERENCE_ROOM_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
            },
            name: `[DB] Conference ${conference.title}`,
            initial_state: [
                makeStoredConference(this.id, conference),
                makeStoredSpace(space.roomId),
            ],
        }));

        this.dbRoom = new MatrixRoom(roomId, this.client, this);
    }

    public async getPentaDb(): Promise<PentaDb> {
        await this.pentaDb.connect();
        return this.pentaDb;
    }

    public async getSpace(): Promise<MSC1772Space> {
        return this.dbRoom.getSpace();
    }

    public async createAuditorium(auditorium: IAuditorium): Promise<Auditorium> {
        if (this.auditoriums[auditorium.id]) {
            return this.auditoriums[auditorium.id];
        }

        const audSpace = await this.client.unstableApis.createSpace({
            localpart: "space-" + config.conference.prefixes.aliases + auditorium.name,
            isPublic: true,
            name: auditorium.name,
        });
        await (await this.getSpace()).addChildSpace(audSpace);

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(AUDITORIUM_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_AUDITORIUM_ID]: auditorium.id,
            },
            initial_state: [
                makeStoredAuditorium(this.id, auditorium),
                makeParentRoom(this.dbRoom.roomId),
                makeStoredSpace(audSpace.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + auditorium.name);
        await this.dbRoom.addDirectChild(roomId);
        this.auditoriums[auditorium.id] = new Auditorium(roomId, this.client, this);

        // TODO: Send widgets after room creation
        // const widget = await LiveWidget.forAuditorium(this.auditoriums[auditorium.id], this.client);
        // await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        await audSpace.addChildRoom(roomId);

        // Now create the backstage
        const backstage = await this.createAuditoriumBackstage(auditorium);
        await audSpace.addChildRoom(backstage.roomId);

        return this.auditoriums[auditorium.id];
    }

    public async createAuditoriumBackstage(auditorium: IAuditorium): Promise<AuditoriumBackstage> {
        if (this.auditoriumBackstages[auditorium.id]) {
            return this.auditoriumBackstages[auditorium.id];
        }

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_AUDITORIUM_ID]: auditorium.id,
            },
            initial_state: [
                makeStoredAuditorium(this.id, auditorium),
                makeParentRoom(this.dbRoom.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + auditorium.name + "-backstage");
        await this.dbRoom.addDirectChild(roomId);
        this.auditoriumBackstages[auditorium.id] = new AuditoriumBackstage(roomId, this.client, this);

        return this.auditoriumBackstages[auditorium.id];
    }

    public async createTalk(talk: ITalk, auditorium: Auditorium): Promise<MatrixRoom> {
        if (this.talks[talk.id]) {
            return this.talks[talk.id];
        }

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(TALK_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_TALK_ID]: talk.id,
                [RSC_AUDITORIUM_ID]: await auditorium.getId(),
            },
            initial_state: [
                makeStoredTalk(this.id, talk),
                makeParentRoom(auditorium.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + (await auditorium.getName()) + '-' + talk.slug);
        await auditorium.addDirectChild(roomId);
        this.talks[talk.id] = new Talk(roomId, this.client, this);

        // TODO: Send widgets after creation
        // const widget = await LiveWidget.forTalk(this.talks[talk.id], this.client);
        // await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        await (await auditorium.getSpace()).addChildRoom(roomId);

        return this.talks[talk.id];
    }

    public async createUpdatePerson(person: IDbPerson): Promise<IStoredPerson> {
        const storedPerson = makeStoredPerson(this.id, person);
        await this.client.sendStateEvent(this.dbRoom.roomId, storedPerson.type, storedPerson.state_key, storedPerson.content);
        this.people[storedPerson.content.pentaId] = storedPerson.content;
        return this.people[storedPerson.content.pentaId];
    }

    public getPerson(personId: string): IStoredPerson {
        return this.people[personId];
    }

    public async getPeopleForAuditorium(auditorium: Auditorium): Promise<IDbPerson[]> {
        const db = await this.getPentaDb();
        return await this.resolvePeople(await db.findAllPeopleForAuditorium(await auditorium.getId()));
    }

    public async getPeopleForTalk(talk: Talk): Promise<IDbPerson[]> {
        const db = await this.getPentaDb();
        return await this.resolvePeople(await db.findAllPeopleForTalk(await talk.getId()));
    }

    public async getInviteTargetsForAuditorium(auditorium: Auditorium, backstage = false): Promise<IDbPerson[]> {
        const people = await this.getPeopleForAuditorium(auditorium);
        const roles = [Role.Coordinator, Role.Host];
        if (backstage) roles.push(Role.Speaker);
        return people.filter(p => roles.includes(p.event_role));
    }

    public async getInviteTargetsForTalk(talk: Talk): Promise<IDbPerson[]> {
        const people = await this.getPeopleForTalk(talk);
        const roles = [Role.Speaker, Role.Host];
        return people.filter(p => roles.includes(p.event_role));
    }

    public async getModeratorsForAuditorium(auditorium: Auditorium): Promise<IDbPerson[]> {
        const people = await this.getPeopleForAuditorium(auditorium);
        const roles = [Role.Coordinator];
        return people.filter(p => roles.includes(p.event_role));
    }

    public async getModeratorsForTalk(talk: Talk): Promise<IDbPerson[]> {
        const people = await this.getPeopleForTalk(talk);
        const roles = [Role.Coordinator, Role.Speaker, Role.Host];
        return people.filter(p => roles.includes(p.event_role));
    }

    private async resolvePeople(people: IDbPerson[]): Promise<IDbPerson[]> {
        // Clone people from the DB to avoid accidentally mutating caches
        people = people.map(p => objectFastClone(p))

        // Fill in any details we have that the database doesn't
        for (const person of people) {
            if (person.matrix_id) continue;
            const storedPerson = this.getPerson(person.person_id);
            if (storedPerson?.userId) {
                person.matrix_id = storedPerson.userId;
            }
        }

        // We don't do the final resolution because that can take too much time at this level
        // in the call chain
        return people;
    }

    public getAuditorium(audId: string): Auditorium {
        return this.auditoriums[audId];
    }

    public getAuditoriumBackstage(audId: string): AuditoriumBackstage {
        return this.auditoriumBackstages[audId];
    }

    public getTalk(talkId: string): Talk {
        return this.talks[talkId];
    }

    public async ensurePermissionsFor(people: ResolvedPersonIdentifier[], roomId: string): Promise<void> {
        const mxids = people.filter(t => !!t.mxid).map(r => r.mxid);

        // Now for the fun part: updating the power levels. We expect there to be sensible content
        // already, so we just need to update the people map. We need to not forget ourselves otherwise
        // we'll be unable to do promotions/demotions in the future.
        const pls = await this.client.getRoomStateEvent(roomId, "m.room.power_levels", "");
        pls['users'][await this.client.getUserId()] = 100;
        pls['users'][config.moderatorUserId] = 100;
        for (const userId of mxids) {
            if (pls['users'][userId]) continue;
            pls['users'][userId] = 50;
        }
        await this.client.sendStateEvent(roomId, "m.room.power_levels", "", pls);
    }
}
