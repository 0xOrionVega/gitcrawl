# SPEC — gitcrawl

Paste any public GitHub repo URL → it becomes a playable, good-looking dungeon in the browser. No install, no login. Built to be shared: every run ends with a screenshot-ready card.

Not a terminal game (GitHub Dungeons already does that in the CLI). The identity here is: **web, visual, and the dungeon is generated from what's actually in the code**.

## 1. Core loop

1. Landing: input "Paste a GitHub repo" + suggested repos as chips (facebook/react, torvalds/linux, bitcoin/bitcoin, a meme repo) + "ENTER DUNGEON".
2. Server fetches repo data via GitHub REST API (cached), builds a dungeon description, client renders it.
3. Player explores top-down, fights enemies made from real code artifacts, beats the boss.
4. End card with stats → share image + link.

Run length target: 3–7 minutes. No permadeath frustration: dying restarts the current room.

## 2. Repo → dungeon mapping

| Repo thing | In the dungeon |
|---|---|
| Folders | Rooms. Big folders = big halls; deep nesting = corridors/mazes |
| Files | Objects in rooms (chests, scrolls, crates). Click to "read" → shows filename, size, language |
| Largest source file | **Final boss**. HP = lines of code. Name = filename |
| Next 3 largest files | Mini-bosses guarding their folder rooms |
| `TODO` / `FIXME` / `HACK` comments | Goblins. Each one shows the real comment text when hit |
| Open issues | Ghosts wandering the halls (title shown on hover) |
| Stale branches (no commits > 6 months) | Skeletons in a crypt room |
| `node_modules` / `vendor` / lockfiles | Bottomless pit room — enter and you fall back to the start ("you will never reach the bottom") |
| Tests folder | Healing shrine (tests heal you) |
| README | Starting room. First lines shown on a stone tablet |
| Top contributors | NPCs with their GitHub avatars; talking to one shows their latest commit message as dialogue |
| Languages | Room themes/tilesets (JS = yellow stone, Rust = rusty iron, Python = jungle, Go = cyan ice, etc.) |
| Stars | Gold in the treasury room; star count = gold pile size |
| License | Locked door; MIT = wooden door, GPL = enchanted door, no license = door that won't open |

Dungeon is deterministic per commit SHA → same repo state = same dungeon (shareable seed).

## 3. Data fetching (server)

- Node + TypeScript + Fastify. Deploy: Fly.io/Railway.
- GitHub REST API with a server token (5,000 req/h). Also support unauthenticated fallback for local dev.
- Calls per repo (keep it ≤ ~10):
  - `GET /repos/{o}/{r}` — stars, default branch, license, language
  - `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` — full file tree with sizes (handles big repos in one call; if `truncated`, use top 3 levels)
  - `GET /repos/{o}/{r}/languages`
  - `GET /repos/{o}/{r}/contributors?per_page=8`
  - `GET /repos/{o}/{r}/issues?state=open&per_page=30` (exclude PRs)
  - `GET /repos/{o}/{r}/branches?per_page=50` + last commit date per branch (cap at 10)
  - TODO/FIXME: code search is rate-limited, so instead fetch raw content of up to 40 source files (prioritize largest + most central) from `raw.githubusercontent.com` and regex-scan them. Cap total bytes at 5 MB.
  - Line counts: estimate from blob size (bytes / 40) for non-fetched files; exact for fetched ones.
- Output: `DungeonSpec` JSON (rooms graph, entities, boss, theme, stats).
- Cache by `owner/repo@sha` for 24h (filesystem or Cloudflare R2). Popular repos pre-generated.
- Private repos: out of scope for MVP.
- Rate limit: 10 new repo generations per IP per hour; cached ones unlimited.

## 4. Dungeon generation

- Folder tree → room graph. Root = entrance hall. Each folder with ≥ 3 files becomes a room; tiny folders merge into their parent.
- Cap: 40 rooms. Beyond that, keep the biggest folders and merge the rest into "Misc Catacombs".
- Layout: BSP or graph-based placement on a tile grid, corridors between parent/child folders.
- Boss room always farthest from the entrance.
- Seeded RNG from commit SHA.

## 5. Client (web)

- Vite + TypeScript + Phaser 3 (tilemaps, arcade physics, camera, input all built in).
- **Locked decisions:** clean top-down pixel art · light action gameplay (walk, slash, beat the boss — no loot grind or hard difficulty) · desktop first, mobile playable but secondary.
- Style: clean top-down pixel art (16×16 or 32×32 tiles), soft lighting and fog of war. Must look great in a 10s clip. Original art only (own sprites or properly licensed packs, e.g. CC0).
- Controls (primary, desktop): WASD/arrows + mouse aim + click to attack. Mobile (secondary): virtual joystick + tap attack.
- Player: one hero with 3 weapons to start (sword, bow, "refactor hammer" that one-shots goblins). Pick-ups from chests: damage boosts, speed, shield.
- Combat: simple, juicy — hit flash, knockback, floating damage numbers, screen shake on boss hits.
- Minimap in corner showing the folder structure.
- Every enemy/boss shows its real source on hit (TODO text, issue title, filename + LOC) — this is the comedy.

## 6. End card + sharing

- Card content: repo name + avatar, time to clear, TODO goblins slain, boss name + LOC, "Deepest folder reached", a funny title ("Survived node_modules", "Defeated a 9,000-line utils.js").
- Generate as PNG client-side (canvas) → download + Web Share API on mobile.
- Server-side OG image at `/r/{owner}/{repo}` so pasted links on X show the card.
- **README badge**: `[![Play as a dungeon](badge-url)](site/r/owner/repo)` with copy button. This is the long-term traffic loop.
- Optional: 10s clip recording via `canvas.captureStream()` + `MediaRecorder`.

## 7. Leaderboard

- Per repo: fastest clear times (nickname only, no accounts).
- Global "Hall of Shame": repos with the most TODOs, biggest boss file, deepest nesting — computed from cached repos. Shareable on its own.

## 8. Tech/structure

- pnpm monorepo: `apps/web` (Phaser client), `apps/api` (Fastify + GitHub fetch + generator), `packages/shared` (types: `DungeonSpec`, entity definitions, tuning numbers).
- Strict TypeScript. Tuning (HP, damage, spawn counts) data-driven in `packages/shared`.
- `pnpm dev` runs everything locally.
- README with Windows/PowerShell-friendly setup and deploy steps (web → Vercel, api → Fly.io).

## 9. Milestones

1. **M1 — Repo → JSON**: API returns `DungeonSpec` for any public repo; debug page renders the room graph as boxes.
2. **M2 — Walkable dungeon**: rooms + corridors rendered, hero walks, camera follows, minimap.
3. **M3 — Combat**: TODO goblins, sword, HP, damage numbers, death/restart room.
4. **M4 — Boss + content**: largest-file boss, mini-bosses, ghosts (issues), skeletons (stale branches), node_modules pit, NPC contributors, themes per language.
5. **M5 — End card + share + OG image + README badge**.
6. **M6 — Polish**: sound, lighting/fog, mobile controls, performance.
7. **M7 — Leaderboards + Hall of Shame**.

Stop after each milestone for review.

## 10. Acceptance (MVP = M1–M6)

- Works on: facebook/react, torvalds/linux (huge, truncated tree), a tiny 5-file repo, a repo with no license, a Python and a Rust repo.
- Uncached generation ≤ 10s; cached ≤ 1s.
- 60fps on a mid-range laptop, playable on mobile.
- Share card renders correctly and link previews on X show it.
- Never exceeds GitHub rate limits under load (cache + per-IP limits verified).
