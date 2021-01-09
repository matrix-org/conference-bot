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
                avatar_url: config.livestream.widgetAvatar,
                url: config.webserver.publicBaseUrl + "/widgets/auditorium.html?widgetId=$matrix_widget_id&auditoriumId=$auditoriumId",
                data: {
                    title: await aud.getName(),
                    auditoriumId: await aud.getId(),
                },
            } as IWidget,
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
                name: "Livestream / Q&A",
                avatar_url: config.livestream.widgetAvatar,
                url: config.webserver.publicBaseUrl + "/widgets/talk.html?widgetId=$matrix_widget_id&auditoriumId=$auditoriumId&talkId=$talkId#displayName=$matrix_display_name&avatarUrl=$matrix_avatar_url&userId=$matrix_user_id&roomId=$matrix_room_id&auth=openidtoken-jwt",
                data: {
                    title: await talk.getName(),
                    auditoriumId: await talk.getAuditoriumId(),
                    talkId: await talk.getId(),
                },
            } as IWidget,
        };
    }
}
