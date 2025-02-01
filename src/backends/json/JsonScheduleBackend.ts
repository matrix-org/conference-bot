import { IConfig, IJsonScheduleBackendConfig, JsonScheduleFormat } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import { JsonScheduleLoader } from "./JsonScheduleLoader";
import * as fetch from "node-fetch";
import * as path from "path";
import { LogService } from "matrix-bot-sdk";
import { readJsonFileAsync, writeJsonFileAsync } from "../../utils";
import { FosdemJsonScheduleLoader } from "./FosdemJsonScheduleLoader";

interface ILoader {
    conference: IConference;
    talks: Map<TalkId, ITalk>;
    auditoriums: Map<AuditoriumId, IAuditorium>;
    interestRooms: Map<InterestId, IInterestRoom>;
}

export class JsonScheduleBackend implements IScheduleBackend {
    constructor(private loader: ILoader, private cfg: IJsonScheduleBackendConfig, private globalConfig: IConfig, private wasFromCache: boolean, public readonly dataPath: string) {

    }

    wasLoadedFromCache(): boolean {
        return this.wasFromCache;
    }

    private static async loadConferenceFromCfg(dataPath: string, cfg: IJsonScheduleBackendConfig, globalConfig: IConfig, allowUseCache: boolean): Promise<{loader: ILoader, cached: boolean}> {
        let jsonDesc: any;
        let cached = false;


        const cachedSchedulePath = path.join(dataPath, 'cached_schedule.json');

        try {
            if (cfg.scheduleDefinition.startsWith("http")) {
                const headers = cfg.scheduleRequestHeaders ?? {};
                // Fetch the JSON track over the network
                jsonDesc = await fetch(cfg.scheduleDefinition, {headers}).then(r => r.json());
            } else {
                // Load the JSON from disk
                jsonDesc = await readJsonFileAsync(cfg.scheduleDefinition);
            }

            // Save a cached copy.
            try {
                await writeJsonFileAsync(cachedSchedulePath, jsonDesc);
            } catch (ex) {
                // Allow this to fail
                LogService.warn("PretalxScheduleBackend", "Failed to cache copy of schedule.", ex);
            }
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

        let loader: ILoader;
        switch (cfg.scheduleFormat) {
            case JsonScheduleFormat.FOSDEM:
                loader = new FosdemJsonScheduleLoader(jsonDesc, globalConfig);
                break;
            case JsonScheduleFormat.Original:
            case undefined:
                loader = new JsonScheduleLoader(jsonDesc);
                break;
            default:
                throw new Error(`Unknown JSON schedule format: ${cfg.scheduleFormat}`);
        }

        return {loader, cached};
    }

    static async new(dataPath: string, cfg: IJsonScheduleBackendConfig, globalConfig: IConfig): Promise<JsonScheduleBackend> {
        const loader = await JsonScheduleBackend.loadConferenceFromCfg(dataPath, cfg, globalConfig, true);
        return new JsonScheduleBackend(loader.loader, cfg, globalConfig, loader.cached, dataPath);
    }

    async refresh(): Promise<void> {
        this.loader = (await JsonScheduleBackend.loadConferenceFromCfg(this.dataPath, this.cfg, this.globalConfig, false)).loader;
        // If we managed to load anything, this isn't from the cache anymore.
        this.wasFromCache = false;
    }

    // refreshShortTerm() not implemented - There's no way to partially refresh a JSON schedule.

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
