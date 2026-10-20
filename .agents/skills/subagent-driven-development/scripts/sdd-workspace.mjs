#!/usr/bin/env node
// Resolve and ensure the working-tree directory SDD uses for one plan's
// short-lived artifacts: task briefs, implementer reports, review packages,
// and the progress ledger. Print the plan directory's absolute path.
//
// Usage: node sdd-workspace.mjs PLAN_FILE

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length !== 1) {
  process.stderr.write('usage: sdd-workspace PLAN_FILE\n');
  process.exit(2);
}

const rawPlan = args[0];
const planPath = path.resolve(rawPlan);

if (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile()) {
  process.stderr.write(`no such plan file: ${rawPlan}\n`);
  process.exit(2);
}

const parent = path.basename(path.dirname(planPath));
const name = path.basename(planPath, '.md');
const slug = `${parent}-${name}`;

if (!slug || slug === '.' || slug === '..') {
  process.stderr.write(`cannot derive a workspace name from: ${rawPlan}\n`);
  process.exit(2);
}

let root;
try {
  root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch (err) {
  process.stderr.write(err.stderr || 'fatal: not a git repository\n');
  process.exit(1);
}

const resolvedRoot = path.resolve(root);
const base = path.join(resolvedRoot, '.dream', 'sdd');
const dir = path.join(base, slug);

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(base, '.gitignore'), '*\n', 'utf8');
process.stdout.write(`${dir}\n`);
