# Using the conference bot with an existing space

The conference bot is normally responsible for creating the top-level space of
the conference and inviting *you* to it.
This is undesirable if you already have a space for your conference and you don't
want to have to move everything (and everyone) over to a new space.

With a little bit of manual setup, it's possible to make the bot re-use an existing space.
Here's how:

 1. Invite the bot to the space.
 2. Join the bot to the space by sending `!conference join #space-id:example.org` in its management room.
 3. Promote the bot to at least moderator privileges (power level 50): enough
    to send state events and add new rooms and spaces to the top-level space.
    **TODO:** Power level 100 might be needed so that the bot can add new admins...
 4. Send a 'locator' **state event** into the space.
    This is currently a little bit fiddly, but here are the steps to do it in Element Web/Desktop:
     1. Enable developer mode by going to a text room, typing `/devtools` and enabling
        the toggle switch that says 'developer mode'.
     2. Now right click on the space in the sidebar on the left-hand-side.
        Since enabling developer mode, you should now see an option 'See room timeline (devtools)'. Select this.
     3. You will now see the timeline (roughly: chat view) for the space,
        as though the space was just a normal text room.
     4. Type `/devtools`, go to 'Explore room state' and 'Send a new state event'.
     5. Set the state event type to `org.matrix.confbot.locator`, leave the state key blank and set the content to
        ```json
        {"kind": "conference_space", "conferenceId": "your-conf-id"}
        ```
        (replace `your-conf-id` with the id of your conference as specified in the configuration file!)


This procedure could be improved in the future.
