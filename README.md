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
* These instructions
* Note about rate limiting (and how there shall not be any)
* Information for what the bot does

## Usage

TODO:
* Some sort of `!import <url>` command (widget?)
* Some sort of `!run <event code>` command (widget?)
* Interactions with Mjolnir
* Expectations that livestreams are handled external to the bot
