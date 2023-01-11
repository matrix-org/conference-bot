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

import { IPerson, Role } from "../../../models/schedule";

export interface IDbPerson {
    event_id: string; // penta talk ID
    person_id: string;
    event_role: Role;
    name: string;
    email: string;
    matrix_id: string;
    conference_room: string;
    remark: string;
}

export function dbPersonToPerson(dbPerson: IDbPerson): IPerson {
    return {
        id: dbPerson.person_id,
        matrix_id: dbPerson.matrix_id,
        role: dbPerson.event_role,
        email: dbPerson.email,
        name: dbPerson.name,
        // TODO There are other attributes which we don't carry over right now.
    };
}