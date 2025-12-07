# Feature: Configurable GitHub Agent Callsign

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files etc.

## Feature Description

Transform the GitHub adapter's hardcoded `@remote-agent` callsign into a configurable value that can be customized via environment variables. This allows users to set a custom mention trigger (e.g., `@jarvis`, `@assistant`, `@bot`) for their GitHub agent, making it more personalized and flexible for different deployment scenarios.

Currently, the GitHub adapter only responds to `@remote-agent` mentions in issue and PR comments. This feature will enable users to configure their preferred callsign in the `.env` file, with the agent dynamically loading and using that callsign for filtering and processing GitHub comments.

## User Story

As a **developer deploying the remote coding agent**
I want to **configure a custom callsign for the GitHub agent**
So that **I can use a personalized trigger (like @jarvis or @assistant) instead of the hardcoded @remote-agent**

## Problem Statement

The GitHub adapter currently has a hardcoded `@remote-agent` string used for:
1. Detecting whether a comment is directed at the agent (`hasMention()`)
2. Stripping the mention from the comment before processing (`stripMention()`)

This inflexibility prevents users from:
- Personalizing their agent's identity
- Using multiple agents with different callsigns in the same organization
- Matching their agent's name to their project branding
- Avoiding conflicts with other bots or mentions

The hardcoded value appears in:
- `/workspace/remote-agentic-coding-system/src/adapters/github.ts` (lines 199, 206)
- Documentation files (README.md, docs/architecture.md, etc.)

## Solution Statement

Implement a configurable callsign system by:

1. **Adding an environment variable** `GITHUB_CALLSIGN` to `.env.example` with default value `@remote-agent`
2. **Modifying GitHubAdapter constructor** to accept an optional callsign parameter and load from environment
3. **Updating regex patterns** to dynamically escape special characters and use the configured callsign
4. **Updating all documentation** to reflect the new configuration option
5. **Adding tests** to verify the configurable callsign works correctly
6. **Maintaining backward compatibility** by defaulting to `@remote-agent` when not configured

The implementation will use regex escaping to ensure any special characters in custom callsigns are properly handled.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Low
**Primary Systems Affected**: GitHub Adapter, Configuration, Documentation
**Dependencies**: None (uses existing dotenv, no new libraries)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `/workspace/remote-agentic-coding-system/src/adapters/github.ts` (lines 53-61, 198-207) - GitHubAdapter constructor and mention detection/stripping methods that need modification
- `/workspace/remote-agentic-coding-system/src/index.ts` (lines 6-8, 64-71) - dotenv loading and GitHub adapter initialization pattern to follow
- `/workspace/remote-agentic-coding-system/.env.example` (lines 23-28) - Environment variable configuration file where new GITHUB_CALLSIGN should be added
- `/workspace/remote-agentic-coding-system/src/adapters/github.test.ts` (entire file) - Test structure and mocking patterns to follow for new tests
- `/workspace/remote-agentic-coding-system/README.md` (lines 330-335) - User-facing usage documentation that needs updating
- `/workspace/remote-agentic-coding-system/docs/architecture.md` (lines 898, 906, 912) - Architecture documentation showing @remote-agent in workflows
- `/workspace/remote-agentic-coding-system/.claude/commands/validation/validate.md` - Validation examples using @remote-agent that should be updated

### New Files to Create

- None - all changes are modifications to existing files

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [MDN: RegExp.escape()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/escape)
  - **Specific section**: Native method for escaping regex special characters (available in modern JavaScript/TypeScript)
  - **Why**: Needed to safely escape user-provided callsign for use in regex patterns
  - **Note**: If using Node.js <20.6, may need manual escaping function

- [MDN: Regular Expressions Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping)
  - **Specific section**: Escaping section explaining special characters: `^$\.*+?()[]{}|`
  - **Why**: Understanding which characters need escaping for dynamic regex construction

- [Node.js v20.6.0+ Environment Variables](https://nodejs.org/api/environment_variables.html)
  - **Specific section**: process.env and native --env-file flag
  - **Why**: Understanding how environment variables are loaded and accessed

- [dotenv Best Practices (GitHub)](https://github.com/motdotla/dotenv#faq)
  - **Specific section**: FAQ on when and how to call .config()
  - **Why**: Confirming dotenv is loaded before any module imports (already done in this project)

### Patterns to Follow

**Environment Variable Pattern with Default:**
```typescript
// From src/index.ts line 56
const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_CONVERSATIONS || '10');

// Pattern to use:
const callsign = process.env.GITHUB_CALLSIGN || '@remote-agent';
```

**Constructor Pattern with Optional Parameter:**
```typescript
// From src/adapters/github.ts lines 57-60
constructor(token: string, webhookSecret: string) {
  this.octokit = new Octokit({ auth: token });
  this.webhookSecret = webhookSecret;
  console.log('[GitHub] Adapter initialized with secret:', webhookSecret.substring(0, 8) + '...');
}

// Pattern to extend:
constructor(token: string, webhookSecret: string, callsign?: string) {
  this.octokit = new Octokit({ auth: token });
  this.webhookSecret = webhookSecret;
  this.callsign = callsign || process.env.GITHUB_CALLSIGN || '@remote-agent';
  console.log('[GitHub] Adapter initialized');
  console.log(`[GitHub] Using callsign: ${this.callsign}`);
}
```

**Regex Escaping Pattern:**
```typescript
// Manual regex escape function (compatible with all Node.js versions)
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Usage in methods:
private hasMention(text: string): boolean {
  const escapedCallsign = this.callsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedCallsign}[\\s,:;]`);
  return regex.test(text) || text.trim() === this.callsign;
}
```

**Logging Pattern:**
```typescript
// From src/adapters/github.ts line 60
console.log('[GitHub] Adapter initialized with secret:', webhookSecret.substring(0, 8) + '...');

// Pattern to use for logging callsign:
console.log(`[GitHub] Using callsign: ${this.callsign}`);
```

**Test Mocking Pattern:**
```typescript
// From src/adapters/github.test.ts lines 6-44
jest.mock('../orchestrator/orchestrator', () => ({
  handleMessage: jest.fn().mockResolvedValue(undefined),
}));

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

  beforeEach(() => {
    adapter = new GitHubAdapter('fake-token-for-testing', 'fake-webhook-secret');
  });

  test('should handle feature', () => {
    expect(adapter.someMethod()).toBe(expectedValue);
  });
});
```

**TypeScript Type Annotation Pattern:**
```typescript
// All functions must have explicit return types
private hasMention(text: string): boolean {
  // implementation
}

async handleWebhook(payload: string, signature: string): Promise<void> {
  // implementation
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

Add the environment variable configuration and prepare the codebase for dynamic callsign support.

**Tasks:**
- Add `GITHUB_CALLSIGN` to `.env.example` with clear documentation
- Document the feature in configuration comments

### Phase 2: Core Implementation

Modify the GitHubAdapter class to support configurable callsign with proper regex escaping.

**Tasks:**
- Add private `callsign` field to GitHubAdapter class
- Update constructor to accept optional callsign parameter
- Modify `hasMention()` to use dynamic regex with escaped callsign
- Modify `stripMention()` to use dynamic regex with escaped callsign
- Add logging to show which callsign is being used

### Phase 3: Integration

Update the initialization code to pass the callsign from environment variables.

**Tasks:**
- Update GitHubAdapter instantiation in `src/index.ts` to pass optional callsign
- Ensure proper fallback chain: parameter → env var → default

### Phase 4: Testing & Validation

Add comprehensive tests and update all documentation.

**Tasks:**
- Add unit tests for custom callsign functionality
- Add tests for special character escaping
- Update README.md usage examples
- Update architecture.md workflow diagrams
- Update validation examples

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### 1. UPDATE `.env.example` configuration file

- **IMPLEMENT**: Add GITHUB_CALLSIGN environment variable with default value and documentation
- **PATTERN**: Follow existing comment style from lines 23-28 in .env.example
- **LOCATION**: Insert after line 28 (after WEBHOOK_SECRET)
- **FORMAT**:
  ```bash
  # GitHub Agent Callsign (mention trigger for comments)
  # Default: @remote-agent
  # Examples: @jarvis, @assistant, @bot
  GITHUB_CALLSIGN=@remote-agent
  ```
- **GOTCHA**: Keep the default as `@remote-agent` to maintain backward compatibility
- **VALIDATE**: `cat .env.example | grep -A 3 "GITHUB_CALLSIGN"`

### 2. UPDATE `src/adapters/github.ts` - Add private callsign field

- **IMPLEMENT**: Add `private callsign: string;` field to GitHubAdapter class
- **PATTERN**: Add after `private webhookSecret: string;` (line 55)
- **IMPORTS**: None needed
- **GOTCHA**: Must be private to match class conventions
- **VALIDATE**: `grep "private callsign" src/adapters/github.ts`

### 3. UPDATE `src/adapters/github.ts` - Modify constructor signature

- **IMPLEMENT**: Add optional callsign parameter to constructor
- **PATTERN**:
  ```typescript
  constructor(token: string, webhookSecret: string, callsign?: string) {
    this.octokit = new Octokit({ auth: token });
    this.webhookSecret = webhookSecret;
    this.callsign = callsign || process.env.GITHUB_CALLSIGN || '@remote-agent';
    console.log('[GitHub] Adapter initialized');
    console.log(`[GitHub] Using callsign: ${this.callsign}`);
  }
  ```
- **LOCATION**: Lines 57-61
- **GOTCHA**: Use `callsign?: string` (optional) to avoid breaking existing code
- **GOTCHA**: Three-tier fallback: parameter > env var > hardcoded default
- **VALIDATE**: `npm run build` (TypeScript compilation)

### 4. UPDATE `src/adapters/github.ts` - Modify hasMention() method

- **IMPLEMENT**: Replace hardcoded `@remote-agent` regex with dynamic escaped callsign
- **PATTERN**:
  ```typescript
  private hasMention(text: string): boolean {
    // Escape special regex characters for safety
    const escapedCallsign = this.callsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedCallsign}[\\s,:;]`);
    return regex.test(text) || text.trim() === this.callsign;
  }
  ```
- **LOCATION**: Lines 198-200
- **GOTCHA**: Must escape special characters like `@`, `[`, `]`, `*`, etc.
- **GOTCHA**: The escaping pattern `[.*+?^${}()|[\]\\]` covers all regex special chars
- **GOTCHA**: Keep the exact match check: `text.trim() === this.callsign`
- **VALIDATE**: `npm run build && npm run lint`

### 5. UPDATE `src/adapters/github.ts` - Modify stripMention() method

- **IMPLEMENT**: Replace hardcoded `@remote-agent` regex with dynamic escaped callsign
- **PATTERN**:
  ```typescript
  private stripMention(text: string): string {
    // Escape special regex characters for safety
    const escapedCallsign = this.callsign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${escapedCallsign}[\\s,:;]+`, 'g');
    return text.replace(regex, '').trim();
  }
  ```
- **LOCATION**: Lines 205-207
- **GOTCHA**: Must use `'g'` flag for global replacement (remove all mentions)
- **GOTCHA**: Use `[\\s,:;]+` to match one or more whitespace/punctuation chars after callsign
- **VALIDATE**: `npm run build && npm run lint`

### 6. UPDATE `src/index.ts` - Pass callsign to GitHubAdapter

- **IMPLEMENT**: Read GITHUB_CALLSIGN from environment and pass to constructor
- **PATTERN**:
  ```typescript
  // Initialize GitHub adapter (conditional)
  let github: GitHubAdapter | null = null;
  if (process.env.GITHUB_TOKEN && process.env.WEBHOOK_SECRET) {
    const callsign = process.env.GITHUB_CALLSIGN; // Optional - will use default if not set
    github = new GitHubAdapter(
      process.env.GITHUB_TOKEN,
      process.env.WEBHOOK_SECRET,
      callsign
    );
    await github.start();
  } else {
    console.log('[GitHub] Adapter not initialized (missing GITHUB_TOKEN or WEBHOOK_SECRET)');
  }
  ```
- **LOCATION**: Lines 64-71
- **GOTCHA**: Don't use `|| '@remote-agent'` here - let constructor handle default
- **GOTCHA**: callsign can be undefined - constructor will handle it
- **VALIDATE**: `npm run build && npm run type-check`

### 7. CREATE unit tests for configurable callsign

- **IMPLEMENT**: Add comprehensive tests for custom callsign functionality
- **PATTERN**: Add to `src/adapters/github.test.ts` after existing tests
- **IMPORTS**: None needed (existing test setup works)
- **TESTS TO ADD**:
  ```typescript
  describe('configurable callsign', () => {
    test('should use custom callsign from constructor', () => {
      const customAdapter = new GitHubAdapter('token', 'secret', '@jarvis');
      // Test private method via public interface (webhook handling)
      // This indirectly verifies hasMention and stripMention work
    });

    test('should default to @remote-agent when no callsign provided', () => {
      const defaultAdapter = new GitHubAdapter('token', 'secret');
      // Verify default behavior is maintained
    });

    test('should handle special characters in callsign', () => {
      const specialAdapter = new GitHubAdapter('token', 'secret', '@bot[test]');
      // Verify regex escaping works correctly
    });

    test('should use environment variable when constructor param not provided', () => {
      process.env.GITHUB_CALLSIGN = '@test-bot';
      const envAdapter = new GitHubAdapter('token', 'secret');
      delete process.env.GITHUB_CALLSIGN;
      // Verify env var loading works
    });
  });
  ```
- **GOTCHA**: Cannot directly test private methods - test via webhook handling
- **GOTCHA**: Mock process.env changes in tests and clean up after
- **GOTCHA**: Testing regex escaping requires special characters like `[]`, `*`, `+`
- **VALIDATE**: `npm test -- src/adapters/github.test.ts`

### 8. UPDATE `README.md` - Document new configuration option

- **IMPLEMENT**: Add GITHUB_CALLSIGN to environment variables section
- **PATTERN**: Add after GitHub Token section (around line 50-100)
- **CONTENT**:
  ```markdown
  **GitHub Agent Callsign (Optional):**
  ```bash
  GITHUB_CALLSIGN=@remote-agent  # Default: @remote-agent
  ```

  Customize the mention trigger for GitHub comments. Examples:
  - `@jarvis` - Use a custom name
  - `@assistant` - Generic assistant name
  - `@bot` - Simple bot trigger

  Leave unset to use the default `@remote-agent`.
  ```
- **LOCATION**: Near other GitHub configuration (after GITHUB_TOKEN documentation)
- **GOTCHA**: Use proper markdown code block formatting with bash syntax highlighting
- **VALIDATE**: `grep -A 10 "GITHUB_CALLSIGN" README.md`

### 9. UPDATE `README.md` - Update usage examples

- **IMPLEMENT**: Modify usage examples to mention configurable callsign
- **PATTERN**: Update section around line 330-335
- **BEFORE**: "Interact by @mentioning `@remote-agent` in issues or PRs:"
- **AFTER**: "Interact by @mentioning your configured callsign (default: `@remote-agent`) in issues or PRs:"
- **LOCATION**: Lines 330-335
- **GOTCHA**: Keep examples using @remote-agent for consistency, just note it's configurable
- **VALIDATE**: `grep -B 2 -A 5 "Interact by" README.md`

### 10. UPDATE `docs/architecture.md` - Update workflow diagrams

- **IMPLEMENT**: Update @remote-agent references to indicate it's configurable
- **PATTERN**:
  - Line 898: `User comments: @remote-agent /command-invoke prime` → `User comments: @<callsign> /command-invoke prime`
  - Line 906: `Check for @remote-agent mention` → `Check for configured callsign mention`
  - Line 912: `Strip @remote-agent from comment` → `Strip callsign from comment`
- **LOCATION**: Lines 898, 906, 912
- **GOTCHA**: Keep the workflow accurate - mention it's configurable but keep examples clear
- **ALTERNATIVE**: Add a note at the top of the section: "Note: @remote-agent is the default callsign, configurable via GITHUB_CALLSIGN"
- **VALIDATE**: `grep -n "callsign\|remote-agent" docs/architecture.md | head -20`

### 11. UPDATE `.claude/commands/validation/validate.md` - Update test examples

- **IMPLEMENT**: Add note that examples use default callsign
- **PATTERN**: Add comment near first @remote-agent usage
- **CONTENT**: Add note: `<!-- Examples use default callsign @remote-agent. Configure via GITHUB_CALLSIGN env var. -->`
- **LOCATION**: Near first occurrence of @remote-agent in file
- **GOTCHA**: Don't change all examples - just add clarifying comment
- **VALIDATE**: `head -20 .claude/commands/validation/validate.md | grep -i callsign`

### 12. RUN full test suite

- **IMPLEMENT**: Execute all tests to ensure no regressions
- **PATTERN**: Run full test suite with coverage
- **COMMAND**: `npm test`
- **GOTCHA**: All existing tests must pass
- **GOTCHA**: New callsign tests must be included in coverage
- **VALIDATE**: `npm test 2>&1 | grep -E "(PASS|FAIL|Tests:)"`

### 13. RUN linting and type checking

- **IMPLEMENT**: Verify code quality and type safety
- **COMMANDS**:
  ```bash
  npm run lint
  npm run type-check
  npm run format:check
  ```
- **GOTCHA**: Must pass with zero errors
- **GOTCHA**: ESLint checks for explicit function return types
- **VALIDATE**: All three commands must exit with code 0

### 14. MANUAL validation with test adapter

- **IMPLEMENT**: Test custom callsign with manual webhook simulation
- **PATTERN**: Use test adapter or curl to simulate GitHub webhook
- **STEPS**:
  1. Set `GITHUB_CALLSIGN=@jarvis` in .env
  2. Start server: `npm run dev`
  3. Check logs confirm: `[GitHub] Using callsign: @jarvis`
  4. Test webhook with @jarvis mention (if webhook endpoint available)
- **GOTCHA**: This is optional if full webhook testing isn't set up
- **VALIDATE**: Check server logs show custom callsign on startup

---

## TESTING STRATEGY

Testing approach based on existing Jest setup and project test patterns.

### Unit Tests

**Scope:** GitHubAdapter class methods with configurable callsign

**Test File:** `src/adapters/github.test.ts`

**Required Test Cases:**

1. **Default Callsign Behavior**
   - Constructor without callsign parameter uses `@remote-agent`
   - Verify backward compatibility

2. **Custom Callsign via Constructor**
   - Constructor with callsign parameter uses provided value
   - Callsign is correctly stored and logged

3. **Environment Variable Loading**
   - When `GITHUB_CALLSIGN` env var is set, it's used as default
   - Constructor parameter overrides env var

4. **Regex Escaping**
   - Special characters in callsign are properly escaped
   - Test with: `@bot[test]`, `@agent*`, `@helper+`
   - Verify regex patterns don't break

5. **Mention Detection**
   - Custom callsign is correctly detected in text
   - Supports formats: `@callsign `, `@callsign,`, `@callsign:`, `@callsign;`
   - Exact match: text that is exactly the callsign

6. **Mention Stripping**
   - Custom callsign is correctly removed from text
   - Multiple mentions are all removed
   - Trailing/leading whitespace is trimmed

**Test Pattern:**
```typescript
describe('configurable callsign', () => {
  beforeEach(() => {
    delete process.env.GITHUB_CALLSIGN;
  });

  test('uses default @remote-agent when not configured', () => {
    const adapter = new GitHubAdapter('token', 'secret');
    // Verify via logs or public interface
  });

  test('uses custom callsign from constructor', () => {
    const adapter = new GitHubAdapter('token', 'secret', '@jarvis');
    // Verify callsign is used
  });

  test('uses environment variable', () => {
    process.env.GITHUB_CALLSIGN = '@test-bot';
    const adapter = new GitHubAdapter('token', 'secret');
    // Verify env var is used
    delete process.env.GITHUB_CALLSIGN;
  });

  test('escapes special regex characters', () => {
    const adapter = new GitHubAdapter('token', 'secret', '@bot[test]');
    // Verify no regex errors occur
  });
});
```

### Integration Tests

**Scope:** Not required for this feature

This is a pure configuration enhancement without complex integration points. Unit tests are sufficient.

### Edge Cases

1. **Empty Callsign**
   - What happens if `GITHUB_CALLSIGN=""` is set?
   - Expected: Fall back to default `@remote-agent`

2. **Callsign Without @ Symbol**
   - What happens if `GITHUB_CALLSIGN=jarvis` (no @)?
   - Expected: Should work - user is responsible for format

3. **Very Long Callsign**
   - What happens with `@very-long-callsign-name-here`?
   - Expected: Should work fine - no length limits needed

4. **Unicode Characters**
   - What happens with `@助手` (Chinese characters)?
   - Expected: Should work - regex escaping handles it

5. **Multiple @ Symbols**
   - What happens with `@@bot` or `@b@t`?
   - Expected: Should work - treated as literal characters

**Testing Edge Cases:**
Add additional tests in the unit test suite for these scenarios.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
# TypeScript type checking (MUST pass with 0 errors)
npm run type-check

# ESLint (MUST pass with 0 errors)
npm run lint

# Prettier formatting check (MUST pass with 0 errors)
npm run format:check
```

**Expected**: All commands pass with exit code 0

### Level 2: Unit Tests

```bash
# Run all tests
npm test

# Run GitHub adapter tests specifically
npm test -- src/adapters/github.test.ts

# Run tests with coverage
npm test -- --coverage

# Watch mode for development
npm run test:watch
```

**Expected**:
- All tests pass
- New callsign tests show in output
- No regressions in existing tests
- Coverage remains high (>80%)

### Level 3: Build Validation

```bash
# Build TypeScript to dist/
npm run build

# Verify dist/ contains github.js
ls -lh dist/adapters/github.js

# Check build output for errors
npm run build 2>&1 | grep -i error
```

**Expected**:
- Build succeeds
- No TypeScript errors
- dist/adapters/github.js exists and is recent

### Level 4: Manual Validation

**Step 1: Verify default behavior**
```bash
# Start server without GITHUB_CALLSIGN set
npm run dev

# Check logs show:
# [GitHub] Using callsign: @remote-agent
```

**Step 2: Verify custom callsign**
```bash
# Add to .env:
echo "GITHUB_CALLSIGN=@jarvis" >> .env

# Start server
npm run dev

# Check logs show:
# [GitHub] Using callsign: @jarvis

# Clean up
sed -i '/GITHUB_CALLSIGN/d' .env
```

**Step 3: Verify documentation**
```bash
# Check .env.example has new variable
grep "GITHUB_CALLSIGN" .env.example

# Check README mentions it
grep -i "callsign" README.md

# Check architecture docs updated
grep -i "callsign" docs/architecture.md
```

**Expected**:
- Server starts with correct callsign in logs
- Documentation is updated
- No errors in console output

### Level 5: Regression Testing

```bash
# Verify existing GitHub functionality still works
# (This requires actual GitHub token and webhook setup)

# Basic smoke test: Start server and check for errors
npm run dev &
sleep 3
curl http://localhost:3000/health
kill %1

# Verify database migrations still work
psql $DATABASE_URL -c "SELECT 1"
```

**Expected**:
- Server starts without errors
- Health check responds
- No breaking changes to existing functionality

---

## ACCEPTANCE CRITERIA

- [x] Feature implements configurable GitHub callsign via environment variable
- [x] All validation commands pass with zero errors (type-check, lint, format:check)
- [x] Unit tests verify default, custom, and env var callsign behavior
- [x] Unit tests verify regex escaping for special characters
- [x] Backward compatibility maintained (defaults to @remote-agent)
- [x] Code follows project conventions (TypeScript strict mode, ESLint rules)
- [x] No regressions in existing functionality
- [x] Documentation updated (README.md, architecture.md, .env.example)
- [x] Logging shows which callsign is being used on startup
- [x] Three-tier fallback works: constructor param → env var → default

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order (1-14)
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully:
  - [ ] Level 1: type-check, lint, format:check (0 errors)
  - [ ] Level 2: npm test (all tests pass)
  - [ ] Level 3: npm run build (successful build)
  - [ ] Level 4: Manual testing (server starts, logs correct callsign)
  - [ ] Level 5: Regression testing (no breaking changes)
- [ ] Full test suite passes (unit tests)
- [ ] No linting errors (npm run lint)
- [ ] No formatting errors (npm run format:check)
- [ ] No type checking errors (npm run type-check)
- [ ] Build succeeds (npm run build)
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability
- [ ] Documentation is clear and accurate
- [ ] Feature is production-ready

---

## NOTES

### Design Decisions

**1. Why optional constructor parameter?**
- Maintains backward compatibility
- Allows testing with custom callsigns
- Provides flexibility for programmatic instantiation

**2. Why three-tier fallback (param → env → default)?**
- Constructor parameter: Highest priority for testing/advanced use
- Environment variable: Standard configuration method
- Hardcoded default: Ensures system always works

**3. Why manual regex escaping instead of RegExp.escape()?**
- RegExp.escape() is a new 2025 feature, not widely available yet
- Manual escaping with `replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` is compatible with all Node.js versions
- More portable and reliable for production use

**4. Why not validate callsign format?**
- User is responsible for choosing valid format
- Allows maximum flexibility (with or without @, any characters)
- Regex escaping handles any special characters safely
- KISS principle: don't over-engineer

**5. Why update docs but not change examples?**
- Keep examples simple and consistent
- @remote-agent is still the default
- Note that it's configurable, but don't complicate examples
- Users who want custom callsigns will read the config docs

### Trade-offs

**Simplicity vs. Validation:**
- Chose simplicity - no validation of callsign format
- Pro: Maximum flexibility, less code, fewer edge cases
- Con: User could set invalid callsign (their responsibility)

**Backward Compatibility:**
- Chose full backward compatibility with default fallback
- Pro: Existing deployments work without changes
- Con: Adds extra fallback logic

**Testing Approach:**
- Testing via public interface (webhook handling) rather than exposing private methods
- Pro: Tests real behavior, maintains encapsulation
- Con: More complex test setup

### Future Enhancements (Out of Scope)

1. **Multiple Callsigns**: Support array of callsigns like `GITHUB_CALLSIGN=@bot,@assistant`
2. **Regex Patterns**: Allow regex patterns like `GITHUB_CALLSIGN=@(bot|assistant)`
3. **Per-Repository Callsigns**: Different callsigns for different repos
4. **Callsign Validation**: Warn users if callsign is invalid or too long
5. **Case Insensitivity**: Make callsign matching case-insensitive

### Implementation Confidence

**Confidence Score: 9/10** for one-pass success

**High Confidence Because:**
- Simple, well-defined change
- Clear existing patterns to follow
- No new dependencies
- Comprehensive test coverage possible
- Backward compatible design
- Regex escaping is straightforward

**Potential Risks:**
- Regex escaping edge cases with exotic Unicode characters (low risk)
- Environment variable not loading correctly (mitigated by three-tier fallback)
- Breaking existing tests (mitigated by maintaining default behavior)

**Mitigation Strategies:**
- Extensive unit testing with special characters
- Manual validation with custom callsigns
- Regression testing suite
- Clear logging of which callsign is being used

This feature is production-ready with minimal risk of issues.
