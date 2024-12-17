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

import * as config from "config";
import { IRCBridgeOpts } from "./IRCBridge";

export enum RunMode {
    normal = "normal",
    webserver = "webserver",
}

export interface IConfig {
    homeserverUrl: string;
    accessToken: string;
    userId: string;
    dataPath: string;
    managementRoom: string;
    idServerDomain?: string;
    idServerBrand?: string;

    // Legacy option that causes a startup error when supplied.
    // Removed in favour of `moderatorUserIds`.
    moderatorUserId?: string;
    
    moderatorUserIds: string[];
    livestream: {
        auditoriumUrl: string;
        talkUrl: string;
        hybridUrl: string;
        scheduleUrl: string;
        jitsiDomain: string;
        widgetAvatar: string;
        onpublish: {
            rtmpHostnameTemplate: string;
            rtmpUrlTemplate: string;
            salt: string;
        };
    };
    webserver: {
        address: string;
        port: number;
        publicBaseUrl: string;
        additionalAssetsPath: string;
    };
    metrics: {
        enabled: boolean;
        address: string;
        port: number;
    };
    dry_run_enabled: boolean;
    conference: {
        id: string;
        name: string;

        schedule: ScheduleBackendConfig;
        timezone: string;
        lookaheadMinutes: number;
        supportRooms: {
            speakers: string;
            coordinators: string;
            specialInterest: string;
        };
        prefixes: IPrefixConfig;
        existingInterestRooms: {
            [id: string]: string;
        };
        subspaces: {
            [name: string]: {
                displayName: string;
                alias: string;
                prefixes: string[];
            };
        };
    };
    ircBridge: IRCBridgeOpts | null;

    templatesPath: string;

    mode: RunMode;
}

export interface IPrefixConfig {
    auditoriumRooms: string[];
    qaAuditoriumRooms: string[];
    physicalAuditoriumRooms: string[];
    interestRooms: string[];
    aliases: string | string[];
    suffixes: {
        [prefix: string]: string;
    };
    displayNameSuffixes: {
        [prefix: string]: string;
    };
    nameOverrides: {
        [auditoriumId: string]: string;
    };
}

export enum JsonScheduleFormat {
    /**
     * Our original JSON schedule format.
     */
    Original = "original",

    /**
     * The FOSDEM-specific schedule format, available on the `/p/matrix` endpoint.
     */
    FOSDEM = "fosdem",
}

export interface IJsonScheduleBackendConfig {
    backend: "json";
    /**
     * Path or HTTP(S) URL to schedule.
     */
    scheduleDefinition: string;

    /**
     * What JSON schedule format to use.
     * Defaults to original.
     */
    scheduleFormat?: JsonScheduleFormat;
}

export enum PretalxScheduleFormat {
    /**
     * Standard pretalx support, uses no custom extensions.
     */
    Pretalx = "pretalx",
    /**
     * Expects a pentabarf (+ extensions)
     * format schedule. Extends standard pretalx API client.
     */
    FOSDEM = "fosdem",
}

export interface IPretalxScheduleBackendConfig {
    backend: "pretalx";
    /**
     * Is the schedule in fosdem or pretalx format? For legacy reasons
     * some conferences prefer "fosdem" which can contain extensions.
     * Defaults to "pretalx".
     */
    scheduleFormat?: PretalxScheduleFormat;
    /**
     * HTTP(S) URL to schedule XML.
     */
    scheduleDefinition: string;
    pretalxAccessToken: string;
    pretalxApiEndpoint: string;
}


export type ScheduleBackendConfig = IJsonScheduleBackendConfig | IPretalxScheduleBackendConfig;

const liveConfig: IConfig = {
    ...config,
    mode: process.env.CONF_RUN_MODE ?? RunMode.normal,
    templatesPath: process.env.CONF_TEMPLATES_PATH ?? config.templatesPath,
}

export default <IConfig>liveConfig;
