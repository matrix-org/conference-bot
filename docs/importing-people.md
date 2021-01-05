# Importing people to your conference

TODO:
1. Build the conference first
2. Run `!conference export roles` to dump the roles to disk.
3. Edit the file / run a merge
4. Run `!conference import roles` to (re-)import the roles from disk.

TODO: Rationale for why we're storing the yaml on disk and not dumping it into the room (file size, PII in the media repo, other issues)

Commented YAML example:

```yaml
# Note: Though this file is human-readable it is entirely meant to be
# written by the bot and parsed with tooling to generate it. It is
# intended that only minor corrections are done by humans.

# First we define all the roles we want to be able to assign to people.
# Matrix groups will be created for these roles, and appropriate flair
# will be represented in all rooms the bot creates.
roles:
  - # The name is used as reference in this file. It's also what forms 
    # the group ID in Matrix.
    name: staff
  - name: volunteers
  - name: vendors
  - name: managers
  - name: speakers
  - name: moderators
people:
  - # The ID is arbitrary and must uniquely identify the person. The ID is
    # used by this file and by the bot to correlate other information about
    # the user. Do not change the user's ID once it has been used. This must
    # be URL safe (ascii recommended).
    id: alice_example_01
    # The name is primarily used for reference in the mission control and
    # similar rooms. It is also used in advertisements for upcoming talks
    # and such.
    name: Alice Example
    # One of email and mxid must be supplied. If a mxid is supplied (or the
    # bot already knows of one) then the mxid will be used instead of email.
    # Otherwise, the bot will try email invites where possible and otherwise
    # wait to discover the user's mxid.
    mxid: "@alice:example.org"
    email: "alice@example.org"
    # Optional. This is the ID of the user in pentabarf.
    pentabarfId: "1234"
    # The roles the user should be assigned.
    roles:
      - staff
      - volunteers
      - speakers
rooms:
  # It is recommended to let the bot generate this section, but then fill in
  # the details yourself. Rooms added here that the bot doesn't understand will
  # not be created.
  "!roomid:example.org":  # The Matrix Room ID.
    # This is the bot's internal categorization of the room.
    kind: "auditorium"
    # This the pentabarf ID for the room, if known.
    pentabarfId: "1234"
    # The roles for which group flair should be exposed in the room.
    flair:
      - staff
      - volunteers
      - managers
      - speakers
      - moderators
    # These are the roles and users which will receive moderator status in the
    # room.
    mxModerators:
      - role: staff
      - role: volunteers
      - person: alice_example_01
    # These are the roles and users which MUST be present in the room at all times.
    # The bot will aggressively ensure that all of these people are present.
    mxMustParticipate:
      - role: staff
      - role: volunteers
      - person: alice_example_01
  "!another_roomid:example.org":
    kind: "talk"
    pentabarfId: "1234"
    mxModerators:
      - role: staff
      - role: volunteers
      - person: alice_example_01
    mxMustParticipate:
      - role: staff
      - role: volunteers
      - person: alice_example_01
    # Of the people which must participate, these are the subset which must be present
    # before an event is to begin in the room. Note that the bot will ignore this function
    # on rooms for which it doesn't understand. This is also only targeting a set of the
    # mxMustParticipate users, so using entire roles will not require that whole role to
    # be present in the room.
    mxRequirePresent:
      - role: moderators
      - role: speakers
```
