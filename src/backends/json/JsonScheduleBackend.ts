import { readFile } from "fs";
import { IJsonScheduleBackendConfig } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import { JsonScheduleLoader } from "./JsonScheduleLoader";
import * as fetch from "node-fetch";

/**
 * Reads a JSON file from disk.
 */
 function readJsonFileAsync(path: string): Promise<object> {
    return new Promise((resolve, reject) => {
        readFile(path, {}, (err, buf: string) => {
            if (err) {
                reject(err);
            } else {
                try {
                    resolve(JSON.parse(buf));
                } catch (err) {
                    reject(err);
                }
            }
        })
    });
}

export class JsonScheduleBackend implements IScheduleBackend {
    constructor(private loader: JsonScheduleLoader, private cfg: IJsonScheduleBackendConfig) {

    }

    private static async loadConferenceFromCfg(cfg: IJsonScheduleBackendConfig): Promise<JsonScheduleLoader> {
        let jsonDesc;
        if (cfg.scheduleDefinition.startsWith("http")) {
            // Fetch the JSON track over the network
            jsonDesc = await fetch(cfg.scheduleDefinition).then(r => r.json());
        } else {
            // Load the JSON from disk
            jsonDesc = await readJsonFileAsync(cfg.scheduleDefinition);
        }

        return new JsonScheduleLoader(jsonDesc);
    }

    static async new(cfg: IJsonScheduleBackendConfig): Promise<JsonScheduleBackend> {
        const loader = await JsonScheduleBackend.loadConferenceFromCfg(cfg);
        return new JsonScheduleBackend(loader, cfg);
    }

    async refresh(): Promise<void> {
        this.loader = await JsonScheduleBackend.loadConferenceFromCfg(this.cfg);
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