/** Loot report: the value layer. Plain data -> Markdown for issues/PRs. */
import type { DungeonSpec } from './types.js';
import { formatAge, formatNumber } from './format.js';

export function gradeLabel(grade: string): string {
  switch (grade) {
    case 'S':
      return 'Legendary';
    case 'A':
      return 'Heroic';
    case 'B':
      return 'Sturdy';
    case 'C':
      return 'Creaky';
    case 'D':
      return 'Haunted';
    default:
      return 'Cursed';
  }
}

export function reportMarkdown(spec: DungeonSpec, siteUrl = 'https://gitcrawl.dev'): string {
  const { repo, findings: f, health } = spec;
  const lines: string[] = [];
  const link = (text: string, url: string | null) => (url ? `[${text}](${url})` : text);
  lines.push(`## gitcrawl loot report: ${repo.fullName}`);
  lines.push('');
  lines.push(
    `**Dungeon health: ${health.score}/100 (${health.grade} · ${gradeLabel(health.grade)})** · ${spec.title.name} · ${formatNumber(spec.stats.files)} files`,
  );
  lines.push('');
  if (health.deductions.length > 0) {
    lines.push('### Curses and deductions');
    for (const d of health.deductions) {
      const curse = f.curses.find((c) => c.id === d.id);
      lines.push(`- **−${d.points}** ${d.label}${curse ? ` — ${curse.detail}` : ''}`);
    }
    lines.push('');
  }
  if (f.bigFiles.length > 0) {
    lines.push('### Boss files (split candidates)');
    lines.push('| File | Lines |');
    lines.push('| --- | ---: |');
    for (const b of f.bigFiles.slice(0, 10)) {
      lines.push(`| ${link(`\`${b.path}\``, b.url)} | ${b.exact ? '' : '~'}${formatNumber(b.loc)} |`);
    }
    lines.push('');
  }
  lines.push(`### Goblin log: ${formatNumber(f.todoTotal)} TODO/FIXME/HACK in ${f.todoScannedFiles} scanned files`);
  if (f.todos.length === 0) {
    lines.push('No goblins found in the scanned files. Suspiciously clean.');
  } else {
    for (const t of f.todos.slice(0, 40)) {
      const where = link(`\`${t.path}:${t.line}\``, t.url);
      lines.push(`- ${where} **${t.kind}**${t.owner ? ` (${t.owner})` : ''}: ${t.text || '_no description_'}`);
    }
    if (f.todos.length > 40) lines.push(`- …and ${formatNumber(f.todoTotal - 40)} more`);
  }
  lines.push('');
  if (f.staleBranches && f.staleBranches.length > 0) {
    lines.push(`### Crypt: ${f.staleBranches.length} stale branches`);
    for (const b of f.staleBranches.slice(0, 15)) {
      lines.push(`- ${link(`\`${b.name}\``, b.url)}, last commit ${formatAge(b.daysStale)} ago`);
    }
    lines.push('');
  }
  if (f.quests && f.quests.length > 0) {
    lines.push('### Quests (start contributing here)');
    for (const q of f.quests) lines.push(`- ${link(`#${q.number}`, q.url)} ${q.title}`);
    lines.push('');
  }
  if (f.guardians.length > 0) {
    lines.push('### Guardians (who to ask)');
    for (const g of f.guardians.slice(0, 10)) {
      lines.push(`- \`${g.folder || '/'}\` → @${g.login}${g.source === 'codeowners' ? ' (CODEOWNERS)' : ''}`);
    }
    lines.push('');
  }
  if (spec.notes.length > 0) {
    lines.push(`_Notes: ${spec.notes.join(' ')}_`);
    lines.push('');
  }
  lines.push(`_Play this repo as a dungeon: ${siteUrl}/r/${repo.fullName}_`);
  return lines.join('\n');
}
