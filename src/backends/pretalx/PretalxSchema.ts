import { IInterestRoom, IAuditorium, ITalk, IConference } from "../../models/schedule";

type TextNode = {
    '#text': string;
}

type OptionalTextNode = {
    '#text': string;
}

type OneOrMore<T> = T|T[]; 

export interface PretalxData {
    schedule: {
        generator: {
            attrs: {
                '@_name': 'pretalx',
                '@_version': string,
            }
        },
        version: TextNode,
        conference: {
            acronym: TextNode,
            title: TextNode,
            start: TextNode,
            end: TextNode,
            days: TextNode,
            timeslot_duration: TextNode,
            base_url: TextNode,
        },
        day: OneOrMore<{
            attrs: {
                '@_index': string,
                '@_date': string,
                '@_start': string,
                '@_end': string,
            },
            room?: OneOrMore<{
                attrs: {
                    '@_name': string,
                },
                event?: OneOrMore<{
                    attrs: {
                        '@_guid': string,
                        '@_id': string,
                    }
                    date: TextNode,
                    start: TextNode,
                    duration: TextNode,
                    room: TextNode,
                    slug: TextNode,
                    url: TextNode,
                    recording: {
                        licence?: TextNode,
                        optout?: TextNode,
                    },
                    title: TextNode,
                    subtitle: OptionalTextNode,
                    track: OptionalTextNode,
                    type: OptionalTextNode,
                    language: OptionalTextNode,
                    abstract: OptionalTextNode,
                    description: OptionalTextNode,
                    logo: OptionalTextNode,
                    persons: OneOrMore<{
                        attrs: {
                            '@_id': string,
                        }
                    }&TextNode>,
                    links: OneOrMore<OptionalTextNode>,
                    attachments: OneOrMore<OptionalTextNode>,
                }>,
            }>,
        }>,
    },
}

export interface PretalxSchema {
    interestRooms: Map<string, IInterestRoom>;
    auditoriums: Map<string, IAuditorium>;
    talks: Map<string, ITalk>;
    conference: IConference;
}