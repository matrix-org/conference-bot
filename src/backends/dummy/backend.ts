import { IConference, ITalk, IAuditorium, IInterestRoom } from "../../models/schedule";
import { IScheduleBackend } from "../IScheduleBackend";

export class DummyScheduleBackend implements IScheduleBackend {
    async refresh(): Promise<void> {
        
    }
    async refreshShortTerm(lookaheadSeconds: number): Promise<void> {
        
    }
    wasLoadedFromCache(): boolean {
        return false;
    }
    conference: IConference;
    talks = new Map<string, ITalk>();
    auditoriums = new Map<string, IAuditorium>();
    interestRooms = new Map<string, IInterestRoom>();
}