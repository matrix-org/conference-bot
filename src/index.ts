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

// TODO: Healthz

import { LogLevel, LogService, MatrixClient, RichConsoleLogger, SimpleFsStorageProvider } from "matrix-bot-sdk";
import * as path from "path";
import config from "./config";

LogService.setLogger(new RichConsoleLogger());
LogService.setLevel(LogLevel.DEBUG);
LogService.info("index", "Bot starting...");

const storage = new SimpleFsStorageProvider(path.join(config.dataPath, "bot.json"));
const bot = new MatrixClient(config.homeserverUrl, config.accessToken, storage);

(async function() {
    // TODO: Command processor
    LogService.info("index", "Starting sync...");
    await bot.start();
})();
