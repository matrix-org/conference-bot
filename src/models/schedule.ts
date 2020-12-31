/*
Copyright 2020 The Matrix.org Foundation C.I.C.

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

export interface IPerson {
    id: string;
    name: string;
}

export interface IEvent {
    id: string;
    dateTs: number; // ms
    startTime: number; // ms
    endTime: number; // ms
    slug: string;
    title: string;
    subtitle: string;
    track: string;
    speakers: IPerson[];
}

export interface IRoom {
    id: string;
    eventsByDate: {
        [day: number]: IEvent[]; // ms timestamp
    };
}

export interface IConference {
    title: string;
    rooms: IRoom[];
}
