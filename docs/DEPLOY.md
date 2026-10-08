# Deploying gitcrawl

One Node process serves the web app, the API, share images (`/og/...png`) and README badges (`/badge/...svg`). Server-side rendering of the `<meta>` tags on `/r/owner/repo` is what makes links unfurl with the dungeon's card on X, so serve the web app from the API rather than a static host.

## Fly.io (recommended)

```powershell
fly launch --copy-config --no-deploy
fly volumes create gitcrawl_data --size 1
fly secrets set GITHUB_TOKEN=github_pat_xxx SITE_URL=https://gitcrawl.dev
fly deploy
```

`fly.toml` mounts the volume at `/data`; dungeons, leaderboards and rendered images live in `/data/cache`. One shared-cpu machine with 512 MB is plenty to start; it scales to zero when idle.

### Before launch

1. Seed the cache with the bundled example dungeons (instant, no GitHub calls):
   `fly ssh console -C "node dist/seed.js web/fixtures"`
2. Pre-generate popular repos with your token (about 30 calls each, roughly 100 repos/hour of budget):
   `fly ssh console -C "node dist/pregen.js"` or pass a list: `node dist/pregen.js facebook/react vercel/next.js`
3. Point your domain at the app (`fly certs add gitcrawl.dev`) and set `SITE_URL` to it.

## Environment

| Variable | Default | What it does |
| --- | --- | --- |
| `GITHUB_TOKEN` | none | Public-repo reads at 5,000 calls/hour. Fine-grained token, public repos read-only. |
| `SITE_URL` | `http://localhost:8787` | Used in share links, OG images, badges and the OAuth callback. |
| `CACHE_DIR` | `.cache/gitcrawl` | Storage for dungeons, leaderboards, images. |
| `WEB_DIST` | `../web/dist` | Built web app to serve. Empty string = API only. |
| `DUNGEON_TTL_HOURS` | `24` | How long a dungeon is served before it's rebuilt. |
| `GENERATE_PER_HOUR` | `10` | Uncached generations per visitor IP per hour. |
| `GITHUB_RESERVE` | `150` | Below this many calls left, the API answers 503 and browsers build dungeons themselves. |
| `CORS_ORIGIN` | `*` | Set to your web origin if the web app is hosted elsewhere. |
| `DAILY_REPOS` | built-in list | Comma-separated rotation for the daily raid. |

The web client reads `VITE_API_BASE` (API origin if hosted separately) and `VITE_SITE_URL` (public URL for share links) at build time.

## Private repos with a GitHub App (optional)

Without these settings the private page still works, but only offers the CLI.

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.
2. **Homepage URL**: `https://YOUR_DOMAIN`. **Callback URL**: `https://YOUR_DOMAIN/auth/callback`.
3. Leave **Request user authorization (OAuth) during installation** off: logins must start from the site so the callback can check its `state`. Set **Setup URL** to `https://YOUR_DOMAIN/private` and tick **Redirect on update**, so people come back to their repo list after installing.
4. **Webhook**: untick Active.
5. Repository permissions, all **Read-only**: Contents, Metadata, Issues, Pull requests. No account permissions.
6. **Where can this app be installed**: Any account.
7. Create the app, then **Generate a new client secret**, and set:
   ```powershell
   fly secrets set GITHUB_APP_CLIENT_ID=Iv1.xxx GITHUB_APP_CLIENT_SECRET=xxx GITHUB_APP_SLUG=your-app-slug SESSION_SECRET=$(openssl rand -hex 32)
   ```
   The slug is the last part of the app's public URL, `github.com/apps/<slug>`.

The flow: `/private` → Connect GitHub (OAuth login) → Choose repos on GitHub (installs the app) → back to `/private` with the repo list → play.

How data is handled (also explained to visitors at `/privacy`): the user token lives only in an encrypted, HttpOnly cookie (AES-256-GCM, 8 hour max). Source code is read into memory to count lines and TODOs and is never written to disk. Private dungeons are cached in memory per user for one hour and never served to anyone else. Disconnecting revokes the token and drops the cache. Share cards and clips for private repos hide the repo and file names, and private runs never reach leaderboards.

For code that should never touch any server, point people to the CLI: `npx gitcrawl-cli`.

## Publishing the CLI

```powershell
pnpm build
cd packages/cli
npm publish --access public
```

`pnpm build` bundles the web client into `packages/cli/dist/web`, so the published package works offline.

## Static demo

`pnpm demo` writes `apps/web/dist-demo`: the example dungeons are bundled, other repos are built in the visitor's browser from the GitHub API (60 unauthenticated calls/hour per visitor, about 7 repos). Any static host works, but link previews will be generic.
