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

import { LogLevel, LogService, MatrixClient, RoomAlias, Space } from "matrix-bot-sdk";
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
    RSC_TALK_ID, RS_LOCATOR, SPECIAL_INTEREST_CREATION_TEMPLATE,
    TALK_CREATION_TEMPLATE
} from "./models/room_kinds";
import { IAuditorium, IConference, IInterestRoom, IPerson, ITalk, Role } from "./models/schedule";
import {
    IStoredSubspace,
    makeAssociatedSpace,
    makeAuditoriumBackstageLocator,
    makeAuditoriumLocator,
    makeDbLocator,
    makeInterestLocator,
    makeRootSpaceLocator,
    makeStoredPersonOverride,
    makeTalkLocator,
    RS_3PID_PERSON_ID,
    RS_STORED_PERSON,
    RS_STORED_SUBSPACE,
} from "./models/room_state";
import { makeDisplayName, objectFastClone, safeCreateRoom } from "./utils";
import { addAndDeleteManagedAliases, assignAliasVariations, calculateAliasVariations, makeLocalpart } from "./utils/aliases";
import config from "./config";
import { MatrixRoom } from "./models/MatrixRoom";
import { Auditorium, AuditoriumBackstage } from "./models/Auditorium";
import { Talk } from "./models/Talk";
import { ResolvedPersonIdentifier, resolveIdentifiers } from "./invites";
import { PentaDb } from "./backends/penta/db/PentaDb";
import { PermissionsCommand } from "./commands/PermissionsCommand";
import { InterestRoom } from "./models/InterestRoom";
import { IStateEvent } from "./models/room_state";
import { logMessage } from "./LogProxy";
import { IScheduleBackend } from "./backends/IScheduleBackend";
import { PentaBackend } from "./backends/penta/PentaBackend";
import { setUnion } from "./utils/sets";

export class Conference {
    private rootSpace: Space | null;
    private dbRoom: MatrixRoom | null;
    // TODO This shouldn't be here.
    private pentaDb: PentaDb | null = null;
    private subspaces: {
        [subspaceId: string]: Space
    } = {};
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
        [interestId: string]: InterestRoom;
    } = {};

    /**
     * Overrides of people. Used to e.g. associate someone's Matrix ID after registration through the e-mail invitation.
     */
    private people: {
        [personId: string]: IPerson;
    } = {};

    constructor(public readonly backend: IScheduleBackend, public readonly id: string, public readonly client: MatrixClient) {
        this.client.on("room.event", async (roomId: string, event) => {
            if (event['type'] === 'm.room.member' && event['content']?.['third_party_invite']) {
                const emailInviteToken = event['content']['third_party_invite']['signed']?.['token'];
                const emailInvite = await this.client.getRoomStateEvent(roomId, "m.room.third_party_invite", emailInviteToken);
                if (emailInvite[RS_3PID_PERSON_ID]) {
                    // We have enough information to know that we probably sent the invite, but
                    // to be sure we'll grab the whole room state and check the senders of the
                    // create event and 3pid invite.
                    const state = await this.client.getRoomState(roomId);
                    const verifiableCreateEvent = state.find(e => e['type'] === 'm.room.create');
                    const verifiable3pidInvite = state.find(e => e['type'] === 'm.room.third_party_invite' && e['state_key'] === emailInviteToken);
                    if (verifiableCreateEvent?.['sender'] === (await this.client.getUserId())) {
                        if (verifiable3pidInvite?.['sender'] === (await this.client.getUserId())) {
                            // Alright, we know it's us who sent it. Now let's check the database.
                            const people = await this.findPeopleWithId(emailInvite[RS_3PID_PERSON_ID]);
                            if (people?.length) {
                                // Finally, associate the users.
                                for (const person of people) {
                                    const clonedPerson = objectFastClone(person);
                                    clonedPerson.matrix_id = event['state_key'];
                                    await this.createUpdatePerson(clonedPerson);
                                    LogService.info("Conference", `Updated ${clonedPerson.id} to be associated with ${clonedPerson.matrix_id}`);
                                }

                                // Update permissions while we're here (if we can identify the room kind)
                                const aud = this.storedAuditoriums.find(a => a.roomId === roomId);
                                if (aud) {
                                    const mods = await this.getModeratorsForAuditorium(aud);
                                    const resolved = await resolveIdentifiers(mods);
                                    await PermissionsCommand.ensureModerator(this.client, roomId, resolved);
                                } else {
                                    const audBackstage = this.storedAuditoriumBackstages.find(a => a.roomId === roomId);
                                    if (audBackstage) {
                                        const mods = await this.getModeratorsForAuditorium(audBackstage);
                                        const resolved = await resolveIdentifiers(mods);
                                        await PermissionsCommand.ensureModerator(this.client, roomId, resolved);
                                    } else {
                                        const talk = this.storedTalks.find(a => a.roomId === roomId);
                                        if (talk) {
                                            const mods = await this.getModeratorsForTalk(talk);
                                            const resolved = await resolveIdentifiers(mods);
                                            await PermissionsCommand.ensureModerator(this.client, roomId, resolved);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    public get isCreated(): boolean {
        return !!this.dbRoom && !!this.rootSpace;
    }

    public get hasDbRoom(): boolean {
        return !!this.dbRoom;
    }

    public get hasRootSpace(): boolean {
        return !!this.rootSpace;
    }

    /**
     * Returns all detected talk rooms for this conference.
     * (Note that since physical auditoriums don't have any talk rooms, there won't be any results for talks
     * in physical auditoriums here.)
     */
    public get storedTalks(): Talk[] {
        return Object.values(this.talks);
    }

    public get storedAuditoriums(): Auditorium[] {
        return Object.values(this.auditoriums);
    }

    public get storedAuditoriumBackstages(): AuditoriumBackstage[] {
        return Object.values(this.auditoriumBackstages);
    }

    public get storedPeople(): IPerson[] {
        return Object.values(this.people);
    }

    public get storedInterestRooms(): InterestRoom[] {
        return Object.values(this.interestRooms);
    }

    private reset() {
        this.dbRoom = null;
        this.subspaces = {};
        this.auditoriums = {};
        this.auditoriumBackstages = {};
        this.talks = {};
        this.interestRooms = {};
    }

    public async construct() {
        this.reset();

        if (this.backend instanceof PentaBackend) {
            // TODO this is not nice.
            this.pentaDb = this.backend.db;
        }

        // Locate all the rooms for the conference
        const roomIds = await this.client.getJoinedRooms();
        const batchSize = 20;
        for (let i = 0; i < roomIds.length; i += batchSize) {
            // Process batches of rooms in parallel, since there may be a few hundred
            const tasks = roomIds.slice(i, i + batchSize).map(
                async roomId => {
                    let locatorEvent;
                    try {
                        locatorEvent = await this.client.getRoomStateEvent(roomId, RS_LOCATOR, "");
                    } catch (err) {
                        LogService.info("Conference", `Can't read locator in room: ${JSON.stringify(err)}`)
                        return;
                    }

                    if (locatorEvent[RSC_CONFERENCE_ID] === this.id) {
                        switch (locatorEvent[RSC_ROOM_KIND_FLAG]) {
                            case RoomKind.ConferenceSpace:
                                this.rootSpace = new Space(roomId, this.client);
                                break;
                            case RoomKind.ConferenceDb:
                                this.dbRoom = new MatrixRoom(roomId, this.client, this);
                                break;
                            case RoomKind.Auditorium:
                                const auditoriumId = locatorEvent[RSC_AUDITORIUM_ID];
                                if (this.backend.auditoriums.has(auditoriumId)) {
                                    this.auditoriums[auditoriumId] = new Auditorium(roomId, this.backend.auditoriums.get(auditoriumId)!, this.client, this);
                                }
                                break;
                            case RoomKind.AuditoriumBackstage:
                                const auditoriumBsId = locatorEvent[RSC_AUDITORIUM_ID];
                                if (this.backend.auditoriums.has(auditoriumBsId)) {
                                    this.auditoriumBackstages[auditoriumBsId] = new AuditoriumBackstage(roomId, this.backend.auditoriums.get(auditoriumBsId)!, this.client, this);
                                }
                                break;
                            case RoomKind.Talk:
                                const talkId = locatorEvent[RSC_TALK_ID];
                                if (this.backend.talks.has(talkId)) {
                                    this.talks[talkId] = new Talk(roomId, this.backend.talks.get(talkId)!, this.client, this);
                                }
                                break;
                            case RoomKind.SpecialInterest:
                                const interestId = locatorEvent[RSC_SPECIAL_INTEREST_ID];
                                if (this.backend.interestRooms.has(interestId)) {
                                    this.interestRooms[interestId] = new InterestRoom(roomId, this.client, this, interestId);
                                }
                                break;
                            default:
                                break;
                        }
                    }
                }
            );
            await Promise.all(tasks);
        }

        // Resolve pre-existing interest rooms
        for (const interestId in config.conference.existingInterestRooms) {
            if (interestId in this.interestRooms) {
                continue;
            }

            const roomIdOrAlias = config.conference.existingInterestRooms[interestId];
            let roomId: string;
            try {
                roomId = await this.client.resolveRoom(roomIdOrAlias);
            } catch (e) {
                // The room probably doesn't exist yet.
                continue;
            }

            this.interestRooms[interestId] = new InterestRoom(roomId, this.client, this, interestId);
        }

        // Locate other metadata in the room
        if (!this.dbRoom) return;
        const dbState = (await this.client.getRoomState(this.dbRoom.roomId)).filter(s => !!s.content);

        // Load person overrides
        const people = dbState.filter(s => s.type === RS_STORED_PERSON).map(s => s.content as IPerson);
        for (const person of people) {
            this.people[person.id] = person;
        }

        // Locate created subspaces
        const subspaceEvents = dbState.filter(
            event => event.type === RS_STORED_SUBSPACE
        ) as IStateEvent<IStoredSubspace>[];
        for (const subspaceEvent of subspaceEvents) {
            const roomId = subspaceEvent.content.roomId;
            this.subspaces[subspaceEvent.state_key] = await this.client.getSpace(roomId);
        }
    }

    /**
     * Creates the top-level space for the conference.
     */
    public async createRootSpace() {
        if (! this.rootSpace) {
            const space = await this.client.createSpace({
                isPublic: true,
                localpart: config.conference.id,
                name: config.conference.name,
            });

            const spaceLocator = makeRootSpaceLocator(config.conference.id);
            await this.client.sendStateEvent(space.roomId, spaceLocator.type, spaceLocator.state_key, spaceLocator.content);

            // Ensure that the space can be viewed by guest users.
            await this.client.sendStateEvent(
                space.roomId,
                "m.room.guest_access",
                "",
                {guest_access:"can_join"},
            );

            this.rootSpace = space;
        }
    }

    /**
     * Creates the data store room for the conference.
     * @param conference The description of the conference.
     */
    public async createDb(conference: IConference) {
        if (!this.dbRoom) {
            const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(CONFERENCE_ROOM_CREATION_TEMPLATE, {
                creation_content: {
                    [RSC_CONFERENCE_ID]: this.id,
                },
                name: `[DB] Conference ${conference.title}`,
                initial_state: [
                    makeDbLocator(this.id),
                ],
            }));

            this.dbRoom = new MatrixRoom(roomId, this.client, this);
        }
    }

    public async getPentaDb(): Promise<PentaDb | null> {
        if (this.pentaDb === null) return null;
        await this.pentaDb.connect();
        return this.pentaDb;
    }

    public async getSpace(): Promise<Space | null> {
        return this.rootSpace;
    }

    /**
     * Creates the support rooms for the conference.
     */
    public async createSupportRooms() {
        const roomAliases = [
            config.conference.supportRooms.speakers,
            config.conference.supportRooms.specialInterest,
            config.conference.supportRooms.coordinators,
        ];

        const rootSpace = await this.getSpace();
        if (!rootSpace) {
            throw new Error("Can't create support rooms: No root space");
        }

        for (const alias of roomAliases) {
            // Skip aliases that aren't configured.
            if (alias == null) continue;
            try {
                await this.client.resolveRoom(alias);
            } catch (e1) {
                // The room doesn't exist yet, probably.
                try {
                    const roomId = await safeCreateRoom(
                        this.client,
                        mergeWithCreationTemplate(AUDITORIUM_BACKSTAGE_CREATION_TEMPLATE, {
                            room_alias_name: (new RoomAlias(alias)).localpart,
                            invite: [config.moderatorUserId],
                        }),
                    );
                    await rootSpace.addChildRoom(roomId);
                } catch (e) {
                    throw {
                        message: `Error whilst creating ${alias}: ${JSON.stringify(e?.body)}. Tried to create the room because failed to resolve it: ${JSON.stringify(e1?.body)}`,
                        cause: e,
                        cause2: e1,
                    };
                }

            }
        }
    }

    /**
     * Creates a subspace defined in the bot config.
     * @param subspaceId The id of the subspace.
     * @param name The display name of the subspace.
     * @param aliasLocalpart The localpart of the subspace's alias.
     * @returns The newly created subspace.
     */
    public async createSubspace(
        subspaceId: string, name: string, aliasLocalpart: string
    ): Promise<Space> {
        const rootSpace = await this.getSpace();
        if (!rootSpace) {
            throw new Error("Can't create subspace: No root space");
        }
        if (!this.dbRoom) {
            throw new Error("createSubspace: No DB room!");
        }

        let subspace: Space;
        if (!this.subspaces[subspaceId]) {
            subspace = await this.client.createSpace({
                isPublic: true,
                localpart: "space-" + config.conference.prefixes.aliases + aliasLocalpart,
                name: name,
                invites: [config.moderatorUserId],
            });
            this.subspaces[subspaceId] = subspace;

            await this.client.sendStateEvent(this.dbRoom.roomId, RS_STORED_SUBSPACE, subspaceId, {
                roomId: subspace.roomId,
            } as IStoredSubspace);

            // Grants PL100 to the moderator in the subspace.
            // We can't do this directly with `createSpace` unfortunately, as we could for plain rooms.
            await this.client.setUserPowerLevel(config.moderatorUserId, subspace.roomId, 100);
        } else {
            subspace = this.subspaces[subspaceId];
        }

        // Ensure that the subspace appears within the conference space.
        await rootSpace.addChildSpace(subspace);

        // Ensure that the subspace can be viewed by guest users.
        await this.client.sendStateEvent(
            subspace.roomId,
            "m.room.guest_access",
            "",
            {guest_access:"can_join"},
        );

        return subspace;
    }

    public async createInterestRoom(interestRoom: IInterestRoom): Promise<InterestRoom> {
        let roomId: string;
        if (!this.interestRooms[interestRoom.id]) {
            if (interestRoom.id in config.conference.existingInterestRooms) {
                // Resolve a pre-existing room that has been created after the bot started up.
                const roomIdOrAlias = config.conference.existingInterestRooms[interestRoom.id];
                roomId = await this.client.resolveRoom(roomIdOrAlias);
                this.interestRooms[interestRoom.id] = new InterestRoom(
                    roomId, this.client, this, interestRoom.id
                );
            } else {
                // Create a new interest room.
                roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(SPECIAL_INTEREST_CREATION_TEMPLATE, {
                    creation_content: {
                        [RSC_CONFERENCE_ID]: this.id,
                        [RSC_SPECIAL_INTEREST_ID]: interestRoom.id,
                    },
                    initial_state: [
                        makeInterestLocator(this.id, interestRoom.id),
                    ],
                }));
                await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + interestRoom.name, interestRoom.id);
                this.interestRooms[interestRoom.id] = new InterestRoom(
                    roomId,
                    this.client,
                    this,
                    interestRoom.id,
                );
            }
        } else {
            // The interest room already exists, either because the conference has already been
            // built, or a pre-existing room is being reused as an interest room.
            roomId = this.interestRooms[interestRoom.id].roomId;
        }

        // Ensure that widget modification is restricted to admins.
        // TODO: Handle missing or malformed `m.room.power_levels` events from pre-existing rooms.
        const powerLevels = await this.client.getRoomStateEvent(roomId, "m.room.power_levels", "");
        powerLevels.events ||= {};
        powerLevels.events["im.vector.modular.widgets"] = 100;
        await this.client.sendStateEvent(roomId, "m.room.power_levels", "", powerLevels);

        // Ensure that the room appears within the correct space.
        const parentSpace = await this.getDesiredParentSpace(interestRoom);
        await parentSpace.addChildRoom(roomId, { order: `interest-${interestRoom.id}` });

        // In the future we may want to ensure that aliases are set in accordance with the
        // config.

        return this.interestRooms[interestRoom.id];
    }

    /**
     * Creates an auditorium space, room and backstage room.
     *
     * The auditorium space's children are ordered as follows:
     *  1. auditorium room
     *  2. backstage room
     *  3. talk rooms, ordered by timestamp, ascending
     *
     * @param auditorium The description of the auditorium.
     * @returns The newly created `Auditorium`.
     */
    public async createAuditorium(auditorium: IAuditorium): Promise<Auditorium> {
        if (this.auditoriums[auditorium.id]) {
            return this.auditoriums[auditorium.id];
        }

        const parentSpace = await this.getDesiredParentSpace(auditorium);
        const spaceName = "space-" + config.conference.prefixes.aliases + auditorium.slug;
        let audSpace;
        try {
            audSpace = await this.client.createSpace({
                localpart: makeLocalpart(
                    spaceName, auditorium.id
                ),
                isPublic: true,
                name: makeDisplayName(auditorium.name, auditorium.id),
            });
            // Ensure that the space can be viewed by guest users.
            await this.client.sendStateEvent(
                audSpace.roomId,
                "m.room.guest_access",
                "",
                {guest_access:"can_join"},
            );
        } catch (e) {
            await logMessage(LogLevel.ERROR, "utils", `Can't create space #${spaceName}: ${e}!`);
            throw e;
        }

        await parentSpace.addChildSpace(audSpace, { order: `auditorium-${auditorium.id}` });

        const roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(AUDITORIUM_CREATION_TEMPLATE, {
            creation_content: {
                [RSC_CONFERENCE_ID]: this.id,
                [RSC_AUDITORIUM_ID]: auditorium.id,
            },
            initial_state: [
                makeAuditoriumLocator(this.id, auditorium.id),
                makeAssociatedSpace(audSpace.roomId),
            ],
            name: auditorium.name,
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + auditorium.slug, auditorium.id);
        this.auditoriums[auditorium.id] = new Auditorium(roomId, auditorium, this.client, this);

        // TODO: Send widgets after room creation
        // const widget = await LiveWidget.forAuditorium(this.auditoriums[auditorium.id], this.client);
        // await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        await audSpace.addChildRoom(roomId, { order: "1-auditorium" });

        // Now create the backstage
        const backstage = await this.createAuditoriumBackstage(auditorium);
        await audSpace.addChildRoom(backstage.roomId, { order: "2-backstage" });

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
                makeAuditoriumBackstageLocator(this.id, auditorium.id),
            ],
        }));
        await assignAliasVariations(this.client, roomId, config.conference.prefixes.aliases + auditorium.slug + "-backstage", auditorium.id);
        this.auditoriumBackstages[auditorium.id] = new AuditoriumBackstage(roomId, auditorium, this.client, this);

        return this.auditoriumBackstages[auditorium.id];
    }

    public async createTalk(talk: ITalk, auditorium: Auditorium): Promise<MatrixRoom> {
        let roomId: string;

        const auditoriumSpace = await auditorium.getAssociatedSpace();
        if (!auditoriumSpace) {
            throw new Error(`Can't create talk ${talk.id} in ${talk.auditoriumId}: No auditorium container space`);
        }

        if (!this.talks[talk.id]) {
            roomId = await safeCreateRoom(this.client, mergeWithCreationTemplate(TALK_CREATION_TEMPLATE, {
                name: talk.title,
                creation_content: {
                    [RSC_CONFERENCE_ID]: this.id,
                    [RSC_TALK_ID]: talk.id,
                    [RSC_AUDITORIUM_ID]: await auditorium.getId(),
                },
                initial_state: [
                    makeTalkLocator(this.id, talk.id),
                ],
            }));
            this.talks[talk.id] = new Talk(roomId, talk, this.client, this);
        } else {
            roomId = this.talks[talk.id].roomId;

            // Ensure that the room has the correct name.
            await this.client.sendStateEvent(roomId, "m.room.name", "", {name: talk.title});
        }

        // Calculate all the aliases the room should have, then update the list of bot-assigned aliases to match
        const aliasesToAssign = setUnion(
            calculateAliasVariations(config.conference.prefixes.aliases + (await auditorium.getSlug()) + '-' + talk.slug),
            calculateAliasVariations(config.conference.prefixes.aliases + 'talk-' + talk.id)
        );
        await addAndDeleteManagedAliases(this.client, roomId, aliasesToAssign);

        // TODO: Send widgets after creation
        // const widget = await LiveWidget.forTalk(this.talks[talk.id], this.client);
        // await this.client.sendStateEvent(roomId, widget.type, widget.state_key, widget.content);

        // Ensure that the room appears within the correct space.
        const startTime = new Date(talk.startTime).toISOString();
        await auditoriumSpace.addChildRoom(roomId, { order: `3-talk-${startTime}` });

        return this.talks[talk.id];
    }

    public async createUpdatePerson(person: IPerson): Promise<IPerson> {
        if (!this.dbRoom) {
            throw new Error("createUpdatePerson: No DB room!");
        }

        const storedPerson = makeStoredPersonOverride(person);
        await this.client.sendStateEvent(this.dbRoom.roomId, storedPerson.type, storedPerson.state_key, storedPerson.content);
        this.people[storedPerson.content.id] = storedPerson.content;
        return this.people[storedPerson.content.id];
    }

    /**
     * Determines the space in which an auditorium space or interest room should reside.
     * @param auditoriumOrInterestRoom The description of the auditorium or interest room.
     * @returns The space in which the auditorium or interest room should reside.
     */
    public async getDesiredParentSpace(
        auditoriumOrInterestRoom: IAuditorium | IInterestRoom
    ): Promise<Space> {
        const rootSpace = await this.getSpace();
        if (!rootSpace) {
            throw new Error(`Can't decide on parent space for ${auditoriumOrInterestRoom.kind}:${auditoriumOrInterestRoom.id}: No root space`);
        }

        const id = auditoriumOrInterestRoom.id;

        for (const [subspaceId, subspaceConfig] of Object.entries(config.conference.subspaces)) {
            for (const prefix of subspaceConfig.prefixes) {
                if (id.startsWith(prefix)) {
                    if (!(subspaceId in this.subspaces)) {
                        throw new Error(`The ${subspaceId} subspace has not been created yet!`);
                    }

                    return this.subspaces[subspaceId];
                }
            }
        }

        // Default to the top-level conference space.
        return rootSpace;
    }

    public getPerson(personId: string): IPerson {
        return this.people[personId];
    }

    public async getPeopleForAuditorium(auditorium: Auditorium): Promise<IPerson[]> {
        const audit = await auditorium.getDefinition();
        const people: IPerson[] = [];
        for (const t of Object.values(this.talks)) {
            const talk = await t.getDefinition();
            if (talk.auditoriumId == audit.id) {
                people.push(...talk.speakers);
            }
        }
        return people;
    }

    public async getPeopleForTalk(talk: Talk): Promise<IPerson[]> {
        const db = await this.getPentaDb();
        if (db !== null) {
            return await this.resolvePeople(await db.findAllPeopleForTalk(await talk.getId()));
        }

        return talk.getSpeakers();
    }

    public async getPeopleForInterest(int: InterestRoom): Promise<IPerson[]> {
        const db = await this.getPentaDb();
        if (db !== null) {
            // Yes, an interest room is an auditorium to Penta.
            return await this.resolvePeople(await db.findAllPeopleForAuditorium(await int.getId()));
        }

        return [];
    }

    public async getInviteTargetsForAuditorium(auditorium: Auditorium, backstage = false): Promise<IPerson[]> {
        const people = await this.getPeopleForAuditorium(auditorium);
        const roles = [Role.Coordinator, Role.Host, Role.Speaker];
        return people.filter(p => roles.includes(p.role));
    }

    public async getInviteTargetsForTalk(talk: Talk): Promise<IPerson[]> {
        const people = await this.getPeopleForTalk(talk);
        const roles = [Role.Speaker, Role.Host, Role.Coordinator];
        return people.filter(p => roles.includes(p.role));
    }

    public async getInviteTargetsForInterest(int: InterestRoom): Promise<IPerson[]> {
        const people = await this.getPeopleForInterest(int);
        const roles = [Role.Speaker, Role.Host, Role.Coordinator];
        return people.filter(p => roles.includes(p.role));
    }

    public async getModeratorsForAuditorium(auditorium: Auditorium): Promise<IPerson[]> {
        const people = await this.getPeopleForAuditorium(auditorium);
        const roles = [Role.Coordinator];
        return people.filter(p => roles.includes(p.role));
    }

    public async getModeratorsForTalk(talk: Talk): Promise<IPerson[]> {
        const people = await this.getPeopleForTalk(talk);
        const roles = [Role.Coordinator, Role.Speaker, Role.Host];
        return people.filter(p => roles.includes(p.role));
    }

    public async getModeratorsForInterest(int: InterestRoom): Promise<IPerson[]> {
        const people = await this.getPeopleForInterest(int);
        const roles = [Role.Host, Role.Coordinator];
        return people.filter(p => roles.includes(p.role));
    }

    private async resolvePeople(people: IPerson[]): Promise<IPerson[]> {
        // Clone people from the DB to avoid accidentally mutating caches
        people = people.map(p => objectFastClone(p))

        // Fill in any details we have that the database doesn't
        for (const person of people) {
            if (person.matrix_id) continue;
            const storedPerson = this.getPerson(person.id);
            if (storedPerson?.matrix_id) {
                person.matrix_id = storedPerson.matrix_id;
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

    public getTalk(talkId: string): Talk | undefined {
        return this.talks[talkId];
    }

    public getInterestRoom(intId: string): InterestRoom {
        return this.interestRooms[intId];
    }

    public async ensurePermissionsFor(people: ResolvedPersonIdentifier[], roomId: string): Promise<void> {
        const mxids = people.filter(t => !!t.mxid).map(r => r.mxid!);

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

    /**
     * Gets talks with upcoming events, where the event timestamp is defined by a lambda.
     */
    private async getUpcomingTalksByLambda(lambda: (talk: ITalk) => number | null, inNextMinutes: number, minBefore: number): Promise<ITalk[]> {
        const from = Date.now() - minBefore * 60000;
        const until = Date.now() + inNextMinutes * 60000;

        const upcomingTalks: ITalk[] = [];
        for (const t of Object.values(this.talks)) {
            const talk = await t.getDefinition();
            const talkEventTime = lambda(talk);
            // If null is returned then the talk does not have this event, so don't return it as upcoming.
            if (talkEventTime === null) continue;

            if (talkEventTime >= from && talkEventTime <= until) {
                upcomingTalks.push(talk);
            }
        }
        return upcomingTalks;
    }

    public async getUpcomingTalkStarts(inNextMinutes: number, minBefore: number): Promise<ITalk[]> {
        return this.getUpcomingTalksByLambda(talk => talk.startTime, inNextMinutes, minBefore);
    }

    public async getUpcomingQAStarts(inNextMinutes: number, minBefore: number): Promise<ITalk[]> {
        return this.getUpcomingTalksByLambda(talk => talk.qa_startTime, inNextMinutes, minBefore);
    }

    public async getUpcomingTalkEnds(inNextMinutes: number, minBefore: number): Promise<ITalk[]> {
        return this.getUpcomingTalksByLambda(talk => talk.endTime, inNextMinutes, minBefore);
    }

    public async findPeopleWithId(personId: string): Promise<IPerson[]> {
        // TODO
        const db = await this.getPentaDb();
        if (db !== null) {
            return await db.findPeopleWithId(personId);
        }

        return [];
    }
}
