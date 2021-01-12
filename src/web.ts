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
