#!/usr/bin/env bash
set -euo pipefail

skill_dir=$(cd "$(dirname "$0")/.." && pwd)
test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' EXIT

repo="$test_root/repo"
mkdir -p "$repo/.kiro/specs/example"
git -C "$repo" init -q

plan="$repo/.kiro/specs/example/tasks.md"
cat > "$plan" <<'EOF'
- [ ] 1.1 Implement artifact paths
  - Produce a task brief and implementation report.
EOF

output=$(cd "$repo" && "$skill_dir/scripts/task-brief" "$plan" 1.1)
brief_file=$(printf '%s\n' "$output" | sed -n 's/^BRIEF_FILE=//p')
report_file=$(printf '%s\n' "$output" | sed -n 's/^REPORT_FILE=//p')

expected_dir="$repo/.superpowers/sdd/example-tasks"
if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null && command -v wslpath >/dev/null 2>&1; then
  expected_brief=$(wslpath -w "$expected_dir/task-1.1-brief.md")
  expected_report=$(wslpath -w "$expected_dir/task-1.1-report.md")
elif command -v cygpath >/dev/null 2>&1; then
  expected_brief=$(cygpath -w "$expected_dir/task-1.1-brief.md")
  expected_report=$(cygpath -w "$expected_dir/task-1.1-report.md")
else
  expected_brief="$expected_dir/task-1.1-brief.md"
  expected_report="$expected_dir/task-1.1-report.md"
fi

test "$brief_file" = "$expected_brief"
test "$report_file" = "$expected_report"
test -f "$expected_dir/task-1.1-brief.md"

printf 'task-brief emits absolute BRIEF_FILE and REPORT_FILE paths\n'
