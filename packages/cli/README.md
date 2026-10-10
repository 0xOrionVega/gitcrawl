# gitcrawl-cli

Play any git repo on your machine as a dungeon. Your code never leaves your computer.

Folders become rooms, the biggest file is the boss, every `TODO` is a goblin, stale branches rattle around a crypt and the lockfile is a bottomless pit. Every monster is a real finding, so when the run ends you get a loot report: the files to split, the oldest TODOs and the branches to prune.

![The entrance hall of a dungeon](https://raw.githubusercontent.com/0xOrionVega/gitcrawl/main/docs/screenshots/react-entrance.png)

## Usage

Run it inside any git repo:

```sh
npx gitcrawl-cli
```

Or point it at one:

```sh
npx gitcrawl-cli ~/code/my-app
```

The dungeon is built locally from your git history and opened in your browser on `http://localhost:4747`.

### Options

| Option | Description |
| --- | --- |
| `[path]` | Repo to crawl (default: current directory) |
| `--port <n>`, `-p <n>` | Local port (default `4747`; the next free one is used if it's taken) |
| `--no-open` | Don't open the browser, just print the URL |
| `--json [file]` | Save the dungeon JSON instead of serving it (default `dungeon.json`) |
| `--help`, `-h` | Show help |

Install it globally to get a `gitcrawl` command:

```sh
npm i -g gitcrawl-cli
gitcrawl
```

## Privacy

Everything runs on your machine: the CLI reads the repo with your local `git`, generates the dungeon and serves the game from localhost. Nothing is uploaded.

## Requirements

- Node.js 20+
- `git` on your `PATH`

## Public repos

For any public GitHub repo, no install needed: paste it into the hosted site. See the [main repo](https://github.com/0xOrionVega/gitcrawl).

## License

MIT
