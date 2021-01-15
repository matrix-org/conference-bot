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

interface IConfig {
    homeserverUrl: string;
    accessToken: string;
    dataPath: string;
    managementRoom: string;
    idServerDomain: string;
    moderatorUserId: string;
    livestream: {
        auditoriumUrl: string;
        talkUrl: string;
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
        pentabarfDefinition: string;
        timezone: string;
        prefixes: {
            auditoriumRooms: string[];
            interestRooms: string[];
            aliases: string;
            nameOverrides: {
                [auditoriumId: string]: string;
            };
        };
        database: {
            connectionString: string;
            tblPeople: string;
        };
    };

    RUNTIME: {
        client: MatrixClient;
        conference: Conference;
    };
}

export default <IConfig>config;
