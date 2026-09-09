// Opt-in actual upstream install + native skill deployment. No OAuth or account reads.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { deploymentFiles, discoveryRoot } from '../dist/setup.js';
import { portableSkills } from '../dist/skills.js';
const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "workspace-unified-'space -"));
const home = join(root, 'home'), state = join(root, 'state'), unrelated = join(root, 'unrelated');
await mkdir(home, { mode: 0o700 }); await mkdir(unrelated, { mode: 0o700 });
const env = { ...process.env, HOME: home, HERMES_HOME: join(home, '.hermes'), XDG_CONFIG_HOME: join(home, '.config') };
const cli = resolve('dist/cli.js');
const expectedSkillNames = ['google-drive', 'google-sheets', 'google-docs', 'google-slides', 'google-workspace-safety'];
const expectedSkillNameSet = new Set(expectedSkillNames);
const evidence = { root, home, state, commands: [], external: 'No human OAuth, credential import or Google account/API data reads. Native paths verified on disk, no running host handshake.' };
const sorted = values => [...values].sort();
const relFrom = (rootPath, path) => relative(rootPath, path).replaceAll('\\', '/');
async function existingFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name), rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await existingFiles(path, rel));
    else if (entry.isFile()) files.push(rel);
  }
  return sorted(files);
}
function verifySkillSet(report, skillsRoot, expected) {
  assert.deepEqual(sorted(report.skills.map(skill => basename(skill.path))), sorted(expectedSkillNames));
  assert.deepEqual(sorted(report.files.map(path => relFrom(skillsRoot, path))), sorted(expected.map(file => file.path)));
}
async function verifyDeployment(skillsRoot, report, expected) {
  verifySkillSet(report, skillsRoot, expected);
  assert.deepEqual(sorted((await readdir(skillsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)), sorted(expectedSkillNames));
  assert.deepEqual(await existingFiles(skillsRoot), sorted(expected.map(file => file.path)));
  const coreFiles = expected.filter(file => file.path.endsWith('/SKILL.md'));
  const runtimeFiles = expected.filter(file => file.path.endsWith('/references/runtime.md'));
  const taskReferences = expected.filter(file => file.path.includes('/references/') && !file.path.endsWith('/references/runtime.md'));
  const launchers = expected.filter(file => file.path.endsWith('/scripts/gws'));
  assert.equal(coreFiles.length, 5);
  assert.equal(runtimeFiles.length, 5);
  assert.equal(taskReferences.length, 13);
  assert.equal(launchers.length, 5);
  for (const name of expectedSkillNames) {
    assert.equal(coreFiles.filter(file => file.path === `${name}/SKILL.md`).length, 1);
    assert.equal(runtimeFiles.filter(file => file.path === `${name}/references/runtime.md`).length, 1);
    assert.equal(launchers.filter(file => file.path === `${name}/scripts/gws`).length, 1);
    assert.ok(taskReferences.filter(file => file.path.startsWith(`${name}/references/`)).length >= 2);
  }
  assert.equal(coreFiles.length + runtimeFiles.length + taskReferences.length, 23);
  for (const service of ['google-docs', 'google-sheets', 'google-slides']) assert.equal(taskReferences.filter(file => file.path === `${service}/references/create-template.md`).length, 1);
  console.log(JSON.stringify({ deployedCounts: { cores: coreFiles.length, skillAssets: coreFiles.length + runtimeFiles.length + taskReferences.length, launchers: launchers.length, taskReferences: taskReferences.length } }));
}
async function command(binary, args, expected = 0) {
  let stdout = '', stderr = '', code = 0;
  try { ({ stdout, stderr } = await execute(binary, args, { cwd: unrelated, env, timeout: 180000, maxBuffer: 3 * 1024 * 1024 })); }
  catch (error) { stdout = error.stdout ?? ''; stderr = error.stderr ?? ''; code = error.code; }
  const record = { binary, args, code, stdout, stderr }; evidence.commands.push(record); console.log(JSON.stringify(record));
  assert.equal(code, expected); return stdout;
}
const pack = (args, code = 0) => command(process.execPath, [cli, ...args], code);
try {
  const targets = { hermes: join(home, '.hermes'), codex: home, claude: home };
  await pack(['setup', '--agent', 'hermes', '--target', targets.hermes, '--state', state, '--dry-run']);
  assert.deepEqual(await readdir(home), []);
  assert.ok(!(await readdir(root)).includes('state'));
  for (const [agent, target] of Object.entries(targets)) {
    const args = ['setup', '--agent', agent, '--target', target, '--state', state, '--json'];
    const report = JSON.parse(await pack(args));
    assert.equal(report.status, 'deployed'); assert.equal(report.ready, false);
    assert.equal(report.installation.status, agent === 'hermes' ? 'installed' : 'already-installed');
    const skillsRoot = discoveryRoot(agent, target);
    assert.equal(report.root, skillsRoot);
    const expected = deploymentFiles(skillsRoot, state);
    verifySkillSet(report, skillsRoot, expected);
    const mtimes = {};
    for (const file of expected) {
      const path = join(skillsRoot, file.path);
      assert.equal(await readFile(path, 'utf8'), file.content);
      mtimes[path] = (await stat(path)).mtimeMs;
      if (file.path.endsWith('SKILL.md')) {
        assert.match(file.content, /^---\nname: [a-z-]+\ndescription: "[^\n]+"\nlicense: MIT\nmetadata:/);
        assert.equal(file.content, portableSkills(() => '').find(f => f.path === `skills/${file.path}`).content);
        assert.ok(expectedSkillNameSet.has(file.path.split('/')[0]));
        assert.ok(await readFile(path.replace('SKILL.md', 'references/runtime.md'), 'utf8'));
      }
    }
    await verifyDeployment(skillsRoot, report, expected);
    const launchers = expected.filter(file => file.path.endsWith('/scripts/gws')).map(file => join(skillsRoot, file.path));
    for (const launcher of launchers) assert.match(await command(launcher, ['--version']), /^gws 0\.22\.5\n/);
    const launcher = join(skillsRoot, 'google-sheets/scripts/gws');
    for (const service of ['sheets', 'docs', 'drive']) await command(launcher, [service, '--help']);
    await command(join(skillsRoot, 'google-slides/scripts/gws'), ['slides', 'presentations', '--help']);
    const again = JSON.parse(await pack(args));
    assert.ok(again.skills.every(s => s.action === 'unchanged'));
    for (const [path, mtime] of Object.entries(mtimes)) assert.equal((await stat(path)).mtimeMs, mtime);
  }
  const doctor = JSON.parse(await pack(['doctor', '--state', state, '--json']));
  assert.equal(doctor.installation, 'verified'); assert.equal(doctor.authentication, 'missing'); assert.equal(doctor.ready, false);
  // Service --help fetches public Discovery schemas, not account data or credentials.
  assert.deepEqual(await readdir(join(state, 'config')), ['cache']);
  const cache = join(state, 'config/cache');
  assert.deepEqual((await readdir(cache)).sort(), ['docs_v1.json', 'drive_v3.json', 'sheets_v4.json', 'slides_v1.json']);
  for (const file of await readdir(cache)) {
    const schema = JSON.parse(await readFile(join(cache, file), 'utf8'));
    assert.equal(schema.kind, 'discovery#restDescription');
    assert.equal(`${schema.name}_${schema.version}.json`, file);
  }
  const edited = join(targets.hermes, 'skills/google-sheets/SKILL.md');
  await writeFile(edited, 'USER EDIT retained by integration test');
  await pack(['setup', '--agent', 'hermes', '--target', targets.hermes, '--state', state], 1);
  assert.equal(await readFile(edited, 'utf8'), 'USER EDIT retained by integration test');
  evidence.status = 'passed';
} catch (error) { evidence.status = 'failed'; evidence.error = error.stack; process.exitCode = 1; }
finally {
  const path = join(root, 'verification.json');
  await writeFile(path, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  console.log(`Unified setup verification: ${evidence.status}. Evidence: ${path}`);
}
