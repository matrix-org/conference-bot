/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import { RichConsoleLogger } from "matrix-bot-sdk";

export class CustomLogger extends RichConsoleLogger {
    // We only override DEBUG because that's where the noise is
    public debug(module: string, ...messageOrObject) {
        if (module === 'Metrics') {
            const metricName = messageOrObject[0];
            const info = messageOrObject[1];
            const ms = messageOrObject[2];
            super.debug(module, `${metricName} ${info['functionName']} took ${ms}ms`);
        } else {
            super.debug(module, ...messageOrObject);
        }
    }
}
