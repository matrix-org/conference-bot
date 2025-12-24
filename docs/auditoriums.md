# Auditoriums

Auditoriums (a.k.a. 'devrooms' \[FOSDEM\]) are places where talks can be scheduled to take place. These rooms are public so that the audience can join.

Each auditorium is accompanied by a 'backstage' room for communication between staff relevant to running the auditorium.
Both the auditorium and auditorium backstage room are located directly underneath the root conference space, or a subspace (depending on config).
For FOSDEM 2026, these will likely be located under subspaces named 'Main Tracks' and 'Devrooms' or similar.

```
#conference:example.org [PUBLIC] (The conference space)
├─ #devrooms:example.org [PUBLIC] (A configured subspace)
|  ├─ #conference-auditorium:example.org [PUBLIC] (The auditorium room itself)
|  ├─ #conference-auditorium-backstage:example.org [PRIVATE] (The auditorium backstage room)
|  ├─ (... more auditoriums follow)
```

**Historical note (auditorium container spaces):** Until 2026, auditoriums were wrapped in an auditorium container space, which also contained the 'backstage' room.
These container spaces were removed because we no longer use talk rooms and so the user experience was worsened by having these needless
containers.

**Historical note (talk rooms):** In previous conferences, the conference-bot has previously created 1 room per talk. Talk rooms are private initially, but made public once the talk has completed. This is intended to allow 'hallway' conversations between the speaker and interested members of the audience once the talk has finished, whilst avoiding disturbing subsequent talks in the auditorium. Talk rooms have not been used since at least 2023. They are likely to be removed.

## Q&A (Questions and Answers)

Q&A will only be enabled for auditoriums that match the `qaAuditoriumRooms` prefix.

Q&A being enabled will:

- Add text to scheduled announcements guiding audience members to submit and vote questions up.
- Add a 'Q&A Scoreboard' widget in the talk and backstage rooms which shows the most voted questions, for the speakers to answer.
