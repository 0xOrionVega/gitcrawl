/**
 * gitcrawl for VS Code and Cursor: "Raid This File" turns the TODO, FIXME, HACK
 * and BUG comments in the open file into pixel monsters that hunt your cursor.
 * The rules live in game.ts; this file wires them to the editor: decorations
 * for sprites, a status bar for hearts, hovers for the TODO text.
 */
import * as vscode from 'vscode';
import { extractTodos } from '@gitcrawl/shared';
import {
  alive,
  createRaid,
  cursorMoved,
  MONSTER_NAME,
  REACH,
  shiftLines,
  syncTodos,
  tick,
  type Board,
  type Monster,
  type MonsterKind,
  type Pos,
  type Raid,
  type RaidEvent,
} from './game.js';

const TICK_MS = 100;
const FRAME_MS = 320;
const SPEECH_MS = 3200;
const CORPSE_MS = 2500;
const HURT_FLASH_MS = 450;
const RESYNC_MS = 300;
const SPEEDS: Record<string, number> = { slow: 0.6, normal: 1, fast: 1.6 };
const KINDS: MonsterKind[] = ['goblin', 'skeleton', 'slime', 'ghost'];

// Out of the text flow, so sprites stand on the code without pushing it around.
const OVERLAY = 'none; position: absolute; z-index: 5; pointer-events: none; transform: translate(-25%, -8%);';

let current: RaidSession | null = null;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitcrawl.startRaid', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showInformationMessage('Open a file first, then start the raid.');
        return;
      }
      current?.end(null);
      const todos = extractTodos(editor.document.fileName, editor.document.getText());
      if (todos.length === 0) {
        void vscode.window.showInformationMessage('No TODO, FIXME, HACK or BUG comments in this file. Nothing to fight.');
        return;
      }
      current = new RaidSession(context, editor);
    }),
    vscode.commands.registerCommand('gitcrawl.endRaid', () => current?.end(null)),
    { dispose: () => current?.end(null) },
  );
}

export function deactivate() {
  current?.end(null);
}

class RaidSession {
  private readonly doc: vscode.TextDocument;
  private readonly raid: Raid;
  private readonly speed: number;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly sprites = new Map<string, vscode.TextEditorDecorationType>();
  private readonly corpseType: vscode.TextEditorDecorationType;
  private readonly speechType: vscode.TextEditorDecorationType;
  private readonly hurtType: vscode.TextEditorDecorationType;
  private readonly status: vscode.StatusBarItem;
  private readonly speech = new Map<number, number>();
  private corpses: { pos: Pos; until: number }[] = [];
  private hurtUntil = 0;
  private timer: NodeJS.Timeout;
  private resync: NodeJS.Timeout | null = null;
  private ended = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    editor: vscode.TextEditor,
  ) {
    this.doc = editor.document;
    const config = vscode.workspace.getConfiguration('gitcrawl');
    this.speed = SPEEDS[config.get<string>('speed', 'normal')] ?? 1;
    this.raid = createRaid(extractTodos(this.doc.fileName, this.doc.getText()), this.lines(), config.get<number>('hearts', 5));

    for (const kind of KINDS) {
      for (const frame of [0, 1]) {
        this.sprites.set(`${kind}-${frame}`, this.spriteType(`${kind}-${frame}`, ''));
        this.sprites.set(`${kind}-${frame}-stun`, this.spriteType(`${kind}-${frame}`, 'opacity: 0.4;'));
      }
    }
    this.corpseType = this.spriteType('bones', 'opacity: 0.8;');
    this.speechType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 2em',
        color: '#ffe24a',
        backgroundColor: '#1a1222',
        border: '1px solid #ffe24a',
        fontStyle: 'italic',
      },
    });
    this.hurtType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(255, 77, 94, 0.28)',
    });

    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    this.status.command = 'gitcrawl.endRaid';
    this.status.tooltip = 'gitcrawl raid: click to end it';
    this.status.show();

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document !== this.doc) return;
        this.handle(cursorMoved(this.raid, this.board(), this.cursor(e.textEditor), Date.now()));
        this.render();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => this.edited(e)),
      vscode.workspace.onDidCloseTextDocument((d) => {
        if (d === this.doc) this.end(null);
      }),
      vscode.languages.registerHoverProvider({ scheme: this.doc.uri.scheme }, { provideHover: (d, p) => this.hover(d, p) }),
    );
    void vscode.commands.executeCommand('setContext', 'gitcrawl.raiding', true);
    this.timer = setInterval(() => this.loop(), TICK_MS);
    this.render();
    vscode.window.setStatusBarMessage(`gitcrawl: ${this.raid.monsters.length} monsters in this file. Move your cursor onto them to fight.`, 5000);
  }

  private spriteType(name: string, extraCss: string) {
    return vscode.window.createTextEditorDecorationType({
      before: {
        contentIconPath: vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'sprites', `${name}.svg`),
        textDecoration: OVERLAY + extraCss,
      },
    });
  }

  private editor(): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find((e) => e.document === this.doc);
  }

  private lines(): string[] {
    return this.doc.getText().split(/\r?\n/);
  }

  private board(): Board {
    const doc = this.doc;
    return { lineCount: doc.lineCount, lineLength: (line) => doc.lineAt(line).text.length };
  }

  private cursor(editor: vscode.TextEditor): Pos {
    const p = editor.selection.active;
    return { line: p.line, col: p.character };
  }

  private loop() {
    const editor = vscode.window.activeTextEditor;
    // Paused while you're in another file or another window: no ambushes.
    if (!editor || editor.document !== this.doc || !vscode.window.state.focused) return;
    this.handle(tick(this.raid, this.board(), this.cursor(editor), Date.now(), this.speed));
    this.render();
  }

  private edited(e: vscode.TextDocumentChangeEvent) {
    if (e.document !== this.doc || e.contentChanges.length === 0) return;
    // Bottom-up, so earlier changes don't move the lines of later ones.
    const changes = [...e.contentChanges].sort((a, b) => b.range.start.line - a.range.start.line);
    for (const c of changes) {
      const delta = (c.text.match(/\n/g)?.length ?? 0) - (c.range.end.line - c.range.start.line);
      if (delta !== 0) shiftLines(this.raid, c.range.start.line, delta);
    }
    if (this.resync) clearTimeout(this.resync);
    this.resync = setTimeout(() => {
      this.resync = null;
      if (this.ended) return;
      this.handle(syncTodos(this.raid, extractTodos(this.doc.fileName, this.doc.getText()), this.lines()));
      this.render();
    }, RESYNC_MS);
  }

  private handle(events: RaidEvent[]) {
    const now = Date.now();
    for (const ev of events) {
      switch (ev.type) {
        case 'spotted':
          this.speech.set(ev.monster.id, now + SPEECH_MS);
          break;
        case 'slain':
          this.corpses.push({ pos: { ...ev.monster.pos }, until: now + CORPSE_MS });
          vscode.window.setStatusBarMessage(`gitcrawl: slain ${MONSTER_NAME[ev.monster.kind]} from line ${ev.monster.home + 1}`, 2500);
          break;
        case 'banished':
          this.corpses.push({ pos: { ...ev.monster.pos }, until: now + CORPSE_MS });
          vscode.window.setStatusBarMessage(`gitcrawl: banished for good. You fixed the ${ev.monster.todo.kind}.`, 3500);
          break;
        case 'hurt':
          this.hurtUntil = now + HURT_FLASH_MS;
          this.speech.set(ev.monster.id, now + SPEECH_MS);
          break;
        case 'won':
        case 'lost':
          this.end(ev.type);
          return;
        case 'hit':
        case 'spawned':
          break;
      }
    }
  }

  private render() {
    const editor = this.editor();
    if (this.ended || !editor) return;
    const now = Date.now();
    const frame = Math.floor(now / FRAME_MS) % 2;
    const at = (p: Pos) => {
      const line = Math.min(p.line, this.doc.lineCount - 1);
      const pos = new vscode.Position(line, Math.min(p.col, this.doc.lineAt(line).text.length));
      return new vscode.Range(pos, pos);
    };

    const groups = new Map<string, vscode.Range[]>();
    for (const key of this.sprites.keys()) groups.set(key, []);
    const speech: vscode.DecorationOptions[] = [];
    for (const m of alive(this.raid)) {
      groups.get(`${m.kind}-${frame}${now < m.stunUntil ? '-stun' : ''}`)!.push(at(m.pos));
      const until = this.speech.get(m.id);
      if (until && now < until) {
        const end = this.doc.lineAt(Math.min(m.pos.line, this.doc.lineCount - 1)).range.end;
        speech.push({ range: new vscode.Range(end, end), renderOptions: { after: { contentText: ` ${quote(m)} ` } } });
      }
    }
    for (const [key, ranges] of groups) editor.setDecorations(this.sprites.get(key)!, ranges);
    editor.setDecorations(this.speechType, speech);

    this.corpses = this.corpses.filter((c) => now < c.until);
    editor.setDecorations(this.corpseType, this.corpses.map((c) => at(c.pos)));
    editor.setDecorations(this.hurtType, now < this.hurtUntil ? [editor.selection.active].map((p) => new vscode.Range(p, p)) : []);

    const left = alive(this.raid).length;
    this.status.text = `${'♥'.repeat(Math.max(0, this.raid.hearts))}${'♡'.repeat(this.raid.maxHearts - Math.max(0, this.raid.hearts))}  $(flame) ${left} left · ${this.raid.slain} slain · ${this.raid.banished} banished`;
  }

  private hover(doc: vscode.TextDocument, p: vscode.Position): vscode.Hover | null {
    if (doc !== this.doc) return null;
    const m = alive(this.raid).find((x) => x.pos.line === p.line && Math.abs(x.pos.col - p.character) <= REACH);
    if (!m) return null;
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${MONSTER_NAME[m.kind]}** · ${'♥'.repeat(m.hp)}${'♡'.repeat(m.maxHp - m.hp)}\n\n`);
    md.appendMarkdown(`> ${m.todo.text ? escape(m.todo.text) : `*an empty ${m.todo.kind}*`}\n\n`);
    md.appendMarkdown(`Lives on line ${m.home + 1}. Hit it with your cursor, or fix the ${m.todo.kind} to banish it for good.`);
    return new vscode.Hover(md);
  }

  end(result: 'won' | 'lost' | null) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer);
    if (this.resync) clearTimeout(this.resync);
    for (const t of this.sprites.values()) t.dispose();
    this.corpseType.dispose();
    this.speechType.dispose();
    this.hurtType.dispose();
    this.status.dispose();
    for (const d of this.disposables) d.dispose();
    void vscode.commands.executeCommand('setContext', 'gitcrawl.raiding', false);
    if (current === this) current = null;

    const { slain, banished } = this.raid;
    const left = alive(this.raid).length;
    if (result === 'won') {
      void vscode.window.showInformationMessage(
        `Raid cleared: ${slain} slain, ${banished} banished. ${slain > 0 ? 'Their TODOs are still in the file: fix them to banish them for good.' : 'Every TODO fixed. Spotless.'}`,
      );
    } else if (result === 'lost') {
      void vscode.window
        .showWarningMessage(`The monsters got your cursor. ${slain} slain, ${banished} banished, ${left} still standing.`, 'Raid again')
        .then((pick) => {
          if (pick) void vscode.commands.executeCommand('gitcrawl.startRaid');
        });
    }
  }
}

function quote(m: Monster): string {
  const text = m.todo.text || `${m.todo.kind}!`;
  return `“${text.length > 60 ? `${text.slice(0, 59)}…` : text}”`;
}

function escape(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}
