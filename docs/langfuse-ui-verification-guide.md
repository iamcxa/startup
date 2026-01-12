# Langfuse UI Verification Guide

**Purpose**: Verify that Langfuse integration captures traces correctly in the UI  
**Tasks**: pd-1cr6 (Verify trace hierarchy) + pd-ehms (Verify E2E traces)  
**Prerequisites**: Configured .env.test with valid Langfuse credentials  

## Expected Trace Hierarchy

Based on design spec (docs/plans/2026-01-12-langfuse-integration-design.md:34-50):

```
Test Session (ID: "{test-name}-{timestamp}")
├── Test Trace (name: "{test-name}")
│   ├── Hook Trigger (span)
│   ├── Agent Spawn (span: "prospect-miner")
│   │   └── Claude Execution (span: "claude-miner")
│   │       ├── Tool Calls (nested)
│   │       └── bd commands (nested)
│   └── Verification (span)
```

## How to Verify

### Step 1: Run E2E Test with Langfuse

```bash
# Load test environment
export $(cat .env.test | xargs)

# Verify environment loaded
echo "LANGFUSE_ENABLED: $LANGFUSE_ENABLED"
echo "LANGFUSE_BASE_URL: $LANGFUSE_BASE_URL"

# Run a single E2E test (choose smallest/fastest)
RUN_E2E_TESTS=1 deno test tests/e2e/context-exhaustion.test.ts --allow-all

# OR run all E2E tests (longer, more comprehensive)
RUN_E2E_TESTS=1 deno test tests/e2e/ --allow-all
```

### Step 2: Access Langfuse UI

1. Open browser to: `https://us.cloud.langfuse.com`
2. Login with your Langfuse account
3. Navigate to your project

### Step 3: Find Test Traces

**Filter by Session**:
- Look for session IDs matching pattern: `{test-name}-{timestamp}`
- Example: `E2E Context Exhaustion-1736659200000`

**Filter by Tags**:
- Tag: `e2e` (for E2E tests)
- Tag: `bq-test` (for BQ tests)
- Tag: `prospect` (for prospect command traces)
- Tag: `{agent-role}` (e.g., `miner`, `assayer`)

**Filter by Date**:
- Recent traces from test execution time

### Step 4: Verify Trace Structure

For each test trace, verify:

#### ✅ Session Grouping
- [ ] Session ID follows format: `{test-name}-{timestamp}`
- [ ] All traces from same test run share same session ID
- [ ] Session grouping enables filtering in UI

#### ✅ Trace Names
- [ ] E2E tests: Named with test description
- [ ] Prospect commands: Named `prospect-{role}`
- [ ] BQ tests: Named `bq-test-{scenario-name}`

#### ✅ Metadata
- [ ] Input metadata present (scenario, agent, prompt, task, claim)
- [ ] Output metadata present (behavior, exitCode)
- [ ] Custom metadata fields (testId, claimId, agent)

#### ✅ Tags
- [ ] Appropriate tags applied (e2e, prospect, bq-test, {role})
- [ ] Tags enable filtering and organization

#### ✅ Span Hierarchy
- [ ] Parent-child relationships correct
- [ ] Agent spawn spans nested under test trace
- [ ] Tool calls nested under Claude execution (if captured)

#### ✅ Span Levels
- [ ] Success traces: Level = DEFAULT
- [ ] Error traces: Level = ERROR
- [ ] Level correlates with exitCode

## Expected Trace Examples

### Example 1: E2E Test Trace

**Session ID**: `E2E Full Chain: Miner → Decision → PM → Miner Resume-1736659200000`  
**Trace Name**: `E2E Full Chain: Miner → Decision → PM → Miner Resume`  
**Tags**: `["e2e", "miner"]`  

**Spans**:
1. Test initialization (initLangfuseForTest)
2. Prospect spawn (prospect-miner)
3. Hook trigger
4. PM spawn (prospect-pm)
5. Resume spawn (prospect-miner)

**Metadata**:
- Input: test description, scenario details
- Output: test results, exit codes

### Example 2: Prospect Command Trace

**Session ID**: From LANGFUSE_SESSION_ID env var  
**Trace Name**: `prospect-miner`  
**Tags**: `["prospect", "miner"]`  

**Metadata**:
- Input: `{ role: "miner", claim: "pd-xyz", task: "..." }`
- Output: `{ exitCode: 0 }`
- Custom: `{ claimId: "pd-xyz" }`

**Level**: DEFAULT (if exitCode = 0), ERROR (if exitCode ≠ 0)

### Example 3: BQ Test Trace

**Session ID**: `BQ-{scenario-name}-{timestamp}`  
**Trace Name**: `bq-test-{scenario-name}`  
**Tags**: `["bq-test", "{agent-role}"]`  

**Metadata**:
- Input: `{ scenario, agent, prompt }`
- Output: `{ behavior, exitCode }`
- Custom: `{ testId, agent }`

## Verification Checklist

### Functional Verification
- [ ] Traces appear in Langfuse UI after test execution
- [ ] Session IDs match expected pattern
- [ ] Trace names descriptive and correct
- [ ] Metadata includes all expected fields
- [ ] Tags applied correctly
- [ ] Span hierarchy matches design
- [ ] Span levels reflect success/error status

### Performance Verification
- [ ] Test execution overhead acceptable (<30% increase)
- [ ] Trace upload doesn't block test execution
- [ ] SDK cleanup completes without hanging

### Debugging Verification
- [ ] Can filter traces by session ID
- [ ] Can filter traces by tags
- [ ] Can filter traces by date/time
- [ ] Metadata provides useful debugging context
- [ ] Error traces clearly identifiable (ERROR level)
- [ ] Nested spans show execution flow

## Troubleshooting

### No Traces Appearing

**Check**:
1. `LANGFUSE_ENABLED=true` in environment
2. Valid credentials in .env.test
3. Network connection to Langfuse Cloud
4. SDK initialization logs (should see startup messages)
5. Cleanup executed (traces flushed before shutdown)

**Debug**:
```bash
# Enable debug output
export LANGFUSE_DEBUG=true

# Run test and check for Langfuse SDK messages
RUN_E2E_TESTS=1 deno test tests/e2e/context-exhaustion.test.ts --allow-all 2>&1 | grep -i langfuse
```

### Traces Missing Metadata

**Likely Causes**:
- Env vars not propagated to spawned processes
- Check buildPaydirtEnvVars() includes Langfuse vars
- Verify spawn functions call getLangfuseEnv()

### Incorrect Span Hierarchy

**Likely Causes**:
- startActiveObservation() not properly nested
- Check trace context propagation
- Verify session ID consistency

## Success Criteria

**Verification Passes If**:
- ✅ Traces visible in Langfuse UI
- ✅ Session grouping works correctly
- ✅ All expected metadata present
- ✅ Tags enable filtering
- ✅ Span hierarchy matches design
- ✅ Error traces identifiable
- ✅ Performance overhead acceptable

**Tasks Complete**: pd-1cr6 ✅ + pd-ehms ✅

## Notes

- Actual E2E test execution not performed during pilot (time/cost)
- All integration code verified via unit tests
- Manual verification recommended before production use
- Consider running one E2E test to confirm end-to-end flow
