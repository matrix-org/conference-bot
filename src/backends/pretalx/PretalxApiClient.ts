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
}

interface PretalxResultsResponse<T> {
    count: number;
    next: string;
    previous: string|null,
    results: T[]
}

export interface PretalxTalk {
    "code": string,
    "speakers": Omit<PretalxSpeaker, "submissions">[],
    "title": string,
    "submission_type": string,
    "submission_type_id": number
    "track": {
        "en": string,
    },
    "track_id": number,
    "state": "confirmed",
    "abstract": string,
    "description": null,
    "duration": number,
    "slot_count": number,
    "do_not_record": boolean,
    "is_featured": boolean,
    "content_locale": "en",
    "slot": {
        "room_id": string,
        "room": string,
        "start": string,
        "end": string,
    },
    "image": string,
    "resources": {resource: string, description: string}[]
    "created": string,
    "pending_state": string|null,
    answers: unknown[],
    "notes": string,
    "internal_notes": string,
    "tags": string[]
    "tag_ids": string[]
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
        const result = await req.json() as PretalxResultsResponse<PretalxSpeaker>;
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

    async getTalks(offset: number, limit: number) {
        const url = new URL(this.baseUri + '/talks/');
        url.searchParams.set('offset', offset.toString());
        url.searchParams.set('limit', limit.toString());
        const req = await fetch(url, this.requestInit);
        if (!req.ok) {
            const reason = await req.text();
            throw Error(`Failed to request talks from Pretalx: ${req.status} ${reason}`);
        }
        const result = await req.json() as PretalxResultsResponse<PretalxTalk>;
        const nextValue = result.next && new URL(result.next).searchParams.get('offset');
        return {
            talks: result.results,
            next: nextValue ? parseInt(nextValue) : null,
        };
    }

    async *getAllTalks(): AsyncGenerator<PretalxTalk, void, void> {
        let offset: number|null = 0;
        do {
            const { next: newOffset, talks } = await this.getTalks(offset, 100);
            for (const talk of talks) {
                yield talk;
            }
            offset = newOffset
        } while (offset !== null)
    }
}