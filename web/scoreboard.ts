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
import { MatrixCapabilities, WidgetApi } from "matrix-widget-api";
import { widgetId } from "./widgets";
import { getAttr } from "./common";

const upvoteEl = document.getElementById("upvoted");

interface RoomMessage {
    permalink: string;
    text: string;
    upvotes: number;
    senderId: string;
    senderName?: string;
    senderAvatarHttpUrl?: string;
}

let widgetApi: WidgetApi = null;

// Start widget API as early as possible
if (widgetId) {
    (async function () {
        widgetApi = new WidgetApi(widgetId);
        widgetApi.requestCapability(MatrixCapabilities.MSC2931Navigate);
        widgetApi.start();
        await new Promise<void>(resolve => {
            widgetApi.once("ready", () => resolve());
        });
    })();
}

const forRoomId = getAttr('org.matrix.confbot.room_id');

function innerText(tag: string, clazz: string, text: string): [string, string[]] {
    const id = Date.now() + '-' + (Math.random() * Number.MAX_SAFE_INTEGER) + '-text';

    return [
        `<${tag} class="${clazz}" id="${id}"><!-- populated --></${tag}>`,
        [id, text],
    ];
}

function render(messages: RoomMessage[]) {
    let html = "";
    const innerTexts: string[][] = [];
    for (const message of messages) {
        html += "<div class='message'>";

        /** SENDER **/
        html += "<div class='sender'>";
        if (message.senderAvatarHttpUrl) {
            html += `<img src="${message.senderAvatarHttpUrl}" class="avatar" />`;
        } else {
            html += `<span class="avatar none">&nbsp;</span>`;
        }

        const name = message.senderName || message.senderId;
        let [val, t] = innerText('span', 'name', name);
        html += val;
        innerTexts.push(t);

        html += "</div>"

        /** MESSAGE **/
        html += "<div class='body'>";
        html += `<span class="votes"><a href="${message.permalink}" onclick="intercept(event)">${message.upvotes}</a></span>`;

        [val, t] = innerText('span', 'text', message.text);
        html += val;
        innerTexts.push(t);

        html += "</div>"

        html += "</div>"
    }
    upvoteEl.innerHTML = html;
    for (const innerText of innerTexts) {
        document.getElementById(innerText[0]).innerText = innerText[1];
    }
}

function doFetch() {
    fetch(`/scoreboard/${encodeURIComponent(forRoomId)}`).then(r => r.json()).then(r => {
        render(r['ordered']);
        setTimeout(doFetch, 3000);
    }).catch(() => setTimeout(doFetch, 15000));
}

function intercept(ev) {
    if (!widgetApi) return; // let the browser work

    ev.preventDefault();
    ev.stopPropagation();
    widgetApi.navigateTo(ev.target.href);
}
(<any>window).intercept = intercept;

doFetch();
