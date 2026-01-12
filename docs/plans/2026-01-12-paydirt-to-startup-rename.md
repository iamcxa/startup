# Paydirt to Startup Rename Design

## Overview

Rename the project from mining metaphor to startup metaphor for better user-facing clarity.

**Core premise**: Different Claude Code agent instances can collaborate via bd issue tracking across sessions. The startup metaphor makes role responsibilities more intuitive.

## Role Mapping

| Old (Mining) | New (Startup) | Responsibility |
|--------------|---------------|----------------|
| paydirt | startup | CLI main program |
| camp-boss | cto | Technical decisions, architecture design |
| miner | engineer | Feature implementation (TDD) |
| planner | designer | Design planning (brainstorming) |
| foreman | lead | Task breakdown |
| witness | qa | E2E verification (Chrome MCP) |
| assayer | reviewer | Code review |
| pm | product | Product Q&A |

## CLI Command Structure

```bash
startup call <role> "<task>"
st call <role> "<task>"        # shorthand

# Examples
startup call cto "Design authentication architecture"
st call engineer "Implement login feature"
st call qa "Verify login flow"
```

## bd Issue Prefix

`pd-xxx` → `st-xxx` (new issues only, existing issues unchanged)

## Technical Changes

### Environment Variables (Immediate)

```bash
PAYDIRT_BD       → STARTUP_BD        # Current convoy/issue ID
PAYDIRT_ROLE     → STARTUP_ROLE      # Current role
PAYDIRT_CONTEXT  → STARTUP_CONTEXT   # Context file path
PAYDIRT_CONVOY   → STARTUP_CONVOY    # Convoy name
```

### File Structure

```
# Agent prompts (immediate rename)
.gastown/agents/          →  .startup/agents/
├── miner.md                  ├── engineer.md
├── camp-boss.md              ├── cto.md
├── planner.md                ├── designer.md
├── foreman.md                ├── lead.md
├── witness.md                ├── qa.md
├── assayer.md                ├── reviewer.md
└── pm.md                     └── product.md

# Main entry (immediate rename)
paydirt.ts                →  startup.ts

# Internal code (gradual, use aliases)
src/roles/miner.ts           keep, export alias engineer
src/roles/camp-boss.ts       keep, export alias cto
```

### Build Output

```bash
# Main executable
deno compile --output=startup startup.ts

# Shorthand (symlink)
ln -s startup st
```

### Development Directory

Keep `paydirt/` unchanged - this is an internal implementation detail.

## Migration Plan

### Phase 1: External Interface (Priority)

1. **Create `.startup/agents/` directory**
   - Copy and rename all agent prompt files
   - Update role descriptions in files

2. **Create `startup.ts` entry point**
   - Add CLI command parsing `startup call <role>`
   - Implement role name mapping (engineer → miner internally)

3. **Update environment variables**
   - Change all `PAYDIRT_*` to `STARTUP_*`
   - Update env var references in agent prompts

4. **Build and release**
   - `deno compile --output=startup startup.ts`
   - Create `st` symlink

### Phase 2: bd Integration

1. **Update bd prefix**
   - Configure new issues to use `st-` prefix
   - Existing `pd-*` issues remain unchanged (backward compatible)

### Phase 3: Internal Code (Later)

1. **Gradual rename**
   - Add alias exports
   - Gradually change internal references to new names
   - Finally remove old names

## Unchanged Items

- Development directory `paydirt/` stays unchanged
- Git repo name unchanged
- `.gastown/` can remain as backup/transition
