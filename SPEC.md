# SPEC — gitcrawl

Paste any public GitHub repo URL → it becomes a playable, good-looking dungeon in the browser. No install, no login. Built to be shared: every run ends with a screenshot-ready card.

Not a terminal game (GitHub Dungeons already does that in the CLI). The identity here is: **web, visual, and the dungeon is generated from what's actually in the code**.

Two layers, one product:
- **Fun layer (viral):** a light action dungeon crawl through your repo, full of real-code jokes.
- **Value layer (retention):** every monster is a real finding, so a run doubles as a code-health report, an onboarding tour, and a contributor funnel for maintainers.

## 0. Locked decisions

- **2D**, clean top-down pixel art (16×16 or 32×32 tiles), soft lighting + fog of war. No 3D.
- **Light action** gameplay: walk, slash, beat the boss. No loot grind, no hard difficulty.
- **Desktop first**; mobile playable but secondary.
- **Public repos:** paste URL, no login. **Private repos:** optional "Connect GitHub".
- **Sound** is part of MVP polish, not an afterthought.

## 1. Core loop

1. Landing: input "Paste a GitHub repo" + suggested repos as chips (facebook/react, torvalds/linux, bitcoin/bitcoin, a meme repo) + "ENTER DUNGEON". Secondary button: "Connect GitHub for private repos".
2. Server fetches repo data via GitHub REST API (cached), builds a dungeon description, client renders it.
3. Player explores top-down, fights enemies made from real code artifacts, beats the boss.
4. End screen: share card (fun) + loot report (value).

Run length target: 3–7 minutes. No permadeath frustration: dying restarts the current room.

## 2. Repo → dungeon mapping

| Repo thing | In the dungeon |
|---|---|
| Folders | Rooms. Big folders = big halls; deep nesting = corridors/mazes |
| Files | Objects in rooms (chests, scrolls, crates). Click to "read" → filename, size, language |
| Largest source file | **Final boss**. HP = lines of code. Name = filename. Taunts using its own code comments |
| Next 3 largest files | Mini-bosses guarding their folder rooms |
| `TODO` / `FIXME` / `HACK` comments | Goblins. Each shows the real comment text, file and line when hit |
| Open issues | Ghosts wandering the halls (title shown on hover) |
| Issues labeled `good first issue` / `help wanted` | **Quests** from a quest board in the entrance hall; completing the room shows a link to the issue |
| Stale branches (no commits > 6 months) | Skeletons in a crypt room |
| `node_modules` / `vendor` / lockfiles | Bottomless pit room — enter and you fall back to the start ("you will never reach the bottom") |
| Tests folder | Healing shrine (tests heal you). No tests = no healing anywhere |
| README | Starting room. First lines shown on a stone tablet |
| Top contributors | NPCs with their GitHub avatars. Each stands in the folder they commit to most; talking shows their latest commit message and "I guard /src/core" |
| `CODEOWNERS` (if present) | Overrides NPC placement: owners guard their folders |
| Languages | Room themes/tilesets + music track (JS = yellow stone, Rust = rusty iron, Python = jungle, Go = cyan ice, etc.) |
| Stars | Gold in the treasury room; star count = gold pile size |
| License | Locked door; MIT = wooden door, GPL = enchanted door, no license = cursed door that won't open |
| Last commit > 1 year ago | Whole dungeon is "abandoned": cobwebs, dim light, dust |

**Repo title** shown at the entrance, derived from stats: "Monorepo Megadungeon" (huge tree), "Legacy Labyrinth" (old + deep nesting), "Abandoned Crypt" (no recent commits), "Goblin Infestation" (TODO-heavy), "Tiny Tavern" (< 20 files).

Dungeon is deterministic per commit SHA → same repo state = same dungeon (shareable seed).

## 3. Data fetching (server)

- Node + TypeScript + Fastify. Deploy: Fly.io/Railway.
- GitHub REST API with a server token (5,000 req/h). Unauthenticated fallback for local dev.
- Calls per repo (keep it ≤ ~12):
  - `GET /repos/{o}/{r}` — stars, default branch, license, language, pushed_at
  - `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` — full file tree with sizes (if `truncated`, use top 3 levels)
  - `GET /repos/{o}/{r}/languages`
  - `GET /repos/{o}/{r}/contributors?per_page=8`
  - `GET /repos/{o}/{r}/commits?per_page=100` — map contributors to their most-touched folders (sample, not full history)
  - `GET /repos/{o}/{r}/issues?state=open&per_page=30` (exclude PRs) + `labels=good first issue` and `labels=help wanted`
  - `GET /repos/{o}/{r}/branches?per_page=50` + last commit date per branch (cap at 10)
  - `CODEOWNERS` from `.github/`, root or `docs/` if present
  - TODO/FIXME: fetch raw content of up to 40 source files (prioritize largest + most central) and regex-scan. Cap total bytes at 5 MB.
  - Line counts: estimate from blob size (bytes / 40) for non-fetched files; exact for fetched ones.
- Output: `DungeonSpec` JSON (rooms graph, entities, boss, theme, title, stats, findings).
- Cache by `owner/repo@sha` for 24h (filesystem or Cloudflare R2). Top 100 repos + daily trending pre-generated.
- Rate limit: 10 new public repo generations per IP per hour; cached ones unlimited.

## 4. Private repos (Connect GitHub)

- **GitHub App** (not OAuth App), installed by the user on selected repos only.
- Permissions: read-only — Contents, Metadata, Issues, Pull requests (read). Never write.
- Calls use the user's installation token, not the server token.
- **Privacy rules:**
  - Code is fetched and processed in memory; no source code is stored. Only the generated `DungeonSpec` is cached, keyed per user, with a short TTL (1h), and never served to anyone else.
  - Private runs are not publicly shareable by default. The share card for a private repo hides repo name and file names unless the user explicitly toggles "show details".
  - "Disconnect" button revokes and deletes everything.
- Short privacy page explaining exactly this, linked from the connect button.
- Phase: after public MVP (M8), but the `DungeonSpec` pipeline must take a pluggable token from day one.

## 5. Dungeon generation

- Folder tree → room graph. Root = entrance hall. Each folder with ≥ 3 files becomes a room; tiny folders merge into their parent.
- Cap: 40 rooms. Beyond that, keep the biggest folders and merge the rest into "Misc Catacombs".
- Layout: BSP or graph-based placement on a tile grid, corridors between parent/child folders.
- Boss room always farthest from the entrance.
- Seeded RNG from commit SHA.

## 6. Client (web)

- Vite + TypeScript + Phaser 3 (tilemaps, arcade physics, camera, input all built in).
- Style: see locked decisions. Must look great in a 10s clip. Original art only (own sprites or properly licensed packs, e.g. CC0).
- Controls (primary, desktop): WASD/arrows + mouse aim + click to attack. Mobile (secondary): virtual joystick + tap attack.
- Player: one hero with 3 weapons (sword, bow, "refactor hammer" that one-shots goblins). Pick-ups from chests: damage boost, speed, shield.
- Combat: simple, juicy — hit flash, knockback, floating damage numbers, screen shake on boss hits.
- Minimap in corner showing the folder structure; hover a room = folder path.
- Every enemy/boss shows its real source on hit (TODO text, issue title, filename + LOC) — this is the comedy and the value.
- **Explore mode** toggle: no combat, enemies become info markers. For onboarding and people who just want to look around.

## 7. Sound

- Chiptune music, one short loop per language theme + boss track.
- SFX: sword swing/hit, bow, hammer smash, goblin squeak, ghost wail, skeleton rattle, boss roar, door unlock, chest open, falling into node_modules, "commit ding" on room clear, victory jingle.
- Sources: CC0 packs or generated (jsfxr / ChipTone). No unlicensed audio.
- Muted until first user interaction (browser autoplay rules). Volume + mute toggle, remembered locally.

## 8. Value layer: loot report

Shown after the run (and available as a "skip to report" link). Every item links to the exact file/line/issue on GitHub.

- **Boss files:** largest files, refactor/split candidates, with LOC.
- **Goblin log:** all TODO/FIXME/HACK found, oldest first (by blame date if cheap, else file order).
- **Crypt:** stale branches safe to review/delete.
- **Curses:** missing license, no tests folder, no README, no CONTRIBUTING, no CI config.
- **Quests:** good-first-issue / help-wanted issues → "Start contributing here".
- **Guardians:** who owns which folder (from commits/CODEOWNERS) → who to ask.
- **Dungeon health score** 0–100 from the above, with a one-line explanation of each deduction. Shown on the card and the README badge.
- Copy report as Markdown (paste into an issue or PR).

## 9. End card + sharing

- Card: repo name + avatar, repo title, time to clear, goblins slain, boss name + LOC, health score, a funny line ("Survived node_modules", "Defeated a 9,000-line utils.js").
- Generated as PNG client-side (canvas) → download + Web Share API on mobile.
- Server-side OG image at `/r/{owner}/{repo}` so pasted links on X show the card.
- **README badge**: `[![gitcrawl](badge-url)](site/r/owner/repo)` showing the health score / repo title. Copy button. Long-term traffic loop.
- 10s clip recording via `canvas.captureStream()` + `MediaRecorder`.

## 10. Virality features

- **Daily raid:** one trending repo per day, global speedrun leaderboard, resets at midnight UTC.
- **Versus mode:** two repos side by side — boss size, goblin count, health score ("my utils.js is bigger than React's").
- **Hall of Shame / Fame:** most TODOs, biggest boss file, deepest nesting, healthiest repo — from cached repos. Shareable lists.
- **Boss taunts** use real code comments from the boss file.
- Per-repo speedrun leaderboard (nickname only, no accounts).

### Launch plan
- Pre-generate top 100 GitHub repos so the first wave is instant.
- Record clips of the Linux, React and a meme-repo dungeons; post them with the maintainers tagged.
- Post Hall of Shame stats as standalone content ("the biggest file in the top 100 repos is…").
- Submit to Hacker News (Show HN), r/programming, r/webdev, Product Hunt.

## 11. Tech/structure

- pnpm monorepo: `apps/web` (Phaser client), `apps/api` (Fastify + GitHub fetch + generator + OG images), `packages/shared` (types: `DungeonSpec`, entity definitions, findings, tuning numbers).
- Strict TypeScript. Tuning (HP, damage, spawn counts, score weights) data-driven in `packages/shared`.
- `pnpm dev` runs everything locally.
- README with Windows/PowerShell-friendly setup and deploy steps (web → Vercel, api → Fly.io).
- Analytics (plausible/umami): repo entered, run finished, report opened, card shared, badge copied, private connect.

## 12. Milestones

1. **M1 — Repo → JSON**: API returns `DungeonSpec` (incl. findings + title) for any public repo; debug page renders the room graph as boxes. Token is pluggable.
2. **M2 — Walkable dungeon**: rooms + corridors rendered, hero walks, camera follows, minimap.
3. **M3 — Combat**: TODO goblins, sword, HP, damage numbers, death/restart room.
4. **M4 — Boss + content**: boss with taunts, mini-bosses, ghosts, quests, skeletons, node_modules pit, contributor NPCs, themes, explore mode.
5. **M5 — Loot report + health score**.
6. **M6 — End card + share + OG image + README badge + clip recording**.
7. **M7 — Polish**: sound + music, lighting/fog, mobile controls, performance.
8. **M8 — Private repos** via GitHub App.
9. **M9 — Daily raid, versus mode, leaderboards, Hall of Shame**.

Stop after each milestone for review.

## 13. Acceptance (MVP = M1–M7)

- Works on: facebook/react, torvalds/linux (huge, truncated tree), a tiny 5-file repo, a repo with no license, a Python and a Rust repo.
- Uncached generation ≤ 10s; cached ≤ 1s.
- 60fps on a mid-range laptop, playable on mobile.
- Every loot report item links to the correct file/line/issue.
- Share card renders correctly and link previews on X show it.
- Sound muted until first interaction; mute persists.
- Never exceeds GitHub rate limits under load (cache + per-IP limits verified).
