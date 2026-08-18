# Using ballast with Codex

ballast is packaged for both Claude Code and Codex. The twelve skills and file-based memory conventions are shared; Codex also gets standing-rule delivery through its native `UserPromptSubmit` lifecycle hook.

## What carries over

- all twelve `skills/*/SKILL.md` workflows
- the `memory/` conventions and project files
- `.claude/ballast.rules.json` and `~/.claude/ballast.rules.json`
- the same `hooks/scripts/ballast-rules.mjs` rule engine
- `action: "block"` rules before the prompt reaches the model

One rule catalog can therefore serve Claude Code and Codex on the same project.

## Native Codex plugin

This fork includes a Codex plugin manifest at `.codex-plugin/plugin.json`. It exposes `./skills/` and points Codex at `hooks/codex-hooks.json`.

The Codex hook runs on every `UserPromptSubmit` and invokes the same Node rule engine used by Claude Code. Matching rules are returned as `hookSpecificOutput.additionalContext`; a matching `action: "block"` rule exits with status 2 and stops the prompt.

The hook resolves the installed plugin through `PLUGIN_ROOT`, so it does not hard-code a clone path.

### Install

Clone this fork somewhere stable:

```bash
git clone https://github.com/allcyber815/ballast
```

Then use the plugin installation flow supported by your installed Codex version to install the local repository. Check `codex --help` and the plugin-related help first rather than assuming an older command syntax.

Before enabling the bundled hook, review these files:

```text
.codex-plugin/plugin.json
hooks/codex-hooks.json
hooks/scripts/ballast-rules.mjs
```

The hook script uses Node built-ins only and reads the local rule catalogs. Review/trust the hook when Codex asks before enabling it.

If your Codex build does not support native plugin installation but does support hooks, use the manual setup below.

## Seed the rule catalog

The plugin is quiet until a catalog exists.

Project rules live at:

```text
<project>/.claude/ballast.rules.json
```

User-wide rules live at:

```text
~/.claude/ballast.rules.json
```

Do not overwrite an existing catalog. If you want to start empty, use:

```json
{
  "version": 1,
  "rules": []
}
```

The example catalog at `rules/ballast.rules.example.json` is for reference and smoke testing; prune it before treating it as your real policy.

Project rules override user rules with the same `id`. Matching uses case-insensitive literal keywords plus optional regex patterns. `action: "block"` stops matching prompts.

## Manual Codex setup without plugin installation

The skills can still be referenced from `AGENTS.md` while the rule engine is wired directly as a repo-local Codex hook.

Append this block to the project `AGENTS.md`, replacing `<BALLAST>` with the clone path:

```markdown
## ballast conventions

Skills live at <BALLAST>/skills/ — one folder per skill, SKILL.md inside.
Before matching work, read the relevant SKILL.md and follow it exactly:
goal (big or unfamiliar goals) · verify-gate (claims, labels) · knowledge-base
(research reuse) · decision-ledger (decisions) · proof-standard (external claims)
· rehearsal (before shipping a deliverable) · researcher (delegated collection)
· checkpoint (pause and return) · pin (corrections become rules) · brain-init
(memory setup) · skill-forge (repeated procedures). Folder names match these
skill names.
```

For native rule delivery, create `<project>/.codex/hooks.json` with the hook shape supported by the installed Codex version and point its `UserPromptSubmit` command at:

```text
node "<BALLAST>/hooks/scripts/ballast-rules.mjs"
```

The bundled `hooks/codex-hooks.json` is the reference configuration used by the plugin package.

## Legacy `codex exec` wrapper

`hooks/scripts/ballast-codex.mjs` remains available as a compatibility path for environments where native hooks are disabled or unavailable:

```bash
node <BALLAST>/hooks/scripts/ballast-codex.mjs "generate 40 images" -- -C /path/to/project
```

Everything after `--` goes to `codex exec` unchanged. Set `CODEX_BIN` if `codex` is not on your `PATH`.

With native Codex hook support this wrapper is a fallback, not the primary setup.

## Invoking skills directly

If you want an explicit shortcut in addition to automatic skill matching, create a Codex prompt such as `~/.codex/prompts/ballast-goal.md`:

```markdown
---
description: Run a goal through the full ballast pipeline
---

Read <BALLAST>/skills/goal/SKILL.md and follow it exactly.

Task: $ARGUMENTS
```

Use the same pattern for `ballast-brain-init.md`, `ballast-pin.md`, or other skills you call often.

## Operational notes

- **Hook trust is explicit.** Review the command and script before trusting plugin-bundled hooks.
- **Hooks may be disabled.** A workspace or administrator can disable lifecycle hooks; use the wrapper fallback if needed.
- **The rule engine is fail-open on its own errors.** A malformed internal state does not intentionally break the agent session. A malformed catalog is surfaced because silently losing user-authored rules would be misleading.
- **Catalogs should stay lean.** The rule engine caps injected matches at 12 rules / roughly 6,000 characters.
- **Node 18+ is expected.** The hook imports only Node built-ins (`fs`, `os`, `path`) and makes no network requests.
- **The hook is a guardrail, not a security sandbox.** Use Codex permissions and sandboxing for hard security boundaries.

## Verify locally

Run both zero-dependency harnesses:

```bash
node hooks/scripts/verify-hook.mjs
node hooks/scripts/verify-codex-package.mjs
```

The original harness covers keyword injection, silent no-match behavior, blocking, legacy prompt-field compatibility, malformed-catalog reporting, and fail-open behavior.

The Codex harness additionally parses the plugin manifest and Codex hook config, then simulates Codex-style `UserPromptSubmit` injection and blocking.
