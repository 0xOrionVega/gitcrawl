# What next

Ordered by how much I think each moves the needle for a viral launch.

## Before launch (small, high impact)

1. **Pick a license.** gitcrawl's own dungeon currently has a cursed treasury door because the repo has no LICENSE file. MIT matches the spirit of the project.
2. **Domain and pre-generation.** Buy the domain, set `SITE_URL`, run `seed` and then `pregen` with a token so the first wave of traffic hits warm caches and link previews already have cards.
3. **Record three launch clips** with the built-in recorder: the Linux boss (33,466-line `phy_n.c`), React's goblin infestation (813 TODOs) and `kelseyhightower/nocode` (the boss is a one-line Dockerfile). Short, loud, captioned with the real numbers.
4. **Tag the maintainers** in the clip posts. Their repo is the content; they tend to repost it.
5. **Real playtest on a phone.** The touch controls work in headless Chrome, but they haven't been tried with a thumb.

## Gameplay

- **Room completion rewards.** Clearing every goblin in a folder room could drop a "folder cleaned" banner and a small heal. Gives a reason to clear rooms rather than run to the boss.
- **Boss variety by language.** Same document golem today; a Rust boss could borrow-check your sword, a JavaScript boss could spawn `undefined` minions, a C boss could segfault (teleport).
- **Commit history as a timeline.** A "time travel" lever that rebuilds the dungeon from a year-old commit, so you can watch a repo's dungeon grow.
- **Hard mode** for speedrunners: more goblins, one heart, a global leaderboard per repo.
- **Weapon unlocks from repo facts**: a CI config unlocks a turret, a Dockerfile unlocks a shipping-container shield.

## Sharing and growth

- **Animated GIF export** in addition to WebM/MP4 clips: GIFs autoplay everywhere and embed in READMEs.
- **"Raid my repo" bot**: a GitHub Action that comments on a PR with the change in dungeon health ("this PR added 3 goblins and made the boss 400 lines bigger").
- **Embeddable dungeon**: an `<iframe>` widget for docs sites and personal pages.
- **Org leaderboards**: "Vercel vs Netlify" style team pages, built on versus mode.
- **Weekly Hall of Shame post**: automate a weekly image of the biggest bosses and most TODO-infested repos. Easy recurring content for X.

## Value layer

- **Blame dates for TODOs** (oldest first) via GraphQL blame on the boss and mini-boss files. "This TODO is 9 years old" is both funny and useful.
- **Bus factor per folder** from guardian data: folders with one guardian get a warning in the report.
- **Dependency pit depth** from the lockfile: count packages, show the deepest chain.
- **Trend over time** for repos that keep the badge: store health score history and show a sparkline on the report.

## Engineering

- **Move the cache to R2 or SQLite** once one Fly volume isn't enough; the store is a small interface.
- **GraphQL for the GitHub fetch** when a token is present: one query can replace about half of the REST calls.
- **Phaser 4** upgrade once its API settles; the game uses Phaser 3.90.
- **Web Worker generation** in the browser fallback so huge repos don't stall the page.
- **E2E tests in CI**: the headless-Chromium playthrough used during development (combat, boss, victory, report, mobile) can run on GitHub Actions with Playwright.

## Other project ideas in the same spirit

- **gitcrawl for pull requests**: each PR is a one-room arena where the diff's new TODOs are the enemies.
- **Codebase tower defense**: the repo's dependency graph is the map, CVEs are the waves.
- **Dungeon from a website** (the earlier idea): same engine, but the DOM tree of any URL becomes the rooms.
