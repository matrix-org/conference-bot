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
import { MatrixClient } from "matrix-bot-sdk";
import { Conference } from "./Conference";
import { IRCBridge, IRCBridgeOpts } from "./IRCBridge";
import { Scheduler } from "./Scheduler";
import { CheckInMap } from "./CheckInMap";

interface IConfig {
    homeserverUrl: string;
    accessToken: string;
    userId: string;
    dataPath: string;
    managementRoom: string;
    idServerDomain: string;
    idServerBrand: string;
    moderatorUserId: string;
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

    RUNTIME: {
        client: MatrixClient;
        conference: Conference;
        scheduler: Scheduler;
        ircBridge: IRCBridge | null;
        checkins: CheckInMap;
    };
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

export interface IJsonScheduleBackendConfig {
    backend: "json";
    /**
     * Path or HTTP(S) URL to schedule.
     */
    scheduleDefinition: string;

    /**
     * Slightly awful, but this works around some type errors in places that don't get hit if you're using a JSON schedule.
     */
    database: undefined;
}

export interface IPentaScheduleBackendConfig {
    backend: "penta";
    /**
     * HTTP(S) URL to schedule.
     */
    scheduleDefinition: string;
    database: IPentaDbConfig;
}

export type ScheduleBackendConfig = IJsonScheduleBackendConfig | IPentaScheduleBackendConfig;

export interface IPentaDbConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    sslmode: string;
    tblPeople: string;
    tblSchedule: string;
    schedulePreBufferSeconds: number;
    schedulePostBufferSeconds: number;
}

export default <IConfig>config;
