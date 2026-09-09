import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat, mkdir, open, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { portableSkills } from './skills.js';
import { exists, safePath, installManaged } from './managed.js';
import type { PackFile } from './assets.js';

export function discoveryRoot(agent: string, target: string): string {
  const paths: Record<string, string> = { hermes: 'skills', codex: '.agents/skills', claude: '.claude/skills' };
  if (!Object.hasOwn(paths, agent)) throw new Error('Unsupported agent. Supported: hermes, codex, claude; custom/plugin targets are not verified.');
  return join(resolve(target), paths[agent]);
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url));

export function deploymentFiles(root: string, state: string): PackFile[] {
  const pack = `${quote(process.execPath)} ${quote(cliPath)}`;
  const files = portableSkills(name => `# Runtime configuration\n\nManaged CLI deployment; not live-verified. Use the absolute launcher below from any working directory. Do not call ambient gws or use another agent's credentials.\n\n\`\`\`sh\n${quote(join(root, name, 'scripts/gws'))} --version\n${pack} doctor --state ${quote(state)} --json\n\`\`\`\n\nPass gws arguments directly to the launcher, e.g. sheets spreadsheets --help, docs documents --help, drive files --help, slides presentations --help. Inspect --help/schema before constructing API requests. Use --params for query JSON and --json for body JSON.\nFor Sheets, read properties.locale, properties.timeZone and sheets.properties; values.get accepts valueRenderOption FORMULA or UNFORMATTED_VALUE, values.update accepts valueInputOption USER_ENTERED.\nUse absolute local upload/download paths: managed execution isolates its cwd.\nOAuth is a separate human step: ${pack} auth --state ${quote(state)} --services drive,docs,sheets,slides (read default; opt into --access write only when needed). A Desktop OAuth client is required; see the package README. Never copy credentials from other tools.\nLocal doctor is offline; auth status may contact Google if credentials exist. Only run live API operations within task authorization.\nThis launcher depends on the Node executable and built package remaining at their recorded absolute paths. If moved, setup reports a conflict; review/remove only this pack's old deployment before reinstalling.\n`);
  for (const file of files.filter(f => f.path.endsWith('SKILL.md'))) {
    files.push({ path: file.path.replace('SKILL.md', 'scripts/gws'), content: `#!/bin/sh\nexec ${pack} exec --state ${quote(state)} -- "$@"\n` });
  }
  return files.map(file => ({ ...file, path: file.path.slice(7) }));
}

async function tree(directory: string, prefix = ''): Promise<string[]> {
  const files: string[] = [];
  for (const name of await readdir(directory)) {
    const rel = join(prefix, name), path = join(directory, name);
    await safePath(path);
    const info = await lstat(path);
    if (info.isDirectory()) files.push(...await tree(path, rel));
    else {
      if (!info.isFile() || info.nlink !== 1) throw new Error(`Unsafe skill file: ${path}`);
      files.push(rel);
    }
  }
  return files.sort();
}

async function plan(root: string, files: PackFile[]) {
  await safePath(root);
  const names = [...new Set(files.map(file => file.path.split('/')[0]))];
  const skills: { path: string; action: 'create' | 'unchanged' }[] = [];
  const conflicts: string[] = [];
  for (const name of names) {
    const path = join(root, name);
    await safePath(path);
    if (!await exists(path)) { skills.push({ path, action: 'create' }); continue; }
    if (!(await lstat(path)).isDirectory()) { conflicts.push(path); continue; }
    const expected = files.filter(file => file.path.startsWith(`${name}/`));
    const actual = await tree(path);
    let same = JSON.stringify(actual) === JSON.stringify(expected.map(f => f.path.slice(name.length + 1)).sort());
    for (const file of expected) {
      const destination = join(root, file.path);
      if (!actual.includes(file.path.slice(name.length + 1))) { same = false; continue; }
      if (await readFile(destination, 'utf8') !== file.content) same = false;
      if (file.path.endsWith('/scripts/gws') && !((await lstat(destination)).mode & 0o100)) same = false;
    }
    if (same) skills.push({ path, action: 'unchanged' }); else conflicts.push(path);
  }
  if (conflicts.length) throw new Error(`Skill conflict; nothing overwritten: ${conflicts.join(', ')}. Preserve your edits; manually reconcile or choose another explicit target. No --force is supported by setup.`);
  return skills;
}

interface SetupOptions { agent: string; target: string; state: string; dryRun?: boolean }
interface Dependencies { install?: (state: string) => Promise<unknown>; beforeWrite?: (path: string) => Promise<void> }
export async function setup(options: SetupOptions, dependencies: Dependencies = {}) {
  const root = discoveryRoot(options.agent, options.target), state = resolve(options.state);
  const files = deploymentFiles(root, state);
  const skills = await plan(root, files);
  const report = { agent: options.agent, root, state, status: options.dryRun ? 'dry-run' : 'deployed', ready: false,
    skills, files: files.map(file => join(root, file.path)),
    next: 'Restart/reload the selected agent and inspect its skill list. Discovery paths are documented, not a running-host handshake. Google authentication and live API access remain unverified.' };
  if (options.dryRun) return report;
  // Detect known conflicts before any network or state writes; retain a verified binary if deployment later fails.
  const installation = await (dependencies.install ?? installManaged)(state);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await safePath(root);
  const lockPath = join(root, '.google-workspace-pack.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  const createdFiles: string[] = [], createdDirs: string[] = [];
  try {
    report.skills = await plan(root, files);
    for (const skill of report.skills.filter(s => s.action === 'create')) {
      await mkdir(skill.path, { mode: 0o700 }); // Exclusive reservation; never adopt someone else's directory.
      createdDirs.push(skill.path);
      for (const file of files.filter(f => join(root, f.path).startsWith(`${skill.path}/`))) {
        const destination = join(root, file.path), parent = dirname(destination);
        if (parent !== skill.path && !createdDirs.includes(parent)) { await mkdir(parent, { mode: 0o700 }); createdDirs.push(parent); }
        await dependencies.beforeWrite?.(destination);
        await safePath(destination);
        await writeFile(destination, file.content, { flag: 'wx', mode: file.path.endsWith('/scripts/gws') ? 0o700 : 0o600 });
        createdFiles.push(destination);
      }
    }
    await plan(root, files); // Read back exact deployed bytes before success.
    return { ...report, installation };
  } catch (error) {
    // Remove only our files and now-empty directories; never recursively delete concurrent user additions.
    for (const file of createdFiles.reverse()) await unlink(file).catch(() => {});
    for (const dir of createdDirs.reverse()) await rmdir(dir).catch(() => {});
    throw new Error(`Skill deployment failed; newly created skill files rolled back (inspect for concurrent edits). Verified tooling, if installed, is retained. ${error instanceof Error ? error.message : 'Retry setup.'}`);
  } finally { await lock.close(); await unlink(lockPath); }
}
