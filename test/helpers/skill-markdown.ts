export interface MarkdownRow {
  task: string;
  load: string;
}

const skillRoots = new Set([
  'google-drive',
  'google-sheets',
  'google-docs',
  'google-slides',
  'google-workspace-safety'
]);

export function parseTaskRows(markdown: string): MarkdownRow[] {
  return markdown
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && !line.includes('---') && !line.startsWith('| Task |'))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 2)
    .map(([task, load]) => ({ task, load }));
}

export function markdownLinks(text: string): string[] {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
}

export function resolveSkillLink(skillPath: string, link: string): string {
  if (/^[a-z]+:/i.test(link) || link.startsWith('/')) throw new Error(`external link: ${link}`);
  const parts = skillPath.split('/');
  const stack = parts.slice(0, -1);
  for (const part of link.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const resolved = stack.join('/');
  const root = resolved.split('/')[1];
  if (!resolved.startsWith('skills/') || !skillRoots.has(root)) throw new Error(`outside skill roots: ${link}`);
  return resolved;
}

export function rowLoadSet(skillPath: string, row: MarkdownRow): string[] {
  const refs = markdownLinks(row.load).map(link => resolveSkillLink(skillPath, link));
  return [skillPath, ...refs];
}
