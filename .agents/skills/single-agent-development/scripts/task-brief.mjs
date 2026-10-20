#!/usr/bin/env node
// Extract one task's full text from an implementation plan into a file the
// implementer reads in one call, so the task text never has to be pasted
// through the controller's context.
//
// Usage: node task-brief.mjs PLAN_FILE TASK_NUMBER [OUTFILE]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 3) {
  process.stderr.write('usage: task-brief PLAN_FILE TASK_NUMBER [OUTFILE]\n');
  process.exit(2);
}

const [rawPlan, taskNum, rawOut] = args;
const planPath = path.resolve(rawPlan);

if (!fs.existsSync(planPath) || !fs.statSync(planPath).isFile()) {
  process.stderr.write(`no such plan file: ${rawPlan}\n`);
  process.exit(2);
}

let outPath;
if (rawOut !== undefined) {
  outPath = path.resolve(rawOut);
} else {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceScript = path.join(scriptDir, 'sad-workspace.mjs');
  const workspaceDir = execFileSync(process.execPath, [workspaceScript, planPath], {
    encoding: 'utf8',
  }).trim();
  outPath = path.join(workspaceDir, `task-${taskNum}-brief.md`);
}

const outDir = path.dirname(outPath);
fs.mkdirSync(outDir, { recursive: true });
const finalOut = path.join(outDir, path.basename(outPath));
const reportPath = path.join(outDir, `task-${taskNum}-report.md`);

const content = fs.readFileSync(planPath, 'utf8');
const lines = content.split(/\r?\n/);

let inFence = false;
let inTask = false;
let found = false;
const extracted = [];

const escapedNum = taskNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headingTaskRegex = new RegExp(`^#+[ \\t]+Task[ \\t]+${escapedNum}([^0-9.]|$)`);
const anyHeadingTaskRegex = /^#+[ \t]+Task[ \t]+[0-9]+/;
const checkboxTaskRegex = /^[ \t]*-[ \t]*\[[ xX]\][ \t]+([0-9]+(?:\.[0-9]+)?)[. ]/;

for (const line of lines) {
  if (/^```/.test(line)) {
    inFence = !inFence;
  }
  if (!inFence && anyHeadingTaskRegex.test(line)) {
    if (found) break;
    inTask = headingTaskRegex.test(line);
    if (inTask) found = true;
  }
  if (!inFence) {
    const match = line.match(checkboxTaskRegex);
    if (match) {
      if (found) break;
      const id = match[1];
      inTask = id === taskNum;
      if (inTask) found = true;
    }
  }
  if (inTask) {
    extracted.push(line);
  }
}

if (extracted.length === 0) {
  process.stderr.write(`task ${taskNum} not found in ${rawPlan}\n`);
  process.exit(3);
}

fs.writeFileSync(finalOut, `${extracted.join('\n')}\n`, 'utf8');
process.stdout.write(`BRIEF_FILE=${finalOut}\n`);
process.stdout.write(`REPORT_FILE=${reportPath}\n`);
