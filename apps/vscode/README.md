# gitcrawl: TODO Raid

Your TODOs come alive and hunt your cursor.

Run **gitcrawl: Raid This File** and every TODO-style comment in the open file turns into a pixel monster standing on its own keyword. Move near one and it wakes up, shouts its TODO at you and comes for your cursor.

| Comment | Monster | HP | Speed |
| --- | --- | --- | --- |
| `TODO` | goblin | 2 | quick |
| `FIXME` | skeleton | 3 | steady |
| `HACK` | slime | 4 | slow |
| `XXX`, `BUG` | ghost | 1 | fast |

## How to play

- **Fight:** move your cursor onto a monster (arrow keys or a click) to hit it. It gets knocked back and stunned for a moment.
- **Get hurt:** a monster that reaches your cursor bites you for one heart. Your hearts and the score are in the status bar.
- **Banish for good:** fix or delete the comment. The monster disappears and counts as banished, which is the real win.
- **Read it:** hover a monster to see its full TODO text and where it lives.
- **Stop:** click the hearts in the status bar, or run **gitcrawl: End Raid**.

The raid pauses while you're in another file or another window, and the code itself is never touched: the monsters are editor decorations.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `gitcrawl.speed` | `normal` | `slow`, `normal` or `fast` |
| `gitcrawl.hearts` | `5` | Hearts per raid, 1 to 9 |

## More gitcrawl

Play a whole repo as a dungeon in the browser: run `npx gitcrawl-cli` inside any git repo, or see [gitcrawl on GitHub](https://github.com/0xOrionVega/gitcrawl).

Works in VS Code, Cursor, Windsurf and VSCodium. MIT licensed.
