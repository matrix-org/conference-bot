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

import "./common.scss";

import { joinConference } from "./jitsi";
import { VideoConferenceCapabilities, WidgetApi } from "matrix-widget-api";
import { controlsEl, makeLivestream, muteButton, pause, play, videoEl } from "./hls";
import { addlQuery, isWidget, widgetId } from "./widgets";
import { formatDuration, getAttr } from "./common";

const messagesEl = document.getElementById("messages");
const jitsiContainer = document.getElementById("jitsiContainer");
const jitsiUnderlay = document.getElementById("jitsiUnderlay");
const liveBanner = document.getElementById("liveBanner");
const liveBannerShortText = document.getElementById("liveBannerShortText");
const liveBannerLongText = document.getElementById("liveBannerLongText");
const joinButton = document.getElementById('joinButton');

const livestreamStartTime = getAttr('org.matrix.confbot.livestream_start_time') ?
    parseInt(getAttr('org.matrix.confbot.livestream_start_time')) :
    null;
const livestreamEndTime = getAttr('org.matrix.confbot.livestream_end_time') ?
    parseInt(getAttr('org.matrix.confbot.livestream_end_time')) :
    null;

let widgetApi: WidgetApi = null;

// Start widget API as early as possible
if (widgetId) {
    (async function () {
        widgetApi = new WidgetApi(widgetId);
        widgetApi.requestCapabilities(VideoConferenceCapabilities);
        widgetApi.start();
        await new Promise<void>(resolve => {
            widgetApi.once("ready", () => resolve());
        });
        await widgetApi.setAlwaysOnScreen(false);
    })();
}


messagesEl.style.display = 'block';
if (isWidget) {
    joinButton.style.display = 'block';
}

makeLivestream(showVideo);

let widgetMode: "video" | "jitsi" = "video";

function showVideo(ready = true) {
    if (widgetApi) widgetApi.setAlwaysOnScreen(false);
    jitsiContainer.style.display = 'none';
    jitsiUnderlay.style.display = 'none';
    messagesEl.style.display = ready ? 'none' : 'block';
    videoEl.style.display = ready ? 'block' : 'none';
    controlsEl.style.display = 'block';
    if (isWidget) {
        joinButton.style.display = 'inline';
    }
    muteButton.style.display = ready ? 'inline' : 'none';

    widgetMode = "video";
    updateLivestreamBanner();
}

function showJitsi() {
    pause();
    if (widgetApi) widgetApi.setAlwaysOnScreen(true);
    jitsiContainer.style.display = 'block';
    jitsiUnderlay.style.display = 'block';
    messagesEl.style.display = 'none';
    videoEl.style.display = 'none';
    controlsEl.style.display = 'none';

    widgetMode = "jitsi";
    updateLivestreamBanner();
}

function onJitsiEnd() {
    showVideo(false);
    play(showVideo);
}

const jitsiOpts = {
    conferenceId: getAttr('org.matrix.confbot.conf_id'),
    conferenceDomain: getAttr('org.matrix.confbot.conf_domain'),
    title: getAttr('org.matrix.confbot.conf_name'),
    displayName: addlQuery["displayName"],
    avatarUrl: addlQuery["avatarUrl"],
    userId: addlQuery["userId"],
    roomId: addlQuery["roomId"],
    auth: addlQuery["auth"],
}

joinButton.addEventListener('click', () => {
    showJitsi();
    joinConference(jitsiOpts, widgetApi, () => onJitsiEnd());
});

let liveBannerVisible: boolean = false;
/**
 * Shows or hides the live banner.
 * @param visible `true` to show the live banner; `false` to hide it.
 */
function setLiveBannerVisible(visible: boolean) {
    if (liveBannerVisible === visible) {
        return;
    }

    liveBannerVisible = visible;
    liveBanner.style.display = visible ? 'block' : 'none';
}

/**
 * Sets the text in the live banner.
 * @param shortText The text to show when horizontal space is limited.
 * @param longText The text to show when there is sufficient horizontal space.
 */
function setLiveBannerText(shortText: string, longText: string) {
    if (liveBannerShortText.innerText !== shortText) {
        liveBannerShortText.innerText = shortText;
    }
    if (liveBannerLongText.innerText !== longText) {
        liveBannerLongText.innerText = longText;
    }
}

/**
 * Updates the livestream banner.
 * @returns The interval until the next update, in milliseconds.
 */
function updateLivestreamBanner(): number | null {
    if (livestreamStartTime == null || livestreamEndTime == null) {
        // Livestream start and end time are unavailable.
        setLiveBannerVisible(false);
        return null;
    }

    const now = Date.now();
    if (now < livestreamStartTime - 5 * 60 * 1000) {
        // The start of the livestream is more than 5 minutes in the future.
        // Don't show anything.
        setLiveBannerVisible(false);
        return livestreamStartTime - 5 * 60 * 1000 - now;
    } else if (now < livestreamStartTime) {
        // The livestream starts within 5 minutes.
        // Show a countdown.
        const countdown = formatDuration(livestreamStartTime - now);
        if (widgetMode === "video") {
            setLiveBannerText(
                `LIVE IN\n${countdown}`,
                `The live broadcast starts in ${countdown}`,
            );
        } else if (widgetMode === "jitsi") {
            setLiveBannerText(
                `LIVE IN\n${countdown}`,
                `You will be live broadcasted in ${countdown}`,
            );
        }
        setLiveBannerVisible(true);
        return 100;
    } else if (now < livestreamEndTime) {
        // The livestream is ongoing.
        const countdown = formatDuration(livestreamEndTime - now);
        setLiveBannerText(
            `LIVE\n${countdown}`,
            `Live broadcast finishes in ${countdown}`,
        );
        setLiveBannerVisible(true);
        return 100;
    } else {
        // The livestream has ended.
        setLiveBannerVisible(false);
        return null;
    }
}

function updateLivestreamBannerTimer() {
    const nextUpdateInterval = updateLivestreamBanner();
    if (nextUpdateInterval !== null) {
        setTimeout(updateLivestreamBannerTimer, nextUpdateInterval);
    }
}
updateLivestreamBannerTimer();
