# Auditoriums

Auditoriums (a.k.a. 'tracks', 'devrooms' \[FOSDEM\]) are places where talks can be scheduled to take place. These rooms are public so that the audience can join.

Each auditorium is formed of a container space which is a child of the main conference space, but a parent of the auditorium room itself.
This auditorium container space also contains a room for each talk, as well as a 'backstage' room for communication between staff relevant to running the auditorium.

```
#conference:example.org [PUBLIC] (The conference space)
├─ #space-conference-auditorium:example.org [PUBLIC] (The container space)
|  ├─ #conference-auditorium:example.org [PUBLIC] (The auditorium room itself)
|  ├─ #conference-auditorium-backstage:example.org [PRIVATE] (The auditorium backstage room)
|  ├─ #conference-auditorium-talk1-name:example.org [PRIVATE INITIALLY*] (A talk room)
```

*Talk rooms are private initially, but made public once the talk has completed. This is intended to allow 'hallway' conversations between the speaker and interested members of the audience once the talk has finished, whilst avoiding disturbing subsequent talks in the auditorium.


## Physical Auditoriums

An auditorium can be declared to be 'physical', by having its name match a prefix set in the configuration (see `physicalAuditoriumRooms`).
The intended purpose of this is for talks which are livestreamed from a physical venue.

Physical Auditoriums have the following differences to regular Auditoriums:

- Talks do not get a dedicated room in the auditorium space (talk coordination is expected to happen in the real world)
    - The speaker will not be nagged to 'check in'; speakers are expected to be present in the real world.
    - Scheduled announcements do not instruct audience members to join a talk room after a talk ends

Physical Auditoriums do still have backstage rooms for speakers and volunteers to coordinate in.

**Physical auditoriums are supported in the Penta and Pretalx backends.**


## Q&A (Questions and Answers)

Q&A will only be enabled for auditoriums that match the `qaAuditoriumRooms` prefix.

Q&A being enabled will:

- Add text to scheduled announcements guiding audience members to submit and vote questions up.
- Add a 'Q&A Scoreboard' widget in the (TODO: check) talk room which shows the most voted questions, for the speakers to answer.
