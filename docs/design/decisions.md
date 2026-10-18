# Design decisions

Where a screen bends a rule in [DESIGN.md](../../DESIGN.md), and why. The rules stay short; the
reasons live here, so an exception isn't copied as a precedent without its reason. Add a note when
you make one, and remove it when the exception goes.

## Hour labels stay plain

The time column's hour labels are plain `muted-ink`. They once shifted through the colors of the
day, and that was dropped because it competed with the work blocks for color.

## Short work is a mark

Work under ten minutes is a short bar in a strip beside the day column rather than a card. Cards for
quick questions pushed longer work into narrow side-by-side lanes: on real logs, blocks sitting three
or more abreast went from 88 of 257 to 7 once they became marks.

## A burst of headless runs is one mark

One mark per headless run turned a script firing `claude -p` every few seconds into a ladder pushed
an hour down the strip. Runs of a project starting within minutes of each other are drawn as one
stacked mark, and the drawer steps through them.

## The week view shows a time range only when selected

The grid already places a block in time, and the tooltip and drawer give the exact range, so in the
week view the space goes to the heading. Other views have the width to show both.

## The selected block is only outlined

A selected block gets a 2px `primary` outline over its normal fill. A deeper fill as well said the
same thing twice.

## The drawer floats over the calendar

Where the drawer floats instead of making room is in [screens.md](screens.md#drawer). Pushing seven
columns into the ~600px left at 1024px cut most titles to one word; Today's two columns would
shrink the same way.

## Period and layout are two controls

The period (month / week / day) is an outlined dropdown and the layout (calendar / summary) a
segmented toggle, as in Google Calendar. Three more segments would widen the toolbar, and on one
shared track the two read as a single switch.

## Filters in a popover, not a sidebar

Filters are occasional, "just for now" conditions. A left panel beside the drawer would squeeze the
week to ~92px a day at 1440px, so they are edited in a popover and shown as chips while they apply.

## A list row's trailing link stays muted

Links are `primary`, except a list row's trailing link to a block (an open item's age, how it
closed): it stays `muted-ink` until hovered. It doubles as the row's date, and a link color on every
row would outshout the items.

## Live cards carry no block fill

Live cards keep the project color in their 3px edge only, on neutral `muted` / `input` fills,
instead of mixing the project color into `block-base`. Dim pigment fills on the navy surface read as
muddy browns, and with the color in the edge alone `warn` stays the only color that calls for you.

## The token chart counts tokens, not cost

Tokens are what the logs record; a cost would put a price list's estimate in between. The calendar's
summary view still shows estimated cost as context.

## The Live button is the one toolbar addition

The toolbar takes no new controls ([what it holds](screens.md#toolbar-search-and-filters)). The Live
button is the exception because it says from every page how many sessions wait on you, which a menu
can't.

## The token chart climbs instead of standing in bars

Today's chart of the day's tokens is a stack of climbing bands, not 5-minute bars. With bars,
one spike flattened every other slot; as a climb, a spike is a steep stretch and the rest of the day
stays readable.
