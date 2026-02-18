#!/bin/bash
# PostToolUse hook: runs TypeScript check after file edits
# Only checks .ts/.tsx files to avoid false positives on other file types

FILE_PATH="$1"

# Only run for TypeScript files
if [[ "$FILE_PATH" == *.ts ]] || [[ "$FILE_PATH" == *.tsx ]]; then
  cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

  # Quick type check (suppress success output, only show errors)
  npx tsc --noEmit 2>&1 | grep -E "^(.*\.tsx?)\([0-9]+,[0-9]+\): error" | head -5

  exit_code=${PIPESTATUS[0]}
  if [ $exit_code -ne 0 ]; then
    echo "TypeScript errors detected. Please fix before continuing."
    exit 1
  fi
fi

exit 0
