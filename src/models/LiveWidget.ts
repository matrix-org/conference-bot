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
import { MatrixClient } from "matrix-bot-sdk";
import template from "../utils/template";

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
    private constructor() { }

    public static async forAuditorium(aud: Auditorium, client: MatrixClient, avatar: string, baseUrl: string): Promise<IStateEvent<IWidget>> {
        const widgetId = sha256(JSON.stringify(aud.getDefinition()));
        return {
            type: "im.vector.modular.widgets",
            state_key: widgetId,
            content: {
                creatorUserId: await client.getUserId(),
                id: widgetId,
                type: "m.custom",
                waitForIframeLoad: true,
                name: "Livestream",
                avatar_url: avatar,
                url: `${baseUrl}/widgets/auditorium.html?widgetId=$matrix_widget_id&auditoriumId=$auditoriumId&theme=$theme`,
                data: {
                    title: aud.getName(),
                    auditoriumId: aud.getId(),
                },
            } as IWidget,
        };
    }

    public static async hybridForRoom(roomId: string, client: MatrixClient, avatar: string, url: string): Promise<IStateEvent<IWidget>> {
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
                avatar_url: avatar,
                url: `${url}/widgets/hybrid.html?widgetId=$matrix_widget_id&roomId=$matrix_room_id&theme=$theme#displayName=$matrix_display_name&avatarUrl=$matrix_avatar_url&userId=$matrix_user_id&roomId=$matrix_room_id&auth=openidtoken-jwt`,
                data: {
                    title: "Join the conference to ask questions",
                },
            } as IWidget,
        };
    }

    public static async scoreboardForAuditorium(aud: Auditorium, client: MatrixClient, avatar: string, url: string): Promise<IStateEvent<IWidget>> {
        // There's nothing special about the widget ID, it just needs to be unique
        const widgetId = `AUDITORIUM_${aud.getId()}_SCOREBOARD`;
        const title = `Messages from ${await aud.getCanonicalAlias()}`;
        return {
            type: "im.vector.modular.widgets",
            state_key: widgetId,
            content: {
                creatorUserId: await client.getUserId(),
                id: widgetId,
                type: "m.custom",
                waitForIframeLoad: true,
                name: "Upvoted messages",
                avatar_url: avatar,
                url: `${url}/widgets/scoreboard.html?widgetId=$matrix_widget_id&auditoriumId=$auditoriumId&theme=$theme`,
                data: {
                    title: title,
                    auditoriumId: aud.getId(),
                },
            } as IWidget,
        };
    }

    public static async scheduleForAuditorium(aud: Auditorium, client: MatrixClient, avatar: string, scheduleUrl: string): Promise<IStateEvent<IWidget>> {
        const widgetId = sha256(`${JSON.stringify(aud.getDefinition())}_AUDSCHED`);
        const widgetUrl = template(scheduleUrl, {
            audName: aud.getName(),
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
                avatar_url: avatar,
                url: widgetUrl,
                data: {
                    title: "Conference Schedule",
                    auditoriumId: aud.getId(),
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

    public static layoutForPhysicalAudBackstage(scoreboard: IStateEvent<IWidget>): IStateEvent<ILayout> {
        return {
            type: "io.element.widgets.layout",
            state_key: "",
            content: {
                widgets: {
                    [scoreboard.state_key]: {
                        container: "top",
                        index: 0,
                        width: 100,
                        height: 60,
                    },
                },
            },
        };
    }

    public static layoutForTalk(qa: IStateEvent<IWidget>, scoreboard: IStateEvent<IWidget> | null): IStateEvent<ILayout> {
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
