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
const { base32 } = require('rfc4648');
import { MatrixClient } from "matrix-bot-sdk";
import { Scoreboard } from "./Scoreboard";
import { LiveWidget } from "./models/LiveWidget";
import { Conference } from "./Conference";

export function renderAuditoriumWidget(req: Request, res: Response, conference: Conference, auditoriumUrl: string) {
    const audId = req.query?.['auditoriumId'] as string;
    if (!audId || Array.isArray(audId)) {
        return res.sendStatus(404);
    }

    let aud = conference.getAuditorium(audId);
    if (!aud) {
        return res.sendStatus(404);
    }

    //let sid = audId.toLowerCase().replace(/[^a-z0-9]/g, '');

    // HACK for FOSDEM 2023 and FOSDEM 2024: transform auditorium IDs to the livestream ID
    // 1. 'K1.105A (Words)' -> 'k1.105a'
    // 2. 'k1.105a' -> 'k1105a'
    // DEPRECATED — see livestreamId instead nowadays!
    let sid = audId.toLowerCase().replace(/\s+\(.+\)$/, '').replace(/[^a-z0-9]/g, '');

    const streamUrl = template(auditoriumUrl, {
        id: audId.toLowerCase(),
        sId: sid,
        livestreamId: aud.getDefinition().livestreamId,
    });

    return res.render('auditorium.liquid', {
        theme: req.query?.['theme'] === 'dark' ? 'dark' : 'light',
        videoUrl: streamUrl,
        roomName: audId,
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
