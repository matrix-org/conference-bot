/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

export interface IRawDbTalk {
    event_id: string; // penta ID
    /**
     * ID of the **auditorium** that will hold this talk.
     */
    conference_room: string;
    start_datetime: number; // ms timestamp, utc
    duration_seconds: number; // seconds
    presentation_length_seconds: number; // seconds
    end_datetime: number; // ms timestamp, utc
    qa_start_datetime: number; // ms timestamp, utc
    prerecorded: boolean;
}

export interface IDbTalk extends IRawDbTalk {
    /**
     * The start time of the talk's livestream, as a Unix timestamp in milliseconds.
     *
     * This is the start of the Q&A session for prerecorded talks, and the start of the talk for
     * non-prerecorded talks.
     */
    livestream_start_datetime: number; // ms timestamp, utc

    /**
     * The end time of the talk's livestream, as a Unix timestamp in milliseconds.
     *
     * This may occur before the end of the talk.
     */
    livestream_end_datetime: number; // ms timestamp, utc
}
