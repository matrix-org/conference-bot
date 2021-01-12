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

import * as Hls from "hls.js/dist/hls.light.js";
import { isWidget } from "./widgets";

const videoUrl = Array.from(document.getElementsByTagName('meta'))
    .find(t => t.name === 'org.matrix.confbot.video_url')
    .getAttribute('content');

export const videoEl = document.getElementById("livestream") as HTMLVideoElement;

if (isWidget) {
    videoEl.classList.add('widget');
} else {
    videoEl.classList.add('popout');
}

let hls: Hls;
let haveManifest = false;
let isVideoMode = true;

export function pause() {
    isVideoMode = false;
    if (hls) hls.stopLoad();
    videoEl.pause();
}

export function play() {
    isVideoMode = true;
    if (hls) {
        if (haveManifest) {
            hls.startLoad();
        } else {
            hls.loadSource(videoUrl);
        }
    }
    videoEl.play();
}

export function makeLivestream(readyFn: () => void) {
    if (Hls.isSupported()) {
        hls = new Hls({
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 3,
            liveDurationInfinity: true,
            liveBackBufferLength: 4,
            lowLatencyMode: true,
            progressive: true,
        });
        hls.on(Hls.Events.ERROR, (e, data) => {
            console.error("HLS error: ", e, data);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                console.log("Network error - trying again in 5s");
                setTimeout(() => {
                    if (!isVideoMode) {
                        return;
                    }
                    hls.loadSource(videoUrl);
                }, 5000);
            }
        });
        hls.on(Hls.Events.MANIFEST_LOADED, (e, data) => {
            haveManifest = true;
            readyFn();
        });
        hls.attachMedia(videoEl);
        hls.loadSource(videoUrl);
    } else {
        videoEl.src = videoUrl;
    }
}
