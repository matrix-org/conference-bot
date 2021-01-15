# Importing people to your conference

After building your conference's rooms, it's time to bring in your people and teams. The bot is 
very particular about which teams and kinds of people it expects and applies a certain amount
of behaviour to them. Specifically, the bot only has 3 roles which get certain rules applied to
them. This may change in the future, however (PRs welcome).

The bot will read a table (see default config) to gather information about people. It is strongly
recommended to verify this data before actually doing the invites.

To verify the data, run `!conference verify M.misc` in the management room. This will have the bot
go through all the roles, people, etc to report a list of what would happen if the bot were to run.
Note that this can take a few minutes to run while the bot tries to ensure that it has enough data
on all the people to be brought into all the rooms. In this example, `M.misc` is an auditorium from 
penta which should be validated.

If the data looks correct for a few key rooms, run `!conference invite` to invite everyone from the
database table to the relevant rooms. If you only want to target a single auditorium (to allow for 
verifying  each auditorium individually), add it to the end of the command: `!conference invite M.misc` 
(for example).

Afterwards, it is time to update permissions.

TODO: Link to permissions documentation.
