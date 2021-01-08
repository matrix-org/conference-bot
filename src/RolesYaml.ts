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

import config from "./config";
import { Conference } from "./Conference";
import * as path from "path";
import * as fs from "fs";
import * as YAML from "yaml";
import { RoleOrPerson, RoomMetadata } from "./models/room_meta";
import { asyncFilter, asyncFind, sha256 } from "./utils";
import { RoomMeta } from "./models/RoomMeta";
import { ALL_USEFUL_ROOM_KINDS, RoomKind } from "./models/room_kinds";

export interface YamlRole {
    name: string;
}

export interface YamlPerson {
    id: string;
    name: string;
    mxid?: string;
    emails?: string[];
    pentabarfId: string;
    roles: string[];
}

export interface YamlRoleSchema {
    roles: YamlRole[];
    people: YamlPerson[];
    rooms: {
        [roomId: string]: RoomMetadata;
    };
}

export class RolesYaml {
    public constructor(private conference: Conference) {
    }

    public async load(): Promise<void> {
        const fpath = path.join(config.dataPath, "roles.yaml");

        const parsed = YAML.parse(await fs.promises.readFile(fpath, 'utf-8'));
        if (!parsed) throw new Error("Invalid file");

        const roles = parsed['roles'];
        if (!Array.isArray(roles)) throw new Error("Invalid file: roles not an array");
        const roleNames = roles.map(r => r['name']).filter(r => !!r);

        const people = parsed['people'];
        if (!Array.isArray(people)) throw new Error("Invalid file: people not an array");
        const peopleById: { [personId: string]: YamlPerson } = {};
        for (const person of people) {
            if (!person) continue;
            const id = person['id'];
            const pentabarfId = person['pentabarfId'];
            const mxid = person['mxid'];
            const emails = person['emails'];
            const name = person['name'];
            const roles = person['roles'];

            if (!Array.isArray(roles)) throw new Error(`Person ${id} is invalid: roles not an array`);
            if ([id, name].some(i => !i)) throw new Error(`Person ${id} is invalid: missing ID or name`);
            if (!mxid && !emails) throw new Error(`Person ${id} is invalid: missing mxid or email`);
            if (emails && !Array.isArray(emails)) throw new Error(`Person ${id} is invalid: no emails`);
            if (!roles.every(r => roleNames.includes(r))) throw new Error(`Person ${id} is invalid: role not defined`);

            peopleById[id] = <YamlPerson>{id, pentabarfId, mxid, emails, name, roles};
        }

        const rooms = parsed['rooms'];
        if (!rooms || !Object.keys(rooms).length) throw new Error("Invalid file: rooms not object");
        const roomIds = Object.keys(rooms);
        for (const roomId of roomIds) {
            const room = rooms[roomId];
            if (!room) continue;

            const kind = room['kind'];
            const pentabarfId = room['pentabarfId'];
            const mxInvite = room['mxInvite'];
            const mxModerators = room['mxModerators'];
            let mxRequirePresent = room['mxRequirePresent'];

            if (!ALL_USEFUL_ROOM_KINDS.includes(kind)) throw new Error(`Room ${roomId} is invalid: unknown kind`);
            if (!Array.isArray(mxInvite)) throw new Error(`Room ${roomId} is invalid: missing mxInvite`);
            if (!Array.isArray(mxModerators)) throw new Error(`Room ${roomId} is invalid: missing mxModerators`);
            if (!Array.isArray(mxRequirePresent) && mxRequirePresent) throw new Error(`Room ${roomId} is invalid: missing mxRequirePresent`);

            if (!Array.isArray(mxRequirePresent)) mxRequirePresent = [];

            const checkPersonRoleCombo = (i: RoleOrPerson) => {
                if (i.person && i.role) throw new Error("Cannot define both a person and a role");
                if (!i.person && !i.role) throw new Error("Missing person or role");

                if (i.person && !peopleById[i.person]) throw new Error(`Person ${i.person} not found`);
                if (i.role && !roleNames.includes(i.role)) throw new Error(`Role ${i.role} not found`);
            }
            mxInvite.forEach(checkPersonRoleCombo);
            mxModerators.forEach(checkPersonRoleCombo);
            mxRequirePresent.forEach(checkPersonRoleCombo);
        }

        // Now actually import

        for (const role of roleNames) {
            await this.conference.createRole(role);
        }
        for (const person of Object.values(peopleById)) {
            await this.conference.createPerson(person);
        }
        for (const roomId of roomIds) {
            const room = rooms[roomId];
            await this.conference.createRoomMeta(roomId, room);
        }
    }

    public async save(): Promise<string> {
        const fpath = path.join(config.dataPath, "roles.yaml");

        const roles = this.conference.storedRoles.map(r => (<YamlRole>{name: r.name}));
        if (!roles.length) {
            // create default roles
            roles.push({name: "staff"});
            roles.push({name: "volunteers"});
            roles.push({name: "vendors"});
            roles.push({name: "managers"});
            roles.push({name: "speakers"});
            roles.push({name: "moderators"});
        }

        const people = this.conference.storedPeople.map(p => p.yaml);
        const obj: YamlRoleSchema = {
            roles: roles,
            people: people,
            rooms: {},
        };

        const talks = this.conference.storedTalks;
        const auditoriums = this.conference.storedAuditoriums;
        const audBackstages = this.conference.storedAuditoriumBackstages;
        const metas = this.conference.storedRoomMeta;

        // Iterate over the auditoriums to link up the talks properly
        for (const aud of auditoriums) {
            const backstage = await asyncFind(audBackstages, async i => (await i.getId()) === (await aud.getId()));
            if (!backstage) throw new Error(`Failed to find backstage for auditorium: ${aud.roomId}`);

            const allSpeakerIds: string[] = [];
            const audTalks = await asyncFilter(talks, async i => (await i.getAuditoriumId()) === (await aud.getId()));
            for (const talk of audTalks) {
                const talkSpeakerIds: string[] = [];
                const speakers = await talk.getSpeakers();
                for (const speaker of speakers) {
                    let person = people.find(p => p.pentabarfId === speaker.id);
                    if (!person) {
                        const yPerson: YamlPerson = {
                            id: sha256(speaker.conferenceId + speaker.id + speaker.name + Date.now()),
                            pentabarfId: speaker.id,
                            mxid: null,
                            emails: [],
                            name: speaker.name,
                            roles: ["speakers"],
                        };
                        people.push(yPerson);
                        person = yPerson;
                    }
                    talkSpeakerIds.push(person.id);
                    allSpeakerIds.push(person.id);
                }

                let talkMeta = metas.find(m => m.forRoomId === talk.roomId);
                if (!talkMeta) {
                    talkMeta = new RoomMeta(talk.roomId, {
                        kind: RoomKind.Talk,
                        mxInvite: [
                            ...talkSpeakerIds.map(s => ({person: s})),
                            {role: "staff"},
                        ],
                        mxModerators: [
                            ...talkSpeakerIds.map(s => ({person: s})),
                            {role: "staff"},
                        ],
                        mxRequirePresent: [
                            ...talkSpeakerIds.map(s => ({person: s})),
                        ],
                        pentabarfId: await talk.getId(),
                    }, this.conference.client, this.conference);
                }

                obj.rooms[talk.roomId] = talkMeta.meta;
            }

            const makeAudMeta = (forRoomId: string, kind: RoomKind, pid: string): RoomMeta => {
                return new RoomMeta(forRoomId, {
                    kind: kind,
                    mxInvite: [
                        ...allSpeakerIds.map(s => ({person: s})),
                        {role: "staff"},
                    ],
                    mxModerators: [
                        ...allSpeakerIds.map(s => ({person: s})),
                        {role: "staff"},
                    ],
                    pentabarfId: pid,
                }, this.conference.client, this.conference);
            };

            let audMeta = metas.find(m => m.forRoomId === aud.roomId);
            let backstageMeta = metas.find(m => m.forRoomId === backstage.roomId);
            if (!audMeta) audMeta = makeAudMeta(aud.roomId, RoomKind.Auditorium, await aud.getId());
            if (!backstageMeta) backstageMeta = makeAudMeta(backstage.roomId, RoomKind.AuditoriumBackstage, await backstage.getId());

            obj.rooms[aud.roomId] = {
                ...audMeta.meta,
                kind: RoomKind.Auditorium,
                pentabarfId: await aud.getId(),
            };
            obj.rooms[backstage.roomId] = {
                ...backstageMeta.meta,
                kind: RoomKind.Auditorium,
                pentabarfId: await backstage.getId(),
            };
        }

        const result = YAML.stringify(obj);
        await fs.promises.writeFile(fpath, result, "utf-8");
        return fpath;
    }
}
