# File formats

## Schedule

TODO: Describe pentabarf format.

## Talk moderators

TODO: Describe extensions to pentabarf?

## Persons of interest

Persons of interest are moderators and speakers (in the bot's perspective). The bot needs to be aware
of who these people are so it can give them correct permissions in their talk rooms as well as make
sure they are present before their talk is meant to begin.

This is done with a simple CSV format:

```csv
1001,"Oliver Wright","oliver.wright@example.org",""
1002,"Amber Cameron","amber.cameron@example.org","@amber:example.org"
1003,"Isobel Naylor","","@isobel:example.org"
```

The first column is the person ID from the show schedule and talk moderators above. The second is the
person's name for good measure. 

The third and fourth columns are how the bot will try to match up the user with a Matrix user ID. They
are both optional, though at least one of them must be supplied. The first of the two is the person's
email address and the second is their Matrix ID. If just an email address is supplied (as in Oliver's
case), the bot will automatically ask its configured identity server to locate the user ID. If it can't
locate the user ID from the identity server, it'll use a third party invite and watch to see who claims
it, tying that user ID to that email address. If just a Matrix ID is supplied (like with Isobel), the bot
will quite simply just use that. The same is true for when both are supplied: the bot will prefer the
Matrix ID over email.

The bot will ignore any data in column 5 and onwards, though those columns are reserved for future use.
