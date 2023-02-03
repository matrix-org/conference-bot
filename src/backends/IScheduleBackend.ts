import { IAuditorium, IConference, IInterestRoom, ITalk } from "../models/schedule";
import { PentaDb } from "./penta/db/PentaDb";

export type TalkId = string;
export type AuditoriumId = string;
export type InterestId = string;


/**
 * A schedule backend, responsible for dictating all the events occurring in the conference.
 *
 */
export interface IScheduleBackend {
    /**
     * Attempts to refresh the schedule from its original source, if applicable to the backend.
     * Intended to be triggered by user command.
     * In case of failure:
     * - throws an error; but
     * - the schedule backend is otherwise usable, as though nothing happened.
     */
    refresh(): Promise<void>;

    /**
     * Calling this function requests the schedule backend to look ahead `lookaheadSeconds` seconds into the future
     * and try its best to ensure whatever talks in that window of time are up-to-date in the backend's view of the schedule.
     *
     * This is an ugly hack to support short-notice changes to the conference schedule, as happens in real life.
     * It is principally expected to be called by the Scheduler when scheduling tasks in the short-term future.
     */
    refreshShortTerm(lookaheadSeconds: number): Promise<void>;

    /**
     * Returns true iff the current schedule was loaded from cache, rather than from the intended source.
     * This happens if there was a problem loading the schedule from the intended source for some reason.
     * The intention of exposing this information is that it allows us to send a notice into the
     * management room, so that the admin knows what's going on.
     */
    wasLoadedFromCache(): boolean;

    /**
     * Get a PentaDb if this is the Pentabarf backend.
     * (very ugly, I know...)
     */
    getPentaDb(): PentaDb | null;

    /**
     * Raw view of the conference.
     * Prefer to use the `talks`, `auditoriums` and `interestRooms` properties instead of the conference.
     */
    readonly conference: IConference;

    /**
     * Talks by talk ID.
     * The application must not modify this map.
     */
    readonly talks: Map<TalkId, ITalk>;

    /**
     * Auditoriums by auditorium ID.
     * The application must not modify this map.
     */
    readonly auditoriums: Map<AuditoriumId, IAuditorium>;

    /**
     * Special interest rooms by special interest ID.
     * The application must not modify this map.
     */
    readonly interestRooms: Map<InterestId, IInterestRoom>;
}