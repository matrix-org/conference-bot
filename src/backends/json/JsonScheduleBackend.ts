import { rename } from "fs";
import config, { IJsonScheduleBackendConfig } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import { JsonScheduleLoader } from "./JsonScheduleLoader";
import * as fetch from "node-fetch";
import * as path from "path";
import { LogService } from "matrix-bot-sdk";
import { readJsonFileAsync, writeJsonFileAsync } from "../../utils";
import { PentaDb } from "../penta/db/PentaDb";

export class JsonScheduleBackend implements IScheduleBackend {
    constructor(private loader: JsonScheduleLoader, private cfg: IJsonScheduleBackendConfig, private wasFromCache: boolean) {

    }

    wasLoadedFromCache(): boolean {
        return this.wasFromCache;
    }

    private static async loadConferenceFromCfg(cfg: IJsonScheduleBackendConfig, allowUseCache: boolean): Promise<{loader: JsonScheduleLoader, cached: boolean}> {
        let jsonDesc;
        let cached = false;

        const cachedSchedulePath = path.join(config.dataPath, 'cached_schedule.json');

        try {
            if (cfg.scheduleDefinition.startsWith("http")) {
                // Fetch the JSON track over the network
                jsonDesc = await fetch(cfg.scheduleDefinition).then(r => r.json());
            } else {
                // Load the JSON from disk
                jsonDesc = await readJsonFileAsync(cfg.scheduleDefinition);
            }

            // Save a cached copy.
            await writeJsonFileAsync(cachedSchedulePath, jsonDesc);
        } catch (e) {
            // Fallback to cache — only if allowed
            if (! allowUseCache) throw e;

            cached = true;

            LogService.error("JsonScheduleBackend", "Unable to load JSON schedule, will use cached copy if available.", e.body ?? e);
            try {
                jsonDesc = await readJsonFileAsync(cachedSchedulePath);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    // No file
                    LogService.error("JsonScheduleBackend", "Double fault: Unable to load schedule and unable to load cached schedule (cached file doesn't exist)");
                } else if (e instanceof SyntaxError) {
                    LogService.error("JsonScheduleBackend", "Double fault: Unable to load schedule and unable to load cached schedule (cached file has invalid JSON)");
                } else {
                    LogService.error("JsonScheduleBackend", "Double fault: Unable to load schedule and unable to load cached schedule: ", e);
                }

                throw "Double fault whilst trying to load JSON schedule";
            }
        }

        return {loader: new JsonScheduleLoader(jsonDesc), cached};
    }

    static async new(cfg: IJsonScheduleBackendConfig): Promise<JsonScheduleBackend> {
        const loader = await JsonScheduleBackend.loadConferenceFromCfg(cfg, true);
        return new JsonScheduleBackend(loader.loader, cfg, loader.cached);
    }

    async refresh(): Promise<void> {
        this.loader = (await JsonScheduleBackend.loadConferenceFromCfg(this.cfg, false)).loader;
        // If we managed to load anything, this isn't from the cache anymore.
        this.wasFromCache = false;
    }

    async refreshShortTerm(_lookaheadSeconds: number): Promise<void> {
        // NOP: There's no way to partially refresh a JSON schedule.
        // Short-term changes to a JSON schedule are therefore currently unimplemented.
        // This hack was intended for Penta anyway.
    }

    getPentaDb(): PentaDb | null {
        return null;
    }

    get conference(): IConference {
        return this.loader.conference;
    };

    get talks(): Map<TalkId, ITalk> {
        return this.loader.talks;
    }

    get auditoriums(): Map<AuditoriumId, IAuditorium> {
        return this.loader.auditoriums;
    }

    get interestRooms(): Map<InterestId, IInterestRoom> {
        return this.loader.interestRooms;
    }
}