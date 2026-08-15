/**
 * Тесты Supervisor (Agent Core) — оркестрация pre-model пайплайна.
 * Запуск: npx tsx src/core/supervisor.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runPipeline,
  formatTrace,
  type PipelineResult,
  type StepResult,
} from "./supervisor.js";
import { resetReadTracker } from "./read-tracker.js";
import { resetGlobalJournal } from "./evidence-journal.js";
import { clearRulesCache } from "./classifier.js";

// --- Test helpers ---

let tmpVault: string;
let origEnv: string | undefined;
let activeProjectSaved: string | null = null;

const ACTIVE_PROJECT_FILE = join(process.env.AGENT_ROOT || process.env.IVA_ROOT || ".", ".agent", "active-project");

function saveActiveProject(): void {
  try {
    const { readFileSync } = require("node:fs");
    activeProjectSaved = readFileSync(ACTIVE_PROJECT_FILE, "utf8").trim();
  } catch {
    activeProjectSaved = null;
  }
}

function restoreActiveProject(): void {
  if (activeProjectSaved !== null) {
    writeFileSync(ACTIVE_PROJECT_FILE, activeProjectSaved, "utf8");
  } else {
    try { unlinkSync(ACTIVE_PROJECT_FILE); } catch { /* ok */ }
  }
}

beforeEach(() => {
  tmpVault = mkdtempSync(join(tmpdir(), "supervisor-test-"));
  origEnv = process.env.ASSISTANT_VAULT_DIR;
  process.env.ASSISTANT_VAULT_DIR = tmpVault;

  // Минимальная структура проекта
  const projDir = join(tmpVault, "..", "projects", "one");
  mkdirSync(projDir, { recursive: true });
  writeFileSync(join(projDir, "context.md"), "# Context\n\nTest project.\n", "utf8");
  writeFileSync(join(projDir, "tone-of-voice.md"), "# TOV\n\nBe brief.\n", "utf8");
  // SKILLS_INDEX.md в $AGENT_ROOT/agent/ уже существует — используем реальный

  saveActiveProject();
  writeFileSync(ACTIVE_PROJECT_FILE, "one", "utf8");

  // Сброс глобального состояния между тестами
  resetReadTracker();
  resetGlobalJournal();
  clearRulesCache();
});

afterEach(() => {
  process.env.ASSISTANT_VAULT_DIR = origEnv;
  restoreActiveProject();
  rmSync(tmpVault, { recursive: true, force: true });
  resetReadTracker();
  resetGlobalJournal();
});

// --- formatTrace ---

describe("formatTrace", () => {
  it("форматирует все статусы", () => {
    const trace: StepResult[] = [
      { step: "classify", status: "ok", durationMs: 5 },
      { step: "preflight", status: "ok", durationMs: 3 },
      { step: "evidence", status: "skip", durationMs: 1 },
      { step: "synthetic", status: "error", durationMs: 2, error: "ENOENT" },
    ];
    const out = formatTrace(trace);
    assert.ok(out.includes("✅ classify: 5ms"));
    assert.ok(out.includes("✅ preflight: 3ms"));
    assert.ok(out.includes("⏭️ evidence: 1ms"));
    assert.ok(out.includes("❌ synthetic: 2ms (ENOENT)"));
    assert.ok(out.includes("11ms total"));
  });

  it("пустой трейс", () => {
    const out = formatTrace([]);
    assert.ok(out.includes("0ms total"));
  });

  it("выводит modelHint когда передан", () => {
    const trace: StepResult[] = [
      { step: "classify", status: "ok", durationMs: 10 },
      { step: "model-router", status: "ok", durationMs: 1 },
      { step: "preflight", status: "ok", durationMs: 8 },
    ];
    const out = formatTrace(trace, "pro");
    assert.ok(out.includes("[Supervisor] 19ms total (pro)"));
  });

  it("не выводит modelHint когда не передан", () => {
    const trace: StepResult[] = [
      { step: "classify", status: "ok", durationMs: 10 },
    ];
    const out = formatTrace(trace);
    assert.ok(out.includes("[Supervisor] 10ms total\n"));
  });
});

// --- runPipeline ---

describe("runPipeline: happy path", () => {
  it("возвращает handled=false для обычного сообщения", async () => {
    const result = await runPipeline("привет, как дела?", 12345);
    assert.equal(result.handled, false);
    assert.ok(result.intent);
    assert.ok(result.trace.length >= 3, `ожидалось ≥3 шагов, получили ${result.trace.length}`);
  });

  it("все шаги в трейсе присутствуют", async () => {
    const result = await runPipeline("найди информацию о TypeScript", 12345);
    const steps = result.trace.map((s) => s.step);
    assert.ok(steps.includes("classify"));
    assert.ok(steps.includes("preflight"));
    assert.ok(steps.includes("evidence"));
    assert.ok(steps.includes("synthetic"));
  });

  it("synthetic reads внедряются при первом вызове", async () => {
    const r1 = await runPipeline("тест synthetic", 1);
    assert.ok(r1.syntheticReads, "первый вызов: synthetic reads должны быть");
    assert.ok(r1.syntheticReads!.includes("[Agent Core]"));
  });

  it("evidence hint формируется", async () => {
    const r = await runPipeline("тест evidence", 99999);
    assert.ok("evidenceHint" in r);
  });
});

describe("runPipeline: preflight respond", () => {
  it("пустое сообщение → handled=true", async () => {
    const result = await runPipeline("", 12345);
    assert.equal(result.handled, true);
    assert.ok(result.response, "должен быть ответ");
    // При handled=true: только classify + preflight, без evidence/synthetic
    const steps = result.trace.map((s) => s.step);
    assert.ok(steps.includes("classify"));
    assert.ok(steps.includes("preflight"));
    assert.ok(!steps.includes("evidence"), "evidence не должен выполняться после respond");
    assert.ok(!steps.includes("synthetic"), "synthetic не должен выполняться после respond");
  });
});

describe("runPipeline: структура результата", () => {
  it("при handled=false: обязательные поля есть, опциональные могут отсутствовать", async () => {
    const r = await runPipeline("привет", 1);
    assert.equal(r.handled, false);
    // Обязательные
    assert.ok("handled" in r);
    assert.ok("trace" in r);
    assert.ok(Array.isArray(r.trace));
    // Опциональные — проверяем что тип корректен (могут быть undefined)
    assert.equal(r.response, undefined, "response должен быть undefined при handled=false");
    // intent должен быть (классификатор отработал)
    assert.ok(r.intent);
    assert.ok(r.intent.kind);
  });

  it("при handled=true: response заполнен, остальное не требуется", async () => {
    const r = await runPipeline("", 12345);
    assert.equal(r.handled, true);
    assert.ok(typeof r.response === "string" && r.response.length > 0);
    assert.ok(r.intent, "intent должен быть даже при handled=true");
  });

  it("intent присутствует для осмысленного текста", async () => {
    const r = await runPipeline("расскажи про архитектуру", 1);
    assert.ok(r.intent, "intent должен определиться");
    assert.ok(r.intent.kind);
  });

  it("trace содержит корректные StepResult", async () => {
    const r = await runPipeline("ещё тест", 1);
    for (const step of r.trace) {
      assert.ok(typeof step.step === "string");
      assert.ok(["ok", "skip", "error"].includes(step.status));
      assert.ok(typeof step.durationMs === "number");
      assert.ok(step.durationMs >= 0);
      if (step.status === "error") {
        assert.ok(typeof step.error === "string");
      }
    }
  });

  it("время шагов не отрицательное", async () => {
    const r = await runPipeline("проверка времени", 1);
    for (const step of r.trace) {
      assert.ok(step.durationMs >= 0, `${step.step}: ${step.durationMs}ms`);
    }
  });
});

describe("runPipeline: обработка ошибок", () => {
  it("не падает при любом вводе", async () => {
    const inputs = [
      "нормальный текст",
      "",
      "!@#$%^",
      "x".repeat(1000),
    ];
    for (const input of inputs) {
      const r = await runPipeline(input, 1);
      assert.ok(r.trace.length >= 1, `trace пуст для "${input.slice(0, 20)}"`);
      assert.ok(typeof r.handled === "boolean");
    }
  });

  it("synthetic не блокирует пайплайн при ошибке", async () => {
    const r = await runPipeline("тест без tov", 1);
    const synStep = r.trace.find((s) => s.step === "synthetic");
    assert.ok(synStep, "synthetic step должен быть в трейсе");
    assert.ok(synStep!.status === "ok" || synStep!.status === "skip");
  });
});
