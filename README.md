# Paydirt

A multi-agent orchestrator that coordinates Claude instances to complete complex software tasks.
Paydirt models **who does what** (the Town), while Goldflow handles **how work flows** (the Engine).

## Why Paydirt?

**Problem**: Multi-agent systems often conflate roles with execution. You end up with "agents" that
are really just pipeline stages dressed in personas.

**Insight**: Humans reason about work through roles and ownership. Machines execute through
pipelines and verification. Mixing these creates confusion.

**Solution**: Paydirt separates the semantic layer (Town) from the execution layer (Engine). You
think in claims and prospects. The system executes through pipelines and gates.

## Architecture: Town and Engine

### Paydirt (The Town)

The semantic layer where humans reason about work.

| Concept      | Description                                      |
| ------------ | ------------------------------------------------ |
| **Claim**    | A piece of work to be done (issue, feature, bug) |
| **Caravan**  | A group of prospects working toward a claim      |
| **Prospect** | A Claude instance with a specific role           |
| **Tunnel**   | Context file that persists across sessions       |
| **Ledger**   | bd-backed issue tracker for state                |

### Goldflow (The Engine)

The execution layer that turns inputs into outputs.

| Concept       | Description                                     |
| ------------- | ----------------------------------------------- |
| **Source**    | Fetches work (issues, specs, prompts)           |
| **Processor** | Transforms input (code generation, refactoring) |
| **Verifier**  | Validates output (tests, lint, review)          |
| **Pipeline**  | Connects stages with retry and routing          |
| **Sink**      | Produces artifacts (PRs, commits, docs)         |

Goldflow knows nothing about prospects or caravans. It executes pipelines. Paydirt assigns prospects
to drive those pipelines.

## Quickstart

```bash
# Install
deno install --allow-all --name pd paydirt.ts

# Stake a claim (start work)
pd stake "Implement user authentication"

# Survey current caravans
pd survey

# Continue existing work
pd continue
```

## Core Concepts

### Prospects (Roles)

Each prospect has a specific responsibility within a caravan:

| Role          | Responsibility                           |
| ------------- | ---------------------------------------- |
| `camp-boss`   | Strategic oversight, dashboard interface |
| `trail-boss`  | Caravan coordination, user interaction   |
| `surveyor`    | Design and planning via brainstorming    |
| `shift-boss`  | Task breakdown from designs              |
| `miner`       | Implementation (TDD-focused)             |
| `assayer`     | Code review                              |
| `canary`      | Testing and verification                 |
| `smelter`     | Code quality and refinement              |
| `claim-agent` | Issue management                         |
| `scout`       | Research and exploration                 |

### Caravans (Work Groups)

A caravan coordinates multiple prospects toward completing a claim:

```
┌─────────────────────────────────────────┐
│              CARAVAN                    │
│  ┌───────────┐  ┌───────────┐          │
│  │trail-boss │──│ surveyor  │          │
│  └───────────┘  └───────────┘          │
│        │              │                 │
│  ┌───────────┐  ┌───────────┐          │
│  │shift-boss │──│   miner   │──► Work  │
│  └───────────┘  └───────────┘          │
│                       │                 │
│               ┌───────────┐            │
│               │  assayer  │──► Review  │
│               └───────────┘            │
└─────────────────────────────────────────┘
```

### Tunnels (Context Persistence)

Tunnels preserve context across sessions and respawns. When a prospect exhausts its context window,
the tunnel maintains continuity.

### Ledger (State Tracking)

Paydirt uses `bd` (beads) for persistent state:

```bash
bd ready              # Find available work
bd show <id>          # View claim details
bd update <id> --status in_progress
bd close <id>         # Complete claim
bd sync               # Sync with git
```

## Boomtown Dashboard

Boomtown is the TUI dashboard for managing Paydirt caravans, built with mprocs.

### Launch Dashboard

```bash
# Using compiled binary
./paydirt boomtown

# Or using deno directly
deno run --allow-all paydirt.ts boomtown

# Short form
pd boomtown
pd -b
```

### Dashboard Features

| Pane          | Description                              |
| ------------- | ---------------------------------------- |
| Control Room  | Real-time status of all caravans         |
| Camp Boss     | Interactive Claude session for commands  |
| Caravan Panes | Direct access to running caravan tmux    |
| Welcome       | Shows available commands when no caravans|

### Hot Reload

When new caravans are created, the dashboard can reload without losing the Camp Boss conversation:

```bash
# From another terminal, request dashboard reload
paydirt reload-dashboard
```

### Gold Rush Theme

Boomtown uses a Gold Rush aesthetic:
- Dark brown background with gold/amber text
- Status glyphs: ▶ (running), ◇ (idle), ■ (stopped)
- Mining terminology throughout

## Usage

### Stake a Claim

Start a new caravan for a task:

```bash
pd stake "Add OAuth2 authentication"
```

This creates a caravan with a trail-boss who coordinates the work.

### Survey Active Work

View current caravans and their status:

```bash
pd survey
```

### Continue Work

Resume work on an existing caravan:

```bash
pd continue
pd continue --claim pd-abc123
```

### Abandon a Claim

Stop work and clean up:

```bash
pd abandon pd-abc123
```

### Prime Mode

Run autonomously with a tunnel for context:

```bash
pd stake "Build feature X" --prime --tunnel ./context.md
```

In prime mode, the trail-boss makes decisions without human interaction, using the tunnel file for
persistent context.

## Claude Plugin

Use Paydirt as a Claude Code plugin:

```bash
# Add to Claude plugins
cp -r . ~/.claude/plugins/paydirt

# Or reference directly
claude --plugin-dir /path/to/paydirt
```

Plugin components:

- `prospects/` - Agent definitions
- `commands/` - Slash commands
- `skills/` - Skill definitions
- `hooks/` - Event hooks

## Requirements

- [Deno](https://deno.land/) 1.40+
- [Claude Code](https://claude.ai/code) CLI
- [tmux](https://github.com/tmux/tmux) for session management
- [mprocs](https://github.com/pvolok/mprocs) for Boomtown dashboard
- [bd](https://github.com/anthropics/beads) for state tracking

### Install mprocs (macOS)

```bash
brew install mprocs
```

## Installation

```bash
# Clone and install
git clone https://github.com/iamcxa/paydirt.git
cd paydirt
deno install --allow-all --name pd paydirt.ts

# Or install both aliases
deno install --allow-all --name paydirt paydirt.ts

# Compile to standalone binary
deno compile --allow-all --output=paydirt paydirt.ts
```

## Development

```bash
# Run tests
deno test --allow-all

# Type check
deno check paydirt.ts

# Lint and format
deno lint
deno fmt
```

## Langfuse Integration

Paydirt integrates with [Langfuse](https://langfuse.com/) for tracing Claude agent executions. When enabled, all agent spawns, tool calls, and test executions are traced for debugging and observability.

### Setup

1. **Get Langfuse credentials** from [cloud.langfuse.com](https://cloud.langfuse.com/)

2. **Create `.env.test`** for test tracing:

```bash
LANGFUSE_ENABLED=true
LANGFUSE_DEBUG=true
LANGFUSE_SESSION_PREFIX=test-
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

3. **Create `.env`** for development tracing (optional):

```bash
LANGFUSE_ENABLED=false  # Enable when debugging
LANGFUSE_SECRET_KEY=sk-lf-your-secret-key
LANGFUSE_PUBLIC_KEY=pk-lf-your-public-key
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
```

> **Note**: `.env` and `.env.test` are gitignored. Never commit credentials to git.

### Usage

#### E2E Tests with Tracing

```bash
# Load test environment
export $(cat .env.test | xargs)

# Run single E2E test
RUN_E2E_TESTS=1 deno test tests/e2e/full-chain.test.ts --allow-all

# Run all E2E tests
RUN_E2E_TESTS=1 deno test tests/e2e/ --allow-all
```

Each test creates a session ID like `{test-name}-{timestamp}` for trace grouping.

#### BQ Tests with Tracing

```bash
# Load test environment
export $(cat .env.test | xargs)

# Run BQ tests (future implementation)
deno run --allow-all src/bq-test/runner.ts
```

#### Prospect Commands with Tracing

```bash
# Load development environment
export $(cat .env | xargs)
export LANGFUSE_ENABLED=true

# Spawn agent with tracing
pd prospect miner --claim pd-xyz --task "Implement feature X"
```

### Debugging with Langfuse UI

1. **Access Langfuse UI**: [cloud.langfuse.com](https://cloud.langfuse.com/)

2. **Find test traces** by filtering:
   - **Session ID**: `{test-name}-{timestamp}`
   - **Tags**: `e2e`, `bq-test`, `prospect`, `{role}`
   - **Date**: Recent traces from test execution

3. **Verify trace structure**:
   ```
   Test Session
   └── Test Trace
       ├── Hook Trigger (span)
       ├── Agent Spawn (span: prospect-miner)
       │   └── Claude Execution (span)
       │       ├── Tool Calls (nested)
       │       └── bd commands (nested)
       └── Verification (span)
   ```

4. **Check trace metadata**:
   - **Input**: Test name, scenario, agent role, prompt
   - **Output**: Exit code, behavior, test results
   - **Custom fields**: claimId, testId, agent

5. **Identify errors**:
   - Error traces have `level: ERROR`
   - Failed tests show `exitCode ≠ 0`
   - View full conversation history for debugging

For detailed verification steps, see [`docs/langfuse-ui-verification-guide.md`](docs/langfuse-ui-verification-guide.md).

### CI/CD Integration

Configure CI environment to enable tracing:

```yaml
# GitHub Actions example
env:
  LANGFUSE_ENABLED: true
  LANGFUSE_SESSION_PREFIX: ci-
  LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
  LANGFUSE_PUBLIC_KEY: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
  LANGFUSE_BASE_URL: https://us.cloud.langfuse.com

- name: Run E2E Tests with Tracing
  run: RUN_E2E_TESTS=1 deno test tests/e2e/ --allow-all
```

Use separate Langfuse projects for CI vs development to isolate traces.

### Performance Impact

- **Unit tests**: ~24% overhead (~40ms for utility tests)
- **E2E tests**: Negligible (multi-minute duration)
- **SDK initialization**: ~150-180ms (one-time startup cost)

Overhead is acceptable for debugging and CI scenarios.

### Troubleshooting

#### No traces appearing in UI

**Check**:
1. `LANGFUSE_ENABLED=true` in environment
2. Valid credentials in `.env.test` or `.env`
3. Network connection to Langfuse Cloud
4. SDK initialization logs (set `LANGFUSE_DEBUG=true`)

**Debug**:
```bash
# Enable debug output
export LANGFUSE_DEBUG=true

# Run test and check for Langfuse messages
RUN_E2E_TESTS=1 deno test tests/e2e/context-exhaustion.test.ts --allow-all 2>&1 | grep -i langfuse
```

#### Traces missing metadata

**Likely causes**:
- Environment variables not propagated to spawned processes
- Check `buildPaydirtEnvVars()` includes Langfuse vars in [`src/paydirt/claude/command.ts:42-49`](src/paydirt/claude/command.ts#L42-L49)
- Verify spawn functions call `getLangfuseEnv()` in test utilities

#### Test hangs during cleanup

**Solution**:
- Ensure `cleanup()` is called in `finally` blocks
- SDK flush may timeout if network is slow
- Check Langfuse Cloud connectivity

For more troubleshooting, see [`docs/langfuse-ui-verification-guide.md`](docs/langfuse-ui-verification-guide.md).

## POC Usage

### Quick Start

```bash
# 1. Start Camp Boss daemon
pd boss start

# 2. Open dashboard (optional)
pd boomtown

# 3. Start a Caravan
pd stake "Implement user authentication"

# 4. Check status
pd list
pd boss status

# 5. Attach to sessions
pd attach boss           # Camp Boss daemon
pd attach pd-abc123      # Specific Caravan
```

### Event-Driven Flow

The POC demonstrates automatic Prospect spawning via Claude Hooks:

1. Trail Boss writes `QUESTION: Which auth provider?`
2. PostToolUse hook detects the prefix
3. Hook automatically spawns Claim Agent
4. Claim Agent reads Ledger, answers, writes to Ledger
5. Trail Boss writes `SPAWN: surveyor --task "Design auth"`
6. Hook spawns Surveyor
7. Surveyor completes design, writes `OUTPUT: design=...`

### Commands

| Command | Description |
|---------|-------------|
| `pd boss start` | Start Camp Boss daemon |
| `pd boss stop` | Stop daemon |
| `pd boss status` | Check daemon status |
| `pd stake "task"` | Start new Caravan |
| `pd prospect <role>` | Spawn specific Prospect |
| `pd attach [target]` | Attach to tmux session |
| `pd list` | List all sessions |
| `pd boomtown` | Open dashboard |

## Contributing

1. Check `bd ready` for available tasks
2. Claim work with `bd update <id> --status in_progress`
3. Follow TDD: write tests first
4. Run quality gates before committing
5. Push changes and sync beads

## License

MIT
