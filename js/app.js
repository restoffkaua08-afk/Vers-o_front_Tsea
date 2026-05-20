const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const tankMeta = [
  { id: 1, volume: 80, hose: "M-01", recipe: "Regulador padrão", sensor: "PT-001" },
  { id: 2, volume: 120, hose: "M-02", recipe: "Regulador médio", sensor: "PT-002" },
  { id: 3, volume: 160, hose: "M-03", recipe: "Regulador grande", sensor: "PT-003" }
];

let state = {
  running: false,
  pump1: false,
  pump2: false,
  pressure: [1000, 1000, 1000],
  sensors: [1000, 1000, 1000],
  elapsed: 0,
  risk: 0,
  stage: "Aguardando",
  interval: null,
  operationPoints: [{ x: 0, y: 1000 }],
  scenarioPoints: [],
  events: JSON.parse(localStorage.getItem("tsea_lab_events") || "[]"),
  history: JSON.parse(localStorage.getItem("tsea_lab_history") || "[]")
};

function save() {
  localStorage.setItem("tsea_lab_events", JSON.stringify(state.events));
  localStorage.setItem("tsea_lab_history", JSON.stringify(state.history));
}

function averagePressure() {
  return state.pressure.reduce((sum, value) => sum + value, 0) / state.pressure.length;
}

function addEvent(title, description) {
  state.events.unshift({
    title,
    description,
    date: new Date().toLocaleString("pt-BR")
  });

  state.events = state.events.slice(0, 8);
  save();
  renderEvents();
}

function setPage(page) {
  $$(".page").forEach((el) => el.classList.remove("active"));
  $("#" + page).classList.add("active");

  $$(".nav-btn").forEach((el) => el.classList.remove("active"));
  $(`.nav-btn[data-page="${page}"]`).classList.add("active");

  if (page === "historico") renderHistory();
  if (page === "relatorios") renderReports();

  setTimeout(() => {
    drawOperationChart();
    drawScenarioChart();
  }, 80);
}

function getTargetPressure() {
  return Number($("#targetPressure")?.value || 10);
}

function getRootsPressure() {
  return Number($("#rootsPressure")?.value || 50);
}

function getVacuumPercent(pressure) {
  return Math.min(100, Math.max(0, (1 - pressure / 1000) * 100));
}

function updateStage() {
  const pressure = averagePressure();
  const target = getTargetPressure();
  const roots = getRootsPressure();

  if (!state.running && pressure >= 999) {
    state.stage = "Aguardando";
    return;
  }

  if (pressure <= target) {
    state.stage = "Finalizado";
    return;
  }

  if (pressure <= target * 1.5) {
    state.stage = "Estabilização";
    return;
  }

  if (pressure <= roots) {
    state.stage = "Bomba Roots";
    return;
  }

  if (state.running) {
    state.stage = "Bomba primária";
    return;
  }

  state.stage = "Parado";
}

function getTankStatus(pressure) {
  if (state.risk >= 90) return ["Crítico", "critical"];
  if (!state.running && pressure >= 999) return ["Aguardando", "waiting"];
  if (pressure <= getTargetPressure()) return ["Concluído", "done"];
  if (pressure <= getRootsPressure()) return ["Roots ativo", "roots"];
  return ["Em vácuo", "running"];
}

function renderTanks() {
  const tankCards = $("#tankCards");
  const miniTanks = $("#miniTanks");

  tankCards.innerHTML = "";
  miniTanks.innerHTML = "";

  state.pressure.forEach((pressure, index) => {
    const meta = tankMeta[index];
    const sensor = state.sensors[index];
    const [statusText, statusClass] = getTankStatus(pressure);
    const vacuum = getVacuumPercent(pressure);
    const target = getTargetPressure();

    tankCards.innerHTML += `
      <article class="tank-card ${statusClass}">
        <div class="tank-head">
          <div>
            <h4>Tanque ${String(meta.id).padStart(2, "0")}</h4>
            <span>${meta.recipe}</span>
          </div>
          <b class="tank-status ${statusClass}">${statusText}</b>
        </div>

        <div class="tank-pressure">
          <strong>${pressure.toFixed(1)}</strong>
          <span>mbar · pressão estimada</span>
        </div>

        <div class="tank-details">
          <div class="detail-row"><span>Sensor</span><strong>${meta.sensor} · ${sensor.toFixed(1)} mbar</strong></div>
          <div class="detail-row"><span>Pressão alvo</span><strong>${target} mbar</strong></div>
          <div class="detail-row"><span>Mangueira</span><strong>${meta.hose}</strong></div>
          <div class="detail-row"><span>Volume</span><strong>${meta.volume} L</strong></div>
          <div class="detail-row"><span>Vácuo aplicado</span><strong>${Math.round(vacuum)}%</strong></div>
        </div>

        <select>
          <option>${meta.hose} · selecionada</option>
          <option>M-01 · 5 m</option>
          <option>M-02 · 8 m</option>
          <option>M-03 · 3 m</option>
        </select>
      </article>
    `;

    miniTanks.innerHTML += `
      <div class="mini-tank">
        <div>
          <strong>Tanque ${meta.id}</strong><br>
          <span>${statusText} · ${meta.hose} · ${meta.volume} L</span>
        </div>
        <strong>${pressure.toFixed(1)} mbar</strong>
      </div>
    `;
  });
}

function renderSteps() {
  const order = ["stepPrep", "stepPrimary", "stepRoots", "stepOil", "stepDone"];
  const map = {
    Aguardando: ["stepPrep"],
    "Bomba primária": ["stepPrep", "stepPrimary"],
    "Bomba Roots": ["stepPrep", "stepPrimary", "stepRoots"],
    Estabilização: ["stepPrep", "stepPrimary", "stepRoots", "stepOil"],
    Finalizado: ["stepPrep", "stepPrimary", "stepRoots", "stepOil", "stepDone"],
    Parado: ["stepPrep"]
  };

  order.forEach((id) => $("#" + id).classList.remove("active", "done"));

  const active = map[state.stage] || ["stepPrep"];

  active.forEach((id, index) => {
    const element = $("#" + id);
    if (index === active.length - 1) element.classList.add("active");
    else element.classList.add("done");
  });
}

function renderOperation() {
  updateStage();

  const pressure = averagePressure();
  const progress = getVacuumPercent(pressure);

  $("#mainPressure").textContent = pressure.toFixed(1);
  $("#dashPressure").textContent = `${pressure.toFixed(1)} mbar`;
  $("#dashCycle").textContent = state.stage;
  $("#dashRisk").textContent = `${state.risk}%`;
  $("#dashHistory").textContent = state.history.length;

  $("#globalState").textContent = state.running ? "Operação em andamento" : "Sistema pronto";

  $("#cycleStageTitle").textContent = state.stage;
  $("#cycleStageDescription").textContent = getStageDescription(state.stage);
  $("#cycleLabel").textContent = state.running ? "em execução" : "parado";
  $("#cyclePercent").textContent = `${Math.round(progress)}%`;
  $("#progressText").textContent = `${Math.round(progress)}%`;
  $("#progressFill").style.width = `${progress}%`;

  $("#pump1").textContent = state.pump1 ? "LIGADA" : "DESLIGADA";
  $("#pump2").textContent = state.pump2 ? "LIGADA" : "DESLIGADA";
  $("#pump1").className = "state " + (state.pump1 ? "on" : "off");
  $("#pump2").className = "state " + (state.pump2 ? "on" : "off");

  $("#dashHistory").textContent = state.history.length;

  renderTanks();
  renderSteps();
  drawOperationChart();
}

function getStageDescription(stage) {
  const descriptions = {
    Aguardando: "Aguardando comando de início. Tanques em pressão ambiente.",
    "Bomba primária": "Bomba primária aplicando vácuo inicial nos tanques.",
    "Bomba Roots": "Pressão atingiu a faixa definida para acionamento da bomba Roots.",
    Estabilização: "Pressão próxima do alvo. Sistema em fase de estabilização.",
    Finalizado: "Ciclo concluído dentro da pressão alvo configurada.",
    Parado: "Ciclo parado ou resetado."
  };

  return descriptions[stage] || "Estado operacional não classificado.";
}

function startCycle() {
  if (state.running) return;

  state.running = true;
  state.pump1 = true;
  state.pump2 = false;
  state.elapsed = 0;
  state.risk = 8;
  state.pressure = [1000, 1000, 1000];
  state.sensors = [1000, 1000, 1000];
  state.operationPoints = [{ x: 0, y: 1000 }];

  const target = getTargetPressure();
  const rootsPressure = getRootsPressure();
  const estimated = Number($("#estimatedTime").value || 90);

  addEvent("Ciclo iniciado", "Operação de vácuo simulada iniciada pelo painel.");

  clearInterval(state.interval);

  state.interval = setInterval(() => {
    if (!state.running) return;

    state.elapsed += 1;

    const progress = Math.min(state.elapsed / estimated, 1);
    let basePressure = 1000 * Math.exp(-progress * 5.7);
    basePressure = Math.max(basePressure, target);

    state.pressure = state.pressure.map((_, index) => {
      const volumePenalty = index * 0.45;
      return Math.max(basePressure - volumePenalty, target);
    });

    state.sensors = state.pressure.map((value, index) => {
      const sensorNoise = index * 0.18;
      return Math.max(value + sensorNoise, target);
    });

    const avg = averagePressure();

    if (!state.pump2 && avg <= rootsPressure) {
      state.pump2 = true;
      addEvent("Bomba Roots ligada", "A pressão atingiu a faixa configurada para a segunda etapa.");
    }

    state.operationPoints.push({ x: state.elapsed, y: avg });

    if (avg <= target) {
      finishCycle("CONCLUÍDO");
      return;
    }

    renderOperation();
  }, 500);

  renderOperation();
}

function finishCycle(status) {
  clearInterval(state.interval);

  const pressure = averagePressure();

  state.history.unshift({
    id: Date.now(),
    datetime: new Date().toLocaleString("pt-BR"),
    tanks: "Tanques 1, 2 e 3",
    operator: "Operador teste",
    finalPressure: pressure.toFixed(2),
    duration: `${state.elapsed}s`,
    status
  });

  state.history = state.history.slice(0, 100);

  state.running = false;
  state.pump1 = false;
  state.pump2 = false;

  addEvent(status === "CONCLUÍDO" ? "Ciclo concluído" : "Ciclo abortado", `Status final: ${status}.`);
  save();
  renderOperation();
  renderHistory();
  renderReports();
}

function emergencyStop() {
  if (state.running) {
    state.risk = 100;
    finishCycle("ABORTADO");
  } else {
    addEvent("Emergência acionada", "Nenhum ciclo estava em execução.");
  }
}

function resetCycle() {
  clearInterval(state.interval);

  state.running = false;
  state.pump1 = false;
  state.pump2 = false;
  state.elapsed = 0;
  state.risk = 0;
  state.pressure = [1000, 1000, 1000];
  state.sensors = [1000, 1000, 1000];
  state.operationPoints = [{ x: 0, y: 1000 }];

  addEvent("Ciclo resetado", "Valores da operação foram restaurados.");
  renderOperation();
}

function runScenario() {
  const scenario = $("#scenarioSelect").value;
  const volume = Number($("#scenarioVolume").value || 100);
  const hose = Number($("#scenarioHose").value || 5);

  const scenarios = {
    seguro: [12, "Operacional", "Cenário estável. A operação tende a atingir a pressão alvo dentro do tempo esperado.", 5.8],
    oleo: [56, "Atenção", "Atraso de óleo pode aumentar o tempo de ciclo e exigir acompanhamento.", 4.2],
    vazamento: [78, "Crítico", "Possível vazamento na linha. A queda de pressão fica mais lenta e instável.", 2.6],
    sensor: [84, "Crítico", "Falha de sensor simulada. O sistema deve bloquear decisão automática.", 2.1],
    bomba: [64, "Atenção", "Desgaste de bomba reduz eficiência e aumenta a duração do ciclo.", 3.4]
  };

  const selected = scenarios[scenario];
  const risk = Math.min(100, Math.round(selected[0] + volume / 25 + hose * 1.5));

  state.scenarioPoints = [];

  for (let time = 0; time <= 90; time += 5) {
    state.scenarioPoints.push({
      x: time,
      y: Math.max(10, 1000 * Math.exp(-(time / 90) * selected[3]))
    });
  }

  $("#scenarioStatus").textContent = selected[1];
  $("#scenarioRisk").textContent = `${risk}%`;
  $("#scenarioDiagnostic").innerHTML = `
    <strong>${selected[1]}</strong><br>
    ${selected[2]}<br><br>
    Volume considerado: ${volume} L<br>
    Mangueira considerada: ${hose} m
  `;

  const degrees = Math.round((risk / 100) * 360);
  const color = risk >= 75 ? "#ef4444" : risk >= 50 ? "#f59e0b" : "#22c55e";
  $("#riskMeter").style.background = `conic-gradient(${color} ${degrees}deg, #e2e8f0 ${degrees}deg)`;

  state.risk = risk;
  addEvent("Simulação executada", `Cenário analisado com risco estimado de ${risk}%.`);
  renderOperation();
  drawScenarioChart();
}

function renderEvents() {
  if (state.events.length === 0) {
    $("#eventList").innerHTML = `
      <div class="event-item">
        <strong>Nenhum evento registrado</strong>
        <span>Os eventos aparecerão conforme o uso do sistema.</span>
      </div>
    `;
    return;
  }

  $("#eventList").innerHTML = state.events.map((event) => `
    <div class="event-item">
      <strong>${event.title}</strong>
      <span>${event.description}<br>${event.date}</span>
    </div>
  `).join("");
}

function renderHistory() {
  const search = ($("#historySearch")?.value || "").toLowerCase();

  const rows = state.history.filter((item) => {
    return JSON.stringify(item).toLowerCase().includes(search);
  });

  $("#historyCount").textContent = `${rows.length} registros`;

  if (rows.length === 0) {
    $("#historyTable").innerHTML = `<tr><td colspan="7">Nenhuma operação registrada.</td></tr>`;
    return;
  }

  $("#historyTable").innerHTML = rows.map((item) => `
    <tr>
      <td>${item.id}</td>
      <td>${item.datetime}</td>
      <td>${item.tanks}</td>
      <td>${item.operator}</td>
      <td>${item.finalPressure} mbar</td>
      <td>${item.duration}</td>
      <td class="${item.status === "CONCLUÍDO" ? "status-ok" : "status-bad"}">${item.status}</td>
    </tr>
  `).join("");
}

function renderReports() {
  const total = state.history.length;
  const success = state.history.filter((item) => item.status === "CONCLUÍDO").length;
  const abort = state.history.filter((item) => item.status === "ABORTADO").length;
  const pressures = state.history.map((item) => Number(item.finalPressure)).filter(Number.isFinite);
  const minPressure = pressures.length ? Math.min(...pressures).toFixed(2) : "--";

  $("#reportTotal").textContent = total;
  $("#reportSuccess").textContent = success;
  $("#reportAbort").textContent = abort;
  $("#reportMin").textContent = minPressure === "--" ? "--" : `${minPressure} mbar`;

  $("#reportText").innerHTML = total === 0
    ? "Nenhuma operação registrada ainda. Inicie uma operação para gerar dados."
    : `
      <strong>Resumo operacional</strong><br><br>
      Foram registradas <strong>${total}</strong> operações no protótipo.
      Desse total, <strong>${success}</strong> foram concluídas e <strong>${abort}</strong> foram abortadas.
      A menor pressão final registrada foi <strong>${minPressure} mbar</strong>.
      <br><br>
      Este relatório é local e serve para validar a organização visual antes de migrar a interface para React.
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
  anchor.download = "historico-tsea-front-lab.json";
  anchor.click();

  URL.revokeObjectURL(url);
}

function drawLineChart(canvasId, points, color) {
  const canvas = $("#" + canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i++) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (!points || points.length < 2) {
    ctx.fillStyle = "#64748b";
    ctx.font = "14px Segoe UI";
    ctx.fillText("A curva aparecerá após iniciar a operação ou executar uma simulação.", 18, 30);
    return;
  }

  const maxX = Math.max(...points.map((p) => p.x), 1);
  const minY = 0;
  const maxY = 1000;

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();

  points.forEach((point, index) => {
    const x = (point.x / maxX) * (width - 30) + 15;
    const y = height - ((point.y - minY) / (maxY - minY)) * (height - 30) - 15;

    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "12px Segoe UI";
  ctx.fillText("Pressão (mbar)", 18, 18);
  ctx.fillText("Tempo (s)", width - 75, height - 12);
}

function drawOperationChart() {
  drawLineChart("operationCanvas", state.operationPoints, "#3b82f6");
}

function drawScenarioChart() {
  drawLineChart("scenarioCanvas", state.scenarioPoints, "#22c55e");
}

function bindEvents() {
  $$(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  $("#btnStart").addEventListener("click", startCycle);
  $("#btnEmergency").addEventListener("click", emergencyStop);
  $("#btnReset").addEventListener("click", resetCycle);
  $("#btnRunScenario").addEventListener("click", runScenario);
  $("#btnClearHistory").addEventListener("click", clearHistory);
  $("#historySearch").addEventListener("input", renderHistory);
  $("#btnExportJson").addEventListener("click", exportJson);
  $("#btnPrint").addEventListener("click", () => window.print());
}

function renderAll() {
  renderOperation();
  renderEvents();
  renderHistory();
  renderReports();
  drawOperationChart();
  drawScenarioChart();
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderAll();
});
