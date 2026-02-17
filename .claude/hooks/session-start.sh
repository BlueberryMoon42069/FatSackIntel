#!/bin/bash
# SessionStart hook: ensures dependencies are installed and DB is ready

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install --silent 2>&1 | tail -3
fi

# Run type check to verify project is in good state
echo "Running type check..."
npx tsc --noEmit 2>&1 | grep -c "error" | {
  read count
  if [ "$count" -gt 0 ]; then
    echo "Warning: $count TypeScript errors detected"
  else
    echo "TypeScript: clean"
  fi
}

exit 0
