const state = {
  activeView: "dashboard",
  pausedFeed: false,
  unseenEvents: 0,
  events: [],
  eventFilter: "all",
  planFilters: { search: "", status: "all", project: "all", tag: "all" },
  projectFilters: { search: "", curator: "all" },
  skillFilters: { search: "", type: "all" },
  selectedPlanId: null,
  selectedProjectId: null,
  selectedSkillId: null,
  draggedTaskId: null,
  liveData: false,
  selectedTaskId: null,
  kanbanVisibleLimit: {},
  kanbanFilters: {
    search: "",
    tag: "",
    projects: {},
    stages: {},
  },
  kanbanFields: {
    description: false,
    due: false,
    tags: true,
    plan: true,
    parent: false,
  },
};

const branding = {
  prototypeTitle: "Unified Dashboard",
  productionTitle: "Agent Dashboard",
};

const data = {
  plans: [],
  planStats: {},
  planTags: [],
  planProjects: [],
  plansRoot: "",
  projects: [],
  projectStats: {},
  projectCurators: [],
  projectsRoot: "",
  skills: [],
  skillStats: {},
  skillsRoot: "",
  passport: {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    fallback: "deepseek-v4-pro",
    uptime: "19d 04h",
    commit: "f5126ad smoke+tests",
  },
  verdict: {
    title: "Агент работает, но память и guard-контур требуют внимания.",
    copy: "Doctor score снижается, ratchet устарел, health endpoint недоступен и переключён на fallback-файл.",
    updated: "срез 40 мин назад",
  },
  shiftSummary: null,
  attention: [
    ["fail", "Health endpoint :9090 не отвечает", "используется fallback: $AGENT_ROOT/health/health.status"],
    ["warn", "Ratchet устарел на 10 дней", "нужен свежий npm run eval-harness перед релизом"],
    ["warn", "Doctor score падает 81.2 → 80.9", "проверить core size и stale contexts"],
    ["warn", "Usage schema не подтверждена", "после копирования агента сверить поля tokens/cache/cost"],
  ],
  freshness: [
    ["health.status", "4 мин", "ok"],
    ["traces.db", "live", "ok"],
    ["usage.jsonl", "40 мин", "warn"],
    ["pipeline-status.json", "3 мин", "ok"],
    ["doctor-status.json", "18 мин", "warn"],
    ["ratchet-journal", "10 дней", "fail"],
  ],
  operatorLog: [
    ["21:42", "dashboard_main_page", "поднят прототип v2, включена операторская сводка"],
    ["21:39", "channel:messenger", "fallback model подтверждён, provider не потерян"],
    ["21:31", "vault_search", "stale index обнаружен, evidence fallback сработал"],
    ["21:18", "ratchet_eval", "прогон пропущен: журнал устарел"],
  ],
  lastTurn: {
    time: "21:42",
    runId: "wrun_01KZSXA66Y3VJFPBQ22YGSGY2",
    intent: "dashboard_main_page",
    status: "ok",
    duration: "1842ms",
    tools: ["read_spec", "render_dashboard", "output_guard"],
    context: {
      inputTokens: 42800,
      outputTokens: 3100,
      cachedTokens: 12400,
      cost: "$0.018",
      sources: [
        ["dashboard-main-page-spec.md", "spec", 8200],
        ["unified-dashboard.md", "spec", 6400],
        ["traces.db summary", "trace", 5100],
        ["ratchet-journal.jsonl", "guard", 3800],
        ["usage.jsonl", "usage", 2600],
        ["health.status", "health", 420],
      ],
    },
    steps: [
      ["classify", "ok", 12, "intent=dashboard_main_page"],
      ["preflight", "ok", 24, "sources reachable"],
      ["evidence", "ok", 96, "2 specs loaded"],
      ["synthetic", "skip", 0, "not needed"],
      ["skill-triggers", "ok", 18, "frontend-design"],
      ["mcp-router", "ok", 9, "none"],
      ["scheduler", "skip", 0, "manual task"],
      ["steering", "ok", 27, "response shaped"],
      ["output-guard", "ok", 14, "passed"],
    ],
  },
  memory: [
    ["core", "1043/1500", "warn", "Размер core-памяти относительно лимита. Жёлтый означает, что запас сжимается."],
    ["last rollup", "today 14:29", "ok", "Когда последний раз собирался rollup памяти."],
    ["stale contexts", "6", "warn", "Контексты, которые давно не обновлялись и могут искажать ответы."],
    ["new notes", "23", "ok", "Новые заметки/сущности, добавленные за текущие сутки."],
  ],
  memoryAnalysis: null,
  kpis: [
    { label: "Health", value: "10/2/0", tone: "warn", detail: "ok / warn / fail из 12 проверок", progress: 83 },
    { label: "Pipeline", value: "OK", tone: "ok", detail: "daily rollup 3m 22s назад", progress: 100 },
    { label: "Doctor", value: "80.9 ↓", tone: "warn", detail: "vault score, тренд вниз", progress: 81 },
    { label: "Токены", value: "2.94M", tone: "ok", detail: "$0.71 из $20 за месяц", progress: 14 },
    { label: "Кэш-хит", value: "57%", tone: "ok", detail: "cacheRead / input за 7 дней", progress: 57 },
  ],
  runs: [
    ["27.07", 41, false],
    ["28.07", 52, false],
    ["29.07", 77, false],
    ["30.07", 69, true],
    ["31.07", 92, false],
    ["01.08", 118, false],
    ["02.08", 109, false],
    ["03.08", 63, true],
    ["04.08", 155, false],
    ["05.08", 128, false],
    ["06.08", 57, true],
    ["07.08", 83, false],
    ["08.08", 96, false],
    ["09.08", 34, false],
  ],
  turns: [
    {
      time: "21:42",
      intent: "dashboard_main_page",
      status: "ok",
      duration: "1842ms",
      steps: "classify ok · preflight ok · evidence ok · synthetic skip · skill-triggers ok · mcp-router ok · scheduler skip · steering ok",
    },
    {
      time: "21:39",
      intent: "channel:messenger",
      status: "ok",
      duration: "933ms",
      steps: "classify ok · preflight ok · evidence ok · synthetic skip · tool route ok · output guard ok",
    },
    {
      time: "21:31",
      intent: "vault_search",
      status: "warn",
      duration: "2281ms",
      steps: "classify ok · evidence warn: stale index · fallback ok · output guard ok",
    },
    {
      time: "21:18",
      intent: "ratchet_eval",
      status: "skip",
      duration: "0ms",
      steps: "scheduler skip: ratchet journal stale, manual run required",
    },
  ],
  errors: [
    ["09.08 21:31", "one", "evidence", "stale index, fallback used", "актуальна"],
    ["06.08 14:29", "memory", "rollup", "health endpoint :9090 unavailable", "актуальна"],
    ["30.07 18:04", "guards", "eval-harness", "ratchet journal stale", "не воспроизводится"],
  ],
  guards: [
    ["prompt-injection", "pass", "Проверяет, что вход не пытается переписать системные правила."],
    ["tool-output", "pass", "Проверяет безопасную обработку результатов инструментов."],
    ["json-contract", "pass", "Следит, что структурированные ответы соответствуют ожидаемой схеме."],
    ["secrets", "pass", "Ищет случайные утечки ключей, токенов и приватных данных."],
    ["markdown-clean", "pass", "Проверяет, что markdown не ломает отображение и не содержит мусор."],
    ["scheduler", "pass", "Проверяет корректность планировщика и отложенных действий."],
    ["state-change", "pass", "Проверяет, что изменения состояния разрешены и ожидаемы."],
    ["memory-rollup", "pass", "Проверяет сборку rollup памяти и отсутствие деградации."],
    ["sse-compact", "pass", "Проверяет компактность и пригодность live-событий для ленты."],
    ["ratchet-fresh", "fail", "Проверяет свежесть guard-прогона. Fail означает, что журнал устарел."],
  ],
  kanban: {
    backlog: {
      title: "Backlog",
      tasks: [
        {
          id: "T-101",
          title: "Подключить реальные источники из $AGENT_ROOT",
          description: "Заменить мок-данные на чтение health, traces, usage и tasks.db.",
          priority: "high",
          project: "one",
          tags: ["dashboard", "data"],
          due: "2026-08-12",
          refs: ["[[plans/kanban-board-mvp-spec]]"],
        },
        {
          id: "T-102",
          title: "Сверить схему usage.jsonl после копирования",
          description: "Проверить поля tokens/cache/cost и зафиксировать несовпадения.",
          priority: "mid",
          project: "two",
          tags: ["usage", "schema"],
          due: "",
          refs: [],
        },
      ],
    },
    plan: {
      title: "Plan",
      tasks: [
        {
          id: "T-103",
          title: "API: /api/tasks и /api/tasks/move",
          description: "Сохранить совместимость с текущим summary и подготовить SQLite-write слой.",
          priority: "high",
          project: "one",
          tags: ["plan", "api", "kanban"],
          due: "2026-08-14",
          refs: ["[[plans/kanban-board-mvp-spec]]"],
        },
        {
          id: "T-104",
          title: "Кнопки событийного пайплайна",
          description: "Plan / Implement / Review дергаются по событию, без supervisor-poller.",
          priority: "mid",
          project: "four",
          tags: ["plan", "pipeline"],
          due: "",
          refs: ["[[plans/kanban-phase-2-static-pipeline]]"],
        },
      ],
    },
    progress: {
      title: "In Progress",
      tasks: [
        {
          id: "T-105",
          title: "Собрать рабочую канбан-доску",
          description: "Ручной drag-and-drop, стрелки, фильтры и движение карточек агентом.",
          priority: "high",
          project: "one",
          tags: ["kanban", "ui"],
          due: "2026-08-10",
          refs: [],
        },
      ],
    },
    review: {
      title: "Review",
      tasks: [
        {
          id: "T-106",
          title: "Проверка drag-and-drop модели",
          description: "Убедиться, что порядок сохраняется в UI и событие move уходит в API.",
          priority: "mid",
          project: "one",
          tags: ["review", "kanban"],
          due: "",
          refs: [],
        },
      ],
    },
    done: {
      title: "Done",
      tasks: [
        {
          id: "T-107",
          title: "Собрать нормальное ТЗ v0",
          description: "MVP-спека выделила колонки, поля карточки, фильтры и API-контракт.",
          priority: "low",
          project: "five",
          tags: ["spec"],
          due: "",
          refs: ["[[plans/kanban-board-mvp-spec]]"],
        },
      ],
    },
  },
  kanbanPipelineLog: [
    ["23:20", "system", "Static pipeline выбран: действия только по кнопке, без poller-ов."],
    ["23:18", "agent", "Coordinator-план помечен как superseded и не используется."],
  ],
};

const eventTemplates = [
  ["message", "MessageReceived", "user asked for dashboard prototype"],
  ["agent", "AgentThinking", "selecting frontend stack"],
  ["tool", "ToolCalled", "read traces.db summary"],
  ["tool", "ToolResult", "duration=44ms success=true"],
  ["issue", "WarningLogged", "ratchet journal is stale"],
  ["context", "ContextCompacted", "summary retained"],
  ["state", "StateChanged", "dashboard.view=kanban"],
  ["guard", "OutputGuard", "pass markdown-clean"],
  ["skills", "SkillTriggered", "frontend-design matched"],
  ["subagents", "SubagentStatus", "reviewer idle"],
  ["services", "ServiceHealth", "health endpoint fallback active"],
  ["agent", "AgentResponding", "готовлю компактный ответ..."],
  ["message", "MessageSent", "prototype updated"],
];

const eventGroups = [
  ["all", "Все", "все события"],
  ["message", "Сообщения", "MessageReceived / MessageSent"],
  ["agent", "Агент", "AgentThinking / AgentResponding"],
  ["tool", "Инструменты", "ToolCalled / ToolResult / ToolError"],
  ["issue", "Ошибки", "ErrorThrown / WarningLogged"],
  ["context", "Контекст", "ContextCompacted"],
  ["state", "Состояние", "Session / StateChanged"],
  ["guard", "Guard", "OutputGuard"],
  ["skills", "Скиллы", "SkillTriggered / SkillLoaded"],
  ["subagents", "Субагенты", "SubagentStarted / SubagentStatus"],
  ["services", "Сервисы", "ServiceHealth / ServiceChanged"],
];

const turnSamples = [
  ["channel:messenger", "ok", "933ms", ["messenger_send", "output_guard"]],
  ["vault_search", "warn", "2281ms", ["search_index", "evidence_fallback", "output_guard"]],
  ["memory_rollup", "ok", "3204ms", ["read_traces", "write_rollup", "doctor_check"]],
  ["ratchet_eval", "skip", "0ms", ["scheduler"]],
  ["tool_route", "ok", "1187ms", ["mcp_router", "tool_result", "output_guard"]],
];

const contextSourcePool = [
  ["dashboard-main-page-spec.md", "spec", 6200, 9400],
  ["unified-dashboard.md", "spec", 4800, 7600],
  ["traces.db summary", "trace", 2600, 7200],
  ["usage.jsonl", "usage", 1200, 3600],
  ["ratchet-journal.jsonl", "guard", 1800, 5200],
  ["doctor-status.json", "doctor", 420, 1400],
  ["pipeline-status.json", "pipeline", 480, 1600],
  ["health.status", "health", 240, 760],
  ["$AGENT_ROOT/.env redacted", "config", 180, 520],
];

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanTooltip(value) {
  return String(value || "")
    .split(/(?:^|\n)\s*(?:user\s*)?query\s*:/i)[0]
    .trim();
}

function toneClass(tone) {
  if (tone === "ok" || tone === "pass") return "ok";
  if (tone === "warn" || tone === "skip") return "warn";
  if (tone === "fail" || tone === "error") return "fail";
  return "";
}

function turnStepClass(status) {
  if (status === "skip") return "skip";
  if (status === "unknown") return "unknown";
  if (status === "fail" || status === "error") return "fail";
  return "ok";
}

function randomMs(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTokens(value) {
  const number = Number(value) || 0;
  if (number >= 1000000000) return `${(number / 1000000000).toFixed(2)}B`;
  if (number >= 1000000) return `${(number / 1000000).toFixed(2)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 1 : 2)}k`;
  return `${number}`;
}

function contextTone(totalTokens) {
  if (totalTokens > 90000) return "fail";
  if (totalTokens > 55000) return "warn";
  return "ok";
}

function statusPill(status) {
  const className = status === "pass" || status === "ok" ? "status-ok" : status === "fail" || status === "error" ? "status-fail" : status === "ignored" ? "" : "status-warn";
  return `<span class="status-pill ${className}">${status}</span>`;
}

function applyBranding() {
  const title = branding.productionTitle;
  qs("#dashboard-title").textContent = title;
  document.title = `Agent ${title}`;
}

function applyDashboardSummary(summary) {
  if (!summary || !summary.live) return false;
  const summaryKanbanHasTasks =
    summary.kanban &&
    Object.values(summary.kanban).some((column) => Array.isArray(column?.tasks) && column.tasks.length);
  [
    "passport",
    "verdict",
    "shiftSummary",
    "attention",
    "freshness",
    "operatorLog",
    "lastTurn",
    "memory",
    "memoryAnalysis",
    "kpis",
    "runs",
    "turns",
    "errors",
    "guards",
  ].forEach((key) => {
    if (summary[key] !== undefined) data[key] = summary[key];
  });
  if (summaryKanbanHasTasks) data.kanban = summary.kanban;
  if (Array.isArray(summary.events)) state.events = summary.events;
  state.liveData = true;
  return true;
}

function renderDashboard() {
  renderPassport();
  renderCommandSummary();
  renderKpis();
  renderSituationalBlocks();
  renderLastTurn();
  renderRuns();
  renderMemoryAnalysis();
  renderFootprintPanel();
  renderToolsPanel();
  renderTurns();
  renderShiftReasons();
  renderGuards();
  renderKanban();
}

async function refreshLiveSummary() {
  try {
    const response = await fetch("/api/dashboard/summary", { cache: "no-store" });
    if (!response.ok) throw new Error(`summary ${response.status}`);
    const summary = await response.json();
    if (!applyDashboardSummary(summary)) return false;
    renderDashboard();
    renderEvents();
    const feed = qs("#event-feed");
    if (feed && !state.pausedFeed) feed.scrollTop = feed.scrollHeight;
    return true;
  } catch (error) {
    console.warn("Live dashboard summary unavailable, using mock data", error);
    return false;
  }
}

function renderPassport() {
  qs("#passport-provider").textContent = data.passport.provider;
  qs("#passport-model").textContent = data.passport.model;
  qs("#passport-fallback").textContent = data.passport.fallback;
  qs("#passport-uptime").textContent = data.passport.uptime;
  qs("#passport-commit").textContent = data.passport.commit;
}

function setBandLabel(section, number, title, subtitle) {
  const label = section?.querySelector(".band-label");
  if (!label) return;
  label.innerHTML = `<span>${number}</span><strong>${title}</strong><em>${subtitle}</em>`;
}

function buildDashboardSections() {
  const actions = qs(".actions-band");
  const telemetry = qs(".telemetry-band");
  const stream = qs(".stream-band");
  const integrity = qs(".integrity-band");
  const handoff = qs(".handoff-band");
  if (!actions || actions.dataset.layoutVersion === "contract-v4") return;

  setBandLabel(actions, "02", "Conversation", "DialogSession · user / agent / turns");
  actions.setAttribute("aria-label", "Conversation");
  actions.innerHTML = `
    <div class="band-label"><span>02</span><strong>Conversation</strong><em>DialogSession · user / agent / turns</em></div>
    <div class="conversation-grid">
      <article class="panel operator-panel">
        <div class="panel-heading compact">
          <div><p class="eyebrow">DialogSession</p><h2>Ход диалога</h2></div>
        </div>
        <div id="operator-list" class="operator-list"></div>
      </article>
      <article class="panel slice-panel">
        <div class="panel-heading compact">
          <div><p class="eyebrow">Turns</p><h2>Последние циклы вопрос-ответ</h2></div>
          <span id="turn-count-label" class="status-pill">5</span>
        </div>
        <div id="turn-list" class="turn-list"></div>
      </article>
    </div>
  `;

  telemetry.setAttribute("aria-label", "Turns");
  telemetry.innerHTML = `
    <div class="band-label"><span>03</span><strong>Turns</strong><em>turns · daily activity</em></div>
    <div class="pipeline-grid">
      <section class="panel trace-panel">
        <div class="panel-heading">
          <div><p class="eyebrow">Активность</p><h2>Турны по дням</h2></div>
          <div class="panel-actions">
            <div class="trace-legend" aria-label="Легенда активности">
              <span class="legend-item"><i class="legend-dot neutral"></i>обычный день</span>
              <span class="legend-item"><i class="legend-dot warn"></i>были ошибки</span>
            </div>
            <span class="status-pill status-warn">14 дней</span>
          </div>
        </div>
        <div id="run-bars" class="run-bars" aria-label="Активность турнов по дням"></div>
      </section>
      <article class="panel footprint-panel">
        <div class="panel-heading compact">
          <div><p class="eyebrow">Context Footprint</p><h2>Что входит в input</h2></div>
        </div>
        <div id="footprint-list" class="footprint-list"></div>
      </article>
    </div>
  `;

  let tools = qs(".tools-band");
  if (!tools) {
    tools = document.createElement("section");
    tools.className = "deck-band tools-band";
    stream.before(tools);
  }
  tools.setAttribute("aria-label", "Tools");
  tools.innerHTML = `
    <div class="band-label"><span>04</span><strong>Tools</strong><em>diagnostics · tool calls · duration</em></div>
    <section class="panel tools-panel">
      <div class="panel-heading compact">
        <div><p class="eyebrow">Diagnostics</p><h2>Инструменты последнего turn</h2></div>
        <span id="tool-count-label" class="status-pill">0</span>
      </div>
      <div id="tool-list" class="tool-list"></div>
    </section>
  `;

  setBandLabel(stream, "05", "Живой поток", "SSE · DialogBus · raw event layer");


  handoff.setAttribute("aria-label", "Ops");
  handoff.innerHTML = `
    <div class="band-label"><span>07</span><strong>Ops</strong><em>work-items · services · data freshness</em></div>
    <div class="ops-final-grid">
      <article class="panel verdict-panel">
        <div class="verdict-status">
          <span id="verdict-status" class="status-pill status-warn">WARN</span>
          <span id="verdict-updated" class="muted">срез только что</span>
        </div>
        <h2 id="verdict-title"></h2>
        <p id="verdict-copy" class="verdict-copy"></p>
        <ul id="verdict-actions" class="verdict-actions"></ul>
      </article>
      <article class="panel attention-panel">
        <div class="panel-heading compact">
          <div><p class="eyebrow">Work Items</p><h2>Очередь действий</h2></div>
          <span id="attention-count" class="status-pill status-warn">0</span>
        </div>
        <div id="attention-list" class="attention-list"></div>
      </article>
      <article class="panel freshness-panel">
        <div class="panel-heading compact">
          <div><p class="eyebrow">Data Freshness</p><h2>Источники данных</h2></div>
        </div>
        <div id="freshness-list" class="freshness-list"></div>
      </article>
      <article class="panel errors-panel">
        <div class="panel-heading compact">
          <div><p class="eyebrow">Sources</p><h2>Причины внимания</h2></div>
        </div>
        <div id="error-list" class="error-list"></div>
      </article>
    </div>
  `;

  setBandLabel(actions, "02", "Conversation", "turns · question-answer cycles");
  qs(".operator-panel", actions)?.remove();
  if (qs(".conversation-grid", actions)) qs(".conversation-grid", actions).className = "single-panel-grid";

  setBandLabel(telemetry, "03", "Turns", "turns · daily activity");
  qs(".footprint-panel", telemetry)?.remove();
  if (qs(".pipeline-grid", telemetry)) qs(".pipeline-grid", telemetry).className = "single-panel-grid";

  qs(".tools-band")?.remove();
  let memoryBand = qs(".memory-band");
  if (!memoryBand) {
    memoryBand = document.createElement("section");
    memoryBand.className = "deck-band memory-band";
    stream.before(memoryBand);
  }
  memoryBand.setAttribute("aria-label", "Memory");
  memoryBand.innerHTML = `
    <div class="band-label"><span>04</span><strong>Memory</strong><em>core / summaries / vault quality / task links</em></div>
    <section class="panel memory-analysis-panel">
      <div id="memory-analysis-grid" class="memory-analysis-grid"></div>
    </section>
  `;
  setBandLabel(stream, "05", "Live", "SSE / DialogBus / raw event layer");

  integrity?.remove();

  setBandLabel(handoff, "06", "Ops", "services / data freshness");
  qs(".verdict-panel", handoff)?.remove();
  qs(".attention-panel", handoff)?.remove();
  qs(".errors-panel", handoff)?.remove();
  if (qs(".ops-final-grid", handoff)) qs(".ops-final-grid", handoff).className = "single-panel-grid";

  actions.dataset.layoutVersion = "contract-v4";
  actions.dataset.layoutVersion = "contract-v4";
}

function renderCommandSummary() {
  const shift = data.shiftSummary || {};
  if (qs("#verdict-title")) qs("#verdict-title").textContent = shift.title || data.verdict.title;
  if (qs("#verdict-copy")) qs("#verdict-copy").textContent = shift.copy || data.verdict.copy;
  if (qs("#verdict-updated")) qs("#verdict-updated").textContent = data.verdict.updated;
  if (qs("#verdict-status")) {
    const status = shift.status || "warn";
    qs("#verdict-status").textContent = String(status).toUpperCase();
    qs("#verdict-status").className = `status-pill status-${toneClass(status)}`;
  }
  if (qs("#verdict-actions")) {
    qs("#verdict-actions").innerHTML = (shift.actions || [])
      .map((action) => `<li>${action}</li>`)
      .join("");
  }
  if (qs("#attention-count")) qs("#attention-count").textContent = data.attention.length;
  if (qs("#attention-list")) qs("#attention-list").innerHTML = data.attention
      .map(
        ([tone, title, detail]) => `
          <article class="attention-row ${toneClass(tone)}">
            <i class="dot ${toneClass(tone)}"></i>
            <div>
              <strong>${title}</strong>
              <span>${detail}</span>
            </div>
          </article>
        `,
      )
      .join("");
  if (qs("#freshness-list")) qs("#freshness-list").innerHTML = data.freshness
    .map(
      ([source, age, tone, detail]) => `
        <article class="freshness-row" title="${escapeHtml(detail || "")}">
          <span>${source}</span>
          <strong class="${toneClass(tone)}">${age}</strong>
        </article>
      `,
    )
    .join("");
}

function renderSituationalBlocks() {
  if (qs("#operator-list")) qs("#operator-list").innerHTML = data.operatorLog
    .map(
      ([time, topic, note]) => `
        <article class="operator-row">
          <span>${time}</span>
          <strong>${topic}</strong>
          <p>${note}</p>
        </article>
      `,
    )
    .join("");
  if (qs("#memory-grid")) qs("#memory-grid").innerHTML = data.memory
    .map(
      ([label, value, tone, title]) => `
        <article class="mini-metric ${toneClass(tone)}" title="${title}">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");
  if (qs("#kanban-summary")) renderKanbanSummary();
}

function metricTone(tone) {
  return toneClass(tone || "ok");
}

function renderMemoryAnalysis() {
  const root = qs("#memory-analysis-grid");
  if (!root) return;
  const memory = data.memoryAnalysis;
  if (!memory) {
    root.innerHTML = `<p class="muted">memory analysis unavailable</p>`;
    return;
  }
  const core = memory.core || {};
  const quality = memory.quality || {};
  const hygiene = memory.hygiene || {};
  const summaries = memory.summaries || [];
  const summaryStatusLabel = (item) =>
    item.status === "ok" ? "fresh" : item.status === "warn" ? "stale" : "missing";
  root.innerHTML = `
    <article class="memory-card ${metricTone(core.tone)}">
      <div class="memory-card-head">
        <span>Core</span>
        ${statusPill(core.tone || "ok")}
      </div>
      <strong>${core.size || 0}/${core.cap || 0}</strong>
      <p>doctor ${core.score || 0} / ${core.trend || "unknown"} / ${core.percent || 0}% / issues ${core.issues || 0}</p>
    </article>

    <article class="memory-card">
      <div class="memory-card-head">
        <span>Summaries</span>
        <em>rollups</em>
      </div>
      <div class="summary-strip">
        ${summaries
          .map(
            (item) => `
              <span class="${metricTone(item.status)}" title="${escapeHtml(item.file || "")}">
                <b>${escapeHtml(item.label)}</b>
                <strong>${escapeHtml(summaryStatusLabel(item))}</strong>
                <em>${escapeHtml(item.age || "missing")}</em>
              </span>
            `,
          )
          .join("")}
      </div>
    </article>

    <article class="memory-card">
      <div class="memory-card-head">
        <span>Vault Quality</span>
        <em>${escapeHtml(quality.source || "")}</em>
      </div>
      <div class="memory-metric-grid">
        <span><b>${quality.files || 0}</b><em>md files</em></span>
        <span><b>${quality.mb || 0} MB</b><em>size</em></span>
        <span class="${quality.brokenLinks ? "fail" : "ok"}"><b>${quality.brokenLinks || 0}</b><em>broken links</em></span>
        <span class="${quality.orphans ? "warn" : "ok"}"><b>${quality.orphans || 0}</b><em>orphans</em></span>
        <span class="${quality.duplicates ? "warn" : "ok"}"><b>${quality.duplicates || 0}</b><em>duplicate titles</em></span>
        <span class="${quality.stale30 ? "warn" : "ok"}"><b>${quality.stale30 || 0}</b><em>stale &gt;30d</em></span>
      </div>
    </article>

    <article class="memory-card">
      <div class="memory-card-head">
        <span>Task Links</span>
        <em>tasks / vault refs</em>
      </div>
      <div class="memory-metric-grid compact">
        <span><b>${hygiene.tasksWithVaultRefs || 0}/${hygiene.tasksTotal || 0}</b><em>tasks linked</em></span>
        <span class="${hygiene.vaultRefPercent >= 20 ? "ok" : "warn"}"><b>${hygiene.vaultRefPercent || 0}%</b><em>memory coverage</em></span>
        <span class="${hygiene.changedToday ? "ok" : "warn"}"><b>${hygiene.changedToday || 0}</b><em>changed today</em></span>
        <span class="${hygiene.stale30 ? "warn" : "ok"}"><b>${hygiene.stale30 || 0}</b><em>stale notes</em></span>
      </div>
    </article>
  `;
}

function renderFootprintPanel() {
  const list = qs("#footprint-list");
  if (!list) return;
  const context = data.lastTurn?.context || {};
  const sources = context.sources || [];
  const topSources = sources.slice(0, 12);
  const maxTokens = Math.max(1, ...topSources.map((source) => Number(source[2]) || 0));
  list.innerHTML = topSources.length
    ? topSources
        .map(
          ([name, type, tokens, detail]) => `
            <article class="footprint-row" title="${escapeHtml(detail || "")}">
              <span>${escapeHtml(name)}</span>
              <em>${escapeHtml(type)}</em>
              <strong>${formatTokens(tokens)}</strong>
              <i><b style="width:${Math.max(6, Math.round(((Number(tokens) || 0) / maxTokens) * 100))}%"></b></i>
            </article>
          `,
        )
        .join("")
    : `<p class="muted">context-footprint.jsonl пока не дал breakdown для этого turn.</p>`;
}

function renderToolsPanel() {
  const list = qs("#tool-list");
  if (!list) return;
  const diagnostics = data.lastTurn?.context?.diagnostics || { total: 0, tools: [] };
  const tools = diagnostics.tools || [];
  const countLabel = qs("#tool-count-label");
  if (countLabel) countLabel.textContent = `${diagnostics.total || 0}`;
  list.innerHTML = tools.length
    ? tools
        .map(
          (tool) => `
            <article class="tool-row">
              <strong>${escapeHtml(tool.tool)}</strong>
              <span>${tool.count} calls</span>
              <em>${tool.ok} ok · ${tool.fail} fail · ${tool.durationMs}ms</em>
            </article>
          `,
        )
        .join("")
    : `<p class="muted">diagnostics jsonl пока не содержит tool calls для этого turn.</p>`;
}

function renderLastTurn() {
  const turn = data.lastTurn;
  const context = turn.context || { inputTokens: 0, outputTokens: 0, cachedTokens: 0, cost: "n/a", sources: [] };
  const sources = context.sources?.length ? context.sources : [["no context sources", "unknown", 1]];
  const defaultContext = turn.defaultContext || [];
  const defaultContextSummary = turn.defaultContextSummary || null;
  const run = turn.run || null;
  const conversation = turn.conversation || {};
  const diagnostics = context.diagnostics || { total: 0, tools: [] };
  const totalTokens = (Number(context.inputTokens) || 0) + (Number(context.outputTokens) || 0);
  const maxSourceTokens = Math.max(1, ...sources.map((source) => Number(source[2]) || 0));
  qs(".last-turn-strip-main span:first-child").textContent = turn.label || "Last Pipeline";
  qs("#last-turn-inline").textContent = `${turn.time} · ${turn.intent} · ${turn.duration}`;
  qs("#last-turn-status").textContent = turn.status.toUpperCase();
  qs("#last-turn-status").className = `status-pill status-${toneClass(turn.status) || "ok"}`;
  qs("#last-turn-card").innerHTML = `
    <code>${turn.runId}</code>
    <div class="turn-dialog">
      <article>
        <span>User</span>
        <p>${escapeHtml(conversation.userQuery || "not recorded in traces.db")}</p>
      </article>
      <article>
        <span>Agent</span>
        <p>${escapeHtml(conversation.agentResponse || "response unavailable in traces.db")}</p>
      </article>
    </div>
    <div class="turn-step-chain">
      ${(turn.steps || [])
        .map(
          ([step, status, durationMs, title]) => `
            <button class="turn-step ${turnStepClass(status)}" type="button" title="${escapeHtml(cleanTooltip(title))}">
              <span>${step}</span>
              <b>${durationMs ? `${durationMs}ms` : status === "unknown" ? "no trace" : status === "fail" ? "missing" : status === "skip" ? "skip" : "ok"}</b>
            </button>
          `,
        )
        .join("")}
    </div>
    <div class="last-turn-tools">
      ${(turn.tools || []).map((tool) => `<span>${tool}</span>`).join("")}
    </div>
    ${
      run
        ? `<div class="run-summary">
            <article><span>run window</span><strong>${run.first} → ${run.last}</strong></article>
            <article><span>turns</span><strong>${run.turns.length}</strong></article>
            <article><span>model</span><strong>${run.model}</strong></article>
            <div class="run-turns">
              ${run.turns
                .map(
                  (item) => `
                    <span title="${formatTokens(item.input)} input · ${formatTokens(item.output)} output · ${formatTokens(item.cacheRead)} cache">${item.id}<b>${item.steps}</b></span>
                  `,
                )
                .join("")}
            </div>
          </div>`
        : ""
    }
    <div class="turn-context" aria-label="Контекст последнего турна">
      <div class="turn-context-head">
        <span>TURN Usage</span>
        <strong class="${contextTone(totalTokens)}">total ${formatTokens(totalTokens)} tokens</strong>
      </div>
      <div class="turn-context-metrics">
        <article>
          <span>input</span>
          <strong>${formatTokens(context.inputTokens)}</strong>
        </article>
        <article>
          <span>output</span>
          <strong>${formatTokens(context.outputTokens)}</strong>
        </article>
        <article>
          <span>cached</span>
          <strong>${formatTokens(context.cachedTokens)}</strong>
        </article>
        <article>
          <span>records</span>
          <strong>${context.records ?? sources.length}</strong>
        </article>
        <article>
          <span>model steps</span>
          <strong>${context.modelSteps ?? context.records ?? 0}</strong>
        </article>
      </div>
      <div class="turn-source-list">
        ${sources
          .slice(0, 10)
          .map(
            ([name, type, tokens, detail]) => `
              <article class="turn-source-row" title="${escapeHtml(cleanTooltip(detail || `${name}: ${tokens} tokens`))}">
                <span>${escapeHtml(name)}</span>
                <em>${escapeHtml(type)}</em>
                <strong>${formatTokens(tokens)}</strong>
                <i><b style="width:${Math.max(8, Math.round((tokens / maxSourceTokens) * 100))}%"></b></i>
              </article>
            `,
          )
          .join("")}
      </div>
      ${
        diagnostics.total
          ? `<div class="turn-diagnostics">
              <span>diagnostics</span>
              <strong>${diagnostics.total} tool calls</strong>
              <div>
                ${(diagnostics.tools || [])
                  .map((tool) => `<em title="${tool.ok} ok · ${tool.fail} fail · ${tool.durationMs}ms">${escapeHtml(tool.tool)} ×${tool.count}</em>`)
                  .join("")}
              </div>
            </div>`
          : ""
      }
    </div>
  `;
}

function createTurnContext(intent, status, tools) {
  const sourceCount = status === "skip" ? randomMs(2, 4) : randomMs(4, 7);
  const sources = contextSourcePool
    .map(([name, type, min, max]) => [name, type, randomMs(min, max)])
    .sort(() => Math.random() - 0.5)
    .slice(0, sourceCount)
    .sort((a, b) => b[2] - a[2]);
  if (intent === "dashboard_main_page" && !sources.some((source) => source[0] === "dashboard-main-page-spec.md")) {
    sources.unshift(["dashboard-main-page-spec.md", "spec", randomMs(7200, 9600)]);
  }
  const sourceTokens = sources.reduce((sum, source) => sum + source[2], 0);
  const toolOverhead = tools.length * randomMs(420, 900);
  const inputTokens = sourceTokens + toolOverhead + randomMs(1800, status === "skip" ? 4200 : 9000);
  const outputTokens = status === "skip" ? randomMs(280, 900) : randomMs(1200, 4200);
  const cachedTokens = Math.round(inputTokens * (status === "ok" ? 0.28 : 0.16));
  const cost = `$${((inputTokens * 0.00000032) + (outputTokens * 0.0000011)).toFixed(3)}`;
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    cost,
    sources,
  };
}

function createMockTurn() {
  const sample = turnSamples[Math.floor(Math.random() * turnSamples.length)];
  const [intent, status, duration, tools] = sample;
  const isWarn = status === "warn";
  const isSkip = status === "skip";
  return {
    time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    runId: `wrun_${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    intent,
    status,
    duration,
    tools,
    context: createTurnContext(intent, status, tools),
    steps: [
      ["classify", "ok", randomMs(8, 22), `intent=${intent}`],
      ["preflight", isSkip ? "skip" : "ok", isSkip ? 0 : randomMs(12, 40), isSkip ? "manual/scheduled skip" : "checks passed"],
      ["evidence", isWarn ? "warn" : isSkip ? "skip" : "ok", isSkip ? 0 : randomMs(48, 240), isWarn ? "fallback used" : "source selected"],
      ["synthetic", "skip", 0, "not needed"],
      ["skill-triggers", isSkip ? "skip" : "ok", isSkip ? 0 : randomMs(9, 32), "matched local rules"],
      ["mcp-router", tools.some((tool) => tool.includes("mcp")) ? "ok" : "skip", tools.some((tool) => tool.includes("mcp")) ? randomMs(16, 55) : 0, "tool route"],
      ["scheduler", isSkip ? "skip" : "ok", isSkip ? 0 : randomMs(6, 28), isSkip ? "no run" : "scheduled state updated"],
      ["steering", "ok", randomMs(12, 38), "response shaped"],
      ["output-guard", status === "ok" || status === "warn" ? "ok" : "skip", status === "ok" || status === "warn" ? randomMs(10, 34) : 0, "final check"],
    ],
  };
}

function advanceLastTurn() {
  data.lastTurn = createMockTurn();
  data.operatorLog.unshift([data.lastTurn.time, data.lastTurn.intent, `${data.lastTurn.status}: ${data.lastTurn.tools.join(", ")}`]);
  data.operatorLog = data.operatorLog.slice(0, 4);
  renderLastTurn();
  renderSituationalBlocks();
}

function refreshSummaryMock() {
  const doctor = 80 + Math.random() * 3;
  const tokens = 2.9 + Math.random() * 0.35;
  data.kpis[1].detail = `daily rollup ${Math.floor(Math.random() * 8 + 1)}m назад`;
  data.kpis[2].value = `${doctor.toFixed(1)} ↓`;
  data.kpis[3].value = `${tokens.toFixed(2)}M`;
  data.verdict.updated = "срез только что";
  data.freshness = data.freshness.map(([source, age, tone]) => {
    if (source === "traces.db") return [source, "live", "ok"];
    if (source === "ratchet-journal") return [source, "10 дней", "fail"];
    return [source, `${Math.floor(Math.random() * 9 + 1)} мин`, tone === "fail" ? "warn" : tone];
  });
  renderKpis();
  renderCommandSummary();
}

function renderKpis() {
  qs("#kpi-grid").innerHTML = data.kpis
    .map(
      (kpi, index) => `
        <article class="kpi-card ${index === 0 ? "kpi-primary" : index < 3 ? "kpi-secondary" : ""}">
          <div class="kpi-label">
            <span>${kpi.label}</span>
            <i class="dot ${toneClass(kpi.tone)}"></i>
          </div>
          <div class="kpi-value">${kpi.value}</div>
          <div class="meter"><span class="${toneClass(kpi.tone)}" style="width:${kpi.progress}%"></span></div>
          <p class="kpi-detail">${kpi.detail}</p>
        </article>
      `,
    )
    .join("");
}

function renderKanbanSummary() {
  const entries = Object.entries(data.kanban);
  const total = entries.reduce((sum, [, column]) => sum + column.tasks.length, 0);
  const blocked = data.kanban.blocked?.tasks.length || 0;
  qs("#kanban-summary").innerHTML = `
    <div class="kanban-total">
      <strong>${total}</strong>
      <span>активных карточек</span>
    </div>
    <div class="kanban-counts">
      ${entries
        .map(
          ([status, column]) => `
            <span class="${status === "blocked" ? "status-fail" : ""}">${column.title}: ${column.tasks.length}</span>
          `,
        )
        .join("")}
    </div>
    ${blocked ? `<p class="blocked-note">Blocked попадает в "Требует внимания" автоматически.</p>` : ""}
  `;
}

function renderRuns() {
  const runs = data.runs?.length ? data.runs : [["--.--", 0, false]];
  const max = Math.max(1, ...runs.map((run) => run[1]));
  qs("#run-bars").innerHTML = runs
    .map(([label, value, hasError]) => {
      const height = Math.max(10, Math.round((value / max) * 112));
      return `
        <div class="bar-wrap" title="${label}: ${value} ходов">
          <span class="bar-value">${value}</span>
          <div class="bar ${hasError ? "has-error" : ""}" style="height:${height}px"></div>
          <span class="bar-label">${label}</span>
        </div>
      `;
    })
    .join("");
}

function formatStepStatusText(value) {
  return escapeHtml(value).replace(
    /\b(ok|skip|fail|error|warn)\b/gi,
    (match) => `<span class="step-status-word ${toneClass(match.toLowerCase())}">${match}</span>`,
  );
}

function renderTurns() {
  const turns = data.turns || [];
  const visibleTurns = turns.slice(0, 5);
  const hiddenTurns = turns.slice(5);
  const renderTurn = (turn) => `
        <article class="turn-row">
          <button class="turn-button" type="button">
            <span>${turn.time}</span>
            <strong>${turn.intent}</strong>
            ${statusPill(turn.status)}
            <span class="muted">${turn.duration}</span>
          </button>
          <div class="row-detail">${formatStepStatusText(turn.steps)}</div>
        </article>
      `;
  qs("#turn-list").innerHTML = `
    ${visibleTurns.map(renderTurn).join("")}
    ${
      hiddenTurns.length
        ? `<details class="turn-archive">
            <summary>Показать ещё ${hiddenTurns.length}</summary>
            ${hiddenTurns.map(renderTurn).join("")}
          </details>`
        : ""
    }
  `;
  if (qs("#turn-count-label")) qs("#turn-count-label").textContent = turns.length > 5 ? `5 из ${turns.length}` : `${turns.length}`;
}

function renderErrors() {
  qs("#error-list").innerHTML = data.errors
    .map(
      ([time, project, step, message, status]) => `
        <article class="error-row">
          <span class="muted">${time} · ${project}</span>
          <strong>${step}: ${message}</strong>
          ${statusPill(status === "актуальна" ? "error" : "skip")}
        </article>
      `,
    )
    .join("");
}

function renderShiftReasons() {
  if (!qs("#error-list")) return;
  qs("#error-list").innerHTML = (data.errors || [])
    .map(([time, source, tone, message, action]) => {
      const normalizedTone = toneClass(tone);
      return `
        <article class="error-row ${normalizedTone}">
          <span class="muted">${time} · ${source}</span>
          <strong>${message}</strong>
          <p>${action || "Проверить источник и обновить срез."}</p>
          ${statusPill(tone)}
        </article>
      `;
    })
    .join("");
}

function renderGuards() {
  const score = qs("#guard-score");
  const grid = qs("#guard-grid");
  if (!score || !grid) return;
  const activeGuards = data.guards.filter((guard) => guard[1] !== "ignored");
  const passCount = activeGuards.filter((guard) => guard[1] === "pass").length;
  score.textContent = `${Math.round((passCount / Math.max(1, activeGuards.length)) * 100)}% PASS`;
  grid.innerHTML = data.guards
    .map(
      ([name, status, title]) => `
        <article class="guard-card" title="${title}">
          <strong>${name}</strong>
          <span>${status === "ignored" ? "retired / ignored" : status === "pass" ? "last_result PASS" : "last_result FAIL"}</span>
          ${statusPill(status)}
        </article>
      `,
    )
    .join("");
}

const kanbanColumnOrder = ["backlog", "plan", "progress", "review", "done"];
const kanbanStageLabels = {
  backlog: "Backlog",
  plan: "Plan",
  progress: "In Progress",
  review: "Review",
  done: "Done",
  archive: "Archive",
};
const kanbanStatusOptions = [...kanbanColumnOrder, "archive"];
const kanbanInitialVisible = { backlog: 8, plan: 8, progress: 8, review: 8, done: 8 };
const kanbanWipLimits = { plan: 4, progress: 2, review: 2 };
const kanbanProjectFilters = ["one", "three", "seven", "six", "two", "four", "five"];
const kanbanFieldLabels = { description: "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435", due: "\u0421\u0440\u043e\u043a", tags: "\u0422\u0435\u0433\u0438", parent: "\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c" };

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function normalizePriority(priority) {
  if (priority === "med") return "mid";
  return ["high", "mid", "low"].includes(priority) ? priority : "mid";
}

function dbPriorityFromUi(priority) {
  return normalizePriority(priority) === "mid" ? "med" : normalizePriority(priority);
}

function normalizeTask(task, status) {
  if (Array.isArray(task)) {
    return {
      id: String(task[0]),
      title: task[1] || "Untitled task",
      description: task[3] || "",
      priority: normalizePriority(task[2] || "mid"),
      project: task[4] || "one",
      tags: Array.isArray(task[5]) ? task[5] : [],
      refs: Array.isArray(task[6]) ? task[6] : [],
      due: task[7] || "",
      parent: task[8] || "",
      status,
      blocked: false,
    };
  }
  return {
    id: String(task.id || task.taskId || "T-???"),
    title: task.title || task.text || "Untitled task",
    description: task.description || "",
    priority: normalizePriority(task.priority || "mid"),
    project: task.project || task.project_id || "one",
    tags: Array.isArray(task.tags) ? task.tags : parseJsonArray(task.tags),
    refs: Array.isArray(task.refs) ? task.refs : Array.isArray(task.vault_refs) ? task.vault_refs : parseJsonArray(task.vault_refs),
    due: task.due || "",
    parent: task.parent || task.parent_id || "",
    status,
    blocked: task.status === "blocked" || task.blocked === true,
  };
}

function allKanbanTasks() {
  return kanbanColumnOrder.flatMap((status) => ((data.kanban[status] || {}).tasks || []).map((task) => normalizeTask(task, status)));
}

function ensureKanbanFilterDefaults() {
  for (const status of kanbanColumnOrder) {
    if (state.kanbanFilters.stages[status] === undefined) state.kanbanFilters.stages[status] = true;
  }
  for (const project of kanbanProjectFilters) {
    if (state.kanbanFilters.projects[project] === undefined) state.kanbanFilters.projects[project] = true;
  }
  for (const task of allKanbanTasks()) {
    if (state.kanbanFilters.projects[task.project] === undefined) state.kanbanFilters.projects[task.project] = true;
  }
}

function taskMatchesKanbanFilters(task) {
  const search = state.kanbanFilters.search.trim().toLowerCase();
  const tag = state.kanbanFilters.tag.trim().toLowerCase();
  const haystack = [task.id, task.title, task.description, task.project, ...task.tags].join(" ").toLowerCase();
  if (state.kanbanFilters.stages[task.status] === false) return false;
  if (state.kanbanFilters.projects[task.project] === false) return false;
  if (search && !haystack.includes(search)) return false;
  if (tag && !task.tags.some((item) => item.toLowerCase().includes(tag))) return false;
  return true;
}

function renderToggle(group, value, label, checked) {
  return `<button class="kanban-chip ${checked ? "is-active" : ""}" type="button" data-toggle-group="${group}" data-toggle-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

function renderKanbanControls() {
  const projectRoot = qs("#kanban-project-filters");
  const stageRoot = qs("#kanban-stage-filters");
  const fieldsRoot = qs("#kanban-field-toggles");
  if (!projectRoot || !stageRoot || !fieldsRoot) return;
  ensureKanbanFilterDefaults();
  const projects = [...new Set([...kanbanProjectFilters, ...allKanbanTasks().map((task) => task.project)])].sort();
  projectRoot.innerHTML = projects.map((project) => renderToggle("project", project, project, state.kanbanFilters.projects[project] !== false)).join("");
  stageRoot.innerHTML = kanbanColumnOrder.map((status) => renderToggle("stage", status, kanbanStageLabels[status], state.kanbanFilters.stages[status] !== false)).join("");
  fieldsRoot.innerHTML = Object.entries(kanbanFieldLabels).map(([field, label]) => renderToggle("field", field, label, state.kanbanFields[field])).join("");
}

function renderKanbanStats() {
  const root = qs("#kanban-stats");
  if (!root) return;
  const tasks = allKanbanTasks();
  const visible = tasks.filter(taskMatchesKanbanFilters);
  const high = visible.filter((task) => task.priority === "high").length;
  const blocked = visible.filter((task) => task.blocked).length;
  root.innerHTML = `<span><strong>${visible.length}</strong> visible</span><span><strong>${tasks.length}</strong> total</span><span class="${high ? "status-warn" : ""}"><strong>${high}</strong> high</span><span class="${blocked ? "status-fail" : ""}"><strong>${blocked}</strong> blocked</span>`;
}

function renderKanban() {
  ensureKanbanFilterDefaults();
  renderKanbanControls();
  qs("#kanban-board").innerHTML = kanbanColumnOrder.map((status) => {
    const column = data.kanban[status] || { title: kanbanStageLabels[status], tasks: [] };
    const tasks = (column.tasks || []).map((task) => normalizeTask(task, status));
    const visibleTasks = tasks.filter(taskMatchesKanbanFilters);
    const visibleLimit = state.kanbanVisibleLimit[status] || kanbanInitialVisible[status] || 8;
    const shownTasks = visibleTasks.slice(0, visibleLimit);
    const hiddenCount = Math.max(0, visibleTasks.length - shownTasks.length);
    const wipLimit = kanbanWipLimits[status];
    const isOverLimit = wipLimit && tasks.length > wipLimit;
    return `<article class="kanban-column ${isOverLimit ? "is-over-limit" : ""}" data-status="${status}">
      <div class="column-title"><div><span>${escapeHtml(column.title || kanbanStageLabels[status])}</span>${wipLimit ? `<em>WIP ${tasks.length}/${wipLimit}</em>` : `<em>${status === "backlog" ? "commitment point" : status === "done" ? "delivery point" : "flow step"}</em>`}</div><span class="status-pill ${isOverLimit ? "status-warn" : ""}">${visibleTasks.length}/${tasks.length}</span></div>
      <div class="card-list" data-status="${status}">${shownTasks.length ? shownTasks.map(renderTaskCard).join("") : `<div class="kanban-empty">\u041d\u0435\u0442 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a</div>`}</div>
      ${hiddenCount ? `<button class="kanban-more" type="button" data-kanban-show-more="${status}">\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0435\u0449\u0435 ${hiddenCount}</button>` : ""}
    </article>`;
  }).join("");
  renderKanbanStats();
}

function renderTaskCard(task) {
  return `<article class="task-card ${task.blocked ? "is-blocked" : ""}" draggable="true" data-task-id="${escapeHtml(task.id)}" tabindex="0">
    <div class="task-meta"><span class="task-id-cluster"><button class="task-id-button" type="button" data-task-detail="${escapeHtml(task.id)}">#${escapeHtml(task.id)}</button><span class="priority-dot priority-${escapeHtml(task.priority)}" title="${escapeHtml(task.priority)}"></span></span><span class="task-project">${escapeHtml(task.project)}</span></div>
    <p class="task-title">${escapeHtml(task.title)}</p>
    ${state.kanbanFields.description && task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ""}
    ${state.kanbanFields.due && task.due ? `<p class="task-description">due: ${escapeHtml(task.due)}</p>` : ""}
    ${state.kanbanFields.tags && task.tags.length ? `<div class="task-tags">${task.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    ${state.kanbanFields.parent && task.parent ? `<p class="task-description">parent: ${escapeHtml(task.parent)}</p>` : ""}
  </article>`;
}

function renderTaskDetail(task) {
  const priorityOptions = [
    ["high", "high"],
    ["med", "mid"],
    ["low", "low"],
  ];
  return `<form id="task-detail-form" class="task-detail-form" data-task-id="${escapeHtml(task.id)}">
    <div class="task-detail-grid">
      <label><span>ID</span><input name="id" value="#${escapeHtml(task.id)}" readonly></label>
      <label><span>\u041f\u0440\u043e\u0435\u043a\u0442</span><input name="project" value="${escapeHtml(task.project)}" autocomplete="off"></label>
      <label><span>\u0421\u0442\u0430\u0442\u0443\u0441</span><select name="column">${kanbanStatusOptions.map((status) => `<option value="${status}" ${task.status === status ? "selected" : ""}>${escapeHtml(kanbanStageLabels[status])}</option>`).join("")}</select></label>
      <label><span>\u041f\u0440\u0438\u043e\u0440\u0438\u0442\u0435\u0442</span><select name="priority">${priorityOptions.map(([value, label]) => `<option value="${value}" ${dbPriorityFromUi(task.priority) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label><span>\u0421\u0440\u043e\u043a</span><input name="due" value="${escapeHtml(task.due)}" placeholder="YYYY-MM-DD" autocomplete="off"></label>
      <label><span>\u0420\u043e\u0434\u0438\u0442\u0435\u043b\u044c</span><input name="parent" value="${escapeHtml(task.parent)}" autocomplete="off"></label>
    </div>
    <label class="task-detail-wide"><span>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</span><input name="title" value="${escapeHtml(task.title)}" autocomplete="off" required></label>
    <label class="task-detail-wide"><span>\u0422\u0435\u0433\u0438</span><input name="tags" value="${escapeHtml(task.tags.join(", "))}" placeholder="kanban, four, review" autocomplete="off"></label>
    <label class="task-detail-wide"><span>\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435</span><textarea name="description" rows="5">${escapeHtml(task.description)}</textarea></label>
    ${task.refs.length ? `<section class="task-detail-wide"><span>Vault refs</span><div class="task-refs">${task.refs.map((ref) => `<span>${escapeHtml(ref)}</span>`).join("")}</div></section>` : ""}
    <div class="task-detail-actions"><span class="task-detail-save-state" aria-live="polite"></span><button class="task-detail-save" type="submit">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c</button></div>
  </form>`;
}

function findTask(taskId) {
  for (const status of kanbanColumnOrder) {
    const column = data.kanban[status];
    const index = column?.tasks.findIndex((task) => normalizeTask(task, status).id === taskId) ?? -1;
    if (index !== -1) return { status, index, task: column.tasks[index], normalized: normalizeTask(column.tasks[index], status) };
  }
  return null;
}

function splitTags(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function applyColumnTags(tags, column) {
  const next = tags.filter((tag) => !["plan", "review"].includes(tag.toLowerCase()));
  if (column === "plan" && !next.includes("plan")) next.push("plan");
  if (column === "review" && !next.includes("review")) next.push("review");
  return next;
}

function columnToDbStatus(column) {
  if (column === "archive") return "archived";
  if (column === "done") return "done";
  if (column === "progress" || column === "review") return "in_progress";
  return "active";
}

async function postJson(url, payload) {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) return { ok: false, error: result.error || `${response.status}` };
    return result;
  } catch (error) {
    console.warn(`POST ${url} unavailable`, error);
    return { ok: false, offline: true };
  }
}

async function saveTaskDetail(form) {
  const getField = (name) => form.querySelector(`[name="${name}"]`);
  const column = getField("column").value;
  const payload = {
    id: form.dataset.taskId,
    title: getField("title").value.trim(),
    project: getField("project").value.trim() || "one",
    column,
    status: columnToDbStatus(column),
    priority: dbPriorityFromUi(getField("priority").value),
    due: getField("due").value.trim(),
    parent: getField("parent").value.trim(),
    tags: applyColumnTags(splitTags(getField("tags").value), column),
    description: getField("description").value.trim(),
  };
  const stateNode = qs(".task-detail-save-state", form);
  if (stateNode) stateNode.textContent = "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u044e...";
  const result = await postJson("/api/tasks/update", payload);
  if (!result.ok && !result.offline) {
    if (stateNode) stateNode.textContent = result.error || "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c";
    return;
  }
  const current = findTask(payload.id);
  if (current) data.kanban[current.status].tasks.splice(current.index, 1);
  if (payload.column !== "archive" && data.kanban[payload.column]) data.kanban[payload.column].tasks.unshift({ id: payload.id, ...payload, refs: [] });
  renderKanban();
  renderKanbanSummary();
  if (payload.column === "archive") closeTaskDetail();
  else openTaskDetail(payload.id);
  const reopenedForm = qs("#task-detail-form");
  if (reopenedForm) qs(".task-detail-save-state", reopenedForm).textContent = result.offline ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e" : "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e";
}

function openTaskDetail(taskId) {
  const found = findTask(taskId);
  if (!found) return;
  const task = found.normalized;
  const modal = qs("#task-detail-modal");
  if (!modal) return;
  qs("#task-detail-kicker").textContent = `${task.project} \u00b7 ${kanbanStageLabels[task.status] || task.status}`;
  qs("#task-detail-title").textContent = task.title;
  qs("#task-detail-body").innerHTML = renderTaskDetail(task);
  modal.hidden = false;
}

function closeTaskDetail() {
  const modal = qs("#task-detail-modal");
  if (modal) modal.hidden = true;
}

async function moveTask(taskId, toStatus, beforeTaskId = null, movedBy = "human") {
  const current = findTask(taskId);
  if (!current || !data.kanban[toStatus]) return;
  const [task] = data.kanban[current.status].tasks.splice(current.index, 1);
  const targetTasks = data.kanban[toStatus].tasks;
  const targetIndex = beforeTaskId ? targetTasks.findIndex((candidate) => normalizeTask(candidate, toStatus).id === beforeTaskId) : -1;
  const newIndex = targetIndex >= 0 ? targetIndex : targetTasks.length;
  targetTasks.splice(newIndex, 0, task);
  const normalized = normalizeTask(task, toStatus);
  task.status = columnToDbStatus(toStatus);
  task.tags = applyColumnTags(normalized.tags, toStatus);
  await postJson("/api/tasks/move", { id: taskId, status: columnToDbStatus(toStatus), column: toStatus, index: newIndex, movedBy });
  renderKanban();
  renderKanbanSummary();
}

const planStatusLabels = {
  all: "All",
  active: "Active",
  draft: "Draft",
  attention: "Attention",
  reference: "Reference",
  archive: "Archive",
};
function planStatusTone(status) {
  if (status === "active") return "ok";
  if (status === "attention") return "warn";
  if (status === "archive") return "";
  return "neutral";
}

const editablePlanStatuses = ["active", "draft", "attention", "reference", "archive"];

function applyPlanStatusToContent(content, status) {
  const value = editablePlanStatuses.includes(status) ? status : "draft";
  const text = String(content || "");
  if (/^---\s*\r?\n/.test(text)) {
    const end = text.search(/\r?\n---\s*\r?\n/);
    if (end > 0) {
      const frontmatter = text.slice(0, end);
      const rest = text.slice(end);
      if (/^status\s*:/im.test(frontmatter)) {
        return frontmatter.replace(/^status\s*:.*$/im, `status: ${value}`) + rest;
      }
      return `${frontmatter}\nstatus: ${value}${rest}`;
    }
  }
  if (/^status\s*:/im.test(text)) {
    return text.replace(/^status\s*:.*$/im, `status: ${value}`);
  }
  return `---\nstatus: ${value}\n---\n\n${text}`;
}

function planMatchesFilters(plan) {
  const search = state.planFilters.search.trim().toLowerCase();
  const haystack = [plan.title, plan.summary, plan.fileName, plan.content, ...(plan.tags || [])].join(" ").toLowerCase();
  if (search && !haystack.includes(search)) return false;
  if (state.planFilters.status !== "all" && plan.status !== state.planFilters.status) return false;
  if (state.planFilters.project !== "all" && plan.project !== state.planFilters.project) return false;
  if (state.planFilters.tag !== "all" && !(plan.tags || []).includes(state.planFilters.tag)) return false;
  return true;
}

function renderPlanFilterButton(group, value, label, count = null) {
  const active = state.planFilters[group] === value;
  const suffix = count === null ? "" : ` <span>${count}</span>`;
  return `<button class="plan-filter ${active ? "is-active" : ""}" type="button" data-plan-filter="${group}" data-plan-value="${escapeHtml(value)}">${escapeHtml(label)}${suffix}</button>`;
}

function renderPlanStats() {
  const root = qs("#plans-stats");
  if (!root) return;
  const stats = data.planStats || {};
  root.innerHTML = [
    ["total", stats.total || data.plans.length || 0],
    ["active", stats.active || 0],
    ["attention", stats.attention || 0],
    ["draft", stats.draft || 0],
  ]
    .map(([label, value]) => `<span><strong>${value}</strong>${label}</span>`)
    .join("");
}

function renderPlanFilters() {
  const statusRoot = qs("#plan-status-filters");
  const projectRoot = qs("#plan-project-filters");
  const tagRoot = qs("#plan-tag-filters");
  if (!statusRoot) return;
  const statuses = ["all", "active", "attention", "draft", "reference", "archive"];
  statusRoot.innerHTML = statuses
    .map((status) =>
      renderPlanFilterButton(
        "status",
        status,
        planStatusLabels[status],
        status === "all" ? data.plans.length : data.plans.filter((plan) => plan.status === status).length,
      ),
    )
    .join("");
  if (projectRoot) {
    const topProjects = [...data.planProjects]
      .sort((a, b) => data.plans.filter((plan) => plan.project === b).length - data.plans.filter((plan) => plan.project === a).length || a.localeCompare(b))
      .slice(0, 7);
    if (state.planFilters.project !== "all" && !topProjects.includes(state.planFilters.project)) state.planFilters.project = "all";
    const projects = ["all", ...topProjects];
    projectRoot.innerHTML = projects
      .map((project) =>
        renderPlanFilterButton(
          "project",
          project,
          project === "all" ? "All projects" : project,
          project === "all" ? data.plans.length : data.plans.filter((plan) => plan.project === project).length,
        ),
      )
      .join("");
  } else {
    state.planFilters.project = "all";
  }
  if (tagRoot) {
    tagRoot.innerHTML = [
      `<button class="plan-tag ${state.planFilters.tag === "all" ? "is-active" : ""}" type="button" data-plan-filter="tag" data-plan-value="all">all</button>`,
      ...data.planTags.map(
        (tag) =>
          `<button class="plan-tag ${state.planFilters.tag === tag ? "is-active" : ""}" type="button" data-plan-filter="tag" data-plan-value="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`,
      ),
    ].join("");
  }
}

function renderPlanCard(plan) {
  const tone = planStatusTone(plan.status);
  return `
    <article class="plan-card" data-plan-id="${escapeHtml(plan.id)}">
      <div class="plan-card-main">
        <span class="plan-card-time">${escapeHtml(plan.updatedLabel || "")}</span>
        <button class="plan-card-title" type="button" data-plan-open="${escapeHtml(plan.id)}" onclick="window.openPlan(this.dataset.planOpen)">${escapeHtml(plan.title)}</button>
        <span class="status-pill ${tone === "ok" ? "status-ok" : tone === "warn" ? "status-warn" : ""}">${escapeHtml(plan.status)}</span>
      </div>
      <p>${escapeHtml(plan.summary || "No summary")}</p>
      <div class="plan-card-foot">
        <span>${escapeHtml(plan.fileName)}</span>
        <span>${escapeHtml(plan.project || "one")}</span>
        ${(plan.tags || []).slice(0, 4).map((tag) => `<em>#${escapeHtml(tag)}</em>`).join("")}
      </div>
    </article>
  `;
}

function projectMatchesFilters(project) {
  const search = state.projectFilters.search.trim().toLowerCase();
  const haystack = [project.name, project.description, project.curator, ...(project.folders || []), ...(project.files || []).map((file) => file.file)].join(" ").toLowerCase();
  if (search && !haystack.includes(search)) return false;
  if (state.projectFilters.curator !== "all" && project.curator !== state.projectFilters.curator) return false;
  return true;
}

function renderProjectFilterButton(value, label, count) {
  const active = state.projectFilters.curator === value;
  return `<button class="plan-filter ${active ? "is-active" : ""}" type="button" data-project-filter="curator" data-project-value="${escapeHtml(value)}">${escapeHtml(label)} <span>${count}</span></button>`;
}

function renderProjectStats() {
  const root = qs("#projects-stats");
  if (!root) return;
  const stats = data.projectStats || {};
  root.innerHTML = [
    ["total", stats.total || data.projects.length || 0],
    ["curators", stats.curators || data.projectCurators.length || 0],
    ["TOV", stats.tov || 0],
    ["fresh", stats.fresh || 0],
  ]
    .map(([label, value]) => `<span><strong>${value}</strong>${label}</span>`)
    .join("");
}

function renderProjectFilters() {
  const root = qs("#project-curator-filters");
  if (!root) return;
  root.innerHTML = [
    renderProjectFilterButton("all", "All", data.projects.length),
    ...data.projectCurators.map((curator) => renderProjectFilterButton(curator, curator, data.projects.filter((project) => project.curator === curator).length)),
  ].join("");
}

function renderProjectCard(project) {
  const sizeMb = Number(project.size || 0) / 1024 / 1024;
  return `
    <article class="project-card" data-project-id="${escapeHtml(project.id)}">
      <div class="project-card-head">
        <span class="plan-card-time">${escapeHtml(project.updatedLabel || "")}</span>
        <button class="plan-card-title" type="button" data-project-open="${escapeHtml(project.id)}" onclick="window.openProject(this.dataset.projectOpen)">${escapeHtml(project.title)}</button>
        <span class="status-pill ${project.hasTov ? "status-ok" : "status-warn"}">${project.hasTov ? "TOV" : "no TOV"}</span>
      </div>
      <p>${escapeHtml(project.description || "No description")}</p>
      <div class="project-card-metrics">
        <span><strong>${escapeHtml(project.curator || "unknown")}</strong> curator</span>
        <span><strong>${project.mdCount || 0}</strong> md</span>
        <span><strong>${project.jsonCount || 0}</strong> json</span>
        <span><strong>${project.dirCount || 0}</strong> dirs</span>
        <span><strong>${sizeMb.toFixed(sizeMb >= 10 ? 0 : 1)}</strong> MB</span>
      </div>
      <div class="plan-card-foot">
        ${(project.folders || []).slice(0, 7).map((folder) => `<em>#${escapeHtml(folder)}</em>`).join("")}
      </div>
    </article>
  `;
}

function renderProjects() {
  renderProjectStats();
  renderProjectFilters();
  const list = qs("#project-list");
  if (!list) return;
  const visible = data.projects.filter(projectMatchesFilters).sort((a, b) => a.name.localeCompare(b.name));
  qs("#projects-visible-count").textContent = `${visible.length} / ${data.projects.length}`;
  qs("#projects-root").textContent = data.projectsRoot || "projects folder";
  list.innerHTML = visible.length ? visible.map(renderProjectCard).join("") : `<div class="plan-empty">No projects match current filters</div>`;
}

function skillMatchesFilters(skill) {
  const search = state.skillFilters.search.trim().toLowerCase();
  const haystack = [skill.title, skill.summary, skill.name, skill.mainFile, skill.content].join(" ").toLowerCase();
  if (search && !haystack.includes(search)) return false;
  if (state.skillFilters.type === "scripts") return skill.hasScripts;
  if (state.skillFilters.type !== "all" && skill.type !== state.skillFilters.type) return false;
  return true;
}

function renderSkillFilterButton(value, label, count) {
  const active = state.skillFilters.type === value;
  return `<button class="plan-filter ${active ? "is-active" : ""}" type="button" data-skill-filter="type" data-skill-value="${escapeHtml(value)}">${escapeHtml(label)} <span>${count}</span></button>`;
}

function renderSkillStats() {
  const root = qs("#skills-stats");
  if (!root) return;
  const stats = data.skillStats || {};
  root.innerHTML = [
    ["total", stats.total || data.skills.length || 0],
    ["folders", stats.folder || 0],
    ["files", stats.file || 0],
    ["scripts", stats.scripts || 0],
  ]
    .map(([label, value]) => `<span><strong>${value}</strong>${label}</span>`)
    .join("");
}

function renderSkillFilters() {
  const root = qs("#skill-type-filters");
  if (!root) return;
  const stats = data.skillStats || {};
  root.innerHTML = [
    renderSkillFilterButton("all", "All", data.skills.length),
    renderSkillFilterButton("folder", "Folders", stats.folder || 0),
    renderSkillFilterButton("file", "Files", stats.file || 0),
    renderSkillFilterButton("scripts", "Scripts", stats.scripts || 0),
  ].join("");
}

function renderSkillCard(skill) {
  return `
    <article class="plan-card skill-card" data-skill-id="${escapeHtml(skill.id)}">
      <div class="plan-card-main">
        <span class="plan-card-time">${escapeHtml(skill.updatedLabel || "")}</span>
        <button class="plan-card-title" type="button" data-skill-open="${escapeHtml(skill.id)}" onclick="window.openSkill(this.dataset.skillOpen)">${escapeHtml(skill.title)}</button>
        <span class="status-pill">${escapeHtml(skill.hasScripts ? "scripts" : skill.type)}</span>
      </div>
      <p>${escapeHtml(skill.summary || "No description")}</p>
      <div class="plan-card-foot">
        <span>${escapeHtml(skill.id)}</span>
        <span>${Number(skill.size || 0).toLocaleString("ru-RU")} bytes</span>
        <em>#${escapeHtml(skill.type)}</em>
        ${skill.hasScripts ? `<em>#scripts</em>` : ""}
      </div>
    </article>
  `;
}

function renderSkills() {
  renderSkillStats();
  renderSkillFilters();
  const list = qs("#skill-list");
  if (!list) return;
  const visible = data.skills.filter(skillMatchesFilters).sort((a, b) => a.title.localeCompare(b.title));
  qs("#skills-visible-count").textContent = `${visible.length} / ${data.skills.length}`;
  qs("#skills-root").textContent = data.skillsRoot || "skills folder";
  list.innerHTML = visible.length ? visible.map(renderSkillCard).join("") : `<div class="plan-empty">No skills match current filters</div>`;
}

function renderPlans() {
  renderPlanStats();
  renderPlanFilters();
  const list = qs("#plan-list");
  if (!list) return;
  const visible = data.plans.filter(planMatchesFilters).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  qs("#plans-visible-count").textContent = `${visible.length} / ${data.plans.length}`;
  qs("#plans-root").textContent = data.plansRoot || "plans folder";
  list.innerHTML = visible.length ? visible.map(renderPlanCard).join("") : `<div class="plan-empty">No plans match current filters</div>`;
}

function openPlan(planId) {
  const plan = data.plans.find((item) => item.id === planId);
  if (!plan) return;
  state.selectedPlanId = planId;
  qs("#plan-detail-title").textContent = plan.title;
  qs("#plan-detail-kicker").textContent = plan.fileName;
  qs("#plan-detail-meta").innerHTML = `
    <span>${escapeHtml(plan.project || "one")}</span>
    <span>${escapeHtml(plan.horizon || "project")}</span>
    <span>${escapeHtml(plan.updatedLabel || "")}</span>
    <span>${Number(plan.size || 0).toLocaleString("ru-RU")} bytes</span>
    ${(plan.tags || []).slice(0, 8).map((tag) => `<em>#${escapeHtml(tag)}</em>`).join("")}
  `;
  qs("#plan-editor").value = plan.content || "";
  const statusSelect = qs("#plan-status-select");
  if (statusSelect) {
    statusSelect.innerHTML = editablePlanStatuses
      .map((status) => `<option value="${status}" ${plan.status === status ? "selected" : ""}>${planStatusLabels[status]}</option>`)
      .join("");
  }
  qs("#plan-save-state").textContent = "editable markdown";
  qs("#plan-detail-modal").hidden = false;
}

function closePlan() {
  const modal = qs("#plan-detail-modal");
  if (modal) modal.hidden = true;
  state.selectedPlanId = null;
}

window.openPlan = openPlan;

function openProject(projectId) {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) return;
  state.selectedProjectId = projectId;
  qs("#project-detail-title").textContent = project.title;
  qs("#project-detail-kicker").textContent = `${project.curator || "unknown"} · ${project.name}`;
  qs("#project-detail-meta").innerHTML = `
    <span>curator: ${escapeHtml(project.curator || "unknown")}</span>
    <span>${project.mdCount || 0} md</span>
    <span>${project.jsonCount || 0} json</span>
    <span>${project.dirCount || 0} dirs</span>
    <span>${escapeHtml(project.updatedLabel || "")}</span>
  `;
  qs("#project-detail-overview").innerHTML = `
    <article>
      <span>Description</span>
      <p>${escapeHtml(project.description || "No description")}</p>
    </article>
    <article>
      <span>Key files</span>
      <div class="project-file-grid">
        ${(project.files || [])
          .map((file) => `<button type="button" title="${escapeHtml(file.preview || "")}"><strong>${escapeHtml(file.file)}</strong><em>${Number(file.size || 0).toLocaleString("ru-RU")} bytes</em></button>`)
          .join("")}
      </div>
    </article>
    <article>
      <span>Folders</span>
      <div class="project-folder-row">${(project.folders || []).map((folder) => `<em>${escapeHtml(folder)}</em>`).join("")}</div>
    </article>
  `;
  qs("#project-tov-editor").value =
    project.tov ||
    `# Tone of Voice — ${project.name}\n\n## Роль\n\n## Стиль ответа\n\n## Что важно\n\n## Чего избегать\n`;
  qs("#project-save-state").textContent = project.hasTov ? "editable TOV" : "new TOV file";
  qs("#project-detail-modal").hidden = false;
}

function closeProject() {
  const modal = qs("#project-detail-modal");
  if (modal) modal.hidden = true;
  state.selectedProjectId = null;
}

window.openProject = openProject;

function openSkill(skillId) {
  const skill = data.skills.find((item) => item.id === skillId);
  if (!skill) return;
  state.selectedSkillId = skillId;
  qs("#skill-detail-title").textContent = skill.title;
  qs("#skill-detail-kicker").textContent = skill.id;
  qs("#skill-detail-meta").innerHTML = `
    <span>${escapeHtml(skill.type)}</span>
    <span>${escapeHtml(skill.mainFile || "SKILL.md")}</span>
    <span>${escapeHtml(skill.updatedLabel || "")}</span>
    <span>${Number(skill.size || 0).toLocaleString("ru-RU")} bytes</span>
    ${skill.hasScripts ? `<em>#scripts</em>` : ""}
  `;
  qs("#skill-editor").value = skill.content || "";
  qs("#skill-save-state").textContent = "editable markdown";
  qs("#skill-detail-modal").hidden = false;
}

function closeSkill() {
  const modal = qs("#skill-detail-modal");
  if (modal) modal.hidden = true;
  state.selectedSkillId = null;
}

window.openSkill = openSkill;

async function saveSelectedPlan() {
  const id = state.selectedPlanId;
  if (!id) return;
  const stateNode = qs("#plan-save-state");
  stateNode.textContent = "saving...";
  try {
    const selectedStatus = qs("#plan-status-select")?.value || "draft";
    const content = applyPlanStatusToContent(qs("#plan-editor").value, selectedStatus);
    qs("#plan-editor").value = content;
    const result = await postJson("/api/plans/update", { id, content });
    if (!result.ok) throw new Error(result.error || "save failed");
    const index = data.plans.findIndex((plan) => plan.id === id);
    if (index >= 0 && result.plan) data.plans[index] = result.plan;
    stateNode.textContent = "saved";
    renderPlans();
  } catch (error) {
    stateNode.textContent = `not saved: ${error.message}`;
  }
}

async function saveSelectedProjectTov() {
  const id = state.selectedProjectId;
  if (!id) return;
  const stateNode = qs("#project-save-state");
  stateNode.textContent = "saving...";
  try {
    const result = await postJson("/api/projects/tov/update", { id, content: qs("#project-tov-editor").value });
    if (!result.ok) throw new Error(result.error || "save failed");
    const index = data.projects.findIndex((project) => project.id === id);
    if (index >= 0 && result.project) data.projects[index] = result.project;
    stateNode.textContent = "saved";
    renderProjects();
    if (result.project) openProject(result.project.id);
  } catch (error) {
    stateNode.textContent = `not saved: ${error.message}`;
  }
}

async function saveSelectedSkill() {
  const id = state.selectedSkillId;
  if (!id) return;
  const stateNode = qs("#skill-save-state");
  stateNode.textContent = "saving...";
  try {
    const result = await postJson("/api/skills/update", { id, content: qs("#skill-editor").value });
    if (!result.ok) throw new Error(result.error || "save failed");
    const index = data.skills.findIndex((skill) => skill.id === id);
    if (index >= 0 && result.skill) data.skills[index] = result.skill;
    stateNode.textContent = "saved";
    renderSkills();
  } catch (error) {
    stateNode.textContent = `not saved: ${error.message}`;
  }
}

async function loadPlans() {
  try {
    const response = await fetch("/api/plans", { cache: "no-store" });
    if (!response.ok) throw new Error(`plans ${response.status}`);
    const payload = await response.json();
    data.plans = Array.isArray(payload.plans) ? payload.plans : [];
    data.planStats = payload.stats || {};
    data.planTags = Array.isArray(payload.tags) ? payload.tags : [];
    data.planProjects = Array.isArray(payload.projects) ? payload.projects : [];
    data.plansRoot = payload.root || "";
    renderPlans();
    return true;
  } catch (error) {
    console.warn("Plans unavailable", error);
    renderPlans();
    return false;
  }
}

async function loadProjects() {
  try {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) throw new Error(`projects ${response.status}`);
    const payload = await response.json();
    data.projects = Array.isArray(payload.projects) ? payload.projects : [];
    data.projectStats = payload.stats || {};
    data.projectCurators = Array.isArray(payload.curators) ? payload.curators : [];
    data.projectsRoot = payload.root || "";
    renderProjects();
    return true;
  } catch (error) {
    console.warn("Projects unavailable", error);
    renderProjects();
    return false;
  }
}

async function loadSkills() {
  try {
    const response = await fetch("/api/skills", { cache: "no-store" });
    if (!response.ok) throw new Error(`skills ${response.status}`);
    const payload = await response.json();
    data.skills = Array.isArray(payload.skills) ? payload.skills : [];
    data.skillStats = payload.stats || {};
    data.skillsRoot = payload.root || "";
    renderSkills();
    return true;
  } catch (error) {
    console.warn("Skills unavailable", error);
    renderSkills();
    return false;
  }
}

function wirePlans() {
  const search = qs("#plan-search");
  if (search) {
    search.addEventListener("input", () => {
      state.planFilters.search = search.value;
      renderPlans();
    });
  }
  document.addEventListener("click", async (event) => {
    const filter = event.target.closest("[data-plan-filter]");
    if (filter) {
      state.planFilters[filter.dataset.planFilter] = filter.dataset.planValue;
      renderPlans();
      return;
    }
    const open = event.target.closest(".plan-card");
    if (open) {
      openPlan(open.dataset.planId);
      return;
    }
    if (event.target.closest("[data-plan-close]")) {
      closePlan();
      return;
    }
    if (event.target.closest("#plan-save-btn")) {
      await saveSelectedPlan();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !qs("#plan-detail-modal")?.hidden) closePlan();
  });
}

function wireProjects() {
  const search = qs("#project-search");
  if (search) {
    search.addEventListener("input", () => {
      state.projectFilters.search = search.value;
      renderProjects();
    });
  }
  document.addEventListener("click", async (event) => {
    const filter = event.target.closest("[data-project-filter]");
    if (filter) {
      state.projectFilters[filter.dataset.projectFilter] = filter.dataset.projectValue;
      renderProjects();
      return;
    }
    const open = event.target.closest(".project-card");
    if (open) {
      openProject(open.dataset.projectId);
      return;
    }
    if (event.target.closest("[data-project-close]")) {
      closeProject();
      return;
    }
    if (event.target.closest("#project-save-btn")) {
      await saveSelectedProjectTov();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !qs("#project-detail-modal")?.hidden) closeProject();
  });
}

function wireSkills() {
  const search = qs("#skill-search");
  if (search) {
    search.addEventListener("input", () => {
      state.skillFilters.search = search.value;
      renderSkills();
    });
  }
  document.addEventListener("click", async (event) => {
    const filter = event.target.closest("[data-skill-filter]");
    if (filter) {
      state.skillFilters[filter.dataset.skillFilter] = filter.dataset.skillValue;
      renderSkills();
      return;
    }
    const open = event.target.closest(".skill-card");
    if (open) {
      openSkill(open.dataset.skillId);
      return;
    }
    if (event.target.closest("[data-skill-close]")) {
      closeSkill();
      return;
    }
    if (event.target.closest("#skill-save-btn")) {
      await saveSelectedSkill();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !qs("#skill-detail-modal")?.hidden) closeSkill();
  });
}

function wireAccordions() {
  qsa(".accordion-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      trigger.closest(".accordion-item").classList.toggle("is-open");
    });
  });
}

function wireRowExpansion() {
  document.addEventListener("click", (event) => {
    const rowButton = event.target.closest(".turn-button, .event-button");
    if (rowButton) rowButton.closest(".turn-row, .event-row").classList.toggle("is-expanded");
  });
}

function wireNavigation() {
  qsa(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchView(tab.dataset.view, tab.textContent);
    });
  });
  qsa("[data-jump-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.jumpView, button.textContent));
  });
}

function switchView(view, label = view) {
  qsa(".nav-tab").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  qsa(".view").forEach((viewNode) => viewNode.classList.remove("is-active"));
  const targetView = qs(`#${view}-view`);
  if (targetView) {
    targetView.classList.add("is-active");
    if (view === "projects") loadProjects();
    if (view === "plans") loadPlans();
    if (view === "skills") loadSkills();
  } else {
    qs("#empty-title").textContent = label;
    qs("#empty-view").classList.add("is-active");
  }
}

function applyInitialView() {
  const initialView = new URLSearchParams(window.location.search).get("view");
  if (!initialView) return;
  const tab = qsa(".nav-tab").find((item) => item.dataset.view === initialView);
  if (tab) switchView(initialView, tab.textContent);
}

function wireDeckSections() {
  qsa(".deck-band").forEach((section) => {
    const label = qs(".band-label", section);
    if (!label || qs(".section-toggle", label)) return;

    const toggle = document.createElement("button");
    toggle.className = "section-toggle";
    toggle.type = "button";
    toggle.textContent = "−";
    toggle.setAttribute("aria-expanded", "true");
    toggle.title = "Свернуть секцию";
    label.appendChild(toggle);

    toggle.addEventListener("click", () => {
      const isCollapsed = section.classList.toggle("is-collapsed");
      toggle.textContent = isCollapsed ? "+" : "−";
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
      toggle.title = isCollapsed ? "Развернуть секцию" : "Свернуть секцию";
    });
  });
}

function wireKanbanDrag() {
  const search = qs("#kanban-search");
  const tag = qs("#kanban-tag-filter");
  if (search) {
    search.addEventListener("input", () => {
      state.kanbanFilters.search = search.value;
      renderKanban();
    });
  }
  if (tag) {
    tag.addEventListener("input", () => {
      state.kanbanFilters.tag = tag.value;
      renderKanban();
    });
  }

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-group]");
    if (toggle) {
      const group = toggle.dataset.toggleGroup;
      const value = toggle.dataset.toggleValue;
      if (group === "project") state.kanbanFilters.projects[value] = state.kanbanFilters.projects[value] === false;
      if (group === "stage") state.kanbanFilters.stages[value] = state.kanbanFilters.stages[value] === false;
      if (group === "field") state.kanbanFields[value] = !state.kanbanFields[value];
      renderKanban();
      return;
    }

    const panelButton = event.target.closest("[data-kanban-panel]");
    if (panelButton) {
      const target = panelButton.dataset.kanbanPanel;
      qsa("[data-kanban-panel-target]").forEach((panel) => {
        panel.classList.toggle("is-open", panel.dataset.kanbanPanelTarget === target && !panel.classList.contains("is-open"));
      });
      return;
    }

    const panelClose = event.target.closest("[data-kanban-panel-close]");
    if (panelClose) {
      qs(`[data-kanban-panel-target="${panelClose.dataset.kanbanPanelClose}"]`)?.classList.remove("is-open");
      return;
    }

    const showMore = event.target.closest("[data-kanban-show-more]");
    if (showMore) {
      const status = showMore.dataset.kanbanShowMore;
      state.kanbanVisibleLimit[status] = (state.kanbanVisibleLimit[status] || kanbanInitialVisible[status] || 8) + 12;
      renderKanban();
      return;
    }

    if (event.target.closest("[data-kanban-reset]")) {
      state.kanbanFilters.search = "";
      state.kanbanFilters.tag = "";
      state.kanbanFilters.projects = {};
      state.kanbanFilters.stages = {};
      state.kanbanVisibleLimit = {};
      if (search) search.value = "";
      if (tag) tag.value = "";
      ensureKanbanFilterDefaults();
      renderKanban();
      return;
    }

    const detailButton = event.target.closest("[data-task-detail]");
    if (detailButton) {
      openTaskDetail(detailButton.dataset.taskDetail);
      return;
    }

    if (event.target.closest("[data-task-detail-close]")) {
      closeTaskDetail();
      return;
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("#task-detail-form");
    if (!form) return;
    event.preventDefault();
    await saveTaskDetail(form);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeTaskDetail();
  });

  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".task-card");
    if (!card) return;
    state.draggedTaskId = card.dataset.taskId;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  document.addEventListener("dragend", (event) => {
    const card = event.target.closest(".task-card");
    if (card) card.classList.remove("is-dragging");
    qsa(".card-list").forEach((list) => list.classList.remove("is-over"));
    state.draggedTaskId = null;
  });

  document.addEventListener("dragover", (event) => {
    const list = event.target.closest(".card-list");
    if (!list || !state.draggedTaskId) return;
    event.preventDefault();
    list.classList.add("is-over");
  });

  document.addEventListener("dragleave", (event) => {
    const list = event.target.closest(".card-list");
    if (list) list.classList.remove("is-over");
  });

  document.addEventListener("drop", async (event) => {
    const list = event.target.closest(".card-list");
    if (!list || !state.draggedTaskId) return;
    event.preventDefault();
    const beforeCard = event.target.closest(".task-card");
    const beforeTaskId = beforeCard && beforeCard.dataset.taskId !== state.draggedTaskId ? beforeCard.dataset.taskId : null;
    await moveTask(state.draggedTaskId, list.dataset.status, beforeTaskId);
  });
}

function createEvent() {
  const template = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
  return {
    id: crypto.randomUUID(),
    time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    group: template[0],
    type: template[1],
    message: template[2],
    detail: `run_id=wrun_${Math.random().toString(16).slice(2, 10)} · duration=${Math.floor(Math.random() * 1900 + 20)}ms · success=${template[0] !== "issue"}`,
  };
}

function renderEvents() {
  const feed = qs("#event-feed");
  const visibleEvents = state.eventFilter === "all" ? state.events : state.events.filter((event) => event.group === state.eventFilter);
  qs("#event-count").textContent = state.eventFilter === "all" ? state.events.length : `${visibleEvents.length}/${state.events.length}`;
  feed.innerHTML = visibleEvents
    .slice(-120)
    .map(
      (event) => `
        <article class="event-row ${event.group}">
          <button class="event-button" type="button">
            <span>${event.time}</span>
            <strong>${event.type}</strong>
            <span class="event-message"><i>${event.group}</i>${event.message}</span>
          </button>
          <div class="row-detail">${event.detail}</div>
        </article>
      `,
    )
    .join("");
}

function renderEventFilters() {
  qs("#event-legend").innerHTML = eventGroups
    .map(
      ([group, label, title]) => `
        <button class="event-filter ${group} ${state.eventFilter === group ? "is-active" : ""}" type="button" data-event-filter="${group}" title="${title}">
          <i class="legend-dot ${group}"></i>
          <span>${label}</span>
        </button>
      `,
    )
    .join("");
}

function pushEvent() {
  const feed = qs("#event-feed");
  const nextEvent = createEvent();
  state.events.push(nextEvent);
  if (state.events.length > 500) state.events.shift();
  if (state.pausedFeed) {
    const isVisibleInFilter = state.eventFilter === "all" || nextEvent.group === state.eventFilter;
    if (isVisibleInFilter) {
      state.unseenEvents += 1;
      const button = qs("#new-events-btn");
      button.textContent = `новые события: ${state.unseenEvents} ↓`;
      button.classList.add("is-visible");
    }
    return;
  }
  renderEvents();
  feed.scrollTop = feed.scrollHeight;
}

function wireFeed() {
  const feed = qs("#event-feed");
  feed.addEventListener("scroll", () => {
    const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    state.pausedFeed = distanceFromBottom > 80;
  });
  qs("#new-events-btn").addEventListener("click", () => {
    state.pausedFeed = false;
    state.unseenEvents = 0;
    qs("#new-events-btn").classList.remove("is-visible");
    renderEvents();
    feed.scrollTop = feed.scrollHeight;
  });
  qs("#event-legend").addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-filter]");
    if (!button) return;
    state.eventFilter = button.dataset.eventFilter;
    renderEventFilters();
    renderEvents();
    feed.scrollTop = feed.scrollHeight;
  });
}

function wireRefresh() {
  qs("#refresh-btn").addEventListener("click", async () => {
    const hadLiveData = state.liveData;
    if (await refreshLiveSummary()) {
      return;
    }
    if (hadLiveData) return;
    data.kpis[2].value = `${(80 + Math.random() * 8).toFixed(1)} ↓`;
    data.kpis[3].value = `${(2.8 + Math.random() * 0.5).toFixed(2)}M`;
    renderKpis();
    pushEvent();
  });
}

async function boot() {
  applyBranding();
  buildDashboardSections();
  const liveLoaded = await refreshLiveSummary();
  if (!liveLoaded) {
    renderDashboard();
    // Оффлайн-демо: без живых данных лента не должна быть пустой (seed из шаблонов).
    if (!state.events.length) {
      for (let i = 0; i < 8; i += 1) state.events.push(createEvent());
    }
  }
  renderEventFilters();
  renderEvents();
  wireAccordions();
  wireRowExpansion();
  wireNavigation();
  applyInitialView();
  wireDeckSections();
  wireKanbanDrag();
  wirePlans();
  wireProjects();
  wireSkills();
  loadPlans();
  loadProjects();
  loadSkills();
  wireFeed();
  wireRefresh();
  renderEvents();
  qs("#event-feed").scrollTop = qs("#event-feed").scrollHeight;
  if (state.liveData) {
    setInterval(refreshLiveSummary, 30000);
  } else {
    setInterval(advanceLastTurn, 12000);
    setInterval(refreshSummaryMock, 30000);
  }
}

boot();
