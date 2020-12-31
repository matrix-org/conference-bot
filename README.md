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

## Room kinds

The conference bot uses the following terminology for defining what purpose a Matrix room serves:

* `Stage` - A place where talks are held with a static livestream for the whole event. In a physical
  world, this would be the location where attendees go to see a talk.
* `Talk` - A presentation. During the talk, the talk room will be closed to only the speakers and other
  relevant people (questions would be asked in the stage room). After the talk, the talk room is opened
  up and used for "hallway" conversations with the speakers.
* `Special Interest` - These are rooms where subject matter is usually specific and the bot's concern
  with it is largely moderation and lightly scheduled events. These are most like stands at a physical
  conference, or places to hold larger discussions.
