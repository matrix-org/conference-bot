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

import { Response, Request } from "express";
import template from "./utils/template"
import config from "./config";
import { base32 } from "rfc4648";
import { LogService, MatrixClient } from "matrix-bot-sdk";
import { sha256 } from "./utils";
import * as dns from "dns";
import { Scoreboard } from "./Scoreboard";
import { LiveWidget } from "./models/LiveWidget";
import { IDbTalk } from "./backends/penta/db/DbTalk";
import { Conference } from "./Conference";
import { IConfig } from "./config";

export function renderAuditoriumWidget(req: Request, res: Response, conference: Conference, auditoriumUrl: string) {
    const audId = req.query?.['auditoriumId'] as string;
    if (!audId || Array.isArray(audId)) {
        return res.sendStatus(404);
    }

    if (!conference.getAuditorium(audId)) {
        return res.sendStatus(404);
    }

    const streamUrl = template(auditoriumUrl, {
        id: audId.toLowerCase(),
        sId: audId.toLowerCase().replace(/[^a-z0-9]/g, ''),
    });

    return res.render('auditorium.liquid', {
        theme: req.query?.['theme'] === 'dark' ? 'dark' : 'light',
        videoUrl: streamUrl,
        roomName: audId,
    });
}

const TALK_CACHE_DURATION = 60 * 1000; // ms
const dbTalksCache: {
    [talkId: string]: {
        talk: Promise<IDbTalk | null>,
        cachedAt: number, // ms
    },
} = {};

/**
 * Gets the Pentabarf database record for a talk, with a cache.
 * @param talkId The talk ID.
 * @returns The database record for the talk, if it exists; `null` otherwise.
 */
async function getDbTalk(talkId: string, conference: Conference): Promise<IDbTalk | null> {
    const now = Date.now();
    if (!(talkId in dbTalksCache) ||
        now - dbTalksCache[talkId].cachedAt > TALK_CACHE_DURATION) {
        const db = await conference.getPentaDb();
        if (db === null) return null;

        dbTalksCache[talkId] = {
            talk: db.getTalk(talkId),
            cachedAt: now,
        };
    }

    return dbTalksCache[talkId].talk;
}

export async function renderTalkWidget(req: Request, res: Response, conference: Conference, talkUrl: string, jitsiDomain: string) {
    const audId = req.query?.['auditoriumId'] as string;
    if (!audId || Array.isArray(audId)) {
        return res.sendStatus(404);
    }
    const talkId = req.query?.['talkId'] as string;
    if (!talkId || Array.isArray(talkId)) {
        return res.sendStatus(404);
    }

    const aud = conference.getAuditorium(audId);
    if (!aud) {
        return res.sendStatus(404);
    }

    const talk = conference.getTalk(talkId);
    if (!talk) {
        return res.sendStatus(404);
    }

    if (await talk.getAuditoriumId() !== await aud.getId()) {
        return res.sendStatus(404);
    }

    // Fetch the corresponding talk from Pentabarf. We cache the `IDbTalk` to avoid hitting the
    // Pentabarf database for every visiting attendee once talk rooms are opened to the public.
    const dbTalk = await getDbTalk(talkId, conference);

    const streamUrl = template(talkUrl, {
        audId: audId.toLowerCase(),
        slug: (await talk.getDefinition()).slug.toLowerCase(),
        jitsi: base32.stringify(Buffer.from(talk.roomId), { pad: false }).toLowerCase(),
    });

    return res.render('talk.liquid', {
        theme: req.query?.['theme'] === 'dark' ? 'dark' : 'light',
        videoUrl: streamUrl,
        roomName: await talk.getName(),
        conferenceDomain: jitsiDomain,
        conferenceId: base32.stringify(Buffer.from(talk.roomId), { pad: false }).toLowerCase(),
        livestreamStartTime: dbTalk?.livestream_start_datetime ?? "",
        livestreamEndTime: dbTalk?.livestream_end_datetime ?? "",
    });
}

export async function renderHybridWidget(req: Request, res: Response, hybridUrl: string, jitsiDomain: string) {
    const roomId = req.query?.['roomId'] as string;
    if (!roomId || Array.isArray(roomId)) {
        return res.sendStatus(404);
    }

    const streamUrl = template(hybridUrl, {
        jitsi: base32.stringify(Buffer.from(roomId), { pad: false }).toLowerCase(),
    });

    return res.render('talk.liquid', { // it's the same widget
        theme: req.query?.['theme'] === 'dark' ? 'dark' : 'light',
        videoUrl: streamUrl,
        roomName: "Livestream / Q&A",
        conferenceDomain: jitsiDomain,
        conferenceId: base32.stringify(Buffer.from(roomId), { pad: false }).toLowerCase(),
    });
}

export async function makeHybridWidget(req: Request, res: Response, client: MatrixClient, avatar: string, url: string) {
    const roomId = req.query?.['roomId'] as string;
    if (!roomId || Array.isArray(roomId)) {
        return res.sendStatus(404);
    }

    const widget = await LiveWidget.hybridForRoom(roomId, client, avatar, url);
    const layout = LiveWidget.layoutForHybrid(widget);

    res.send({
        widget_id: widget.state_key,
        widget: widget.content,
        layout: layout.content.widgets[widget.state_key],
    });
}

export async function rtmpRedirect(req: Request, res: Response, conference: Conference, cfg: IConfig["livestream"]["onpublish"]) {
    // Check auth (salt must match known salt)
    if (req.query?.['auth'] !== cfg.salt) {
        return res.sendStatus(200); // fake a 'no mapping' response for security
    }

    try {
        // First we un-base32 the conference name (because prosody auth)
        const confName = req.body?.['name'];
        if (!confName) return res.sendStatus(200); // imply no mapping
        const mxRoomId = Buffer.from(base32.parse(confName, {loose: true})).toString();

        // Try to find a talk with that room ID
        const talk = conference.storedTalks.find(t => t.roomId === mxRoomId);
        if (!talk) return res.sendStatus(200); // Annoying thing of nginx wanting "no mapping" to be 200 OK

        // Redirect to RTMP URL
        const hostname = template(cfg.rtmpHostnameTemplate, {
            squishedAudId: (await talk.getAuditoriumId()).replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
        });
        const ip = await dns.promises.resolve(hostname);
        const uri = template(config.livestream.onpublish.rtmpUrlTemplate, {
            // Use first returned IP.
            hostname: ip[0],
            saltedHash: sha256((await talk.getId()) + '.' + config.livestream.onpublish.salt),
        });
        return res.redirect(uri);
    } catch (e) {
        LogService.error("web", "Error trying to do onpublish:", e);
        return res.sendStatus(500);
    }
}

export function renderHealthz(req: Request, res: Response) {
    return res.sendStatus(200);
}

export async function renderScoreboardWidget(req: Request, res: Response, conference: Conference) {
    const audId = req.query?.['auditoriumId'] as string;
    if (!audId || Array.isArray(audId)) {
        return res.sendStatus(404);
    }

    const aud = conference.getAuditorium(audId);
    if (!aud) {
        return res.sendStatus(404);
    }

    if (!(await aud.getDefinition()).isPhysical) {
        // For physical auditoriums, the widget sits in the backstage room and so there isn't any talk ID to cross-reference, so skip
        // these checks for physical auditoriums.
        // I'm not sure why we want to check a talk ID anyway — 'security'?
        // But I'll leave it be.

        const talkId = req.query?.['talkId'] as string;
        if (!talkId || Array.isArray(talkId)) {
            return res.sendStatus(404);
        }

        const talk = conference.getTalk(talkId);
        if (!talk) {
            return res.sendStatus(404);
        }

        if (await talk.getAuditoriumId() !== await aud.getId()) {
            return res.sendStatus(404);
        }
    }

    return res.render('scoreboard.liquid', {
        theme: req.query?.['theme'] === 'dark' ? 'dark' : 'light',
        trackingAlias: await aud.getCanonicalAlias(),
        trackingId: aud.roomId,
    });
}

export function renderScoreboard(req: Request, res: Response, scoreboard: Scoreboard, conference: Conference) {
    const roomId = req.params['roomId'];
    if (!roomId) return res.sendStatus(400);

    const auditorium = conference.storedAuditoriums.find(a => a.roomId === roomId);
    if (!auditorium) return res.sendStatus(404);

    let sb = scoreboard.getScoreboard(auditorium.roomId);
    sb = sb || {qaStartTime: null, ordered: []};
    res.send(sb);
}
