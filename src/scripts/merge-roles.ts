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

import * as YAML from "yaml";
import * as fs from "fs";
import { MatrixClient, UserID } from "matrix-bot-sdk";
import config from "../config";

(async function() {

    const fname = process.argv[2];
    const yaml = YAML.parse(await fs.promises.readFile(fname, 'utf-8'));

    // TODO: Use penta or another location as an import location

    const client = new MatrixClient(config.homeserverUrl, config.accessToken);
    const domain = (new UserID(await client.getUserId())).domain;

    for (const person of yaml['people']) {
        const dottedName = person['name'].toLowerCase().replace(/ /g, '.').replace(/[^a-z0-9.]/g, '');
        if (Math.random() < 0.25) {
            person['mxid'] = `@${dottedName}:${domain}`;
        }
        person['emails'] = [
            `${dottedName}@example.org`,
            `${dottedName}@alt.example.org`,
        ];
    }

    await fs.promises.writeFile(fname, YAML.stringify(yaml), 'utf-8');
})();
