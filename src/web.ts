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
import * as template from "string-template";
import config from "./config";
import { base32 } from "rfc4648";
import { LogService } from "matrix-bot-sdk";
import { sha256 } from "./utils";
import * as dns from "dns";

export function renderAuditoriumWidget(req: Request, res: Response) {
    const audId = req.query?.['auditoriumId'] as string;
    if (!audId || Array.isArray(audId)) {
        return res.sendStatus(404);
    }

    if (!config.RUNTIME.conference.getAuditorium(audId)) {
        return res.sendStatus(404);
    }

    const streamUrl = template(config.livestream.auditoriumUrl, {
        id: audId.toLowerCase(),
    });

    return res.render('auditorium.liquid', {
        videoUrl: streamUrl,
        roomName: audId,
    });
}

export async function renderTalkWidget(req: Request, res: Response) {
    const audId = req.query?.['auditoriumId'] as string;
    if (!audId || Array.isArray(audId)) {
        return res.sendStatus(404);
    }
    const talkId = req.query?.['talkId'] as string;
    if (!talkId || Array.isArray(talkId)) {
        return res.sendStatus(404);
    }

    const aud = config.RUNTIME.conference.getAuditorium(audId);
    if (!aud) {
        return res.sendStatus(404);
    }

    const talk = config.RUNTIME.conference.getTalk(talkId);
    if (!talk) {
        return res.sendStatus(404);
    }

    if (await talk.getAuditoriumId() !== await aud.getId()) {
        return res.sendStatus(404);
    }

    const streamUrl = template(config.livestream.talkUrl, {
        audId: audId.toLowerCase(),
        slug: (await talk.getDefinition()).slug.toLowerCase(),
        //slug: base32.stringify(Buffer.from(talk.roomId), { pad: false }).toLowerCase(),
    });

    return res.render('talk.liquid', {
        videoUrl: streamUrl,
        roomName: await talk.getName(),
        conferenceDomain: config.livestream.jitsiDomain,
        conferenceId: base32.stringify(Buffer.from(talk.roomId), { pad: false }).toLowerCase(),
    });
}

export async function rtmpRedirect(req: Request, res: Response) {
    // Check auth (salt must match known salt)
    if (req.query?.['auth'] !== config.livestream.onpublish.salt) {
        return res.sendStatus(200); // fake a 'no mapping' response for security
    }

    try {
        // First we un-base32 the conference name (because prosody auth)
        const confName = req.body?.['name'];
        if (!confName) return res.sendStatus(200); // imply no mapping
        const mxRoomId = Buffer.from(base32.parse(confName, {loose: true})).toString();

        // Try to find a talk with that room ID
        const talk = config.RUNTIME.conference.storedTalks.find(t => t.roomId === mxRoomId);
        if (!talk) return res.sendStatus(200); // Annoying thing of nginx wanting "no mapping" to be 200 OK

        // Redirect to RTMP URL
        const hostname = template(config.livestream.onpublish.rtmpHostnameTemplate, {
            squishedAudId: (await talk.getAuditoriumId()).replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
        });
        const ip = await dns.promises.resolve(hostname);
        const uri = template(config.livestream.onpublish.rtmpUrlTemplate, {
            hostname: ip,
            saltedHash: sha256((await talk.getId()) + '.' + config.livestream.onpublish.salt),
        });
        return res.redirect(uri);
    } catch (e) {
        LogService.error("web", "Error trying to do onpublish:", e);
        return res.sendStatus(500);
    }
}
