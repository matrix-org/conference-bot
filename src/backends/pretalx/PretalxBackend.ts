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

import { IPrefixConfig, IPretalxScheduleBackendConfig, PretalxScheduleFormat } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom, Role } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import * as fetch from "node-fetch";
import * as path from "path";
import { LogService } from "matrix-bot-sdk";
import { PretalxSchema as PretalxData, parseFromJSON } from "./PretalxParser";
import { readFile, writeFile } from "fs/promises";
import { PretalxApiClient } from "./PretalxApiClient";
import { PentabarfParser } from "../penta/PentabarfParser";
import { FOSDEMPretalxApiClient } from "./FOSDEMPretalxApiClient";


const MIN_TIME_BEFORE_REFRESH_MS = 60000;

export class PretalxScheduleBackend implements IScheduleBackend {
    private readonly apiClient: PretalxApiClient;
    private lastRefresh: number;
    private constructor(
        private readonly cfg: IPretalxScheduleBackendConfig,
        private readonly prefixCfg: IPrefixConfig,
        private data: PretalxData,
        private wasFromCache: boolean,
        private readonly dataPath: string) {
            if (cfg.scheduleFormat === PretalxScheduleFormat.FOSDEM) {
                this.apiClient = new FOSDEMPretalxApiClient(cfg.pretalxApiEndpoint, cfg.pretalxAccessToken);
            } else {
                this.apiClient = new PretalxApiClient(cfg.pretalxApiEndpoint, cfg.pretalxAccessToken);
            }
        
    }

    wasLoadedFromCache(): boolean {
        return this.wasFromCache;
    }

    private static async loadConferenceFromCfg(dataPath: string, cfg: IPretalxScheduleBackendConfig, prefixCfg: IPrefixConfig, allowUseCache: boolean): Promise<{data: PretalxData, cached: boolean}> {
        let jsonOrXMLDesc;
        let cached = false;

        const cachedSchedulePath = path.join(dataPath, 'cached_schedule.json');

        try {
            if (cfg.scheduleDefinition.startsWith("http")) {
                // Fetch the JSON track over the network
                jsonOrXMLDesc = await fetch(cfg.scheduleDefinition).then(r => r.text());
            } else {
                // Load the JSON from disk
                jsonOrXMLDesc = await readFile(cfg.scheduleDefinition, 'utf-8');
            }

            // Save a cached copy.
            try {
                await writeFile(cachedSchedulePath, jsonOrXMLDesc);
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
                jsonOrXMLDesc = await readFile(cachedSchedulePath, 'utf-8');
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
        let data: PretalxData;
        // For FOSDEM we prefer to use the pentabarf format as it contains
        // extra information not found in the JSON format. This may change
        // in the future.
        if (cfg.scheduleFormat === PretalxScheduleFormat.FOSDEM) {
            const pentaData = new PentabarfParser(jsonOrXMLDesc, prefixCfg);
            data = {
                talks: new Map(pentaData.talks.map(v => [v.id, v])),
                auditoriums: new Map(pentaData.auditoriums.map(v => [v.name, v])),
                interestRooms: new Map(pentaData.interestRooms.map(v => [v.id, v])),
                title: pentaData.conference.title,
            }
        } else {
            data = await parseFromJSON(jsonOrXMLDesc, prefixCfg);
        }

        return {data, cached};
    }

    static async new(dataPath: string, cfg: IPretalxScheduleBackendConfig, prefixCfg: IPrefixConfig): Promise<PretalxScheduleBackend> {
        const loader = await PretalxScheduleBackend.loadConferenceFromCfg(dataPath, cfg, prefixCfg, true);
        const backend = new PretalxScheduleBackend(cfg, prefixCfg, loader.data, loader.cached, dataPath);
        await backend.hydrateFromApi();
        return backend;
    }

    private async hydrateFromApi() {
        if (this.apiClient instanceof FOSDEMPretalxApiClient) {
            for (const apiTalk of await this.apiClient.getFOSDEMTalks()) {
                const localTalk = this.talks.get(apiTalk.event_id.toString());
                if (!localTalk) {
                    LogService.warn("PretalxScheduleBackend", `Talk missing from public schedule ${apiTalk.event_id}.`);
                    continue;
                }
                localTalk.speakers = apiTalk.persons.map(speaker => ({
                    id: speaker.person_id.toString(),
                    // Set emails for all the speakers.
                    email: speaker.email,
                    matrix_id: speaker.matrix_id,
                    name: speaker.name,
                    role: speaker.event_role,
                }));
            }
            return;
        }
        // Otherwise, use standard API.
        for await (const apiTalk of this.apiClient.getAllTalks()) {
            if (apiTalk.state !== "confirmed") {
                continue;
            }
            const localTalk = this.talks.get(apiTalk.code);
            if (!localTalk) {
                LogService.warn("PretalxScheduleBackend", `Talk missing from public schedule ${apiTalk.code}.`);
                continue;
            }
            localTalk.speakers = apiTalk.speakers.map(speaker => ({
                id: speaker.code,
                email: speaker.email,
                // Pretalx has no matrix ID field.
                matrix_id: '',
                name: speaker.name,
                role: Role.Speaker,
            }));
        }
    }

    async refresh(): Promise<void> {
        this.lastRefresh = Date.now(); 
        this.data = (await PretalxScheduleBackend.loadConferenceFromCfg(this.dataPath, this.cfg, this.prefixCfg, false)).data;
        await this.hydrateFromApi();
        // If we managed to load anything, this isn't from the cache anymore.
        this.wasFromCache = false;
    }

    async refreshShortTerm(): Promise<void> {
        // We don't have a way to partially refresh yet, so do a full refresh since
        // it's currently only two API calls.
        
        // We still want to prevent rapid refreshing, so this should only happen periodically.
        if (Date.now() - this.lastRefresh  < MIN_TIME_BEFORE_REFRESH_MS) {
            return;
        }
        await this.refresh();
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