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
- [bd](https://github.com/anthropics/beads) for state tracking

## Installation

```bash
# Clone and install
git clone https://github.com/iamcxa/paydirt.git
cd paydirt
deno install --allow-all --name pd paydirt.ts

# Or install both aliases
deno install --allow-all --name paydirt paydirt.ts
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

## Contributing

1. Check `bd ready` for available tasks
2. Claim work with `bd update <id> --status in_progress`
3. Follow TDD: write tests first
4. Run quality gates before committing
5. Push changes and sync beads

## License

MIT
