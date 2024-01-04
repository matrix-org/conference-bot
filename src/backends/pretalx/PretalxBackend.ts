/*
Copyright 2024 The Matrix.org Foundation C.I.C.

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

import { IPrefixConfig, IPretalxScheduleBackendConfig } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom, Role } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import * as fetch from "node-fetch";
import * as path from "path";
import { LogService } from "matrix-bot-sdk";
import { PretalxSchema as PretalxData, parseFromJSON } from "./PretalxParser";
import { readFile, writeFile } from "fs/promises";
import { PretalxApiClient, PretalxSpeaker, PretalxTalk } from "./PretalxApiClient";

export class PretalxScheduleBackend implements IScheduleBackend {
    private speakerCache = new Map<string, PretalxSpeaker>();
    private readonly apiClient: PretalxApiClient;
    private constructor(
        private readonly cfg: IPretalxScheduleBackendConfig,
        private readonly prefixCfg: IPrefixConfig,
        private data: PretalxData,
        private wasFromCache: boolean,
        private readonly dataPath: string) {
        this.apiClient = new PretalxApiClient(cfg.pretalxApiEndpoint, cfg.pretalxAccessToken);
    }

    wasLoadedFromCache(): boolean {
        return this.wasFromCache;
    }

    private static async loadConferenceFromCfg(dataPath: string, cfg: IPretalxScheduleBackendConfig, prefixCfg: IPrefixConfig, allowUseCache: boolean): Promise<{data: PretalxData, cached: boolean}> {
        let jsonDesc;
        let cached = false;

        const cachedSchedulePath = path.join(dataPath, 'cached_schedule.json');

        try {
            if (cfg.scheduleDefinition.startsWith("http")) {
                // Fetch the JSON track over the network
                jsonDesc = await fetch(cfg.scheduleDefinition).then(r => r.text());
            } else {
                // Load the JSON from disk
                jsonDesc = await readFile(cfg.scheduleDefinition, 'utf-8');
            }

            // Save a cached copy.
            try {
                await writeFile(cachedSchedulePath, jsonDesc);
            } catch (ex) {
                // Allow this to fail, 
                LogService.warn("PretalxScheduleBackend", "Failed to cache copy of schedule.", ex);
            }
        } catch (e) {
            // Fallback to cache — only if allowed
            if (! allowUseCache) throw e;

            cached = true;

            LogService.error("PretalxScheduleBackend", "Unable to load XML schedule, will use cached copy if available.", e.body ?? e);
            try {
                jsonDesc = await readFile(cachedSchedulePath, 'utf-8');
            } catch (e) {
                if (e.code === 'ENOENT') {
                    // No file
                    LogService.error("PretalxScheduleBackend", "Double fault: Unable to load schedule and unable to load cached schedule (cached file doesn't exist)");
                } else if (e instanceof SyntaxError) {
                    LogService.error("PretalxScheduleBackend", "Double fault: Unable to load schedule and unable to load cached schedule (cached file has invalid JSON)");
                } else {
                    LogService.error("PretalxScheduleBackend", "Double fault: Unable to load schedule and unable to load cached schedule: ", e);
                }

                throw "Double fault whilst trying to load JSON schedule";
            }
        }

        const data = await parseFromJSON(jsonDesc, prefixCfg);

        return {data, cached};
    }

    static async new(dataPath: string, cfg: IPretalxScheduleBackendConfig, prefixCfg: IPrefixConfig): Promise<PretalxScheduleBackend> {
        const loader = await PretalxScheduleBackend.loadConferenceFromCfg(dataPath, cfg, prefixCfg, true);
        const backend = new PretalxScheduleBackend(cfg, prefixCfg, loader.data, loader.cached, dataPath);
        await backend.hydrateFromApi();
        return backend;
    }

    async refresh(): Promise<void> {
        this.data = (await PretalxScheduleBackend.loadConferenceFromCfg(this.dataPath, this.cfg, this.prefixCfg, false)).data;
        await this.hydrateFromApi();
        // If we managed to load anything, this isn't from the cache anymore.
        this.wasFromCache = false;
    }

    private async hydrateFromApi() {
        for await (const apiTalk of this.apiClient.getAllTalks()) {
            if (apiTalk.state !== "confirmed") {
                continue;
            }
            const localTalk = this.data.talks.get(apiTalk.code);
            if (!localTalk) {
                LogService.warn("PretalxScheduleBackend", `Talk missing from public schedule ${apiTalk.code}.`);
                continue;
            }
            localTalk.speakers = apiTalk.speakers.map(speaker => ({
                id: speaker.code,
                // Set emails for all the speakers.
                email: speaker.email,
                matrix_id: '',
                name: speaker.name,
                role: Role.Speaker,
            }));
        }
    }

    async refreshShortTerm(_lookaheadSeconds: number): Promise<void> {
        // NOP: There's no way to partially refresh a JSON schedule.
        // Short-term changes to a JSON schedule are therefore currently unimplemented.
        // This hack was intended for Penta anyway.
    }

    get conference(): IConference {
        return {
            title: this.data.title,
            interestRooms: [...this.data.interestRooms.values()],
            auditoriums: [...this.data.auditoriums.values()]
        };
    };

    get talks(): Map<TalkId, ITalk> {
        return this.data.talks;
    }

    get auditoriums(): Map<AuditoriumId, IAuditorium> {
        return this.data.auditoriums;
    }

    get interestRooms(): Map<InterestId, IInterestRoom> {
        return this.data.interestRooms;
    }
}