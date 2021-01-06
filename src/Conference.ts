/*
Copyright 2020 The Matrix.org Foundation C.I.C.

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
    makeParentRoom,
    makeStoredAuditorium,
    makeStoredConference,
    makeStoredPublicPerson,
    makeStoredRole,
    makeStoredRoomMeta,
    makeStoredSpace,
    makeStoredTalk,
    RS_STORED_DB_PERSON,
    RS_STORED_ROLE,
    RS_STORED_ROOM_META
} from "./models/room_state";
import { safeCreateRoom } from "./utils";
import { assignAliasVariations } from "./utils/aliases";
import config from "./config";
import { MatrixRoom } from "./models/MatrixRoom";
import { Auditorium, AuditoriumBackstage } from "./models/Auditorium";
import { Talk } from "./models/Talk";
import { LiveWidget } from "./models/LiveWidget";
import { Role } from "./models/Role";
import { DbPerson } from "./models/DbPerson";
import { RoomMeta } from "./models/RoomMeta";
import { YamlPerson } from "./RolesYaml";
import { RoomMetadata } from "./models/room_meta";

export class Conference {
    private dbRoom: MatrixRoom;
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
    private roles: {
        [roleName: string]: Role;
    } = {};
    private people: {
        [personId: string]: DbPerson;
    } = {};
    private roomMeta: {
        [roomId: string]: RoomMeta;
    } = {};

    constructor(public readonly id: string, public readonly client: MatrixClient) {
    }

    public get isCreated(): boolean {
        return !!this.dbRoom;
    }

    public get storedRoles(): Role[] {
        return Object.values(this.roles);
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

    public get storedPeople(): DbPerson[] {
        return Object.values(this.people);
    }

    public get storedRoomMeta(): RoomMeta[] {
        return Object.values(this.roomMeta);
    }

    private reset() {
        this.dbRoom = null;
        this.auditoriums = {};
        this.auditoriumBackstages = {};
        this.talks = {};
        this.interestRooms = {};
        this.roles = {};
        this.people = {};
        this.roomMeta = {};
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

        const roles = dbState.filter(s => s.type === RS_STORED_ROLE).map(s => s.content);
        for (const role of roles) {
            this.roles[role.name] = new Role(role, this.dbRoom.roomId, this.client, this);
        }

        const people = dbState.filter(s => s.type === RS_STORED_DB_PERSON).map(s => s.content);
        for (const person of people) {
            this.people[person.id] = new DbPerson(person, this.client, this);
        }

        const metas = dbState.filter(s => s.type === RS_STORED_ROOM_META);
        for (const meta of metas) {
            this.roomMeta[meta.state_key] = new RoomMeta(meta.state_key, meta.content, this.client, this);
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

        const widget = await LiveWidget.forAuditorium(this.auditoriums[auditorium.id], this.client);
        await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        await audSpace.addChildRoom(roomId);

        // Now create the backstage
        await this.createAuditoriumBackstage(auditorium, audSpace);

        return this.auditoriums[auditorium.id];
    }

    private async createAuditoriumBackstage(auditorium: IAuditorium, space: MSC1772Space): Promise<AuditoriumBackstage> {
        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_AUDITORIUM_ID]: auditorium.id,
            },
            initial_state: [
                makeStoredAuditorium(this.id, auditorium),
                makeParentRoom(this.dbRoom.roomId),
                makeStoredSpace(space.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + auditorium.name + "-backstage");
        await this.dbRoom.addDirectChild(roomId);
        this.auditoriumBackstages[auditorium.id] = new AuditoriumBackstage(roomId, this.client, this);

        await space.addChildRoom(roomId);

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
                ...talk.speakers.map(s => makeStoredPublicPerson(this.id, s)),
                makeParentRoom(auditorium.roomId),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + (await auditorium.getName()) + '-' + talk.slug);
        await auditorium.addDirectChild(roomId);
        this.talks[talk.id] = new Talk(roomId, this.client, this);

        const widget = await LiveWidget.forTalk(this.talks[talk.id], this.client);
        await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        await (await auditorium.getSpace()).addChildRoom(roomId);

        return this.talks[talk.id];
    }

    public async createRole(name: string): Promise<Role> {
        if (this.roles[name]) {
            return this.roles[name];
        }

        const space = await (await this.getSpace()).createChildSpace({
            name: name,
            isPublic: false,
            localpart: "space-" + config.conference.prefixes.aliases + "-" + name,
        });

        const storedRole = makeStoredRole(name, space);
        await this.client.sendStateEvent(this.dbRoom.roomId, storedRole.type, storedRole.state_key, storedRole.content);

        this.roles[name] = new Role(storedRole.content, this.dbRoom.roomId, this.client, this);
        return this.roles[name];
    }

    public async createPerson(person: YamlPerson): Promise<DbPerson> {
        // We always update people
        const rsDbPerson = DbPerson.fromYaml(person);
        const dbPerson = new DbPerson(rsDbPerson, this.client, this);
        await this.client.sendStateEvent(this.dbRoom.roomId, dbPerson.stateEvent.type, dbPerson.stateEvent.state_key, dbPerson.stateEvent.content);
        this.people[person.id] = dbPerson;
        return this.people[person.id];
    }

    public async createRoomMeta(roomId: string, room: RoomMetadata): Promise<RoomMeta> {
        // We always update room metadata
        const meta = new RoomMeta(roomId, room, this.client, this);
        const rsMeta = makeStoredRoomMeta(roomId, room);
        await this.client.sendStateEvent(this.dbRoom.roomId, rsMeta.type, rsMeta.state_key, rsMeta.content);
        this.roomMeta[roomId] = meta;
        return this.roomMeta[roomId];
    }

}
