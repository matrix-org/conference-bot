export interface IEvent {
    attr: {
        "@_id": string; // number
    };
    start: string;
    duration: string;
    room: string;
    slug: string;
    title: string;
    subtitle: string;
    track: string;
    type: "devroom";
    language: string;
    abstract: string;
    description: string;
    persons: {
        person: {
            attr: {
                "@_id": string; // number
            };
            "#text": string;
        }[];
    };
    attachments: unknown; // TODO
    links: {
        link: {
            attr: {
                "@_href": string;
            };
            "#text": string;
        }[];
    };
}

export interface ISchedule {
    schedule: {
        conference: {
            title: string;
            subtitle: string;
            venue: string;
            city: string;
            start: string;
            end: string;
            days: number;
            day_change: string;
            timeslot_duration: string;
        };
        day: {
            attr: {
                "@_index": string; // number
                "@_date": string;
            };
            room: {
                attr: {
                    "@_name": string;
                };
                event: IEvent[];
            }[];
        }[];
    };
}
