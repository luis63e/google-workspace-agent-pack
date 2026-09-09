import { describe, expect, it } from 'vitest';
import { createPackFiles } from '../src/assets.js';
import { markdownLinks, parseTaskRows, resolveSkillLink, rowLoadSet } from './helpers/skill-markdown.js';

const skills = ['google-drive', 'google-sheets', 'google-docs', 'google-slides', 'google-workspace-safety'];

function skillFiles() {
  return createPackFiles().filter(file => file.path.startsWith('skills/'));
}

function byPath() {
  return new Map(skillFiles().map(file => [file.path, file.content]));
}

describe('Markdown skill loading contract', () => {
  it('loads references conditionally per task and keeps planning runtime-free', () => {
    const files = byPath();
    for (const skill of skills) {
      const path = `skills/${skill}/SKILL.md`;
      const rows = parseTaskRows(files.get(path)!);
      expect(rows.length, skill).toBeGreaterThanOrEqual(4);
      const plan = rows.find(row => /plan/i.test(row.task));
      expect(plan, `${skill} plan row`).toBeDefined();
      expect(markdownLinks(plan!.load), `${skill} plan links`).toEqual([]);
      expect(plan!.load).toMatch(/core only/i);

      const linkedRows = rows.filter(row => markdownLinks(row.load).length > 0);
      expect(linkedRows.length, `${skill} linked rows`).toBeGreaterThan(0);
      const allReferences = skillFiles().filter(file => file.path.includes('/references/')).map(file => file.path);
      for (const row of linkedRows) {
        const loadSet = rowLoadSet(path, row);
        expect(loadSet[0]).toBe(path);
        expect(new Set(loadSet).size, `${skill} ${row.task} duplicate links`).toBe(loadSet.length);
        expect(loadSet.length, `${skill} ${row.task} no all-reference fanout`).toBeLessThan(allReferences.length + 1);
        for (const loaded of loadSet) expect(files.has(loaded), `${skill} ${row.task} -> ${loaded}`).toBe(true);
      }
    }
  });

  it('keeps runtime instructions in one reusable reference invalidated by backend/account/config/context changes', () => {
    const files = byPath();
    for (const skill of skills) {
      const core = files.get(`skills/${skill}/SKILL.md`)!;
      expect(core).toContain('[runtime](references/runtime.md) once');
      expect(core).toContain('reuse if backend/account/config/context unchanged');
      expect(core).toContain('Do not recursively follow every link');
      expect(files.has(`skills/${skill}/references/runtime.md`)).toBe(true);
    }
  });

  it('resolves sibling skill links only within the five shipped skill roots', () => {
    const path = 'skills/google-drive/SKILL.md';
    expect(resolveSkillLink(path, '../google-docs/SKILL.md')).toBe('skills/google-docs/SKILL.md');
    expect(() => resolveSkillLink(path, '../../README.md')).toThrow(/outside skill roots/);
    expect(() => resolveSkillLink(path, '../not-a-skill/SKILL.md')).toThrow(/outside skill roots/);
    expect(() => resolveSkillLink(path, 'https://example.test/ref.md')).toThrow(/external link/);
  });

  it('keeps Google Drive native MIME sibling handoffs one-target and service-specific', () => {
    const path = 'skills/google-drive/SKILL.md';
    const rows = parseTaskRows(byPath().get(path)!);
    const siblingTargets = new Map<string, string>();

    for (const row of rows) {
      const targets = markdownLinks(row.load)
        .map(link => resolveSkillLink(path, link))
        .filter(target => target !== path && /^skills\/google-(docs|sheets|slides)\/SKILL\.md$/.test(target));

      expect(targets.length, `${row.task} sibling handoff count`).toBeLessThanOrEqual(1);
      for (const target of targets) siblingTargets.set(target, row.task);
    }

    expect([...siblingTargets.keys()].sort()).toEqual([
      'skills/google-docs/SKILL.md',
      'skills/google-sheets/SKILL.md',
      'skills/google-slides/SKILL.md'
    ]);
  });

  it('keeps essential safety, privacy, scope, retry, and readback gates in every core', () => {
    const files = byPath();
    for (const skill of skills) {
      const core = files.get(`skills/${skill}/SKILL.md`)!;
      for (const required of ['Authorization', 'Privacy', 'scope', 'Capability', 'No blind write retry', 'read back', 'untrusted']) {
        expect(core, `${skill} includes ${required}`).toContain(required);
      }
    }
  });
});
