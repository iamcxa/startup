#!/bin/bash
# hooks/post-tool-use.sh
# PostToolUse hook - automatic agent delegation
#
# Environment variables (set by Claude launcher):
#   STARTUP_BD   - Current issue ID
#   STARTUP_BIN   - Path to startup binary
#   STARTUP_ROLE  - Current agent role
#   STARTUP_HOOK_SYNC - If set, run synchronously (for testing)
#
# Receives tool output on stdin from Claude Code

set -e

# Only process in Startup context
[ -z "$STARTUP_BIN" ] && exit 0

# Read tool output from stdin (we don't use it, but must consume it)
cat > /dev/null

# CLAUDE_TOOL_INPUT contains the Bash command that was executed
TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"

# Helper to run command (background unless STARTUP_HOOK_SYNC is set)
run_cmd() {
  if [ -n "$STARTUP_HOOK_SYNC" ]; then
    "$@"
  else
    "$@" &
  fi
}

# --- Decision Issue Detection ---
# Detect bd create with st:decision label -> spawn Product agent
# Note: This matches any label starting with 'st:decision' (e.g., st:decision-archive)
# This is acceptable for POC as label naming is controlled
if echo "$TOOL_INPUT" | grep -qE "bd create.*--label[= ].*st:decision"; then
  # Extract issue ID from tool output (CLAUDE_TOOL_OUTPUT)
  TOOL_OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"
  DECISION_ID=$(echo "$TOOL_OUTPUT" | sed -n 's/.*Created issue:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1)

  if [ -n "$DECISION_ID" ] && [ -n "$STARTUP_BIN" ]; then
    # Use STARTUP_MODEL env var if set, otherwise default to sonnet
    STARTUP_MODEL="${STARTUP_MODEL:-sonnet}"
    run_cmd "$STARTUP_BIN" call product --claim "$DECISION_ID" --background --task "Answer decision issue $DECISION_ID" --model "$STARTUP_MODEL"
  fi
fi

# --- Decision Close Detection ---
# Detect bd close -> check if st:decision -> respawn blocked engineer
# Note: This queries bd show to check labels and dependents
if echo "$TOOL_INPUT" | grep -q "bd close"; then
  # POSIX-compatible: use [[:space:]][[:space:]]* instead of GNU's [[:space:]]\+
  CLOSED_ID=$(echo "$TOOL_INPUT" | sed -n 's/.*bd close[[:space:]][[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1)

  if [ -n "$CLOSED_ID" ]; then
    # Get issue details (labels and dependents)
    # Note: bd show --json returns an array: [{...}]
    ISSUE_JSON=$(bd show "$CLOSED_ID" --json 2>/dev/null || echo "[]")

    # Check if it's a st:decision issue (properly parse JSON array)
    HAS_DECISION_LABEL=$(echo "$ISSUE_JSON" | jq -r '.[0].labels // [] | any(. == "st:decision")' 2>/dev/null)
    if [ "$HAS_DECISION_LABEL" = "true" ]; then
      # Get the first dependent (the blocked work issue)
      # Note: bd show --json returns array format with dependents as objects, so extract .id
      BLOCKED_ISSUE=$(echo "$ISSUE_JSON" | jq -r '.[0].dependents[0].id // empty' 2>/dev/null)

      if [ -n "$BLOCKED_ISSUE" ] && [ -n "$STARTUP_BIN" ]; then
        # Get resume context from the blocked issue's comments
        # bd comments format: "[user] BLOCKED: ... | resume-task: ... at YYYY-..."
        # Known limitation: resume-task extraction only works for single-line BLOCKED comments
        RESUME_CONTEXT=$(bd comments "$BLOCKED_ISSUE" 2>/dev/null | grep "] BLOCKED:" | tail -1)
        # Extract resume-task, stripping the " at YYYY-MM-DD" suffix
        RESUME_TASK=$(echo "$RESUME_CONTEXT" | sed -n 's/.*resume-task:[[:space:]]*\(.*\)[[:space:]]at[[:space:]][0-9].*$/\1/p')

        # Use STARTUP_MODEL env var if set, otherwise default to sonnet
        STARTUP_MODEL="${STARTUP_MODEL:-sonnet}"
        run_cmd "$STARTUP_BIN" call engineer --claim "$BLOCKED_ISSUE" --task "${RESUME_TASK:-Resume work}" --background --model "$STARTUP_MODEL"
      fi
    fi
  fi
fi

# Check if this is a bd comments add command
echo "$TOOL_INPUT" | grep -q "bd comments add" || exit 0

# Extract the comment content using sed (portable)
# Handles: bd comments add <id> "CONTENT"
COMMENT=$(echo "$TOOL_INPUT" | sed -n 's/.*bd comments add [^ ]* "\([^"]*\)".*/\1/p' | head -1)
[ -z "$COMMENT" ] && exit 0

# Get prefix (everything before first colon)
PREFIX=$(echo "$COMMENT" | cut -d: -f1)
# Get content (everything after "PREFIX: ")
CONTENT=$(echo "$COMMENT" | sed 's/^[^:]*: *//')

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
      # Company creates new team
      if [ -n "$TASK" ]; then
        run_cmd "$STARTUP_BIN" kickoff "$TASK"
      fi
    elif [ -n "$TARGET_CLAIM" ]; then
      # Add agent to specified team
      run_cmd "$STARTUP_BIN" call "$ROLE" --claim "$TARGET_CLAIM" --task "$TASK" --background
    elif [ -n "$STARTUP_BD" ]; then
      # Add agent to same team
      run_cmd "$STARTUP_BIN" call "$ROLE" --claim "$STARTUP_BD" --task "$TASK" --background
    fi
    ;;

  QUESTION)
    # Spawn claim-agent to answer question
    if [ -n "$STARTUP_BD" ]; then
      run_cmd "$STARTUP_BIN" call claim-agent --claim "$STARTUP_BD" --background
    fi
    ;;

  # Other prefixes - no action needed
  ANSWER|OUTPUT|PROGRESS|CHECKPOINT|DECISION)
    exit 0
    ;;
esac

exit 0
