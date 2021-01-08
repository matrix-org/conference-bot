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

import {KJUR} from 'jsrsasign';
import {
    IOpenIDCredentials,
} from "matrix-widget-api";

const JITSI_OPENIDTOKEN_JWT_AUTH = 'openidtoken-jwt';

// Dev note: we use raw JS without many dependencies to reduce bundle size.
// We do not need all of React to render a Jitsi conference.

declare let JitsiMeetExternalAPI: any;

let meetApi: any; // JitsiMeetExternalAPI

/**
 * Create a JWT token fot jitsi openidtoken-jwt auth
 *
 * See https://github.com/matrix-org/prosody-mod-auth-matrix-user-verification
 */
function createJWTToken(jitsiDomain, roomId, avatarUrl, displayName, openIdToken) {
    // Header
    const header = {alg: 'HS256', typ: 'JWT'};
    // Payload
    const payload = {
        // As per Jitsi token auth, `iss` needs to be set to something agreed between
        // JWT generating side and Prosody config. Since we have no configuration for
        // the widgets, we can't set one anywhere. Using the Jitsi domain here probably makes sense.
        iss: jitsiDomain,
        sub: jitsiDomain,
        aud: `https://${jitsiDomain}`,
        room: "*",
        context: {
            matrix: {
                token: openIdToken.access_token,
                room_id: roomId,
            },
            user: {
                avatar: avatarUrl,
                name: displayName,
            },
        },
    };
    // Sign JWT
    // The secret string here is irrelevant, we're only using the JWT
    // to transport data to Prosody in the Jitsi stack.
    return KJUR.jws.JWS.sign(
        'HS256',
        JSON.stringify(header),
        JSON.stringify(payload),
        'notused',
    );
}

export async function joinConference(opts, widgetApi, onCallback) { // event handler bound in HTML
    const jitsiDomain = opts.conferenceDomain;
    const conferenceId = opts.conferenceId;
    const displayName = opts.displayName;
    const avatarUrl = opts.avatarUrl;
    const userId = opts.userId;
    const jitsiAuth = opts.auth;
    const roomId = opts.roomId;

    let jwt;
    let openIdToken: IOpenIDCredentials;
    if (jitsiAuth === JITSI_OPENIDTOKEN_JWT_AUTH) {
        openIdToken = await widgetApi.requestOpenIDConnectToken();
        console.log("Got OpenID Connect token");
        if (!openIdToken?.access_token) { // eslint-disable-line camelcase
            // We've failed to get a token, don't try to init conference
            console.warn('Expected to have an OpenID credential, cannot initialize widget.');
            document.getElementById("widgetActionContainer").innerText = "Failed to load Jitsi widget";
            return;
        }
        jwt = createJWTToken(jitsiDomain, roomId, avatarUrl, displayName, openIdToken);
    }

    console.warn(
        "[Jitsi Widget] The next few errors about failing to parse URL parameters are fine if " +
        "they mention 'external_api' or 'jitsi' in the stack. They're just Jitsi Meet trying to parse " +
        "our fragment values and not recognizing the options.",
    );
    const options = {
        width: "100%",
        height: "100%",
        parentNode: document.querySelector("#jitsiContainer"),
        roomName: conferenceId,
        interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MAIN_TOOLBAR_BUTTONS: [],
            VIDEO_LAYOUT_FIT: "height",
        },
        jwt: jwt,
    };

    meetApi = new JitsiMeetExternalAPI(jitsiDomain, options);
    if (displayName) meetApi.executeCommand("displayName", displayName);
    if (avatarUrl) meetApi.executeCommand("avatarUrl", avatarUrl);
    if (userId) meetApi.executeCommand("email", userId);

    meetApi.on("readyToClose", () => {
        document.getElementById("jitsiContainer").innerHTML = "";
        meetApi = null;
    });
}
