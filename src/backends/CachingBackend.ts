import { rename } from "fs";
import { LogService } from "matrix-bot-sdk";
import { config } from "process";
import { RoomKind } from "../models/room_kinds";
import { IConference, ITalk, IAuditorium, IInterestRoom } from "../models/schedule";
import { jsonReplacerMapToObject, readJsonFileAsync, writeJsonFileAsync } from "../utils";
import { IScheduleBackend, TalkId } from "./IScheduleBackend";


type BackendFactory = () => Promise<IScheduleBackend>;

/**
 * Layout of the cache file content, as encoded on disk.
 *
 * Note that this can only contain primitive JSON types — no Map<>s etc, so we have to make minor customisations sometimes.
 */
interface IRawCacheFileContent {
    conference: {
        title: string;
        auditoriums: IRawCacheAuditorium[];
        interestRooms: IInterestRoom[];
    };
}
interface IRawCacheAuditorium {
    id: string;
    slug: string;
    name: string;
    kind: RoomKind;
    // This is a Map<> in the real type.
    talks: Record<TalkId, ITalk>;
    isPhysical: boolean;
}

/**
 * Wrapper for any schedule backend that adds caching (in case the source goes down) and refresh support.
 */
export class CachingBackend implements IScheduleBackend {
    public conference: IConference;
    public talks: Map<string, ITalk> = new Map();
    public auditoriums: Map<string, IAuditorium> = new Map();
    public interestRooms: Map<string, IInterestRoom> = new Map();

    private wasCached: boolean = true;

    /**
     * @param underlyingBackend A factory for the underlying backend, which will be reconstructed each time we try to refresh.
     */
    public constructor(private underlyingBackend: BackendFactory, private cachePath: string) {
        // All the real work is in init(). The arguments here are properties.
    }

    /**
     * To be called immediately after construction.
     */
    public async init(): Promise<void> {
        try {
            await this.refresh();
        } catch (e) {
            LogService.error("CachingBackend", "Failed to create underlying backend: ", e.body ?? e);

            try {
                await this.loadFromCache();
            } catch (e) {
                LogService.error("CachingBackend", "Double fault: can't load from schedule source and can't load from cache: ", e.body ?? e);
                throw new Error("Double fault when trying to load either schedule source or cache.");
            }
        }

    }

    public static async new(underlyingBackend: BackendFactory, cachePath: string): Promise<CachingBackend> {
        const cachingBackend = new CachingBackend(underlyingBackend, cachePath);
        await cachingBackend.init();
        return cachingBackend;
    }

    async refresh(): Promise<void> {
        const backend = await this.underlyingBackend();

        this.conference = backend.conference;
        this.talks = backend.talks;
        this.auditoriums = backend.auditoriums;
        this.interestRooms = backend.interestRooms;
        this.wasCached = false;

        try {
            await this.saveCacheToDisk();
        } catch (e) {
            // I wish we could be noisier about this, but not sure it's worth jeopardising a successful refresh over...
            LogService.error("CachingBackend", "Failed to save cache to disk: ", e.body ?? e);
        }
    }

    private async saveCacheToDisk(): Promise<void> {
        // Save a cached copy.
        // Do it atomically so that there's very little chance of anything going wrong: write to a file first, then move into place.
        await writeJsonFileAsync(this.cachePath, { conference: this.conference }, jsonReplacerMapToObject);
    }

    private async loadFromCache(): Promise<void> {
        const payload: IRawCacheFileContent = await readJsonFileAsync(this.cachePath) as any;

        function loadAuditorium(raw: IRawCacheAuditorium): IAuditorium {
            return {
                id: raw.id,
                kind: raw.kind,
                name: raw.name,
                slug: raw.slug,
                talks: new Map(Object.entries(raw.talks)),
                isPhysical: raw.isPhysical
            };
        }

        this.conference = {
            auditoriums: payload.conference.auditoriums.map(loadAuditorium),
            interestRooms: payload.conference.interestRooms,
            title: payload.conference.title
        };
        this.auditoriums.clear();
        this.interestRooms.clear();
        this.talks.clear();

        // Rebuild the lists.
        for (const auditorium of this.conference.auditoriums) {
            this.auditoriums.set(auditorium.id, auditorium);
            for (const [talkId, talk] of auditorium.talks) {
                this.talks.set(talkId, talk);
            }
        }

        for (const interest of this.conference.interestRooms) {
            this.interestRooms.set(interest.id, interest);
        }
    }

    wasLoadedFromCache(): boolean {
        return this.wasCached;
    }
}