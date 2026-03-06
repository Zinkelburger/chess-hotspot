# Tips for Triaging Chess.com Clubs into Real In-Person Clubs

Notes from manually reviewing ~36,000 chess.com club entries (March 2026).

## The Problem

Chess.com has tens of thousands of "clubs," but the vast majority are online-only groups, school clubs, friend groups, meme clubs, or abandoned placeholders. Only a small fraction (~4%) are real-life, in-person chess clubs with regular public meetings.

## Strong Positive Signals

These are the things that make a club almost certainly real:

- **Specific meeting day + time** ("Thursdays 6-9pm", "Every Saturday at 10am")
- **Physical venue named** ("at the Blount County Library", "Switchback Coffee Roasters")
- **Street address** in description or location field
- **USCF affiliate** or mentions USCF-rated events
- **OTB** / "over the board" / "in person" explicitly stated
- **Meetup.com or Facebook group link** alongside physical meeting details
- **"All welcome" / "open to the public" / "all skill levels"** combined with a location
- **Community center / library / church / cafe / brewery** as meeting venue

## Strong Negative Signals (Exclude These)

### Schools (biggest false-positive category, ~10% of all clubs)
- K-12 schools: look for "high school", "middle school", "elementary", "academy", "preparatory"
- Common abbreviation patterns: club names ending in "HS", "MS", "ES"
- Meeting times during school hours (e.g., "12:30-1:15pm", "after school until 3:40")
- Location field is a school address
- "STUDENTS ONLY" or "must be enrolled"
- **Exception**: "Chess School" (like "Regal Chess School") is usually a teaching business, not a K-12 school — these can be legit

### Colleges/Universities
- "College", "University", "Campus", "Collegiate"
- Club names like "UCLA", "USF", "SFASU" followed by "Chess"
- **Exception**: Some community chess clubs meet at college facilities but aren't restricted to students — read the description carefully

### Workplaces
- Company names (Google, Microsoft, Amazon, etc.)
- "Employee", "coworker", "corporate"
- Military base clubs (AFTAC, MCBH, etc.) — technically real but not public

### Prisons
- "Prison", "jail", "correctional", "inmate", "penitentiary"

### Online-Only Clubs
- "Daily matches", "vote chess" — these are chess.com-specific online features
- "Discord server/club" without physical meetings
- "Online only", "virtual club"
- Descriptions that only mention chess.com features with no physical location
- No location + no description = almost certainly online-only

### Private / Not Open to Public
- "Friend group", "friends only", "invite only"
- "Not public", "private club"
- "For me friends matey" (yes, really)
- Homeschool groups (often restricted to specific families)
- Church-specific groups ("must be a member of our congregation")

### Joke / Meme / Spam Clubs
- Names like "boy67676767676", "abcdefghijk", "PERRY THE PLATYPUS"
- Empty descriptions with absurd names
- Descriptions that are clearly creative writing, not club info

## Gray Areas (Use Judgment)

- **Homeschool chess clubs**: Some are genuinely open community clubs that happen to serve homeschoolers. Others are closed family groups. Read the description.
- **"Chess School" businesses**: Real physical locations with lessons — include these, they're in-person chess venues.
- **State/regional chess associations**: These are organizations, not weekly clubs. They may host tournaments but don't have regular weekly meetings. Include if they mention specific regular meeting schedules.
- **Clubs "planning to start"**: Some clubs say "we're starting soon" with no meetings yet. Borderline — include if they have a specific venue/time planned.
- **Senior centers**: These are real in-person clubs, include them.
- **Clubs at businesses** (breweries, coffee shops, bookstores): These are great — real venues with regular meetings. Include.

## Batch Processing Strategy

When processing the full chess.com clubs dump:

1. **Work in batches of ~1000 entries** — this is a manageable chunk for manual review
2. **Read compactly**: extract just `[index] "name" | location | description` per line
3. **Scan fast**: most entries (~96%) can be rejected at a glance — no description, online-only language, or obviously not a club
4. **Slow down for**: entries with physical addresses, meeting times, or community language
5. **Parallelize across batches** if using multiple agents
6. **Expect ~20-40 qualifying clubs per 1000 entries** (about 2-4% hit rate)

## Matching to Existing Spots

When cross-referencing chess.com clubs with a known spots database:

- **Normalize names** before comparing: strip "Chess Club", "The", "Inc.", "CC", case, punctuation
- **Match "St." = "Saint"** and "Assn" / "Assoc" = "Association"
- **Require location overlap** for fuzzy matches — a 0.85 name similarity means nothing if one club is in Florida and the other in Oregon
- **Don't trust fuzzy matching alone** below 0.95 similarity without location confirmation
- **Watch for duplicates**: some clubs have multiple chess.com pages (e.g., "Chess Club Bobby Fischer" appearing twice)
- **City names in club names are helpful**: "Franklin TN Chess Club" disambiguates from other Franklin clubs

## Data Quality Notes

- Chess.com club `location` field is free-text and inconsistent — sometimes a full address, sometimes just "US", sometimes empty
- `members_count` on chess.com is online members, not in-person attendance
- `visibility: "private"` doesn't mean the physical club is private — many real clubs set their chess.com page to private
- `created` timestamp tells you when the chess.com page was made, not when the physical club was founded
- Descriptions are often copy-pasted from websites and may be outdated
