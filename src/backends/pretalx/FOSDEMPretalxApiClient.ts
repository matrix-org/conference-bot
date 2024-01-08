import { Role } from "../../models/schedule";
import { PretalxApiClient } from "./PretalxApiClient";

export interface FOSDEMTalk {
    event_id: number,
    title: string,
    conference_room: string,
    start_datetime: string,
    duration: number,
    track_id: number,
    persons: [{
        person_id: number,
        event_role: Role,
        name: string,
        email: string,
        matrix_id: string,
    }]
}

export class FOSDEMPretalxApiClient extends PretalxApiClient {
    async getFOSDEMTalks(): Promise<FOSDEMTalk[]> {
        const url = new URL(this.baseUri + `/p/matrix/`);
        const req = await fetch(url, this.requestInit);
        if (!req.ok) {
            const reason = await req.text();
            throw Error(`Failed to request events from Pretalx: ${req.status} ${reason}`);
        }
        return (await req.json()).talks as FOSDEMTalk[];
    }
}