/*
Copyright 2020, 2021 The Matrix.org Foundation C.I.C.

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

import * as Hls from "hls.js/dist/hls.light.js";

const videoUrl = Array.from(document.getElementsByTagName('meta'))
    .find(t => t.name === 'org.matrix.confbot.video_url')
    .getAttribute('content');

const params = (new URL(window.location.href)).searchParams;
const widgetId = params.get("widgetId");

const isWidget = widgetId && widgetId !== "$matrix_widget_id";
if (isWidget) {
    document.getElementById("livestream").classList.add('widget');
} else {
    document.getElementById("livestream").classList.add('popout');
}

if (Hls.isSupported()) {
    renderStatusMessage("Waiting for stream...");
    const config = {
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 3,
        liveDurationInfinity: true,
        liveBackBufferLength: 4,
        lowLatencyMode: true,
        progressive: true,
    };
    const hls = new Hls(config);
    hls.on(Hls.Events.ERROR, (e, data) => {
        console.error("HLS error: ", e, data);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            renderStatusMessage("Waiting for stream...");
            setTimeout(() => {
                hls.loadSource(videoUrl);
            }, 5000);
        }
    });
    hls.on(Hls.Events.MANIFEST_LOADED, (e, data) => {
        showVideo();
    });
    hls.attachMedia(document.getElementById("livestream"));
    hls.loadSource(videoUrl);
} else {
    renderStatusMessage("Sorry, your browser cannot play this livestream.");
}

function renderStatusMessage(message: string) {
    const el = document.getElementById("messages");
    el.innerText = message;
    el.style.display = 'block';

    const video = document.getElementById("livestream");
    video.style.display = 'none';
}

function showVideo() {
    document.getElementById("messages").style.display = 'none';
    document.getElementById("livestream").style.display = 'block';
}

