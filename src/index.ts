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

import { LogLevel, LogService, SimpleFsStorageProvider, UserID } from "matrix-bot-sdk";
import * as path from "path";
import runtimeConfig, { IConfig, IPentaScheduleBackendConfig } from "./config";
import { ICommand } from "./commands/ICommand";
import { HelpCommand } from "./commands/HelpCommand";
import { BuildCommand } from "./commands/BuildCommand";
import { Conference } from "./Conference";
import { InviteCommand } from "./commands/InviteCommand";
import express from "express";
import { Liquid } from "liquidjs";
import {
    makeHybridWidget,
    renderAuditoriumWidget,
    renderHealthz,
    renderHybridWidget,
    renderScoreboard,
    renderScoreboardWidget,
    renderTalkWidget,
    rtmpRedirect
} from "./web";
import { DevCommand } from "./commands/DevCommand";
import { IRCBridge } from "./IRCBridge";
import { IrcPlumbCommand } from "./commands/IrcPlumbCommand";
import { PermissionsCommand } from "./commands/PermissionsCommand";
import { VerifyCommand } from "./commands/VerifyCommand";
import { CustomLogger } from "./CustomLogger";
import { InviteMeCommand } from "./commands/InviteMeCommand";
import { WidgetsCommand } from "./commands/WidgetsCommand";
import { Scoreboard } from "./Scoreboard";
import { Scheduler } from "./Scheduler";
import { RunCommand } from "./commands/RunCommand";
import { StopCommand } from "./commands/StopCommand";
import { CopyModeratorsCommand } from "./commands/CopyModeratorsCommand";
import { AttendanceCommand } from "./commands/AttendanceCommand";
import { ScheduleCommand } from "./commands/ScheduleCommand";
import { CheckInMap } from "./CheckInMap";
import { FDMCommand } from "./commands/FDMCommand";
import { IScheduleBackend } from "./backends/IScheduleBackend";
import { PentaBackend } from "./backends/penta/PentaBackend";
import { JsonScheduleBackend } from "./backends/json/JsonScheduleBackend";
import { JoinCommand } from "./commands/JoinRoomCommand";
import { StatusCommand } from "./commands/StatusCommand";
import { CachingBackend } from "./backends/CachingBackend";
import { ConferenceMatrixClient } from "./ConferenceMatrixClient";
import { Server } from "http";
import { DummyScheduleBackend } from "./backends/dummy/backend";

LogService.setLogger(new CustomLogger());
LogService.setLevel(LogLevel.DEBUG);
LogService.info("index", "Bot starting...");

export class ConferenceBot {
    private webServer?: Server;
    private static async loadBackend(config: IConfig) {
        switch (config.conference.schedule.backend) {
            case "penta":
                return await CachingBackend.new(() => PentaBackend.new(config), path.join(config.dataPath, "penta_cache.json"));
            case "json":
                return await JsonScheduleBackend.new(config.dataPath, config.conference.schedule);
            case "dummy":
                return new DummyScheduleBackend();
            default:
                throw new Error(`Unknown scheduling backend: choose penta or json!`)
        }
    }

    public static async start(config: IConfig): Promise<ConferenceBot> {
        const storage = new SimpleFsStorageProvider(path.join(config.dataPath, "bot.json"));
        const client = await ConferenceMatrixClient.create(config, storage);
        client.impersonateUserId(config.userId);       
        const backend = await this.loadBackend(config);
        const conference = new Conference(backend, config.conference.id, client, config);
        const checkins = new CheckInMap(client, config);
        const scoreboard = new Scoreboard(conference, client, config);
        const scheduler = new Scheduler(client, conference, scoreboard, checkins, config);
    
        let ircBridge: IRCBridge | null = null;
        if (config.ircBridge != null) {
            ircBridge = new IRCBridge(config, client);
        }
    
    
        return new ConferenceBot(config, backend, client, conference, scoreboard, scheduler, ircBridge);
    }

    private constructor(
        private readonly config: IConfig,
        private readonly backend: IScheduleBackend,
        public readonly client: ConferenceMatrixClient,
        public readonly conference: Conference,
        public readonly scoreboard: Scoreboard,
        public readonly scheduler: Scheduler,
        private readonly ircBridge: IRCBridge|null) {

    }


    public async main() {
        let localpart;
        let displayName;
        let userId;
        // Quickly check connectivity before going much further
        userId = await this.client.getUserId();
        LogService.info("index", "Running as ", userId);
    
        localpart = new UserID(userId).localpart;
    
        try {
            const profile = await this.client.getUserProfile(userId);
            displayName = profile?.displayname ?? localpart;
        } catch (ex) {
            LogService.warn("index", "The bot has no profile. Consider setting one.");
            // No profile set, assume localpart.
            displayName = localpart;
        }
    
        this.registerCommands(userId, localpart, displayName);
    
        await this.client.joinRoom(this.config.managementRoom);
    
        await this.conference.construct();
    
        this.setupWebserver();
    
        if (!this.conference.isCreated) {
            await this.client.sendHtmlNotice(this.config.managementRoom, "" +
                "<h4>Welcome!</h4>" +
                "<p>Your conference hasn't been built yet (or I don't know of it). If your this.config is correct, run <code>!conference build</code> to start building your conference.</p>"
            );
        } else {
            await this.client.sendHtmlNotice(this.config.managementRoom, "" +
                "<h4>Bot restarted</h4>" +
                "<p>I am ready to start performing conference actions.</p>"
            );
        }
    
        if (this.backend.wasLoadedFromCache()) {
            await this.client.sendHtmlText(this.config.managementRoom, "" +
                "<h4>⚠ Cached schedule in use ⚠</h4>" +
                "<p>@room ⚠ The bot failed to load the schedule properly and a cached copy is being used.</p>"
            );
        }
    
        // Load the previous room scoreboards. This has to happen before we start syncing, otherwise
        // new scoreboard changes will get lost. The `MatrixClient` resumes syncing from where it left
        // off, so events will only be missed if the bot dies while processing them.
        await this.scoreboard.load();
    
        await this.scheduler.prepare();
        await this.client.start();
    
        // Needs to happen after the sync loop has started
        // Note that the IRC bridge will cause a crash if wrongly configured, so be cautious that it's not
        // wrongly enabled in conferences without one.
        await this.ircBridge?.setup();
    }

    private async setupWebserver() {
        const app = express();
        const tmplPath = process.env.CONF_TEMPLATES_PATH || './srv';
        const engine = new Liquid({
            root: tmplPath,
            cache: process.env.NODE_ENV === 'production',
        });
        app.use(express.urlencoded({extended: true}));
        app.use('/assets', express.static(this.config.webserver.additionalAssetsPath));
        app.use('/bundles', express.static(path.join(tmplPath, 'bundles')));
        app.engine('liquid', engine.express());
        app.set('views', tmplPath);
        app.set('view engine', 'liquid');
        app.get('/widgets/auditorium.html', (req, res) => renderAuditoriumWidget(req, res, this.conference, this.config.livestream.auditoriumUrl));
        app.get('/widgets/talk.html', (req, res) =>  renderTalkWidget(req, res, this.conference, this.config.livestream.talkUrl, this.config.livestream.jitsiDomain));
        app.get('/widgets/scoreboard.html', (req, res) =>  renderScoreboardWidget(req,res, this.conference));
        app.get('/widgets/hybrid.html', (req, res) => renderHybridWidget(req, res, this.config.livestream.hybridUrl, this.config.livestream.jitsiDomain));
        app.post('/onpublish', (req, res) =>  rtmpRedirect(req,res,this.conference, this.config.livestream.onpublish));
        app.get('/healthz', renderHealthz);
        app.get('/scoreboard/:roomId', (rq, rs) => renderScoreboard(rq, rs, this.scoreboard, this.conference));
        app.get('/make_hybrid', (req, res) =>  makeHybridWidget(req, res, this.client, this.config.livestream.widgetAvatar, this.config.webserver.publicBaseUrl));
        this.webServer = app.listen(this.config.webserver.port, this.config.webserver.address, () => {
            LogService.info("web", `Webserver running at http://${this.config.webserver.address}:${this.config.webserver.port}`);
        });
    }

    private async registerCommands(userId: string, localpart: string, displayName: string) {
        const commands: ICommand[] = [
            new AttendanceCommand(this.client, this.conference),
            new BuildCommand(this.client, this.conference, this.config),
            new CopyModeratorsCommand(this.client),
            new DevCommand(this.client, this.conference),
            new FDMCommand(this.client, this.conference),
            new HelpCommand(this.client),
            new InviteCommand(this.client, this.conference, this.config),
            new InviteMeCommand(this.client, this.conference),
            new JoinCommand(this.client),
            new PermissionsCommand(this.client, this.conference),
            new RunCommand(this.client, this.conference, this.scheduler),
            new ScheduleCommand(this.client, this.conference, this.scheduler),
            new StatusCommand(this.client, this.conference, this.scheduler),
            new StopCommand(this.client, this.scheduler),
            new VerifyCommand(this.client, this.conference),
            new WidgetsCommand(this.client, this.conference, this.config),
        ];
        if (this.ircBridge !== null) {
            commands.push(new IrcPlumbCommand(this.client, this.conference, this.ircBridge));
        }

        this.client.on("room.message", async (roomId: string, event: any) => {
            if (roomId !== this.config.managementRoom) return;
            if (!event['content']) return;
            if (event['content']['msgtype'] !== 'm.text') return;
            if (!event['content']['body']) return;

            // Check age just in case we recently started
            const now = Date.now();
            if (Math.abs(now - event['origin_server_ts']) >= 900000) { // 15min
                LogService.warn("index", `Ignoring ${event['event_id']} in management room due to age`);
                return;
            }

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
                return await this.client.replyNotice(roomId, event, `Invalid command. Try ${prefixUsed.trim()} help`);
            }

            try {
                for (const command of commands) {
                    if (command.prefixes.includes(args[0].toLowerCase())) {
                        LogService.info("index", `${event['sender']} is running command: ${content['body']}`);
                        return await command.run(roomId, event, args.slice(1));
                    }
                }
            } catch (e) {
                LogService.error("index", "Error processing command: ", e);
                return await this.client.replyNotice(roomId, event, `There was an error processing your command: ${e?.message}`);
            }

            return await this.client.replyNotice(roomId, event, `Unknown command. Try ${prefixUsed.trim()} help`);
        });
    }

    public async stop() {
        // TODO: Wait for pending tasks
        await this.scheduler.stop();
        this.client.stop();
        this.webServer?.close();
    }
}

if (require.main === module) {
    (async function () {
        const conf = await ConferenceBot.start(runtimeConfig);
        process.on('SIGINT', () => {
            conf.stop().then(() => {
                process.exit(0);
            }).catch(ex => {
                LogService.warn("index", "Failed to exit gracefully", ex);
                process.exit(1);
            })
        });
        
        return conf.main();
    })().catch((ex) => {
        LogService.error("index", "Fatal error", ex);
        process.exit(1);
    });
}
