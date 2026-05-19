const pages = {
  dashboard: ["Visão geral", "Resumo operacional do protótipo."],
  operacao: ["Operação", "Controle simulado de tanques, bombas e rampa de vácuo."],
  gemeo: ["Gêmeo Digital", "Cenários simulados com diagnóstico básico."],
  historico: ["Histórico", "Operações registradas localmente no navegador."],
  relatorios: ["Relatórios", "Resumo gerencial simples do protótipo."],
  parametros: ["Parâmetros", "Dados técnicos básicos para referência visual."]
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let state = {
  running: false,
  pressure: [1000, 1000, 1000],
  pump1: false,
  pump2: false,
  elapsed: 0,
  risk: 0,
  operationPoints: [{ x: 0, y: 1000 }],
  interval: null,
  history: JSON.parse(localStorage.getItem("tsea_lab_history") || "[]"),
  events: JSON.parse(localStorage.getItem("tsea_lab_events") || "[]")
};

let operationChart;
let scenarioChart;

function save() {
  localStorage.setItem("tsea_lab_history", JSON.stringify(state.history));
  localStorage.setItem("tsea_lab_events", JSON.stringify(state.events));
}

function averagePressure() {
  return state.pressure.reduce((a, b) => a + b, 0) / state.pressure.length;
}

function addEvent(title, text) {
  state.events.unshift({
    title,
    text,
    at: new Date().toLocaleString("pt-BR")
  });
  state.events = state.events.slice(0, 8);
  save();
  renderEvents();
}

function setPage(page) {
  $$(".page").forEach((p) => p.classList.remove("active"));
  $("#" + page).classList.add("active");

  $$(".nav-btn").forEach((b) => b.classList.remove("active"));
  $(`.nav-btn[data-page="${page}"]`).classList.add("active");

  $("#pageTitle").textContent = pages[page][0];
  $("#pageSubtitle").textContent = pages[page][1];

  if (page === "historico") renderHistory();
  if (page === "relatorios") renderReports();

  setTimeout(() => {
    operationChart?.resize();
    scenarioChart?.resize();
  }, 80);
}

function renderTanks() {
  const tankCards = $("#tankCards");
  const dashboardTanks = $("#dashboardTanks");

  tankCards.innerHTML = "";
  dashboardTanks.innerHTML = "";

  state.pressure.forEach((p, i) => {
    const id = i + 1;

    tankCards.innerHTML += `
      <article class="tank-card">
        <h4>Tanque ${String(id).padStart(2, "0")}</h4>
        <div class="tank-value">${p.toFixed(1)} <small>mbar</small></div>
        <select>
          <option>Mangueira M-01</option>
          <option>Mangueira M-02</option>
          <option>Mangueira M-03</option>
        </select>
      </article>
    `;

    dashboardTanks.innerHTML += `
      <div class="tank-mini">
        <strong>Tanque ${id}</strong>
        <span>${p.toFixed(1)} mbar</span>
      </div>
    `;
  });
}

function renderOperation() {
  const avg = averagePressure();

  $("#mainPressure").textContent = avg.toFixed(1);
  $("#dashPressao").textContent = `${avg.toFixed(1)} mbar`;
  $("#dashStatus").textContent = state.running ? "Operando" : "Pronto";
  $("#dashOperacoes").textContent = state.history.length;
  $("#dashRisco").textContent = `${state.risk}%`;

  $("#pump1").textContent = state.pump1 ? "ON" : "OFF";
  $("#pump2").textContent = state.pump2 ? "ON" : "OFF";
  $("#pump1").className = `badge ${state.pump1 ? "on" : "off"}`;
  $("#pump2").className = `badge ${state.pump2 ? "on" : "off"}`;

  $("#cycleState").textContent = state.running ? "em execução" : "parado";

  const progress = Math.min(100, Math.max(0, (1 - avg / 1000) * 100));
  $("#progressFill").style.width = `${progress}%`;
  $("#progressLabel").textContent = `${Math.round(progress)}%`;

  renderTanks();

  if (operationChart) {
    operationChart.data.datasets[0].data = state.operationPoints;
    operationChart.update();
  }
}

function startCycle() {
  if (state.running) return;

  state.running = true;
  state.pump1 = true;
  state.pump2 = false;
  state.elapsed = 0;
  state.risk = 8;
  state.pressure = [1000, 1000, 1000];
  state.operationPoints = [{ x: 0, y: 1000 }];

  const target = Number($("#targetPressure").value || 10);
  const pump2Limit = Number($("#pump2Pressure").value || 50);
  const estimated = Number($("#estimatedTime").value || 90);

  addEvent("Ciclo iniciado", "Operação simulada iniciada.");

  clearInterval(state.interval);

  state.interval = setInterval(() => {
    if (!state.running) return;

    state.elapsed += 1;

    const progress = Math.min(state.elapsed / estimated, 1);
    let next = 1000 * Math.exp(-progress * 5.7);
    next = Math.max(next, target);

    state.pressure = state.pressure.map((_, i) => Math.max(next - i * 0.35, target));

    const avg = averagePressure();

    if (!state.pump2 && avg <= pump2Limit) {
      state.pump2 = true;
      addEvent("Bomba secundária ligada", "Pressão atingiu a faixa definida.");
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

  const avg = averagePressure();

  state.history.unshift({
    id: Date.now(),
    datetime: new Date().toLocaleString("pt-BR"),
    tank: "Tanques 1, 2 e 3",
    operator: "Operador teste",
    finalPressure: avg.toFixed(2),
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
  state.operationPoints = [{ x: 0, y: 1000 }];

  addEvent("Ciclo resetado", "Valores restaurados.");
  renderOperation();
}

function resetAll() {
  clearInterval(state.interval);

  state.running = false;
  state.pump1 = false;
  state.pump2 = false;
  state.elapsed = 0;
  state.risk = 0;
  state.pressure = [1000, 1000, 1000];
  state.operationPoints = [{ x: 0, y: 1000 }];
  state.history = [];
  state.events = [];

  save();
  renderAll();
}

function runScenario() {
  const scenario = $("#scenarioSelect").value;
  const volume = Number($("#simVolume").value || 100);
  const hose = Number($("#simHose").value || 5);

  const data = {
    seguro: [12, "Operacional", "Cenário estável. A operação tende a atingir a pressão alvo dentro do tempo esperado.", 5.8],
    oleo: [58, "Atenção", "Atraso de óleo pode aumentar o tempo de ciclo e exigir acompanhamento.", 4.2],
    vazamento: [76, "Crítico", "Possível vazamento na linha. A queda de pressão fica mais lenta.", 2.6],
    sensor: [82, "Crítico", "Falha de sensor simulada. O sistema deve bloquear decisão automática.", 2.1],
    bomba: [64, "Atenção", "Desgaste de bomba reduz eficiência e aumenta a duração do ciclo.", 3.4]
  }[scenario];

  const risk = Math.min(100, Math.round(data[0] + Math.min(18, volume / 25) + Math.min(12, hose * 1.5)));

  const points = [];
  for (let t = 0; t <= 90; t += 5) {
    points.push({ x: t, y: Math.max(10, 1000 * Math.exp(-(t / 90) * data[3])) });
  }

  $("#scenarioRisk").textContent = `${risk}%`;
  $("#scenarioStatus").textContent = data[1];
  $("#scenarioDiagnostic").innerHTML = `
    <strong>${data[1]}</strong><br>
    ${data[2]}<br><br>
    Volume: ${volume} L<br>
    Mangueira: ${hose} m
  `;

  const deg = Math.round((risk / 100) * 360);
  const color = risk >= 75 ? "#ef4444" : risk >= 50 ? "#f59e0b" : "#22c55e";
  $(".risk-circle").style.background = `conic-gradient(${color} ${deg}deg, #e2e8f0 ${deg}deg)`;

  scenarioChart.data.datasets[0].data = points;
  scenarioChart.update();

  state.risk = risk;
  addEvent("Simulação executada", `Risco estimado: ${risk}%.`);
  renderOperation();
}

function renderHistory() {
  const term = ($("#historySearch")?.value || "").toLowerCase();
  const rows = state.history.filter((item) => JSON.stringify(item).toLowerCase().includes(term));

  $("#historyCount").textContent = `${rows.length} registros`;

  if (!rows.length) {
    $("#historyTable").innerHTML = `<tr><td colspan="7">Nenhuma operação registrada.</td></tr>`;
    return;
  }

  $("#historyTable").innerHTML = rows.map((item) => `
    <tr>
      <td>${item.id}</td>
      <td>${item.datetime}</td>
      <td>${item.tank}</td>
      <td>${item.operator}</td>
      <td>${item.finalPressure} mbar</td>
      <td>${item.duration}</td>
      <td class="${item.status === "CONCLUÍDO" ? "status-ok" : "status-bad"}">${item.status}</td>
    </tr>
  `).join("");
}

function renderReports() {
  const total = state.history.length;
  const success = state.history.filter((i) => i.status === "CONCLUÍDO").length;
  const abort = state.history.filter((i) => i.status === "ABORTADO").length;
  const pressures = state.history.map((i) => Number(i.finalPressure)).filter(Number.isFinite);
  const min = pressures.length ? Math.min(...pressures).toFixed(2) : "--";

  $("#reportTotal").textContent = total;
  $("#reportSuccess").textContent = success;
  $("#reportAbort").textContent = abort;
  $("#reportMin").textContent = min === "--" ? "--" : `${min} mbar`;

  $("#reportText").innerHTML = total === 0
    ? "Nenhuma operação registrada ainda."
    : `
      <strong>Resumo do protótipo</strong><br><br>
      Foram registradas <strong>${total}</strong> operações.
      Desse total, <strong>${success}</strong> foram concluídas e <strong>${abort}</strong> foram abortadas.
      A menor pressão final registrada foi <strong>${min} mbar</strong>.
    `;
}

function renderEvents() {
  if (!state.events.length) {
    $("#eventList").innerHTML = `<div class="event-item"><strong>Nenhum evento</strong><span>Eventos aparecerão durante o uso.</span></div>`;
    return;
  }

  $("#eventList").innerHTML = state.events.map((e) => `
    <div class="event-item">
      <strong>${e.title}</strong>
      <span>${e.text}<br>${e.at}</span>
    </div>
  `).join("");
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tsea-historico-lab.json";
  a.click();
  URL.revokeObjectURL(url);
}

function initCharts() {
  operationChart = new Chart($("#operationChart"), {
    type: "line",
    data: {
      datasets: [{
        label: "Pressão média (mbar)",
        data: state.operationPoints,
        borderColor: "#3b82f6",
        tension: 0.35,
        pointRadius: 0
      }]
    },
    options: {
      parsing: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: "linear", title: { display: true, text: "Tempo (s)" } },
        y: { reverse: true, title: { display: true, text: "Pressão (mbar)" } }
      }
    }
  });

  scenarioChart = new Chart($("#scenarioChart"), {
    type: "line",
    data: {
      datasets: [{
        label: "Curva simulada",
        data: [],
        borderColor: "#22c55e",
        tension: 0.35,
        pointRadius: 0
      }]
    },
    options: {
      parsing: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: "linear", title: { display: true, text: "Tempo (s)" } },
        y: { reverse: true, title: { display: true, text: "Pressão (mbar)" } }
      }
    }
  });
}

function bindEvents() {
  $$(".nav-btn").forEach((btn) => btn.addEventListener("click", () => setPage(btn.dataset.page)));

  $("#btnStart").addEventListener("click", startCycle);
  $("#btnEmergency").addEventListener("click", emergencyStop);
  $("#btnResetCycle").addEventListener("click", resetCycle);
  $("#btnResetAll").addEventListener("click", resetAll);
  $("#btnRunScenario").addEventListener("click", runScenario);
  $("#btnClearHistory").addEventListener("click", () => {
    state.history = [];
    save();
    renderHistory();
    renderReports();
    renderOperation();
  });
  $("#historySearch").addEventListener("input", renderHistory);
  $("#btnExportJson").addEventListener("click", exportJson);
  $("#btnPrint").addEventListener("click", () => window.print());
}

function renderAll() {
  renderOperation();
  renderEvents();
  renderHistory();
  renderReports();
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  initCharts();
  renderAll();
});
