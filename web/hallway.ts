import "./hallway.scss"

import { joinConference } from "./jitsi";
import * as Hls from "hls.js/dist/hls.light.js";
import * as qs from "qs";
import { MatrixCapabilities, WidgetApi, VideoConferenceCapabilities } from "matrix-widget-api";

// c+ped from react-sdk to avoid dependency
enum ElementWidgetActions {
    ClientReady = "im.vector.ready",
    HangupCall = "im.vector.hangup",
    OpenIntegrationManager = "integration_manager_open",
    ViewRoom = "io.element.view_room",
}

// Example widget (to prove imports work)
const testWidget = new WidgetApi(/*widgetId*/);
testWidget.requestCapability(MatrixCapabilities.AlwaysOnScreen);


async function start() {
    let widgetApi = null;
    // The widget's options are encoded into the fragment to avoid leaking info to the server. The widget
    // spec on the other hand requires the widgetId and parentUrl to show up in the regular query string.
    const widgetQuery = qs.parse(window.location.hash.substring(1));
    const query = Object.assign({}, qs.parse(window.location.search.substring(1)), widgetQuery);
    const qsParam = (name: string, optional = false): string => {
        if (!optional && (!query[name] || typeof (query[name]) !== 'string')) {
            throw new Error(`Expected singular ${name} in query string`);
        }
        return <string>query[name];
    };
    const conferenceId = qsParam('conferenceId');
    if (!conferenceId || conferenceId.length === 0) {
        return;
    }
    
    const holdingScreen = document.getElementById('holdingScreen');
    const videoContainer = document.getElementById('videoContainer');
    const video = document.getElementById('video') as HTMLVideoElement;
    const joinButton = document.getElementById('joinButton');
    const jitsiContainer = document.getElementById('jitsiContainer');
    const controlBar = document.getElementById('controlBar');

    const config = {
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 3,
        liveDurationInfinity: true,
        liveBackBufferLength: 4,
        lowLatencyMode: true,
        progressive: true,
    };
    const hls = new Hls(config);

    const onJitsiFinished = () => {
        hls.startLoad();
        video.play();
        videoContainer.style.display = 'block';
        controlBar.style.display = 'block';
    };

    joinButton.addEventListener('click', () => {
        video.pause();
        hls.stopLoad();
        videoContainer.style.display = 'none';
        controlBar.style.display = 'none';
        holdingScreen.style.display = 'none';
        jitsiContainer.style.display = 'block';
        
        joinConference(query, widgetApi, onJitsiFinished);
    });

    holdingScreen.style.display = 'inline';

    // If we have these params, expect a widget API to be available (ie. to be in an iframe
    // inside a matrix client). Otherwise, assume we're on our own, eg. have been popped
    // out into a browser.
    const parentUrl = qsParam('parentUrl', true);
    const widgetId = qsParam('widgetId', true);

    if (parentUrl && widgetId) {
        video.style.height = '100%';
        video.style.maxWidth = '100%';

        const parentOrigin = new URL(parentUrl).origin;
        widgetApi = new WidgetApi(widgetId, parentOrigin);
        widgetApi.requestCapabilities(VideoConferenceCapabilities);
        await Promise.all([
            new Promise<void>(resolve => {
                widgetApi.once(`action:${ElementWidgetActions.ClientReady}`, ev => {
                    ev.preventDefault();
                    widgetApi.transport.reply(ev.detail, {});
                    resolve();
                });
            }),
            new Promise<void>(resolve => {
                widgetApi.once("ready", () => resolve());
            }),
        ]);
        await widgetApi.setAlwaysOnScreen(false);
        widgetApi.start();
    } else {
        console.warn("No parent URL or no widget ID - assuming no widget API is available");
        video.style.maxHeight = '100%';
        video.style.width = '100%';
    }

    const streamUrl = "https://stream.matrix.org/hls/" + conferenceId + ".m3u8";
    if (Hls.isSupported()) {
        hls.on(Hls.Events.ERROR, (e, data) => {
            console.log("error", e, data);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                console.log("network error: trying again in 5s");
                holdingScreen.style.display = 'inline';
                videoContainer.style.display = 'none';
                setTimeout(() => {
                    hls.loadSource(streamUrl);
                }, 5000);
            }
        });
        hls.on(Hls.Events.MANIFEST_LOADED, (e, data) => {
            holdingScreen.style.display = 'none';
            videoContainer.style.display = 'block';
            if (widgetApi) widgetApi.setAlwaysOnScreen(false);
        });
        hls.attachMedia(video);
        hls.loadSource(streamUrl);
    } else {
        video.src = streamUrl;
    }
}

start();