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

import { ICommand } from "./ICommand";
import { MatrixClient } from "matrix-bot-sdk";
import * as fetch from "node-fetch";
import { simpleHtmlReply, simpleReply } from "../utils";
import { PentabarfParser } from "../parsers/PentabarfParser";
import { ACD_CURRENT_EVENT, ACD_EVENTS_INDEX, ICurrentEventContent, IEventsIndexContent } from "../models/account_data";
import {
    dtoToInitialState,
    makeChildRoom,
    makeParentRoom,
    makeStoredConference,
    makeStoredEvent,
    makeStoredPerson,
    makeStoredRoom,
    RSC_CONFERENCE_ROOM_FLAG
} from "../models/room_state";
import {
    INITIAL_EVENT_ROOM_CREATION_TEMPLATE,
    mergeWithCreationTemplate,
    PRIMARY_ROOM_CREATION_TEMPLATE
} from "../models/room_kinds";
import { IEvent } from "../models/schedule";

export class CreateCommand implements ICommand {
    public readonly prefixes = ["create", "c"];

    public async run(client: MatrixClient, roomId: string, event: any, args: string[]) {
        if (!args[0]) {
            return simpleReply(client, roomId, event, "Missing pentabarf schedule URL.");
        }

        await client.sendReadReceipt(roomId, event['event_id']);

        const xml = await fetch(args[0]).then(r => r.text());
        const parsed = new PentabarfParser(xml);

        const baseConferenceId = parsed.conference.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        let conferenceId = parsed.conference.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const knownEvents = await client.getSafeAccountData(ACD_EVENTS_INDEX, <IEventsIndexContent>{events: []});
        let i = 1;
        while (knownEvents.events.includes(conferenceId)) {
            conferenceId = `${baseConferenceId}-${i++}`;
        }

        await simpleHtmlReply(client, roomId, event, `Creating event with ID <code>${conferenceId}</code> (this might take a while).`);

        const roomState = [];
        for (const person of parsed.speakers) {
            roomState.push(makeStoredPerson(conferenceId, person));
        }
        for (const event of parsed.events) {
            roomState.push(makeStoredEvent(conferenceId, event));
        }
        for (const room of parsed.rooms) {
            roomState.push(makeStoredRoom(conferenceId, room));
        }
        roomState.push(makeStoredConference(conferenceId, parsed.conference));

        const confRoomId = await client.createRoom({
            creation_content: {
                [RSC_CONFERENCE_ROOM_FLAG]: conferenceId,
            },
            name: `Conference ${conferenceId}`,
            preset: 'private_chat',
            initial_state: roomState.map(e => dtoToInitialState(e)),
        });

        await client.setAccountData(ACD_EVENTS_INDEX, {events: [...knownEvents.events, conferenceId]});

        await client.sendNotice(roomId, `[Conference ${conferenceId}] Conference created. Now creating rooms (this may take a while - invites will not be issued yet).`);

        const activeConference = await client.getSafeAccountData(ACD_CURRENT_EVENT, <ICurrentEventContent>{eventId: null});
        if (!activeConference.conferenceId) {
            await client.setAccountData(ACD_CURRENT_EVENT, <ICurrentEventContent>{eventId: conferenceId});
            await client.sendNotice(roomId, `${conferenceId} is now the active/default conference`);
        }

        // Let's actually create some rooms now
        let primaryRoomsCreated = 0;
        let eventRoomsCreated = 0;
        for (const room of parsed.rooms) {
            const allEvents: IEvent[] = [];
            Object.values(room.eventsByDate).forEach(ea => allEvents.push(...ea));

            const pRoomId = await client.createRoom(mergeWithCreationTemplate(PRIMARY_ROOM_CREATION_TEMPLATE, {
                name: room.id,
                initial_state: [
                    makeStoredRoom(conferenceId, room),
                    makeParentRoom(confRoomId),
                    ...allEvents.map(e => makeStoredEvent(conferenceId, e)),
                ].map(e => dtoToInitialState(e)),
            }));
            primaryRoomsCreated++;

            // TODO: Add aliases to rooms (primary and event)

            for (const event of allEvents) {
                const eRoomId = await client.createRoom(mergeWithCreationTemplate(INITIAL_EVENT_ROOM_CREATION_TEMPLATE, {
                    name: event.title,
                    topic: event.subtitle,
                    initial_state: [
                        makeStoredRoom(conferenceId, room),
                        makeParentRoom(pRoomId),
                        makeStoredEvent(conferenceId, event),
                    ].map(e => dtoToInitialState(e)),
                }));
                const childRoom = makeChildRoom(eRoomId);
                await client.sendStateEvent(pRoomId, childRoom.eventType, childRoom.stateKey, childRoom.content);
                eventRoomsCreated++;
            }
        }

        await client.sendNotice(roomId, `[Conference ${conferenceId}] ${primaryRoomsCreated} virtual rooms and ${eventRoomsCreated} talk rooms have been created. Next steps: Import your moderators and speakers list so I can start preparing to invite them to the room.`);
    }
}
