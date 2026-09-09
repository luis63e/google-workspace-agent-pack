import { describe, expect, it } from 'vitest';
import { createPackFiles } from '../src/assets.js';
import { parseTaskRows, rowLoadSet } from './helpers/skill-markdown.js';
import scenarios from './fixtures/skill-scenarios.json' with { type: 'json' };

const expectedSkills = ['google-drive', 'google-sheets', 'google-docs', 'google-slides', 'google-workspace-safety'];
const runtimeNames = ['codex', 'hermes', 'claude', 'opencode', 'artifact_tool', 'CUA', 'plugin'];

function words(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function skillFiles() {
  return createPackFiles().filter(file => file.path.startsWith('skills/'));
}

function skillMap() {
  return new Map(skillFiles().map(file => [file.path, file.content]));
}

const knownBatchOperations = new Set(['repeatCell', 'insertText']);

function extractJsonObjects(text: string) {
  const objects: any[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(i, j + 1);
          try {
            objects.push(JSON.parse(candidate));
            i = j;
          } catch {
            // Keep scanning; braces in prose are not recipes.
          }
          break;
        }
      }
    }
  }
  return objects;
}

function columnToIndex(column: string) {
  return [...column].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function parseA1Range(a1: string) {
  const match = a1.match(/^'([^']+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) throw new Error(`Unsupported A1 recipe range: ${a1}`);
  const [, sheetTitle, startColumn, startRow, endColumn, endRow] = match;
  return {
    sheetTitle,
    startRowIndex: Number(startRow) - 1,
    endRowIndexInclusive: Number(endRow) - 1,
    startColumnIndex: columnToIndex(startColumn),
    endColumnIndexInclusive: columnToIndex(endColumn),
    rowCount: Number(endRow) - Number(startRow) + 1,
    columnCount: columnToIndex(endColumn) - columnToIndex(startColumn) + 1
  };
}

function assertFiniteInteger(value: unknown, label: string) {
  expect(Number.isInteger(value), label).toBe(true);
}

function assertValidSheetValueRecipe(valuesRecipe: any, gridRangeRecipe: any) {
  const range = parseA1Range(valuesRecipe.range);
  expect(range.sheetTitle).toBe('Q1');
  expect(valuesRecipe.majorDimension).toBe('ROWS');
  expect(valuesRecipe.values).toHaveLength(range.rowCount);
  for (const row of valuesRecipe.values) expect(row).toHaveLength(range.columnCount);

  const cellMap = new Map<string, unknown>();
  valuesRecipe.values.forEach((row: unknown[], rowOffset: number) => {
    row.forEach((value, columnOffset) => {
      const rowNumber = range.startRowIndex + rowOffset + 1;
      const columnNumber = range.startColumnIndex + columnOffset;
      const columnName = String.fromCharCode(65 + columnNumber);
      cellMap.set(`${columnName}${rowNumber}`, value);
    });
  });

  expect(cellMap.get('B2')).toBe('sku');
  expect(cellMap.get('C2')).toBe('qty');
  expect(cellMap.get('D2')).toBe('unitPrice');
  expect(cellMap.get('E2')).toBe('total');
  expect(cellMap.get('B3')).toBe('A');
  expect(cellMap.get('C3')).toBe(2);
  expect(cellMap.get('D3')).toBe(10);
  expect(cellMap.get('E3')).toBe('=C3*D3');

  const formula = cellMap.get('E3');
  expect(typeof formula).toBe('string');
  const formulaRefs = [...(formula as string).matchAll(/[A-Z]+\d+/g)].map(match => match[0]);
  expect(formulaRefs).toEqual(['C3', 'D3']);
  for (const ref of formulaRefs) expect(typeof cellMap.get(ref), `${ref} numeric formula input`).toBe('number');
  expect(formulaRefs).not.toContain('B3');
  expect((cellMap.get('C3') as number) * (cellMap.get('D3') as number)).toBe(20);

  expect(gridRangeRecipe).toEqual({
    sheetId: 123456,
    startRowIndex: range.startRowIndex,
    endRowIndex: range.endRowIndexInclusive + 1,
    startColumnIndex: range.startColumnIndex,
    endColumnIndex: range.endColumnIndexInclusive + 1
  });
  for (const key of ['sheetId', 'startRowIndex', 'endRowIndex', 'startColumnIndex', 'endColumnIndex']) assertFiniteInteger(gridRangeRecipe[key], key);
}

function assertValidBatchRecipe(recipe: any) {
  expect(Array.isArray(recipe.requests), 'batch recipe requests').toBe(true);
  for (const request of recipe.requests) {
    const operationKeys = Object.keys(request).filter(key => knownBatchOperations.has(key));
    expect(operationKeys, 'one known operation per Request').toHaveLength(1);
    expect(Object.keys(request), 'Request contains only the operation key').toEqual(operationKeys);
    if ('repeatCell' in request) {
      const range = request.repeatCell.range;
      expect(range).toEqual(expect.objectContaining({ sheetId: expect.any(Number), startRowIndex: expect.any(Number), endRowIndex: expect.any(Number), startColumnIndex: expect.any(Number), endColumnIndex: expect.any(Number) }));
      for (const key of ['sheetId', 'startRowIndex', 'endRowIndex', 'startColumnIndex', 'endColumnIndex']) assertFiniteInteger(range[key], `repeatCell.range.${key}`);
      expect(range.endRowIndex).toBeGreaterThan(range.startRowIndex);
      expect(range.endColumnIndex).toBeGreaterThan(range.startColumnIndex);
      expect(request.repeatCell.fields).toBe('userEnteredFormat.textFormat.bold');
      expect(request.repeatCell.fields).not.toMatch(/^\*$/);
    }
  }
}

function expectAssertionFailure(fn: () => void) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  expect(failed).toBe(true);
}

describe('portable Markdown skill corpus', () => {
  it('ships exactly five portable skills with concise complete frontmatter and local-only Markdown references', () => {
    const files = skillFiles();
    const cores = files.filter(file => file.path.endsWith('/SKILL.md'));
    expect(cores.map(file => file.path.split('/')[1]).sort()).toEqual([...expectedSkills].sort());
    for (const name of expectedSkills) {
      const core = files.find(file => file.path === `skills/${name}/SKILL.md`);
      expect(core, name).toBeDefined();
      expect(core!.content).toMatch(new RegExp(`^---\\nname: ${name}\\ndescription: "[^"]+"\\nlicense: MIT\\nmetadata:\\n  author: google-workspace-agent-pack\\n  version: "1\\.3\\.0"`, 'm'));
      expect(words(core!.content)).toBeGreaterThanOrEqual(140);
      expect(words(core!.content)).toBeLessThanOrEqual(430);
      for (const section of ['Activation Contract', 'Loading', 'Hard Rules', 'Task Routes', 'Output Contract', 'References']) expect(core!.content).toContain(`## ${section}`);
      const refs = [...core!.content.matchAll(/\((references\/[^)]+|\.\.\/google-[^)]+)\)/g)].map(match => match[1]);
      expect(refs.length, `${name} reference links`).toBeGreaterThanOrEqual(2);
      const byPath = new Map(files.map(file => [file.path, file.content]));
      const rows = parseTaskRows(core!.content);
      for (const row of rows) for (const ref of rowLoadSet(`skills/${name}/SKILL.md`, row)) expect(byPath.has(ref), ref).toBe(true);
      for (const bad of runtimeNames) expect(core!.content.toLowerCase()).not.toContain(bad.toLowerCase());
    }
  });

  it('contains mandatory core safety and route-scoped semantic details without inventing MCP schemas', () => {
    const byPath = skillMap();
    for (const name of expectedSkills) {
      const core = byPath.get(`skills/${name}/SKILL.md`)!;
      for (const term of ['untrusted', 'Authorization', 'Capability', 'No blind write retry', 'runtime']) expect(core, `${name} core includes ${term}`).toContain(term);
      expect(core).toContain('| Task | Load when needed |');
      expect(core).toContain('Do not recursively follow every link');
    }
    const routeUnion = (name: string, taskPattern: RegExp) => {
      const skillPath = `skills/${name}/SKILL.md`;
      const rows = parseTaskRows(byPath.get(skillPath)!);
      const paths = new Set<string>();
      for (const row of rows.filter(row => taskPattern.test(row.task))) for (const path of rowLoadSet(skillPath, row)) paths.add(path);
      return [...paths].map(path => byPath.get(path)).join('\n');
    };
    const expectations: Record<string, { tasks: RegExp; terms: string[] }> = {
      'google-drive': { tasks: /Read|Comments/, terms: ['stable IDs', 'pagination', 'trash', 'commentId', 'replyId', 'permission'] },
      'google-sheets': { tasks: /Edit/, terms: ['numeric sheetId', 'GridRange', 'RAW', 'USER_ENTERED', 'FORMULA', 'UNFORMATTED_VALUE'] },
      'google-docs': { tasks: /Structured edits/, terms: ['tabId', 'UTF-16', 'requiredRevisionId', 'exactly one operation', 'chips'] },
      'google-slides': { tasks: /Text|Media/, terms: ['presentationId', 'objectId', 'master', 'thumbnail', 'visual verification pending', 'linked Sheets chart'] },
      'google-workspace-safety': { tasks: /Auth|Writes/, terms: ['403', '404', '429', '5xx', 'ambiguous', 'no automatic escalation'] }
    };
    for (const [name, expectation] of Object.entries(expectations)) for (const term of expectation.terms) expect(routeUnion(name, expectation.tasks), `${name} row union includes ${term}`).toContain(term);
    for (const file of byPath.values()) {
      if (file.includes('REST-shaped')) expect(file).toMatch(/REST-shaped[^\n]+available schema/i);
      expect(file).not.toMatch(/mcp_[a-z]+|Hermes tool|Codex tool|raw REST fields/);
    }
  });

  it('validates static scenario corpus coverage and local reference paths', () => {
    expect(scenarios).toHaveProperty('purpose');
    expect(scenarios.cases.length).toBeGreaterThanOrEqual(15);
    expect(scenarios.cases.length).toBeLessThanOrEqual(22);
    const refs = new Set(skillFiles().map(file => file.path));
    const ids = new Set<string>();
    const requiredTags = ['partial-read', 'ambiguous-identity', 'injection', 'unsupported-capability', 'ambiguous-write', 'utf16-tabs', 'formula-date-raw', 'slide-template-chart-visual'];
    for (const tag of requiredTags) expect(scenarios.cases.some((c: any) => c.tags.includes(tag)), tag).toBe(true);
    for (const skill of expectedSkills) expect(scenarios.cases.some((c: any) => c.skill === skill), skill).toBe(true);
    for (const c of scenarios.cases as any[]) {
      expect(c).toEqual(expect.objectContaining({ id: expect.any(String), skill: expect.any(String), request: expect.any(String), suppliedFacts: expect.any(Array), capabilities: expect.any(Array), requiredActions: expect.any(Array), forbiddenActions: expect.any(Array), verificationRubric: expect.any(Array), referencePaths: expect.any(Array), tags: expect.any(Array) }));
      expect(c.id.trim(), 'nonempty id').not.toBe('');
      expect(ids.has(c.id), `unique id ${c.id}`).toBe(false);
      ids.add(c.id);
      expect(expectedSkills, `${c.id}: known skill`).toContain(c.skill);
      for (const key of ['suppliedFacts', 'capabilities', 'requiredActions', 'forbiddenActions', 'verificationRubric', 'referencePaths']) {
        expect(c[key].length, `${c.id}: nonempty ${key}`).toBeGreaterThan(0);
        for (const item of c[key]) expect(typeof item, `${c.id}: ${key} item`).toBe('string');
      }
      for (const ref of c.referencePaths) {
        expect(refs.has(ref), `${c.id}: ${ref}`).toBe(true);
        const refSkill = ref.split('/')[1];
        expect(expectedSkills, `${c.id}: ${ref} belongs to a known skill`).toContain(refSkill);
      }
    }
  });

  it('parses generated reference JSON recipes and verifies Sheets coordinates, formulas, and batch bounds', () => {
    const references = skillFiles().filter(file => file.path.includes('/references/'));
    const recipesByPath = new Map(references.map(file => [file.path, extractJsonObjects(file.content)]));
    for (const [path, recipes] of recipesByPath) for (const recipe of recipes) expect(recipe && typeof recipe === 'object' && !Array.isArray(recipe), `${path} recipe object`).toBe(true);

    const sheetsValues = recipesByPath.get('skills/google-sheets/references/ranges-values-and-formulas.md')!;
    expect(sheetsValues).toHaveLength(2);
    assertValidSheetValueRecipe(sheetsValues[0], sheetsValues[1]);

    const batchRecipes = [...recipesByPath.values()].flat().filter(recipe => Array.isArray(recipe.requests));
    expect(batchRecipes.length).toBeGreaterThanOrEqual(3);
    for (const recipe of batchRecipes) assertValidBatchRecipe(recipe);
  });

  it('fails regression assertions for prior Sheets recipe defects', () => {
    const recipes = extractJsonObjects(skillFiles().find(file => file.path === 'skills/google-sheets/references/ranges-values-and-formulas.md')!.content);
    const batch = extractJsonObjects(skillFiles().find(file => file.path === 'skills/google-sheets/references/batch-updates-and-preservation.md')!.content)[0];

    expectAssertionFailure(() => assertValidSheetValueRecipe({ ...recipes[0], range: "'Q1'!B2:D4" }, recipes[1]));
    expectAssertionFailure(() => assertValidSheetValueRecipe({ ...recipes[0], values: [['sku', 'qty', 'unitPrice', 'total'], ['A', 2, 10, '=B3*10']] }, recipes[1]));
    expectAssertionFailure(() => assertValidBatchRecipe({ requests: [{ repeatCell: { ...batch.requests[0].repeatCell, range: { ...batch.requests[0].repeatCell.range, endColumnIndex: undefined } } }] }));
  });

  it('keeps every generated skill asset in package/init distribution without private data markers', () => {
    const files = createPackFiles();
    const refs = files.filter(file => file.path.startsWith('skills/') && file.path.includes('/references/'));
    expect(refs.length).toBe(18);
    expect(files.find(file => file.path === 'adapters/codex/plugin.json')!.content).toContain('google-slides');
    for (const file of files.filter(file => file.path.startsWith('skills/'))) {
      expect(file.content).not.toMatch(/client_secret|refresh_token|access_token|\.env/i);
      expect(file.content).toContain(file.path.endsWith('runtime.md') ? 'not live-verified' : 'References');
    }
  });
});
