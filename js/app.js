const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const pages = {
  visao: ["Visão Geral", "Resumo do estado operacional, tanques, bombas e último ciclo registrado."],
  operacao: ["Operação", "Acompanhamento do ciclo de vácuo, tanques, bombas e curva de pressão."],
  gemeo: ["Gêmeo Digital", "Simulação de cenários para prever comportamento do processo antes da operação."],
  historico: ["Histórico", "Registros locais de operações concluídas ou abortadas."],
  relatorios: ["Relatórios", "Resumo gerencial simples gerado a partir dos registros do protótipo."],
  dados: ["Dados Técnicos", "Informações de referência para explicar o funcionamento do protótipo."]
};

let state = {
  running: false,
  pump1: false,
  pump2: false,
  pressure: [1000, 1000, 1000],
  elapsed: 0,
  risk: 0,
  interval: null,
  operationPoints: [{ x: 0, y: 1000 }],
  events: JSON.parse(localStorage.getItem("tsea_events") || "[]"),
  history: JSON.parse(localStorage.getItem("tsea_history") || "[]")
};

let operationChart;
let scenarioChart;

function save() {
  localStorage.setItem("tsea_events", JSON.stringify(state.events));
  localStorage.setItem("tsea_history", JSON.stringify(state.history));
}

function averagePressure() {
  return state.pressure.reduce((total, value) => total + value, 0) / state.pressure.length;
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
  $$(".page").forEach((element) => element.classList.remove("active"));
  $("#" + page).classList.add("active");

  $$(".nav-item").forEach((element) => element.classList.remove("active"));
  $(`.nav-item[data-page="${page}"]`).classList.add("active");

  if (page === "historico") renderHistory();
  if (page === "relatorios") renderReports();

  setTimeout(() => {
    if (operationChart) operationChart.resize();
    if (scenarioChart) scenarioChart.resize();
  }, 80);
}

function renderTanks() {
  const tankCards = $("#tankCards");
  const miniTanks = $("#miniTanks");

  tankCards.innerHTML = "";
  miniTanks.innerHTML = "";

  state.pressure.forEach((pressure, index) => {
    const tankNumber = index + 1;

    tankCards.innerHTML += `
      <article class="tank-card">
        <h4>Tanque ${String(tankNumber).padStart(2, "0")}</h4>
        <div class="tank-value">${pressure.toFixed(1)} <small>mbar</small></div>
        <select>
          <option>Mangueira M-01</option>
          <option>Mangueira M-02</option>
          <option>Mangueira M-03</option>
        </select>
      </article>
    `;

    miniTanks.innerHTML += `
      <div class="mini-tank">
        <strong>Tanque ${tankNumber}</strong>
        <span>${pressure.toFixed(1)} mbar</span>
      </div>
    `;
  });
}

function renderOperation() {
  const pressure = averagePressure();
  const progress = Math.min(100, Math.max(0, (1 - pressure / 1000) * 100));

  $("#mainPressure").textContent = pressure.toFixed(1);
  $("#kpiPressure").textContent = `${pressure.toFixed(1)} mbar`;
  $("#kpiStatus").textContent = state.running ? "Operando" : "Pronto";
  $("#kpiRisk").textContent = `${state.risk}%`;
  $("#kpiHistory").textContent = state.history.length;
  $("#globalState").textContent = state.running ? "Operação em andamento" : "Sistema pronto";

  $("#pump1").textContent = state.pump1 ? "LIGADA" : "DESLIGADA";
  $("#pump2").textContent = state.pump2 ? "LIGADA" : "DESLIGADA";
  $("#pump1").className = "state " + (state.pump1 ? "on" : "off");
  $("#pump2").className = "state " + (state.pump2 ? "on" : "off");

  $("#cycleLabel").textContent = state.running ? "em execução" : "parado";
  $("#progressText").textContent = `${Math.round(progress)}%`;
  $("#progressFill").style.width = `${progress}%`;

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
  state.risk = 10;
  state.pressure = [1000, 1000, 1000];
  state.operationPoints = [{ x: 0, y: 1000 }];

  const target = Number($("#targetPressure").value || 10);
  const pump2Limit = Number($("#pump2Pressure").value || 50);
  const estimated = Number($("#estimatedTime").value || 90);

  addEvent("Ciclo iniciado", "Operação de vácuo simulada iniciada.");

  clearInterval(state.interval);

  state.interval = setInterval(() => {
    if (!state.running) return;

    state.elapsed += 1;

    const progress = Math.min(state.elapsed / estimated, 1);
    let nextPressure = 1000 * Math.exp(-progress * 5.7);
    nextPressure = Math.max(nextPressure, target);

    state.pressure = state.pressure.map((_, index) => {
      return Math.max(nextPressure - index * 0.4, target);
    });

    const avg = averagePressure();

    if (!state.pump2 && avg <= pump2Limit) {
      state.pump2 = true;
      addEvent("Bomba secundária ligada", "A pressão atingiu a faixa definida para acionamento.");
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

  addEvent("Ciclo resetado", "Valores da operação restaurados.");
  renderOperation();
}

function runScenario() {
  const scenario = $("#scenarioSelect").value;
  const volume = Number($("#scenarioVolume").value || 100);
  const hose = Number($("#scenarioHose").value || 5);

  const scenarios = {
    seguro: [12, "Operacional", "Cenário estável. A operação tende a atingir a pressão alvo dentro do tempo esperado.", 5.8],
    oleo: [56, "Atenção", "Atraso de óleo pode aumentar o tempo de ciclo e exigir acompanhamento.", 4.2],
    vazamento: [78, "Crítico", "Possível vazamento na linha. A queda de pressão fica mais lenta.", 2.6],
    sensor: [84, "Crítico", "Falha de sensor simulada. O sistema deve bloquear decisão automática.", 2.1],
    bomba: [64, "Atenção", "Desgaste de bomba reduz eficiência e aumenta a duração do ciclo.", 3.4]
  };

  const selected = scenarios[scenario];
  const risk = Math.min(100, Math.round(selected[0] + volume / 25 + hose * 1.5));

  const points = [];
  for (let time = 0; time <= 90; time += 5) {
    points.push({
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

  scenarioChart.data.datasets[0].data = points;
  scenarioChart.update();

  state.risk = risk;
  addEvent("Simulação executada", `Cenário analisado com risco estimado de ${risk}%.`);
  renderOperation();
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
  const term = ($("#historySearch").value || "").toLowerCase();
  const rows = state.history.filter((item) => JSON.stringify(item).toLowerCase().includes(term));

  $("#historyCount").textContent = `${rows.length} registros`;

  if (rows.length === 0) {
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
  const success = state.history.filter((item) => item.status === "CONCLUÍDO").length;
  const abort = state.history.filter((item) => item.status === "ABORTADO").length;
  const pressures = state.history.map((item) => Number(item.finalPressure)).filter(Number.isFinite);
  const min = pressures.length > 0 ? Math.min(...pressures).toFixed(2) : "--";

  $("#reportTotal").textContent = total;
  $("#reportSuccess").textContent = success;
  $("#reportAbort").textContent = abort;
  $("#reportMin").textContent = min === "--" ? "--" : `${min} mbar`;

  $("#reportText").innerHTML = total === 0
    ? "Nenhuma operação registrada ainda. Inicie uma operação para gerar dados."
    : `
      <strong>Resumo operacional</strong><br><br>
      Foram registradas <strong>${total}</strong> operações no protótipo.
      Desse total, <strong>${success}</strong> foram concluídas e <strong>${abort}</strong> foram abortadas.
      A menor pressão final registrada foi <strong>${min} mbar</strong>.
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
  anchor.download = "historico-tsea-prototipo.json";
  anchor.click();

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
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
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
        label: "Curva prevista",
        data: [],
        borderColor: "#22c55e",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
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
  $$(".nav-item").forEach((button) => {
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
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  initCharts();
  renderAll();
});
