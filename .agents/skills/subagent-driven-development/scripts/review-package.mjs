#!/usr/bin/env node
// Generate a review package from BASE to the current working tree, including
// committed, staged, unstaged, and untracked changes.
//
// Usage: node review-package.mjs PLAN_FILE BASE HEAD [OUTFILE]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length < 3 || args.length > 4) {
  process.stderr.write('usage: review-package PLAN_FILE BASE HEAD [OUTFILE]\n');
  process.exit(2);
}

const [rawPlan, base, head, rawOut] = args;
const planPath = path.resolve(rawPlan);

if (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile()) {
  process.stderr.write(`no such plan file: ${rawPlan}\n`);
  process.exit(2);
}

function verifyRef(ref, label) {
  const res = spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], {
    stdio: 'ignore',
  });
  if (res.status !== 0) {
    process.stderr.write(`bad ${label}: ${ref}\n`);
    process.exit(2);
  }
}

verifyRef(base, 'BASE');
verifyRef(head, 'HEAD');

let outPath;
if (rawOut !== undefined) {
  outPath = path.resolve(rawOut);
} else {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceScript = path.join(scriptDir, 'sdd-workspace.mjs');
  const workspaceDir = execFileSync(process.execPath, [workspaceScript, planPath], {
    encoding: 'utf8',
  }).trim();
  const shortBase = execFileSync('git', ['rev-parse', '--short', base], {
    encoding: 'utf8',
  }).trim();
  outPath = path.join(workspaceDir, `review-${shortBase}-worktree.diff`);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });

function runGit(gitArgs) {
  const res = spawnSync('git', gitArgs, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });
  return res.stdout || '';
}

const commitsLog = runGit(['log', '--oneline', `${base}..${head}`]).trimEnd();
const statusShort = runGit(['status', '--short']).trimEnd();
const trackedDiff = runGit(['diff', '-U10', base]);

const untrackedRaw = runGit(['ls-files', '--others', '--exclude-standard']);
const untrackedFiles = untrackedRaw
  .split(/\r?\n/)
  .map((f) => f.trim())
  .filter(Boolean);

const untrackedDiffs = [];
for (const file of untrackedFiles) {
  if (path.resolve(file) === outPath) continue;
  const res = spawnSync('git', ['diff', '--no-index', '-U10', '--', '/dev/null', file], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (res.stdout) {
    untrackedDiffs.push(res.stdout);
  }
}

const sections = [
  `# Review package: ${base}..working-tree (HEAD ${head})`,
  '',
  '## Commits',
  ...(commitsLog ? [commitsLog] : []),
  '',
  '## Working tree status',
  ...(statusShort ? [statusShort] : []),
  '',
  '## Diff',
  trackedDiff + untrackedDiffs.join(''),
];

const outputContent = sections.join('\n');
fs.writeFileSync(outPath, outputContent, 'utf8');

const commitCount = runGit(['rev-list', '--count', `${base}..${head}`]).trim() || '0';
const byteCount = fs.statSync(outPath).size;
process.stdout.write(
  `wrote ${outPath}: ${commitCount} commit(s) plus working tree, ${byteCount} bytes\n`
);
