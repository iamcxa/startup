#!/bin/bash
# hooks/post-tool-use.sh
# PostToolUse hook - automatic agent delegation
#
# Environment variables (set by Claude launcher):
#   PAYDIRT_CLAIM - Current caravan ID
#   PAYDIRT_BIN   - Path to paydirt binary
#   PAYDIRT_PROSPECT  - Current agent role
#   PAYDIRT_HOOK_SYNC - If set, run synchronously (for testing)
#
# Receives tool output on stdin from Claude Code

set -e

# Only process in Paydirt context
[ -z "$PAYDIRT_BIN" ] && exit 0

# Read tool output from stdin
TOOL_OUTPUT=$(cat)

# Check if this is a bd comments add command
echo "$TOOL_OUTPUT" | grep -q "bd comments add" || exit 0

# Extract the comment content using sed (portable)
# Handles: bd comments add <id> "CONTENT"
COMMENT=$(echo "$TOOL_OUTPUT" | sed -n 's/.*bd comments add [^ ]* "\([^"]*\)".*/\1/p' | head -1)
[ -z "$COMMENT" ] && exit 0

# Get prefix (everything before first colon)
PREFIX=$(echo "$COMMENT" | cut -d: -f1)
# Get content (everything after "PREFIX: ")
CONTENT=$(echo "$COMMENT" | sed 's/^[^:]*: *//')

# Helper to run command (background unless PAYDIRT_HOOK_SYNC is set)
run_cmd() {
  if [ -n "$PAYDIRT_HOOK_SYNC" ]; then
    "$@"
  else
    "$@" &
  fi
}

case "$PREFIX" in
  SPAWN)
    # Parse: <role> [--task "<task>"] [--claim <claim>]
    ROLE=$(echo "$CONTENT" | awk '{print $1}')
    # Extract task using sed (portable) - handles escaped quotes too
    TASK=$(echo "$CONTENT" | sed -n 's/.*--task ["\]\{0,2\}\([^"\\]*\)["\]\{0,2\}.*/\1/p')
    # Extract claim using sed (portable)
    TARGET_CLAIM=$(echo "$CONTENT" | sed -n 's/.*--claim \([^ ]*\).*/\1/p')

    [ -z "$ROLE" ] && exit 0

    if [ "$ROLE" = "trail-boss" ]; then
      # Camp Boss creates new caravan
      if [ -n "$TASK" ]; then
        run_cmd "$PAYDIRT_BIN" stake "$TASK"
      fi
    elif [ -n "$TARGET_CLAIM" ]; then
      # Add agent to specified caravan
      run_cmd "$PAYDIRT_BIN" prospect "$ROLE" --claim "$TARGET_CLAIM" --task "$TASK" --background
    elif [ -n "$PAYDIRT_CLAIM" ]; then
      # Add agent to same caravan
      run_cmd "$PAYDIRT_BIN" prospect "$ROLE" --claim "$PAYDIRT_CLAIM" --task "$TASK" --background
    fi
    ;;

  QUESTION)
    # Spawn claim-agent to answer question
    if [ -n "$PAYDIRT_CLAIM" ]; then
      run_cmd "$PAYDIRT_BIN" prospect claim-agent --claim "$PAYDIRT_CLAIM" --background
    fi
    ;;

  # Other prefixes - no action needed
  ANSWER|OUTPUT|PROGRESS|CHECKPOINT|DECISION)
    exit 0
    ;;
esac

exit 0
