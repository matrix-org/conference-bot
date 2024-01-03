export interface PretalxSpeaker {
    code: string,
    name: string,
    biography: string|null,
    submissions: string[],
    avatar: string,
    answers: [],
    email: string,
    availabilities: {
        id: string,
        start: string,
        end: string,
        allDay: boolean
    }[],
}

interface PretalxSpeakersResponse {
    count: number;
    next: string;
    previous: string|null,
    results: [{
        code: string,
        name: string,
        biography: string|null,
        submissions: string[],
        avatar: string,
        answers: [],
        email: string,
        availabilities: {
            id: string,
            start: string,
            end: string,
            allDay: boolean
        }[],
    }]
}

export class PretalxApiClient {
    constructor(private readonly baseUri: string, private readonly token: string) {
        if (baseUri.endsWith('/')) { this.baseUri = baseUri.slice(0, -1)}
    }

    private get requestInit(): RequestInit {
        return {
            headers: {
                'Authorization': `Token ${this.token}`
            },
        }
    }

    async getSpeaker(code: string) {
        const url = new URL(this.baseUri + `/speakers/${code}/`);
        const req = await fetch(url, this.requestInit);
        if (!req.ok) {
            const reason = await req.text();
            throw Error(`Failed to request speakers from Pretalx: ${req.status} ${reason}`);
        }
        const result = await req.json() as PretalxSpeaker;
        return result;
    }

    async getSpeakers(offset: number, limit: number) {
        const url = new URL(this.baseUri + '/speakers/');
        url.searchParams.set('offset', offset.toString());
        url.searchParams.set('limit', limit.toString());
        const req = await fetch(url, this.requestInit);
        if (!req.ok) {
            const reason = await req.text();
            throw Error(`Failed to request speakers from Pretalx: ${req.status} ${reason}`);
        }
        const result = await req.json() as PretalxSpeakersResponse;
        const nextValue = result.next && new URL(result.next).searchParams.get('offset');
        return {
            speakers: result.results,
            next: nextValue ? parseInt(nextValue) : null,
        };
    }

    async *getAllSpeakers(): AsyncGenerator<PretalxSpeaker, void, void> {
        let offset: number|null = 0;
        do {
            const { next: newOffset, speakers } = await this.getSpeakers(offset, 100);
            for (const speaker of speakers) {
                yield speaker;
            }
            offset = newOffset
        } while (offset !== null)
    }
}