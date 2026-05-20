const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const tanks = [
  { id: 1, code: "TQ-01", type: "Tanque de Processo", volume: 1250, structuralLimit: 35 },
  { id: 2, code: "TQ-02", type: "Tanque de Processo", volume: 1250, structuralLimit: 35 },
  { id: 3, code: "TQ-03", type: "Tanque de Processo", volume: 1250, structuralLimit: 35 }
];

const hoses = [
  { id: 1, code: "MG-01", length: 5, diameter: 2, loss: 0.8, status: "Operacional" },
  { id: 2, code: "MG-02", length: 8, diameter: 2, loss: 1.1, status: "Atenção" },
  { id: 3, code: "MG-03", length: 3, diameter: 2, loss: 0.6, status: "Operacional" }
];

const recipes = [
  { code: "REC-PADRAO", target: 8, roots: 50, time: 90, oil: 2.2 },
  { code: "REC-SEGURA", target: 10, roots: 55, time: 110, oil: 2.5 },
  { code: "REC-TESTE", target: 20, roots: 80, time: 60, oil: 1.8 }
];

const operators = [
  { name: "Operador teste", role: "Produção", permission: "Iniciar ciclo", status: "Ativo" },
  { name: "Supervisor", role: "Gestão", permission: "Relatórios e auditoria", status: "Ativo" },
  { name: "Manutenção", role: "Técnico", permission: "Diagnóstico", status: "Ativo" }
];

const specs = {
  primary: [
    ["Modelo", "Leybold SOGEVAC SV 630 B"],
    ["Tecnologia", "Bomba rotativa de palhetas lubrificada a óleo"],
    ["Velocidade nominal 50 Hz", "640 m³/h"],
    ["Velocidade nominal 60 Hz", "755 m³/h"],
    ["Pressão final sem gas ballast", "≤ 0,08 mbar"],
    ["Pressão final com gas ballast", "≤ 0,7 mbar"],
    ["Óleo", "20 L"],
    ["Potência do motor", "15 kW"],
    ["Rotação nominal 50 Hz", "820 rpm"],
    ["Entrada", "DN 100 PN 10 / DN 100 ISO-K"],
    ["Função", "Evacuação inicial e sustentação do conjunto."]
  ],
  roots: [
    ["Modelo", "Leybold RUVAC WSU 2001"],
    ["Tecnologia", "Bomba secundária com motor blindado refrigerado a ar"],
    ["Velocidade nominal 50 Hz", "2050 m³/h"],
    ["Velocidade nominal 60 Hz", "2460 m³/h"],
    ["Velocidade efetiva com SOGEVAC 50 Hz", "1850 m³/h"],
    ["Velocidade efetiva com SOGEVAC 60 Hz", "2100 m³/h"],
    ["Pressão final", "< 4 × 10⁻² mbar"],
    ["Pressão diferencial máxima", "50 mbar"],
    ["Taxa de vazamento", "< 1 × 10⁻⁴ mbar·l/s"],
    ["Função", "Reforço do vácuo após faixa segura."]
  ],
  units: [
    ["Pressão", "mbar", "Pressão atual, alvo, curva esperada e leitura de sensores"],
    ["Tempo", "s", "Duração de ciclo, atraso do óleo e simulações"],
    ["Volume", "L", "Tanques e volume de óleo"],
    ["Vazão", "L/min", "Entrada de óleo no processo"],
    ["Comprimento", "m", "Mangueiras e distância simulada"],
    ["Risco", "%", "Criticidade operacional"]
  ],
  margin: [
    ["Fórmula", "|medido - esperado| / esperado × 100", "Cálculo do desvio percentual"],
    ["Operacional", "Dentro da margem", "Sem ação crítica"],
    ["Atenção", "Desvio intermediário", "Operador deve acompanhar"],
    ["Crítico", "Desvio elevado", "Bloqueio ou análise técnica"],
    ["Aplicação", "Semáforo visual e físico", "Pode acionar alerta no sistema e no painel físico"]
  ]
};

const scenarios = [
  { key: "safe", title: "Operação segura", text: "Parâmetros dentro da faixa esperada.", risk: 16, factor: 5.9 },
  { key: "oil_delay", title: "Óleo atrasado", text: "Atraso no óleo aumenta instabilidade e tempo.", risk: 58, factor: 4.2 },
  { key: "leak", title: "Vazamento na mangueira", text: "Perda de carga e curva de vácuo mais lenta.", risk: 78, factor: 2.7 },
  { key: "sensor", title: "Falha de sensor", text: "Leitura inconsistente exige bloqueio ou validação.", risk: 84, factor: 2.2 },
  { key: "pump", title: "Desgaste de bomba", text: "Eficiência reduzida e ciclo mais longo.", risk: 64, factor: 3.5 },
  { key: "plc", title: "Perda de comunicação com CLP", text: "Interrupção entre sistema supervisório e controlador.", risk: 72, factor: 3.2 }
];

let state = {
  running: false,
  pressure: [1000, 1000, 1000],
  oil: [0, 0, 0],
  risk: [0, 0, 0],
  elapsed: 0,
  stage: "Parado",
  primaryPump: false,
  rootsPump: false,
  points: [{ x: 0, real: 1000, expected: 1000, risk: 0 }],
  scenarioPoints: [],
  selectedScenario: "safe",
  lastSimulation: null,
  interval: null,
  history: JSON.parse(localStorage.getItem("tsea_lab_history") || "[]"),
  events: JSON.parse(localStorage.getItem("tsea_lab_events") || "[]")
};

function fmt(value, suffix = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + (suffix ? " " + suffix : "");
}

function save() {
  localStorage.setItem("tsea_lab_history", JSON.stringify(state.history));
  localStorage.setItem("tsea_lab_events", JSON.stringify(state.events));
}

function avgPressure() {
  return state.pressure.reduce((a, b) => a + b, 0) / state.pressure.length;
}

function maxRisk() {
  return Math.max(...state.risk, 0);
}

function addEvent(title, text) {
  state.events.unshift({ title, text, date: new Date().toLocaleString("pt-BR") });
  state.events = state.events.slice(0, 8);
  save();
  renderEvents();
}

function toneByRisk(risk) {
  if (risk >= 82) return "critical";
  if (risk >= 65) return "warning";
  return "success";
}

function riskClass(risk) {
  if (risk >= 82) return "riskHigh";
  if (risk >= 65) return "riskMedium";
  return "riskLow";
}

function statusLabel() {
  if (state.stage === "Finalizado") return "Concluído";
  if (state.stage === "Bomba primária" || state.stage === "Bomba secundária") return "Em execução";
  if (state.stage === "Estabilização") return "Atenção";
  return state.stage;
}

function recordDateISO(datetime) {
  const parts = String(datetime || "").split(",")[0]?.split("/");
  if (!parts || parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function inPeriod(datetime, period) {
  if (period === "all") return true;
  const iso = recordDateISO(datetime);
  if (!iso) return true;
  if (period === "today") return iso === todayISO();
  if (period === "week") return iso >= daysAgo(7);
  if (period === "month") return iso >= daysAgo(30);
  return true;
}

function setView(view) {
  $$(".view").forEach((item) => item.classList.remove("active"));
  $("#" + view).classList.add("active");

  $$(".menu-card").forEach((btn) => btn.classList.remove("active"));
  $(`.menu-card[data-view="${view}"]`).classList.add("active");

  if (view === "history") renderHistory();
  if (view === "reports") renderReports();
}

function setTab(containerSelector, attr, valuePrefix, value) {
  $$(containerSelector + " .tab").forEach((btn) => btn.classList.remove("active"));
  $(`${containerSelector} .tab[${attr}="${value}"]`).classList.add("active");

  $$("[id^='" + valuePrefix + "-']").forEach((panel) => panel.classList.remove("active"));
  $("#" + valuePrefix + "-" + value).classList.add("active");
}

function renderTankCard(tank, index, compact = false) {
  const hose = hoses[index] || hoses[0];
  const pressure = state.pressure[index];
  const oil = state.oil[index];
  const risk = state.risk[index];
  const gasHeight = Math.max(18, Math.min(72, 74 - risk * 0.22));
  const pressureHeight = Math.max(8, Math.min(68, risk));
  const oilHeight = Math.max(5, Math.min(42, oil * 5));
  const status = toneByRisk(risk);

  return `
    <article class="tank-card ${riskClass(risk)}">
      <div class="tank-top">
        <div>
          <h4>${tank.code}</h4>
          <span>${tank.type} · ${hose.code}</span>
        </div>
        <b class="badge ${status}">${status === "critical" ? "Crítico" : status === "warning" ? "Atenção" : "Operacional"}</b>
      </div>

      <div class="tank-visual">
        <div class="layer gas" style="height:${gasHeight}%">Gás</div>
        <div class="layer pressure" style="height:${pressureHeight}%">Pressão</div>
        <div class="layer oil" style="height:${oilHeight}%">Óleo</div>
      </div>

      <div class="tank-metrics">
        <div class="metric-row"><span>Pressão Atual</span><strong>${fmt(pressure, "mbar")}</strong></div>
        <div class="metric-row"><span>Curva Esperada</span><strong>${fmt(tank.structuralLimit, "mbar")}</strong></div>
        <div class="metric-row"><span>Volume de Óleo</span><strong>${fmt(oil, "L")}</strong></div>
        <div class="metric-row"><span>Risco Estrutural</span><strong>${fmt(risk, "%")}</strong></div>
        ${compact ? "" : `<div class="metric-row"><span>Perda na Mangueira</span><strong>${fmt(hose.loss, "mbar")}</strong></div>`}
        ${compact ? "" : `<div class="metric-row"><span>Sinal</span><strong>${risk >= 82 ? "red" : risk >= 65 ? "yellow" : "green"}</strong></div>`}
      </div>
    </article>
  `;
}

function renderTanks() {
  $("#operationTanks").innerHTML = tanks.map((tank, index) => renderTankCard(tank, index)).join("");
  $("#dashboardTanks").innerHTML = tanks.map((tank, index) => renderTankCard(tank, index, true)).join("");
}

function renderComponents() {
  const pressure = avgPressure();
  const risk = maxRisk();

  const rows = [
    ["Bomba primária", "Leybold SOGEVAC SV 630 B", state.primaryPump ? "Ligada" : "Pronta", "640 m³/h"],
    ["Bomba secundária", "Leybold RUVAC WSU 2001", state.rootsPump ? "Ligada" : "Intertravada", "2050 m³/h"],
    ["Sensor de pressão", "SP-TQ-01/02/03", risk >= 82 ? "Atenção" : "Online", fmt(pressure, "mbar")],
    ["Sistema de óleo", "Injeção de óleo", state.running ? "Ativo" : "Disponível", fmt(Math.max(...state.oil), "L")],
    ["Mangueiras", "MG-01/MG-02/MG-03", "Configuradas", "Perda calculada"],
    ["Tanques", "TQ-01/TQ-02/TQ-03", "Monitorados", fmt(risk, "%")]
  ];

  $("#componentHealth").innerHTML = rows.map((row) => `
    <div class="component-row">
      <div>
        <strong>${row[0]}</strong><br>
        <span>${row[1]}</span>
      </div>
      <div>
        <strong>${row[2]}</strong><br>
        <span>${row[3]}</span>
      </div>
    </div>
  `).join("");
}

function renderDashboardSpecs() {
  const rows = [
    ["Tanques", "3 unidades", "TQ-01, TQ-02 e TQ-03"],
    ["Mangueiras", "3 unidades", "MG-01, MG-02 e MG-03"],
    ["Bomba primária", "SV 630 B", "Evacuação inicial"],
    ["Bomba secundária", "WSU 2001", "Reforço do vácuo"],
    ["Status", statusLabel(), "Classificação atual"],
    ["Risco máximo", fmt(maxRisk(), "%"), "Maior risco entre tanques"]
  ];

  $("#dashboardSpecs").innerHTML = rows.map((row) => `
    <div class="param-row"><span>${row[0]}</span><strong>${row[1]}</strong><span>${row[2]}</span></div>
  `).join("");
}

function renderEvents() {
  if (!state.events.length) {
    $("#eventList").innerHTML = `<div class="event-item"><strong>Nenhum evento</strong><span>Eventos aparecerão durante o uso.</span></div>`;
    return;
  }

  $("#eventList").innerHTML = state.events.map((event) => `
    <div class="event-item">
      <strong>${event.title}</strong>
      <span>${event.text}<br>${event.date}</span>
    </div>
  `).join("");
}

function updateStage() {
  const pressure = avgPressure();
  const rootsStart = Number($("#rootsStart")?.value || 50);
  const target = Number($("#targetPressure")?.value || 8);

  if (!state.running && pressure >= 999) state.stage = "Parado";
  else if (pressure <= target) state.stage = "Finalizado";
  else if (pressure <= target * 1.5) state.stage = "Estabilização";
  else if (pressure <= rootsStart) state.stage = "Bomba secundária";
  else if (state.running) state.stage = "Bomba primária";
}

function stageDescription() {
  const map = {
    "Parado": "Aguardando início da operação.",
    "Bomba primária": "Evacuação inicial em andamento com bomba primária.",
    "Bomba secundária": "Bomba secundária liberada após atingir a faixa segura.",
    "Estabilização": "Pressão próxima da meta. Sistema estabilizando ciclo.",
    "Finalizado": "Ciclo finalizado dentro da pressão alvo configurada."
  };
  return map[state.stage] || "Estado operacional não classificado.";
}

function renderSteps() {
  const activeMap = {
    "Parado": ["prep"],
    "Bomba primária": ["prep", "primary"],
    "Bomba secundária": ["prep", "primary", "roots"],
    "Estabilização": ["prep", "primary", "roots", "oil"],
    "Finalizado": ["prep", "primary", "roots", "oil", "done"]
  };

  const active = activeMap[state.stage] || ["prep"];

  $$("#operationSteps .step").forEach((step) => {
    step.classList.remove("active", "done");
    const key = step.dataset.step;
    const index = active.indexOf(key);
    if (index >= 0 && index === active.length - 1) step.classList.add("active");
    else if (index >= 0) step.classList.add("done");
  });
}

function renderOperation() {
  updateStage();

  const pressure = avgPressure();
  const risk = maxRisk();
  const progress = Math.min(100, Math.max(0, (1 - pressure / 1000) * 100));

  $("#metricPressure").textContent = fmt(pressure, "mbar");
  $("#metricState").textContent = statusLabel();
  $("#metricRisk").textContent = fmt(risk, "%");
  $("#metricRecords").textContent = state.history.length;
  $("#headerState").textContent = state.running ? "Operação em andamento" : "Operação parada";

  $("#cycleStage").textContent = state.stage;
  $("#cycleDescription").textContent = stageDescription();
  $("#cycleProgress").textContent = Math.round(progress) + "%";

  $("#bigPressure").textContent = fmt(pressure);
  $("#primaryPumpState").textContent = state.primaryPump ? "Ligada" : "Pronta";
  $("#rootsPumpState").textContent = state.rootsPump ? "Ligada" : "Intertravada";
  $("#primaryPumpState").className = "badge " + (state.primaryPump ? "on" : "off");
  $("#rootsPumpState").className = "badge " + (state.rootsPump ? "on" : "off");

  renderTanks();
  renderComponents();
  renderDashboardSpecs();
  renderSteps();
  drawChart("operationChart", state.points);
}

function startOperation() {
  if (state.running) return;

  state.running = true;
  state.primaryPump = true;
  state.rootsPump = false;
  state.elapsed = 0;
  state.pressure = [1000, 1000, 1000];
  state.oil = [0, 0, 0];
  state.risk = [8, 8, 8];
  state.points = [{ x: 0, real: 1000, expected: 1000, risk: 8 }];

  const target = Number($("#targetPressure").value || 8);
  const rootsStart = Number($("#rootsStart").value || 50);
  const oilFlow = Number($("#oilFlow").value || 2.2);
  const estimated = Number($("#estimatedTime").value || 90);
  const pumpHealth = Number($("#pumpHealth").value || 0.96);

  addEvent("Operação iniciada", "Ciclo de vácuo iniciado pelo painel operacional.");

  clearInterval(state.interval);

  state.interval = setInterval(() => {
    if (!state.running) return;

    state.elapsed += 1;

    const progress = Math.min(state.elapsed / estimated, 1);
    const base = Math.max(target, 1000 * Math.exp(-progress * 5.8 * pumpHealth));

    state.pressure = state.pressure.map((_, index) => Math.max(target, base - index * 0.6));
    state.oil = state.oil.map((_, index) => Math.min(8, progress * oilFlow * 3 + index * 0.12));
    state.risk = state.pressure.map((p, index) => {
      const oilPenalty = Math.max(0, 2 - state.oil[index]) * 8;
      return Math.min(96, Math.max(6, 18 + oilPenalty + (p > rootsStart ? 4 : 10) + (1 - pumpHealth) * 35));
    });

    const pressure = avgPressure();

    if (!state.rootsPump && pressure <= rootsStart) {
      state.rootsPump = true;
      addEvent("Bomba secundária liberada", "A pressão atingiu a faixa configurada para acionamento.");
    }

    state.points.push({
      x: state.elapsed,
      real: pressure,
      expected: Math.max(target, 1000 * Math.exp(-progress * 6.2)),
      risk: maxRisk() * 10
    });

    if (pressure <= target) {
      finishOperation("Concluído");
      return;
    }

    renderOperation();
  }, 500);

  renderOperation();
}

function finishOperation(status) {
  clearInterval(state.interval);

  const pressure = avgPressure();
  const risk = maxRisk();

  state.running = false;
  state.primaryPump = false;
  state.rootsPump = false;

  state.history.unshift({
    id: Date.now(),
    type: "Operação",
    datetime: new Date().toLocaleString("pt-BR"),
    status,
    pressure: pressure.toFixed(2),
    risk: risk.toFixed(0),
    duration: state.elapsed + "s",
    tank: "TQ-01/TQ-02/TQ-03",
    hose: "MG-01/MG-02/MG-03"
  });

  state.history = state.history.slice(0, 80);

  addEvent(status === "Concluído" ? "Operação concluída" : "Operação abortada", "Status final: " + status + ".");
  save();
  renderAll();
}

function emergencyStop() {
  if (state.running) {
    state.risk = [100, 100, 100];
    finishOperation("Abortado");
  } else {
    addEvent("Emergência acionada", "Nenhuma operação estava em execução.");
  }
}

function resetOperation() {
  clearInterval(state.interval);

  state.running = false;
  state.primaryPump = false;
  state.rootsPump = false;
  state.elapsed = 0;
  state.pressure = [1000, 1000, 1000];
  state.oil = [0, 0, 0];
  state.risk = [0, 0, 0];
  state.points = [{ x: 0, real: 1000, expected: 1000, risk: 0 }];

  addEvent("Operação resetada", "Valores do ciclo foram restaurados.");
  renderAll();
}

function renderSelects() {
  $("#scenarioTank").innerHTML = tanks.map((tank) => `<option value="${tank.id}">${tank.code} · ${tank.volume} L</option>`).join("");
  $("#scenarioHose").innerHTML = hoses.map((hose) => `<option value="${hose.id}">${hose.code} · ${hose.length} m · perda ${hose.loss}</option>`).join("");
}

function renderScenarios() {
  $("#scenarioList").innerHTML = scenarios.map((scenario) => `
    <button class="scenario-card" data-scenario="${scenario.key}">
      <strong>${scenario.title}</strong>
      <span>${scenario.text}</span>
    </button>
  `).join("");

  $$(".scenario-card").forEach((card) => {
    card.addEventListener("click", () => {
      $$(".scenario-card").forEach((item) => item.classList.remove("selected"));
      card.classList.add("selected");
      state.selectedScenario = card.dataset.scenario;
    });
  });

  const first = $(".scenario-card");
  if (first) {
    first.classList.add("selected");
    state.selectedScenario = first.dataset.scenario;
  }
}

function runSimulation(manual = false) {
  let scenario = scenarios.find((item) => item.key === state.selectedScenario) || scenarios[0];

  let config = {
    target: 8,
    roots: 50,
    oil: 2.2,
    health: 0.96,
    oilDelay: Number($("#scenarioOilDelay")?.value || 0),
    maxCycle: 900,
    leak: false,
    sensor: false,
    plc: false
  };

  if (manual) {
    config = {
      target: Number($("#manualTarget").value || 8),
      roots: Number($("#manualRoots").value || 50),
      oil: Number($("#manualOil").value || 2.2),
      health: Number($("#manualPumpHealth").value || 0.96),
      oilDelay: Number($("#manualOilDelay").value || 0),
      maxCycle: Number($("#manualMaxCycle").value || 900),
      leak: $("#manualLeak").checked,
      sensor: $("#manualSensorFail").checked,
      plc: $("#manualPlcLoss").checked
    };

    scenario = {
      key: "manual",
      title: "Simulação manual",
      text: `Alvo ${config.target} mbar, Roots em ${config.roots} mbar, óleo ${config.oil} L/min, saúde ${config.health}.`,
      risk: 24,
      factor: 5.4 * config.health
    };
  }

  const tank = tanks.find((item) => String(item.id) === String($("#scenarioTank")?.value || 1)) || tanks[0];
  const hose = hoses.find((item) => String(item.id) === String($("#scenarioHose")?.value || 1)) || hoses[0];
  const volume = Number($("#scenarioVolume")?.value || tank.volume);
  const hoseLength = Number($("#scenarioHoseLength")?.value || hose.length);

  const risk = Math.min(
    98,
    Math.round(
      scenario.risk +
      volume / 320 +
      hoseLength * 1.3 +
      config.oilDelay * 0.18 +
      Math.max(0, 2 - config.oil) * 16 +
      Math.max(0, 1 - config.health) * 42 +
      (config.leak ? 24 : 0) +
      (config.sensor ? 18 : 0) +
      (config.plc ? 14 : 0)
    )
  );

  const status = risk >= 82 ? "Crítico" : risk >= 65 ? "Atenção" : "Operacional";
  const finalPressure = Math.max(config.target, config.target + hose.loss * 0.7 + Math.max(0, 2 - config.oil) * 1.8 + (config.leak ? 8 : 0));
  const estimatedTime = Math.round(Math.min(config.maxCycle, (volume / 640) * 220 + hose.loss * 42 + config.oilDelay * 1.6 + (1 - config.health) * 180));

  state.scenarioPoints = [];

  for (let t = 0; t <= 90; t += 5) {
    const pressure = Math.max(finalPressure, 1000 * Math.exp(-(t / 90) * scenario.factor));
    state.scenarioPoints.push({
      x: t,
      real: pressure + (risk >= 65 ? 18 : 0),
      expected: Math.max(config.target, 1000 * Math.exp(-(t / 90) * 6.0)),
      risk: risk * 10
    });
  }

  state.lastSimulation = {
    scenario: scenario.title,
    text: scenario.text,
    risk,
    status,
    finalPressure: finalPressure.toFixed(2),
    estimatedTime,
    tank: tank.code,
    hose: hose.code,
    config
  };

  $("#simulationStatus").textContent = status;
  $("#riskValue").textContent = risk + "%";
  $("#simulationDiagnostic").innerHTML = `
    <strong>${status}</strong><br>
    ${scenario.text}<br><br>
    Tanque: ${tank.code} · ${fmt(volume, "L")}<br>
    Mangueira: ${hose.code} · ${fmt(hoseLength, "m")}<br>
    Atraso do óleo: ${fmt(config.oilDelay, "s")}
  `;

  $("#simulationMetrics").innerHTML = `
    <div class="metric-row"><span>Pressão final</span><strong>${fmt(finalPressure, "mbar")}</strong></div>
    <div class="metric-row"><span>Tempo estimado</span><strong>${fmt(estimatedTime, "s")}</strong></div>
    <div class="metric-row"><span>Risco máximo</span><strong>${fmt(risk, "%")}</strong></div>
    <div class="metric-row"><span>Status</span><strong>${status}</strong></div>
  `;

  $("#assistantText").textContent = `A simulação "${scenario.title}" apresentou risco de ${risk}%. Valide com a TSEA se esse cenário existe no processo real e quais limites técnicos devem ser usados.`;

  const degrees = Math.round((risk / 100) * 360);
  const color = risk >= 82 ? "#dc2626" : risk >= 65 ? "#d97706" : "#22c55e";
  $("#riskMeter").style.background = `conic-gradient(${color} ${degrees}deg, #dbe7e1 ${degrees}deg)`;

  state.history.unshift({
    id: Date.now(),
    type: "Simulação",
    datetime: new Date().toLocaleString("pt-BR"),
    status,
    pressure: finalPressure.toFixed(2),
    risk,
    duration: estimatedTime + "s",
    tank: tank.code,
    hose: hose.code
  });

  state.history = state.history.slice(0, 80);

  addEvent("Simulação executada", `${scenario.title} · risco ${risk}%.`);
  save();

  renderSimulationTrace();
  drawChart("scenarioChart", state.scenarioPoints);
  renderReports();
  setTab("#twinTabs", "data-tab", "tab", "result");
}

function renderSimulationTrace() {
  const sim = state.lastSimulation;
  if (!sim) {
    $("#simulationTrace").innerHTML = `<tr><td colspan="5">Nenhuma simulação executada.</td></tr>`;
    $("#simulationActions").innerHTML = `<tr><td colspan="5">Nenhuma ação simulada.</td></tr>`;
    $("#simulationReport").innerHTML = `<tr><td colspan="3">Nenhum relatório disponível.</td></tr>`;
    return;
  }

  const traceRows = [
    ["Bomba primária", "Leybold SOGEVAC SV 630 B", "Pronta", "640 m³/h", "Evacuação inicial"],
    ["Bomba secundária", "Leybold RUVAC WSU 2001", Number(sim.finalPressure) <= sim.config.roots ? "Liberada" : "Bloqueada", "2050 m³/h", "Reforço do vácuo"],
    ["Tanque de processo", sim.tank, sim.status, fmt(sim.finalPressure, "mbar"), "Validação de pressão"],
    ["Sensor de pressão", "SP-" + sim.tank, sim.config.sensor ? "Falha simulada" : "Online", fmt(sim.risk, "%"), "Alimentar diagnóstico"],
    ["Mangueira", sim.hose, sim.risk >= 65 ? "Perda elevada" : "Operacional", "Fator simulado", "Condução de vácuo"],
    ["Sistema de óleo", "Injeção de óleo", sim.config.oil < 1.5 ? "Vazão baixa" : "Operacional", fmt(sim.config.oil, "L/min"), "Estabilidade e vedação"]
  ];

  $("#simulationTrace").innerHTML = traceRows.map((row) => `
    <tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td></tr>
  `).join("");

  const actionRows = [
    ["Preparação", "Parâmetros carregados", sim.tank, sim.hose, "Configuração aplicada ao ciclo simulado"],
    ["Evacuação inicial", "Bomba primária", fmt(sim.estimatedTime * 0.35, "s"), fmt(sim.finalPressure, "mbar"), "Redução inicial da pressão"],
    ["Acionamento secundário", Number(sim.finalPressure) <= sim.config.roots ? "Liberado" : "Bloqueado", fmt(sim.config.roots, "mbar"), "Intertravamento", "Bomba secundária depende de faixa segura"],
    ["Injeção de óleo", sim.config.oil < 1.5 ? "Insuficiente" : "Normal", fmt(sim.config.oil, "L/min"), "Vedação", "Condição usada no diagnóstico"],
    ["Fechamento", sim.status, fmt(sim.risk, "%"), "Resultado", sim.risk >= 82 ? "Revisar operação" : "Ciclo aceitável para protótipo"]
  ];

  $("#simulationActions").innerHTML = actionRows.map((row) => `
    <tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td></tr>
  `).join("");

  const reportRows = [
    ["Status final", sim.status, "Classificação geral da simulação"],
    ["Pressão final", fmt(sim.finalPressure, "mbar"), "Valor final calculado"],
    ["Tempo estimado", fmt(sim.estimatedTime, "s"), "Duração prevista do ciclo"],
    ["Risco máximo", fmt(sim.risk, "%"), sim.risk >= 82 ? "Reprovado" : sim.risk >= 65 ? "Aprovado com restrição" : "Aprovado"],
    ["Cenário", sim.scenario, "Origem da simulação usada no diagnóstico"]
  ];

  $("#simulationReport").innerHTML = reportRows.map((row) => `
    <tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>
  `).join("");
}

function renderSpecs() {
  $("#primarySpecs").innerHTML = specs.primary.map((item) => `<div class="param-row"><span>${item[0]}</span><strong>${item[1]}</strong></div>`).join("");
  $("#rootsSpecs").innerHTML = specs.roots.map((item) => `<div class="param-row"><span>${item[0]}</span><strong>${item[1]}</strong></div>`).join("");
  $("#unitSpecs").innerHTML = specs.units.map((item) => `<div class="param-row"><span>${item[0]}</span><strong>${item[1]}</strong><span>${item[2]}</span></div>`).join("");
  $("#marginSpecs").innerHTML = specs.margin.map((item) => `<div class="param-row"><span>${item[0]}</span><strong>${item[1]}</strong><span>${item[2]}</span></div>`).join("");
}

function renderHistory() {
  const term = ($("#historySearch")?.value || "").toLowerCase();
  const period = $("#historyPeriod")?.value || "all";
  const type = $("#historyType")?.value || "all";

  const rows = state.history.filter((item) => {
    const matchesTerm = JSON.stringify(item).toLowerCase().includes(term);
    const matchesType = type === "all" || item.type === type;
    const matchesPeriod = inPeriod(item.datetime, period);
    return matchesTerm && matchesType && matchesPeriod;
  });

  $("#historyCount").textContent = rows.length + " registros";

  if (!rows.length) {
    $("#historyTable").innerHTML = `<tr><td colspan="9">Nenhum registro encontrado.</td></tr>`;
    return;
  }

  $("#historyTable").innerHTML = rows.map((item) => {
    const cls = item.status === "Operacional" || item.status === "Concluído" ? "status-ok" : item.status === "Atenção" ? "status-warn" : "status-bad";
    return `
      <tr>
        <td>${item.id}</td>
        <td>${item.type}</td>
        <td>${item.datetime}</td>
        <td class="${cls}">${item.status}</td>
        <td>${fmt(item.pressure, "mbar")}</td>
        <td>${fmt(item.risk, "%")}</td>
        <td>${item.duration}</td>
        <td>${item.tank || "--"}</td>
        <td>${item.hose || "--"}</td>
      </tr>
    `;
  }).join("");
}

function renderReports() {
  const total = state.history.length;
  const ok = state.history.filter((item) => item.status === "Operacional" || item.status === "Concluído").length;
  const warn = total - ok;
  const pressures = state.history.map((item) => Number(item.pressure)).filter(Number.isFinite);
  const min = pressures.length ? Math.min(...pressures).toFixed(2) : "--";

  $("#reportTotal").textContent = total;
  $("#reportOk").textContent = ok;
  $("#reportWarn").textContent = warn;
  $("#reportMinPressure").textContent = min === "--" ? "--" : fmt(min, "mbar");

  $("#reportText").innerHTML = total
    ? `Foram registrados <strong>${total}</strong> itens no laboratório visual. Desse total, <strong>${ok}</strong> estão operacionais/concluídos e <strong>${warn}</strong> exigem atenção ou análise. A menor pressão final registrada foi <strong>${min} mbar</strong>.`
    : "Nenhum registro disponível. Execute uma operação ou simulação para gerar relatório.";
}

function renderParameters(tab = "tanks") {
  const content = {
    tanks: {
      title: "Tanques",
      subtitle: "Cadastro visual dos tanques do processo.",
      columns: ["Código", "Tipo", "Volume", "Limite estrutural"],
      rows: tanks.map((tank) => [tank.code, tank.type, fmt(tank.volume, "L"), fmt(tank.structuralLimit, "mbar")])
    },
    hoses: {
      title: "Mangueiras",
      subtitle: "Cadastro visual das mangueiras.",
      columns: ["Código", "Comprimento", "Diâmetro", "Perda", "Status"],
      rows: hoses.map((hose) => [hose.code, fmt(hose.length, "m"), fmt(hose.diameter, "pol"), fmt(hose.loss), hose.status])
    },
    recipes: {
      title: "Receitas",
      subtitle: "Receitas básicas do ciclo.",
      columns: ["Código", "Pressão alvo", "Roots inicia", "Tempo", "Óleo"],
      rows: recipes.map((recipe) => [recipe.code, fmt(recipe.target, "mbar"), fmt(recipe.roots, "mbar"), fmt(recipe.time, "s"), fmt(recipe.oil, "L/min")])
    },
    formulas: {
      title: "Fórmulas",
      subtitle: "Referências técnicas simplificadas.",
      columns: ["Nome", "Fórmula", "Aplicação"],
      rows: [
        ["Queda de pressão", "P(t)=P0·e^(-kt)", "Curva esperada"],
        ["Desvio percentual", "|medido-esperado|/esperado×100", "Margem de erro"],
        ["Risco", "Pressão + óleo + mangueira + bomba", "Classificação"],
        ["Carga estrutural", "Função da pressão efetiva e limite", "Criticidade do tanque"]
      ]
    },
    operators: {
      title: "Operadores",
      subtitle: "Usuários de exemplo.",
      columns: ["Nome", "Perfil", "Permissão", "Status"],
      rows: operators.map((op) => [op.name, op.role, op.permission, op.status])
    }
  }[tab];

  $("#paramTitle").textContent = content.title;
  $("#paramSubtitle").textContent = content.subtitle;

  $("#paramContent").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${content.columns.map((col) => `<th>${col}</th>`).join("")}</tr></thead>
        <tbody>${content.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function drawChart(containerId, points) {
  const box = $("#" + containerId);
  if (!box) return;

  if (!points || points.length < 2) {
    box.innerHTML = `<div class="empty-chart">A curva aparecerá após executar uma operação ou simulação.</div>`;
    return;
  }

  const values = points.flatMap((point) => [point.real, point.expected, point.risk || 0]).map(Number);
  const max = Math.max(...values, 10);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  function line(key) {
    return points.map((point, index) => {
      const value = Number(point[key] || 0);
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 92 - ((value - min) / span) * 82;
      return `${x},${y}`;
    }).join(" ");
  }

  box.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points="${line("expected")}" fill="none" stroke="#22c55e" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
      <polyline points="${line("risk")}" fill="none" stroke="#dc2626" stroke-width="1.4" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>
      <polyline points="${line("real")}" fill="none" stroke="#2563eb" stroke-width="2.2" vector-effect="non-scaling-stroke"/>
    </svg>
  `;
}

function clearHistory() {
  state.history = [];
  save();
  renderHistory();
  renderReports();
  renderOperation();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tsea-front-lab-historico.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  $$(".menu-card").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

  $("#btnStart").addEventListener("click", startOperation);
  $("#btnEmergency").addEventListener("click", emergencyStop);
  $("#btnReset").addEventListener("click", resetOperation);

  $("#btnRunScenario").addEventListener("click", () => runSimulation(false));
  $("#btnManualSim").addEventListener("click", () => runSimulation(true));

  $$("#twinTabs .tab").forEach((btn) => btn.addEventListener("click", () => setTab("#twinTabs", "data-tab", "tab", btn.dataset.tab)));

  $$("#reportTabs .tab").forEach((btn) => btn.addEventListener("click", () => {
    $$("#reportTabs .tab").forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
  }));

  $$("#paramTabs .tab").forEach((btn) => btn.addEventListener("click", () => {
    $$("#paramTabs .tab").forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    renderParameters(btn.dataset.paramTab);
  }));

  $("#historySearch").addEventListener("input", renderHistory);
  $("#historyPeriod").addEventListener("change", renderHistory);
  $("#historyType").addEventListener("change", renderHistory);
  $("#btnClearHistory").addEventListener("click", clearHistory);
  $("#btnExportJson").addEventListener("click", exportJson);
  $("#btnPrint").addEventListener("click", () => window.print());
}

function renderAll() {
  renderSelects();
  renderOperation();
  renderEvents();
  renderSpecs();
  renderScenarios();
  renderHistory();
  renderReports();
  renderSimulationTrace();
  renderParameters("tanks");
  drawChart("scenarioChart", state.scenarioPoints);
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderAll();
});
