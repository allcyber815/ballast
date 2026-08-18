#!/usr/bin/env node

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const engine = join(here, "ballast-rules.mjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runHook(cwd, prompt) {
  return spawnSync(process.execPath, [engine], {
    input: JSON.stringify({
      session_id: "verify-session",
      turn_id: "verify-turn",
      cwd,
      hook_event_name: "UserPromptSubmit",
      prompt,
    }),
    encoding: "utf8",
    env: { ...process.env, HOME: join(cwd, "home") },
  });
}

let project;
try {
  const manifest = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"), "utf8"));
  assert(manifest.skills === "./skills/", "manifest must expose ./skills/");
  assert(manifest.hooks === "./hooks/codex-hooks.json", "manifest must point to Codex hooks");

  const hooks = JSON.parse(readFileSync(join(root, "hooks/codex-hooks.json"), "utf8"));
  const handler = hooks?.hooks?.UserPromptSubmit?.[0]?.hooks?.[0];
  assert(handler?.type === "command", "UserPromptSubmit command hook is missing");
  assert(handler.command?.includes("ballast-rules.mjs"), "Codex hook must invoke ballast-rules.mjs");

  project = mkdtempSync(join(tmpdir(), "ballast-codex-"));
  mkdirSync(join(project, ".claude"), { recursive: true });
  writeFileSync(
    join(project, ".claude", "ballast.rules.json"),
    JSON.stringify({
      version: 1,
      rules: [
        {
          id: "inject-test",
          title: "Codex inject test",
          when: { keywords: ["generate"] },
          body: "Injected into Codex developer context.",
        },
        {
          id: "block-test",
          title: "Codex block test",
          action: "block",
          when: { keywords: ["destroy-now"] },
          body: "Stop before the prompt reaches Codex.",
        },
      ],
    })
  );

  const injected = runHook(project, "generate a report");
  assert(injected.status === 0, `inject case exited ${injected.status}`);
  const output = JSON.parse(injected.stdout);
  assert(
    output?.hookSpecificOutput?.hookEventName === "UserPromptSubmit",
    "inject case returned the wrong hook event"
  );
  assert(
    output?.hookSpecificOutput?.additionalContext?.includes("Injected into Codex developer context."),
    "matching rule was not injected"
  );

  const blocked = runHook(project, "destroy-now");
  assert(blocked.status === 2, `block case exited ${blocked.status}, expected 2`);
  assert(blocked.stderr.includes("blocked by rule"), "block case did not emit a reason");

  console.log("PASS  Codex plugin manifest and hook config parse");
  console.log("PASS  Codex UserPromptSubmit injects matching rules");
  console.log("PASS  Codex UserPromptSubmit blocks action:block rules");
  console.log("\n3/3 passed");
} finally {
  if (project) rmSync(project, { recursive: true, force: true });
}
