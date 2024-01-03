import { IPrefixConfig, IPretalxScheduleBackendConfig } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import * as fetch from "node-fetch";
import * as path from "path";
import { LogService } from "matrix-bot-sdk";
import { PretalxSchema as PretalxData, parseFromJSON } from "./PretalxParser";
import { readFile, writeFile } from "fs/promises";
import { PretalxApiClient, PretalxSpeaker } from "./PretalxApiClient";


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
        if (this.speakerCache.size === 0) {
            // Do a full refresh of speaker data.
            for await (const speaker of await this.apiClient.getAllSpeakers()) {
                this.speakerCache.set(speaker.code, speaker);
            }
        } // else: we just fetch missing speakers on demand.

        // Set emails for all the speakers.
        for (const talk of this.data.talks.values()) {
            for (const speaker of talk.speakers) {
                let cachedSpeaker = this.speakerCache.get(speaker.id);
                if (!cachedSpeaker) {
                    LogService.info("PretalxScheduleBackend", `Speaker ${speaker.id} not found in cache, fetching from API`);
                    try {
                        const fetchedSpeaker = await this.apiClient.getSpeaker(speaker.id);
                        this.speakerCache.set(fetchedSpeaker.code, fetchedSpeaker);
                        cachedSpeaker = fetchedSpeaker;
                    } catch (ex) {
                        LogService.warn("PretalxScheduleBackend", `Speaker ${speaker.id} not found in API. This is problematic.`, ex);
                        continue;
                    }
                }
                speaker.email = cachedSpeaker?.email;
            }
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