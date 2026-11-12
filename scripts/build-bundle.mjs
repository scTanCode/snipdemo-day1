import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'bundle');
const frontend = join(root, 'frontend');
const push = process.argv.slice(2);
if (push.some((arg) => arg !== '--push') || push.length > 1) {
  throw new Error('Usage: node scripts/build-bundle.mjs [--push]');
}

function run(command, args, cwd = root, capture = false) {
  const windowsNpm = process.platform === 'win32' && command === 'npm';
  const executable = windowsNpm ? process.env.ComSpec || 'cmd.exe' : command;
  const commandArgs = windowsNpm ? ['/d', '/s', '/c', 'npm.cmd', ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
  return capture ? result.stdout.trim() : '';
}

function clean(path) {
  if (run('git', ['status', '--porcelain', '--untracked-files=all'], path, true)) {
    throw new Error(`Refusing to overwrite changes in ${path}`);
  }
}

clean(root);
for (const path of ['backend', 'frontend', 'cli', 'bundle']) clean(join(root, path));
run('git', ['submodule', 'update', '--init', '--remote', 'backend', 'frontend', 'cli']);
run('npm', ['ci'], frontend);
run('npm', ['run', 'build'], frontend);
const output = join(frontend, 'dist', 'snip-frontend', 'browser');
if (!existsSync(join(output, 'index.html'))) {
  throw new Error(`Frontend build is missing ${join(output, 'index.html')}`);
}

rmSync(join(bundle, 'public'), { recursive: true, force: true });
mkdirSync(join(bundle, 'public'), { recursive: true });
cpSync(output, join(bundle, 'public'), { recursive: true });
cpSync(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
cpSync(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
writeFileSync(join(bundle, '.env'), 'PUBLIC_DIR=./public\n');
writeFileSync(join(bundle, 'package.json'), JSON.stringify({
  name: 'snip-bundle', private: true, scripts: { start: 'bun server.js' },
}, null, 2) + '\n');
writeFileSync(join(bundle, 'Dockerfile'), 'FROM oven/bun:1-alpine\nWORKDIR /app\nCOPY . .\nENV PORT=3000\nEXPOSE 3000\nCMD ["bun", "server.js"]\n');
writeFileSync(join(bundle, '.dockerignore'), '.git\nnode_modules\n');
writeFileSync(join(bundle, 'railway.json'), JSON.stringify({
  build: { builder: 'DOCKERFILE' },
}, null, 2) + '\n');
run('git', ['add', '-A'], bundle);
if (run('git', ['diff', '--cached', '--name-only'], bundle, true)) {
  run('git', ['commit', '-m', 'Build generated bundle', '-m',
    'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    '-m', 'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>'], bundle);
} else {
  console.log('Bundle unchanged');
}
run('git', ['add', 'backend', 'frontend', 'cli', 'bundle']);
if (run('git', ['diff', '--cached', '--name-only'], root, true)) {
  run('git', ['commit', '-m', 'Update release submodule pointers', '-m',
    'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    '-m', 'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>']);
} else {
  console.log('Superproject unchanged');
}
if (push.length) {
  run('git', ['push', 'origin', 'HEAD:bundle'], bundle);
  run('git', ['push', 'origin', 'HEAD:main']);
}
