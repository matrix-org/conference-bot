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
import { Talk } from "./Talk";
import * as template from "string-template";
import { base32 } from "rfc4648";

export interface ILayout {
    widgets: {
        [widgetId: string]: {
            container: "top" | "right";
            index?: number;
            width?: number;
            height?: number;
        };
    };
}

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
                url: config.webserver.publicBaseUrl + "/widgets/auditorium.html?widgetId=$matrix_widget_id&auditoriumId=$auditoriumId&theme=$theme",
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
                url: config.webserver.publicBaseUrl + "/widgets/talk.html?widgetId=$matrix_widget_id&auditoriumId=$auditoriumId&talkId=$talkId&theme=$theme#displayName=$matrix_display_name&avatarUrl=$matrix_avatar_url&userId=$matrix_user_id&roomId=$matrix_room_id&auth=openidtoken-jwt",
                data: {
                    title: await talk.getName(),
                    auditoriumId: await talk.getAuditoriumId(),
                    talkId: await talk.getId(),
                },
            } as IWidget,
        };
    }

    public static async hybridForRoom(roomId: string, client: MatrixClient): Promise<IStateEvent<IWidget>> {
        const widgetId = sha256(JSON.stringify({roomId, kind: "hybrid"}));
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
                url: config.webserver.publicBaseUrl + "/widgets/hybrid.html?widgetId=$matrix_widget_id&roomId=$matrix_room_id&theme=$theme#displayName=$matrix_display_name&avatarUrl=$matrix_avatar_url&userId=$matrix_user_id&roomId=$matrix_room_id&auth=openidtoken-jwt",
                data: {
                    title: "Join the conference to ask questions",
                },
            } as IWidget,
        };
    }

    public static async scoreboardForTalk(talk: Talk, client: MatrixClient): Promise<IStateEvent<IWidget>> {
        const widgetId = sha256(JSON.stringify(await talk.getDefinition()) + "_SCOREBOARD");
        const aud = await config.RUNTIME.conference.getAuditorium(await talk.getAuditoriumId());
        const title = aud ? `Messages from ${await aud.getCanonicalAlias()}` : `Messages from ${await talk.getAuditoriumId()}`;
        return {
            type: "im.vector.modular.widgets",
            state_key: widgetId,
            content: {
                creatorUserId: await client.getUserId(),
                id: widgetId,
                type: "m.custom",
                waitForIframeLoad: true,
                name: "Upvoted messages",
                avatar_url: config.livestream.widgetAvatar,
                url: config.webserver.publicBaseUrl + "/widgets/scoreboard.html?widgetId=$matrix_widget_id&auditoriumId=$auditoriumId&talkId=$talkId&theme=$theme",
                data: {
                    title: title,
                    auditoriumId: await talk.getAuditoriumId(),
                    talkId: await talk.getId(),
                },
            } as IWidget,
        };
    }

    public static async scheduleForAuditorium(aud: Auditorium, client: MatrixClient): Promise<IStateEvent<IWidget>> {
        const widgetId = sha256(JSON.stringify(await aud.getDefinition()) + "_AUDSCHED");
        const widgetUrl = template(config.livestream.scheduleUrl, {
            audId: await aud.getId(),
        });
        return {
            type: "im.vector.modular.widgets",
            state_key: widgetId,
            content: {
                creatorUserId: await client.getUserId(),
                id: widgetId,
                type: "m.custom",
                waitForIframeLoad: true,
                name: "Schedule",
                avatar_url: config.livestream.widgetAvatar,
                url: widgetUrl,
                data: {
                    title: "Conference Schedule",
                    auditoriumId: await aud.getId(),
                },
            } as IWidget,
        };
    }

    public static layoutForAuditorium(widget: IStateEvent<IWidget>): IStateEvent<ILayout> {
        return {
            type: "io.element.widgets.layout",
            state_key: "",
            content: {
                widgets: {
                    [widget.state_key]: {
                        container: "top",
                        index: 0,
                        width: 100,
                        height: 40,
                    },
                },
            },
        };
    }

    public static layoutForTalk(qa: IStateEvent<IWidget>, scoreboard: IStateEvent<IWidget>): IStateEvent<ILayout> {
        const val: IStateEvent<ILayout> = {
            type: "io.element.widgets.layout",
            state_key: "",
            content: {
                widgets: {
                    [qa.state_key]: {
                        container: "top",
                        index: 0,
                        width: scoreboard ? 65 : 100,
                        height: 60,
                    },
                },
            },
        };
        if (scoreboard) {
            val.content.widgets[scoreboard.state_key] = {
                container: "top",
                index: 1,
                width: 34,
                height: 60,
            };
        }
        return val;
    }

    public static layoutForHybrid(qa: IStateEvent<IWidget>): IStateEvent<ILayout> {
        return {
            type: "io.element.widgets.layout",
            state_key: "",
            content: {
                widgets: {
                    [qa.state_key]: {
                        container: "top",
                        index: 0,
                        width: 65,
                        height: 50,
                    },
                },
            },
        };
    }
}
