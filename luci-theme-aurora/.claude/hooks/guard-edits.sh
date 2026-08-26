#!/bin/sh
# PreToolUse guard for Edit/Write/MultiEdit (see .dev/docs/workflows.md).
# Shipped or source paths may only be edited inside an approved scope:
# .claude/.change-approved lists the approved path prefixes, one per line
# (written by /luci-change after the user approves the plan, deleted when
# the change is reported). Anything else is blocked with exit 2.
# Known gap: edits made through Bash (sed -i, heredocs) are not seen here;
# the review workflow's scope check is the second net.

input=$(cat)
if command -v node >/dev/null 2>&1; then
  path=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).tool_input?.file_path??""))}catch{}})')
else
  path=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
fi
[ -z "$path" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$path" in
  "$root"/*) rel="${path#"$root"/}" ;;
  /*) exit 0 ;;            # outside this project
  *) rel="$path" ;;
esac

case "$rel" in
  .dev/src/*|.dev/public/*|.dev/vite.config.ts|.dev/package.json|ucode/*|htdocs/*|root/*|Makefile|.github/*) ;;
  *) exit 0 ;;             # docs, tests, .claude, scratch: not guarded
esac

marker="$root/.claude/.change-approved"
if [ -f "$marker" ]; then
  while IFS= read -r prefix || [ -n "$prefix" ]; do
    [ -z "$prefix" ] && continue
    case "$rel" in "$prefix"*) exit 0 ;; esac
  done < "$marker"
  echo "guard-edits: '$rel' is outside the approved scope in .claude/.change-approved — extend the plan (and the file) first." >&2
  exit 2
fi

echo "guard-edits: '$rel' is a shipped/source path. Run /luci-change so the plan is approved first (it writes .claude/.change-approved); to bypass deliberately, create that file with the allowed path prefixes." >&2
exit 2
