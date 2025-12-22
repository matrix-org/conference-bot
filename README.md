# conference-bot
The conductor for your orchestra^Wconference

## Development

1. `yarn install`
2. Copy `config/default.yaml` to `config/development.yaml` and edit accordingly.
3. `yarn start:dev`

The project is a TypeScript bot based off the concepts of [Mjolnir](https://github.com/matrix-org/mjolnir),
using [matrix-bot-sdk](https://github.com/turt2live/matrix-bot-sdk) as a base.

## Production (Docker)

TODO:
* Information for what the bot does

This bot is best deployed with Docker. Note that the steps required to get the bot into production are
complicated.

1. First, register a user on your homeserver for the bot to use. In Synapse, this would be `register_new_matrix_user`.
2. Set up any profile data for that user (displayname and avatar).
3. On your homeserver, prepare and install an appservice registration like so:
   ```yaml
    id: conference_bot # Can be any helpful identifier
    hs_token: CHANGE_ME # hs_token and as_token must be unique and secret
    as_token: CHANGE_ME
    namespaces:
      users:
        - exclusive: true
          regex: '@yourbot:example.org'  # Set this to your bot's user ID.
      aliases:
        - exclusive: false
          regex: '#.*:example.org'  # Change the domain to match your server.
      rooms: []
    url: null  # Important! The bot doesn't receive transactions, so set this explicitly to null.
    sender_localpart: not_confbot  # Use something other than your bot's localpart.
    rate_limited: false  # Important! The bot is noisy.
   ```
4. Create `/etc/conference-bot` or wherever you are comfortable with mapping a volume for the bot.
5. Copy `config/default.yaml` from this repo to `/etc/conference-bot/config/production.yaml` and edit
   accordingly.
6. Run the container with Docker. For example: `docker run -d --rm --name conference-bot -v /etc/conference-bot:/data -p 8080:8080 matrixdotorg/conference-bot`
7. Reverse proxy port `8080` as appropriate, using SSL if needed.

## Usage

TODO:
* Some sort of `!import <url>` command (widget?)
* Some sort of `!run <event code>` command (widget?)
* Interactions with Mjolnir
* Expectations that livestreams are handled external to the bot

## Room kinds

The conference bot uses the following terminology for defining what purpose a Matrix room serves:

* `Auditorium` - A place where talks are held with a static livestream for the whole event. In a physical
  world, this would be the location where attendees go to see a talk.
* `Talk` - A presentation. During the talk, the talk room will be closed to only the speakers and other
  relevant people (questions would be asked in the stage room). After the talk, the talk room is opened
  up and used for "hallway" conversations with the speakers.
* `Special Interest` - These are rooms where subject matter is usually specific and the bot's concern
  with it is largely moderation and lightly scheduled events. These are most like stands at a physical
  conference, or places to hold larger discussions.

## Running the end-to-end tests

Before running the end-to-end tests you need to have a running homerunner instance.

To do so, get a Complement checkout (`git clone https://github.com/matrix-org/complement`) and in the Complement directory,
compile homerunner with `go build ./cmd/homerunner`.

Now you can run `HOMERUNNER_SPAWN_HS_TIMEOUT_SECS=100 path/to/complement/homerunner` to start homerunner.

With homerunner running, you can now run the tests with:

```shell-commands
npm run test:e2e
```
