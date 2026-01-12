# Complete Paydirt → Startup Rename

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Rename all remaining "paydirt" references to "startup" throughout the codebase.

**Architecture:** Sequential rename from internal components outward, with verification at each step.

**Tech Stack:** Deno/TypeScript, bash scripts, markdown

---

## Scope

### In Scope
- `prospects/*.md` - Internal agent definitions (11 files)
- `src/paydirt/` → `src/startup/` - Source directory rename
- Root imports - Files importing from paydirt
- `paydirt.ts` - Remove old entry point
- `scripts/paydirt-dev.sh` → `scripts/startup-dev.sh`
- `tests/` - Test file imports and references
- `deno.json` - Task paths

### Out of Scope
- `docs/plans/*.md` - Historical documents (preserve as-is)
- `.startup/agents/` - Already renamed
- `.worktrees/` - Old worktrees (ignore)
- Existing bd issues with `pd-*` prefix

### Already Completed (Previous Session)
- ✅ `startup.ts` entry point created
- ✅ `.startup/agents/` directory with new agents
- ✅ `STARTUP_*` environment variables in command.ts
- ✅ bd prefix changed to `st-`

---

## Task 1: Update prospects/*.md

**Files:** 11 files in `prospects/`

**Changes:**
- `PAYDIRT_PROSPECT` → `STARTUP_ROLE`
- `PAYDIRT_CLAIM` → `STARTUP_BD`
- `PAYDIRT_TUNNEL` → `STARTUP_TUNNEL`
- `PAYDIRT_CARAVAN` → `STARTUP_CONVOY`
- `PAYDIRT_BIN` → `STARTUP_BIN`
- `pd:` labels → `st:` labels
- `paydirt-` session names → `startup-`

**Verification:**
```bash
grep -r "PAYDIRT_" prospects/ | wc -l  # Should be 0
grep -r "pd:" prospects/ | wc -l       # Should be 0
```

---

## Task 2: Rename src/paydirt/ → src/startup/

**Action:**
```bash
mv src/paydirt src/startup
```

**Verification:**
```bash
ls src/startup/  # Should show: boomtown, claude, cli, hooks, ledger, paths.ts, paths.test.ts
```

---

## Task 3: Update Root Imports

**Files to update:**
- `startup.ts`
- `src/types.ts`
- Any file with `from './src/paydirt'` or `from '../paydirt'`

**Changes:**
- `./src/paydirt` → `./src/startup`
- `../paydirt` → `../startup`

**Verification:**
```bash
grep -r "from.*paydirt" src/ --include="*.ts" | wc -l  # Should be 0
```

---

## Task 4: Remove paydirt.ts

**Action:**
```bash
rm paydirt.ts
```

**Verification:**
- `startup.ts` remains as sole entry point
- `deno task startup` still works

---

## Task 5: Update scripts/

**Rename:**
```bash
mv scripts/paydirt-dev.sh scripts/startup-dev.sh
```

**Content updates in startup-dev.sh:**
- Script references to paydirt → startup
- Path references

**Update deno.json** to reference new script name.

**Verification:**
```bash
./scripts/startup-dev.sh --help  # Should work
```

---

## Task 6: Update tests/

**Files:** 27 test files in `tests/`

**Changes:**
- Import paths: `paydirt` → `startup`
- Env var references: `PAYDIRT_*` → `STARTUP_*`
- Session names: `paydirt-` → `startup-`

**Verification:**
```bash
grep -r "PAYDIRT_" tests/ --include="*.ts" | wc -l  # Should be 0
grep -r "from.*paydirt" tests/ --include="*.ts" | wc -l  # Should be 0
deno test --allow-all  # All tests pass
```

---

## Task 7: Final Verification

**Checks:**
1. `deno check startup.ts` - No type errors
2. `deno test --allow-all` - All tests pass
3. `grep -ri "paydirt" src/ tests/ prospects/ --include="*.ts" --include="*.md"` - Only historical refs
4. `./startup --help` - CLI works
5. `./scripts/startup-dev.sh prospect surveyor --dry-run` - Dev script works

**Commit:**
```bash
git add -A
git commit -m "refactor: complete paydirt → startup rename"
```

---

## Success Criteria

- [ ] No `PAYDIRT_*` env vars in source code (except docs/plans/)
- [ ] No `pd:` labels in source code (except docs/plans/)
- [ ] `src/startup/` directory exists, `src/paydirt/` removed
- [ ] All 197+ tests pass
- [ ] CLI works: `startup call cto "test"` (dry-run)
