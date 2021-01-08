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

import { IStateEvent } from "./room_state";
import { IWidget } from "matrix-widget-api";
import { sha256 } from "../utils";
import { Auditorium } from "./Auditorium";
import config from "../config";
import { MatrixClient } from "matrix-bot-sdk";
import { base32 } from "rfc4648";
import { Talk } from "./Talk";

export class LiveWidget {
    private constructor() {
        // nothing
    }

    public static async forAuditorium(aud: Auditorium, client: MatrixClient): Promise<IStateEvent<IWidget>> {
        const widgetId = sha256(JSON.stringify(await aud.getDefinition()));
        return {
            type: "im.vector.modular.widgets",
            state_key: widgetId,
            content: {
                creatorUserId: await client.getUserId(),
                id: widgetId,
                type: "m.custom",
                waitForIframeLoad: true,
                name: "Livestream",
                url: config.webserver.publicBaseUrl + "/widgets/auditorium.html?widgetId=$matrix_widget_id&$auditoriumId=$auditoriumId&conferenceId=$conferenceId&jitsiB32=$jitsiB32",
                data: {
                    title: await aud.getName(),
                    auditoriumId: await aud.getId(),
                    conferenceId: await aud.getConferenceId(),
                },
            },
        };
    }

    public static async forTalk(talk: Talk, client: MatrixClient): Promise<IStateEvent<IWidget>> {
        const widgetId = sha256(JSON.stringify(await talk.getDefinition()));
        return {
            type: "im.vector.modular.widgets",
            state_key: widgetId,
            content: {
                creatorUserId: await client.getUserId(),
                id: widgetId,
                type: "m.custom",
                waitForIframeLoad: true,
                name: "Livestream",
                url: config.webserver.publicBaseUrl + "/widgets/talk.html?widgetId=$matrix_widget_id&$auditoriumId=$auditoriumId&conferenceId=$conferenceId&jitsiB32=$jitsiB32",
                data: {
                    title: await talk.getName(),
                    talkId: await talk.getId(),
                    conferenceId: await talk.getConferenceId(),

                    // https://github.com/matrix-org/prosody-mod-auth-matrix-user-verification
                    jitsiB32: base32.stringify(Buffer.from(talk.roomId), {pad: false}),
                },
            },
        };
    }
}
