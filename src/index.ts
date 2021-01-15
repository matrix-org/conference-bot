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

// TODO: Healthz
// TODO: Timezones!! (Europe-Brussels)
// TODO: Start webserver

import { LogLevel, LogService, MatrixClient, RichConsoleLogger, SimpleFsStorageProvider, UserID } from "matrix-bot-sdk";
import * as path from "path";
import config from "./config";
import { ICommand } from "./commands/ICommand";
import { HelpCommand } from "./commands/HelpCommand";
import { BuildCommand } from "./commands/BuildCommand";
import { Conference } from "./Conference";
import { InviteCommand } from "./commands/InviteCommand";
import * as express from "express";
import { Liquid } from "liquidjs";
import { renderAuditoriumWidget, renderTalkWidget } from "./web";
import { DevCommand } from "./commands/DevCommand";
import { IRCBridge } from "./ircBridge";
import { IrcPlumbCommand } from "./commands/IrcPlumbCommand";
import { PermissionsCommand } from "./commands/PermissionsCommand";
import { VerifyCommand } from "./commands/VerifyCommand";

config.RUNTIME = {
    client: null,
    conference: null,
};

LogService.setLogger(new RichConsoleLogger());
LogService.setLevel(LogLevel.DEBUG);
LogService.info("index", "Bot starting...");

const storage = new SimpleFsStorageProvider(path.join(config.dataPath, "bot.json"));
const client = new MatrixClient(config.homeserverUrl, config.accessToken, storage);
config.RUNTIME.client = client;
client.impersonateUserId("@fosdem:localdev.t2host.io");

const conference = new Conference(config.conference.id, client);
config.RUNTIME.conference = conference;

const ircBridge = new IRCBridge(config.ircBridge, client);

let localpart;
let displayName;
let userId;

(async function () {
    // Quickly check connectivity before going much further
    userId = await client.getUserId();
    LogService.info("index", "Running as ", userId);

    localpart = new UserID(userId).localpart;

    const profile = await client.getUserProfile(userId);
    if (profile?.displayname) {
        displayName = profile.displayname;
    } else {
        displayName = localpart; // for sanity
    }

    registerCommands();
    setupWebserver();

    await client.joinRoom(config.managementRoom);

    await conference.construct();
    if (!conference.isCreated) {
        await client.sendHtmlNotice(config.managementRoom, "" +
            "<h4>Welcome!</h4>" +
            "<p>Your conference hasn't been built yet (or I don't know of it). If your config is correct, run <code>!conference build</code> to start building your conference.</p>"
        );
    } else {
        await client.sendHtmlNotice(config.managementRoom, "" +
            "<h4>Bot restarted</h4>" +
            "<p>Your conference has been built already, but I appear to have restarted. If this is unexpected, please contact a support representative.</p>"
        );
    }

    await client.start();

    // Needs to happen after the sync loop has started
    await ircBridge.setup();
})();

function registerCommands() {
    const commands: ICommand[] = [
        new HelpCommand(),
        new BuildCommand(),
        new VerifyCommand(),
        new InviteCommand(),
        new DevCommand(),
        new IrcPlumbCommand(ircBridge),
        new PermissionsCommand(),
    ];

    client.on("room.message", async (roomId: string, event: any) => {
        if (roomId !== config.managementRoom) return;
        if (!event['content']) return;
        if (event['content']['msgtype'] !== 'm.text') return;
        if (!event['content']['body']) return;

        const content = event['content'];

        const prefixes = [
            "!conference",
            localpart + ":",
            displayName + ":",
            userId + ":",
            localpart + " ",
            displayName + " ",
            userId + " ",
        ];

        const prefixUsed = prefixes.find(p => content['body'].startsWith(p));
        if (!prefixUsed) return;

        const restOfBody = content['body'].substring(prefixUsed.length).trim();
        const args = restOfBody.split(' ');
        if (args.length <= 0) {
            return await client.replyNotice(roomId, event, `Invalid command. Try ${prefixUsed.trim()} help`);
        }

        try {
            for (const command of commands) {
                if (command.prefixes.includes(args[0])) {
                    LogService.info("index", `${event['sender']} is running command: ${content['body']}`);
                    return await command.run(conference, client, roomId, event, args.slice(1));
                }
            }
        } catch (e) {
            LogService.error("index", "Error processing command: ", e);
            return await client.replyNotice(roomId, event, `There was an error processing your command: ${e.message}`);
        }

        return await client.replyNotice(roomId, event, `Unknown command. Try ${prefixUsed.trim()} help`);
    });
}

function setupWebserver() {
    const app = express();
    const tmplPath = process.env.CONF_TEMPLATES_PATH || './srv';
    const engine = new Liquid({
        root: tmplPath,
        cache: process.env.NODE_ENV === 'production',
    });
    app.use('/assets', express.static(config.webserver.additionalAssetsPath));
    app.use('/bundles', express.static(path.join(tmplPath, 'bundles')));
    app.engine('liquid', engine.express());
    app.set('views', tmplPath);
    app.set('view engine', 'liquid');
    app.get('/widgets/auditorium.html', renderAuditoriumWidget);
    app.get('/widgets/talk.html', renderTalkWidget);
    app.listen(config.webserver.port, config.webserver.address, () => {
        LogService.info("web", `Webserver running at http://${config.webserver.address}:${config.webserver.port}`);
    });
}
