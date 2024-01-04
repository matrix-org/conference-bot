/*
Copyright 2024 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

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