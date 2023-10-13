import { IPretalxScheduleBackendConfig } from "../../config";
import { IConference, ITalk, IAuditorium, IInterestRoom } from "../../models/schedule";
import { AuditoriumId, InterestId, IScheduleBackend, TalkId } from "../IScheduleBackend";
import * as fetch from "node-fetch";
import * as path from "path";
import { LogService } from "matrix-bot-sdk";
import { PretalxData, PretalxSchema } from "./PretalxSchema";
import { readFile, writeFile } from "fs/promises";
import { XMLParser } from "fast-xml-parser";


export class PretalxScheduleBackend implements IScheduleBackend {
    data: PretalxSchema;
    private constructor(private cfg: IPretalxScheduleBackendConfig, private wasFromCache: boolean, public readonly dataPath: string) {
        
    }

    wasLoadedFromCache(): boolean {
        return this.wasFromCache;
    }

    static async parseFromXML(rawXml: string): Promise<PretalxSchema> {
        const parser = new XMLParser({
            attributesGroupName: "attr",
            attributeNamePrefix : "@_",
            textNodeName: "#text",
            ignoreAttributes: false,
        });
        const { schedule } = parser.parse(rawXml) as PretalxData;
        const interestRooms = new Map<string, IInterestRoom>();
        const auditoriums = new Map<string, IAuditorium>();
        const talks = new Map<string, ITalk>();

        const normaliseToArray = <T>(v: T|undefined|T[]) => v !== undefined ? (Array.isArray(v) ? v : [v]) : [];

        for (const day of normaliseToArray(schedule.day)) {
            for (const room of normaliseToArray(day.room)) {
                for (const event of normaliseToArray(room.event)) {
                    
                    console.log(event.title);   
                }                
            }
        }

        return {
            conference: {
                title: schedule.conference.title["#text"],
                interestRooms: [],
                auditoriums: [],
            },
            interestRooms,
            auditoriums,
            talks,
        }
    }

    private static async loadConferenceFromCfg(dataPath: string, cfg: IPretalxScheduleBackendConfig, allowUseCache: boolean): Promise<{data: PretalxSchema, cached: boolean}> {
        let xmlDesc;
        let cached = false;

        const cachedSchedulePath = path.join(dataPath, 'cached_schedule.xml');

        try {
            if (cfg.scheduleDefinition.startsWith("http")) {
                // Fetch the JSON track over the network
                xmlDesc = await fetch(cfg.scheduleDefinition).then(r => r.json());
            } else {
                // Load the JSON from disk
                xmlDesc = await readFile(cfg.scheduleDefinition, 'utf-8');
            }

            // Save a cached copy.
            await writeFile(cachedSchedulePath, xmlDesc);
        } catch (e) {
            // Fallback to cache — only if allowed
            if (! allowUseCache) throw e;

            cached = true;

            LogService.error("JsonScheduleBackend", "Unable to load JSON schedule, will use cached copy if available.", e.body ?? e);
            try {
                xmlDesc = await readFile(cachedSchedulePath, 'utf-8');
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
        

        let data: PretalxSchema = {
            interestRooms: new Map(),
            auditoriums: new Map(),
            talks: new Map(),
            conference: {
                title: 'Hi',
                auditoriums: [],
                interestRooms: [],
            }
        };

        return {data, cached};
    }

    static async new(dataPath: string, cfg: IPretalxScheduleBackendConfig): Promise<PretalxScheduleBackend> {
        const loader = await PretalxScheduleBackend.loadConferenceFromCfg(dataPath, cfg, true);
        return new PretalxScheduleBackend(cfg, loader.cached, dataPath);
    }

    async refresh(): Promise<void> {
        this.data = (await PretalxScheduleBackend.loadConferenceFromCfg(this.dataPath, this.cfg, false)).data;
        // If we managed to load anything, this isn't from the cache anymore.
        this.wasFromCache = false;
    }

    async refreshShortTerm(_lookaheadSeconds: number): Promise<void> {
        // NOP: There's no way to partially refresh a JSON schedule.
        // Short-term changes to a JSON schedule are therefore currently unimplemented.
        // This hack was intended for Penta anyway.
    }

    get conference(): IConference {
        return this.data.conference;
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