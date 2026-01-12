# CLAUDE.md

This file provides guidance to Claude Code when working with the paydirt/startup codebase.

## Startup CLI (New Interface)

```bash
# Call a role to perform a task
startup call <role> "task"
st call <role> "task"

# Examples
startup call cto "Design authentication architecture"
st call engineer "Implement login feature"
st call qa "Verify login flow"

# Roles
cto       - Technical decisions, architecture
engineer  - Implementation (TDD)
designer  - Design planning
lead      - Task breakdown
qa        - E2E verification
reviewer  - Code review
product   - Product Q&A
```

## Environment Variables

The startup system uses the following environment variables:

| Variable | Description |
|----------|-------------|
| `STARTUP_BD` | Current issue ID (was PAYDIRT_CLAIM) |
| `STARTUP_BIN` | Path to startup binary (was PAYDIRT_BIN) |
| `STARTUP_ROLE` | Current agent role (was PAYDIRT_PROSPECT) |
| `STARTUP_HOOK_SYNC` | If set, run hooks synchronously (for testing) |
| `STARTUP_MODEL` | Model to use (sonnet, opus, haiku) |

## Commands

```bash
# Run tests
deno test --allow-all

# Run single test file
deno test --allow-all tests/e2e/context-exhaustion.test.ts

# Type check
deno check paydirt.ts

# Lint
deno lint

# Format
deno fmt

# Compile binary
deno compile --allow-all --output=paydirt paydirt.ts

# Run development mode
deno task dev
```

## bd CLI Quick Reference

```bash
bd ready                           # Find available work
bd show <id>                       # View issue details
bd update <id> --status in_progress # Claim work
bd close <id>                      # Complete work
bd comments add <id> "message"     # Add comment
bd sync                            # Sync with git
```
