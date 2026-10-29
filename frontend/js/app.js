/**
 * CVAT Annotation Analytics - Frontend Controller
 * Full Stack Technical Assessment (xis.ai)
 * Implements: REST API integration, SVG Graph rendering, WebSocket live streaming,
 * drop & recovery resilience, sorting, filtering, and CSV/JSON export.
 */

// Application State
const state = {
  currentTaskId: 1,
  shapeTypeFilter: "",
  searchTerm: "",
  sortColumn: "count",
  sortAscending: false,
  analyticsData: null,
  ws: null,
  wsReconnectAttempts: 0,
  maxReconnectAttempts: 10,
  reconnectTimeoutId: null,
  simulatedDrop: false,
  currentUser: "annotator_lead", // 'annotator_lead' (owner), 'admin', 'unauthorized_guest', 'anonymous'
  theme: localStorage.getItem("cvat_theme") || "dark"
};

// User Credentials Directory for Access Control Testing (Requirement 5)
const USERS = {
  annotator_lead: { user: "annotator_lead", pass: "pass123", role: "Task Owner (200 OK)" },
  admin: { user: "admin", pass: "admin123", role: "Superuser (200 OK)" },
  unauthorized_guest: { user: "unauthorized_guest", pass: "pass123", role: "Unauthorized (403 Forbidden)" },
  anonymous: { user: "", pass: "", role: "Unauthenticated (401 Unauthorized)" }
};

// API Base URLs
const API_BASE = "http://127.0.0.1:8000/api/v1";
const WS_BASE = "ws://127.0.0.1:8001/ws";

// Initialize application upon DOM load
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupEventListeners();
  loadTaskAnalytics(state.currentTaskId);
  initWebSocket(state.currentTaskId);
});

/* ==========================================================================
   Theme Management
   ========================================================================== */
function initTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  updateThemeIcon();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  localStorage.setItem("cvat_theme", state.theme);
  updateThemeIcon();
  if (state.analyticsData) renderChart(state.analyticsData.classes);
}

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.textContent = state.theme === "dark" ? "☀️" : "🌙";
  }
}

/* ==========================================================================
   Event Listeners
   ========================================================================== */
function setupEventListeners() {
  // Theme Toggle
  document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);

  // Task Selector
  const taskSelect = document.getElementById("taskSelect");
  taskSelect.addEventListener("change", (e) => {
    state.currentTaskId = parseInt(e.target.value);
    loadTaskAnalytics(state.currentTaskId);
    switchWebSocketTask(state.currentTaskId);
  });

  // User / Auth Switcher (Requirement 5 demonstration)
  const userSelect = document.getElementById("userAuthSelect");
  userSelect.addEventListener("change", (e) => {
    state.currentUser = e.target.value;
    showToast(`Switched active user to: ${USERS[state.currentUser].role}`, "warning");
    loadTaskAnalytics(state.currentTaskId);
  });

  // Filter Pills (Requirement 7)
  document.querySelectorAll(".filter-pill").forEach(pill => {
    pill.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.shapeTypeFilter = pill.getAttribute("data-filter") || "";
      loadTaskAnalytics(state.currentTaskId);
    });
  });

  // Search Input for Table
  const searchInput = document.getElementById("classSearchInput");
  searchInput.addEventListener("input", (e) => {
    state.searchTerm = e.target.value.toLowerCase().trim();
    renderTable();
  });

  // Table Column Sort Headers
  document.querySelectorAll(".sortable-th").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-col");
      if (state.sortColumn === col) {
        state.sortAscending = !state.sortAscending;
      } else {
        state.sortColumn = col;
        state.sortAscending = false;
      }
      updateSortIndicators();
      renderTable();
    });
  });

  // Export Buttons
  document.getElementById("exportCsvBtn").addEventListener("click", exportToCsv);
  document.getElementById("exportJsonBtn").addEventListener("click", exportToJson);

  // Live WebSocket Simulation Triggers (Requirement 8)
  document.getElementById("simAddShapeBtn").addEventListener("click", () => {
    simulateLiveAnnotationAction("simulate_annotation");
  });
  document.getElementById("simDeleteShapeBtn").addEventListener("click", () => {
    simulateLiveAnnotationAction("simulate_delete");
  });

  // Drop & Recovery Simulation Toggle (Requirement 9)
  document.getElementById("simDropWsBtn").addEventListener("click", toggleSimulatedWsDrop);
}

/* ==========================================================================
   REST API Analytics Fetcher (Requirements 1, 4, 5, 6, 7)
   ========================================================================== */
async function loadTaskAnalytics(taskId) {
  showLoadingState();
  const startTime = performance.now();

  let url = `${API_BASE}/tasks/${taskId}/annotations/analytics`;
  if (state.shapeTypeFilter) {
    url += `?shape_type=${encodeURIComponent(state.shapeTypeFilter)}`;
  }

  // Build Auth Headers
  const headers = { "Accept": "application/json" };
  const creds = USERS[state.currentUser];
  if (creds && creds.user) {
    headers["Authorization"] = "Basic " + btoa(`${creds.user}:${creds.pass}`);
  }

  try {
    const response = await fetch(url, { headers });
    const latency = (performance.now() - startTime).toFixed(1);
    updateLatencyBadge(latency);

    if (response.status === 401) {
      renderErrorState("401 Unauthorized", "Authentication required. You are currently anonymous. Select 'Task Owner' from the User menu to authenticate.");
      return;
    }

    if (response.status === 403) {
      renderErrorState("403 Forbidden", "Access denied. Current user has no permission for this task. CVAT enforces role-based task ownership.");
      return;
    }

    if (response.status === 404) {
      renderErrorState("404 Task Not Found", `Task ID #${taskId} was not found in the database.`);
      return;
    }

    if (!response.ok) {
      renderErrorState(`HTTP Error ${response.status}`, `Failed to retrieve analytics: ${response.statusText}`);
      return;
    }

    const data = await response.json();
    state.analyticsData = data;

    // Check for Empty Data Case (Requirement 4)
    if (data.total_annotations === 0) {
      renderEmptyState(data);
    } else {
      renderDashboard(data);
    }

  } catch (err) {
    renderErrorState("Network Connection Error", `Unable to reach CVAT backend at ${API_BASE}. Ensure Django server is running.`);
  }
}

function updateLatencyBadge(ms) {
  const badge = document.getElementById("latencyBadge");
  if (badge) {
    badge.textContent = `${ms} ms`;
    badge.style.color = ms < 50 ? "var(--accent-green)" : "var(--accent-amber)";
  }
}

/* ==========================================================================
   UI State Rendering: Dashboard, Empty & Error (Requirements 3 & 4)
   ========================================================================== */
function showLoadingState() {
  document.getElementById("emptyStateContainer").style.display = "none";
  document.getElementById("errorStateContainer").style.display = "none";
  document.getElementById("dashboardContent").style.display = "block";
  document.getElementById("chartArea").style.opacity = "0.5";
}

function renderEmptyState(data) {
  document.getElementById("dashboardContent").style.display = "none";
  document.getElementById("errorStateContainer").style.display = "none";
  const emptyContainer = document.getElementById("emptyStateContainer");
  emptyContainer.style.display = "block";

  updateKpiSummary(data);
}

function renderErrorState(title, description) {
  document.getElementById("dashboardContent").style.display = "none";
  document.getElementById("emptyStateContainer").style.display = "none";
  const errContainer = document.getElementById("errorStateContainer");
  errContainer.style.display = "block";

  document.getElementById("errorTitle").textContent = title;
  document.getElementById("errorDescription").textContent = description;
}

function renderDashboard(data) {
  document.getElementById("emptyStateContainer").style.display = "none";
  document.getElementById("errorStateContainer").style.display = "none";
  const content = document.getElementById("dashboardContent");
  content.style.display = "block";
  document.getElementById("chartArea").style.opacity = "1";

  updateKpiSummary(data);
  renderChart(data.classes);
  renderGeometryBreakdown(data.geometry_breakdown);
  renderTable();
}

function updateKpiSummary(data) {
  document.getElementById("kpiTotalAnnotations").textContent = (data.total_annotations || 0).toLocaleString();
  
  const activeClasses = (data.classes || []).filter(c => c.count > 0).length;
  document.getElementById("kpiActiveClasses").textContent = `${activeClasses} / ${(data.classes || []).length}`;

  const topGeometry = (data.geometry_breakdown && data.geometry_breakdown.length > 0)
    ? data.geometry_breakdown[0].type
    : "None";
  document.getElementById("kpiPrimaryGeometry").textContent = topGeometry.toUpperCase();

  document.getElementById("kpiJobsCount").textContent = `${data.job_count || 1} Jobs`;
}

/* ==========================================================================
   Dynamic SVG Bar Chart (Requirement 3: The counts shown as a graph)
   ========================================================================== */
function renderChart(classes) {
  const container = document.getElementById("chartArea");
  container.innerHTML = "";

  if (!classes || classes.length === 0) return;

  // Filter out zero-count classes for clean graph or show top 15
  const activeClasses = classes.filter(c => c.count > 0).slice(0, 15);
  if (activeClasses.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 4rem 1rem; color: var(--text-muted);">No active annotations to display for current filter.</div>`;
    return;
  }

  const width = container.clientWidth || 700;
  const height = 360;
  const margin = { top: 25, right: 30, bottom: 50, left: 110 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const maxVal = Math.max(...activeClasses.map(c => c.count), 1);
  const barHeight = Math.min(innerHeight / activeClasses.length - 8, 28);
  const barGap = (innerHeight - barHeight * activeClasses.length) / (activeClasses.length + 1);

  // Construct SVG
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  // Grid Lines
  const gridGroup = document.createElementNS(svgNS, "g");
  for (let i = 0; i <= 5; i++) {
    const x = margin.left + (innerWidth * i) / 5;
    const val = Math.round((maxVal * i) / 5);

    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", margin.top);
    line.setAttribute("x2", x);
    line.setAttribute("y2", margin.top + innerHeight);
    line.setAttribute("stroke", "var(--border-color)");
    line.setAttribute("stroke-dasharray", "3,3");
    gridGroup.appendChild(line);

    const label = document.createElementNS(svgNS, "text");
    label.setAttribute("x", x);
    label.setAttribute("y", margin.top + innerHeight + 20);
    label.setAttribute("class", "chart-text");
    label.setAttribute("text-anchor", "middle");
    label.textContent = val;
    gridGroup.appendChild(label);
  }
  svg.appendChild(gridGroup);

  // Bars Group
  const barsGroup = document.createElementNS(svgNS, "g");
  activeClasses.forEach((item, index) => {
    const y = margin.top + barGap + index * (barHeight + barGap);
    const barWidth = (item.count / maxVal) * innerWidth;

    // Label Text (Y-Axis)
    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("x", margin.left - 12);
    text.setAttribute("y", y + barHeight / 2 + 4);
    text.setAttribute("class", "chart-text");
    text.setAttribute("text-anchor", "end");
    text.setAttribute("font-weight", "600");
    text.textContent = item.name.length > 12 ? item.name.substring(0, 11) + "…" : item.name;
    barsGroup.appendChild(text);

    // Background track
    const track = document.createElementNS(svgNS, "rect");
    track.setAttribute("x", margin.left);
    track.setAttribute("y", y);
    track.setAttribute("width", innerWidth);
    track.setAttribute("height", barHeight);
    track.setAttribute("rx", 4);
    track.setAttribute("fill", "var(--bg-card-subtle)");
    barsGroup.appendChild(track);

    // Active Bar with Taxonomy Color
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", margin.left);
    rect.setAttribute("y", y);
    rect.setAttribute("width", 0); // Animate from 0
    rect.setAttribute("height", barHeight);
    rect.setAttribute("rx", 4);
    rect.setAttribute("fill", item.color || "var(--accent-primary)");
    rect.setAttribute("class", "chart-bar-rect");

    // Micro-interaction tooltips
    rect.addEventListener("mouseenter", (e) => {
      showChartTooltip(e, item);
    });
    rect.addEventListener("mouseleave", hideChartTooltip);

    barsGroup.appendChild(rect);

    // Trigger smooth transition
    requestAnimationFrame(() => {
      rect.setAttribute("width", barWidth);
    });

    // Count value badge inside or next to bar
    const valText = document.createElementNS(svgNS, "text");
    valText.setAttribute("x", margin.left + barWidth + 8);
    valText.setAttribute("y", y + barHeight / 2 + 4);
    valText.setAttribute("class", "chart-text");
    valText.setAttribute("font-weight", "700");
    valText.setAttribute("fill", "var(--text-primary)");
    valText.textContent = item.count;
    barsGroup.appendChild(valText);
  });

  svg.appendChild(barsGroup);
  container.appendChild(svg);
}

// Tooltip logic
function showChartTooltip(e, item) {
  let tooltip = document.getElementById("chartTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "chartTooltip";
    tooltip.className = "chart-tooltip";
    document.body.appendChild(tooltip);
  }

  const total = state.analyticsData ? state.analyticsData.total_annotations : 1;
  const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;

  tooltip.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 2px;">
      <span style="display:inline-block; width:10px; height:10px; background:${item.color}; border-radius:2px; margin-right:6px;"></span>
      ${item.name}
    </div>
    <div>Count: <strong>${item.count}</strong> (${pct}% of task)</div>
  `;
  tooltip.style.left = `${e.pageX}px`;
  tooltip.style.top = `${e.pageY - 10}px`;
  tooltip.style.opacity = "1";
}

function hideChartTooltip() {
  const tooltip = document.getElementById("chartTooltip");
  if (tooltip) tooltip.style.opacity = "0";
}

function renderGeometryBreakdown(geometry) {
  const container = document.getElementById("geometryBreakdownList");
  container.innerHTML = "";

  if (!geometry || geometry.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem;">No geometry data</div>`;
    return;
  }

  const total = geometry.reduce((sum, g) => sum + g.count, 0);

  geometry.forEach(g => {
    const pct = total > 0 ? ((g.count / total) * 100).toFixed(1) : 0;
    const row = document.createElement("div");
    row.className = "breakdown-item";
    row.innerHTML = `
      <div class="breakdown-info">
        <span class="breakdown-badge">${g.type}</span>
      </div>
      <div style="font-size:0.85rem; font-weight:600;">
        ${g.count} <span style="font-weight:400; color:var(--text-secondary); font-size:0.75rem;">(${pct}%)</span>
      </div>
    `;
    container.appendChild(row);
  });
}

/* ==========================================================================
   Interactive Data Table
   ========================================================================== */
function renderTable() {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  if (!state.analyticsData || !state.analyticsData.classes) return;

  let classes = [...state.analyticsData.classes];

  // Search Filter
  if (state.searchTerm) {
    classes = classes.filter(c => c.name.toLowerCase().includes(state.searchTerm));
  }

  // Sort
  classes.sort((a, b) => {
    let valA = a[state.sortColumn];
    let valB = b[state.sortColumn];
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();

    if (valA < valB) return state.sortAscending ? -1 : 1;
    if (valA > valB) return state.sortAscending ? 1 : -1;
    return 0;
  });

  const total = state.analyticsData.total_annotations || 1;

  if (classes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-muted);">No matching classes found.</td></tr>`;
    return;
  }

  classes.forEach(c => {
    const pct = total > 0 ? ((c.count / total) * 100).toFixed(1) : 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span class="color-swatch" style="background:${c.color}"></span>
        <strong>${c.name}</strong>
      </td>
      <td><code>${c.color}</code></td>
      <td style="font-weight:700;">${c.count.toLocaleString()}</td>
      <td>
        <span class="progress-track">
          <span class="progress-bar-fill" style="width:${pct}%; background:${c.color}"></span>
        </span>
        <span style="font-size:0.8rem; margin-left:0.5rem; color:var(--text-secondary);">${pct}%</span>
      </td>
      <td>
        <span class="breakdown-badge" style="background:${c.count > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)'}; color:${c.count > 0 ? 'var(--status-online)' : 'var(--text-muted)'}">
          ${c.count > 0 ? 'Annotated' : 'Empty'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateSortIndicators() {
  document.querySelectorAll(".sortable-th").forEach(th => {
    const col = th.getAttribute("data-col");
    const icon = th.querySelector(".sort-icon");
    if (col === state.sortColumn) {
      icon.textContent = state.sortAscending ? "▲" : "▼";
      icon.style.opacity = "1";
    } else {
      icon.textContent = "⇅";
      icon.style.opacity = "0.4";
    }
  });
}

/* ==========================================================================
   Data Export Functions (CSV / JSON)
   ========================================================================== */
function exportToCsv() {
  if (!state.analyticsData || !state.analyticsData.classes) return;

  const total = state.analyticsData.total_annotations || 1;
  let csv = "Label ID,Class Name,Hex Color,Count,Percentage of Task\n";

  state.analyticsData.classes.forEach(c => {
    const pct = total > 0 ? ((c.count / total) * 100).toFixed(2) : 0;
    csv += `${c.label_id},"${c.name}",${c.color},${c.count},${pct}%\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `cvat_task_${state.currentTaskId}_annotation_analytics.csv`);
  showToast("CSV export generated successfully.", "success");
}

function exportToJson() {
  if (!state.analyticsData) return;

  const jsonStr = JSON.stringify(state.analyticsData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  downloadBlob(blob, `cvat_task_${state.currentTaskId}_annotation_analytics.json`);
  showToast("JSON export generated successfully.", "success");
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   WebSocket Live Streaming & Connection Resilience (Requirements 8 & 9)
   ========================================================================== */
function initWebSocket(taskId) {
  if (state.simulatedDrop) return; // Drop simulation engaged

  const wsUrl = `${WS_BASE}/tasks/${taskId}/annotations/`;
  updateWsStatus("reconnecting", "Connecting...");

  try {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      state.wsReconnectAttempts = 0;
      updateWsStatus("online", "Live Stream");
      showToast("WebSocket connected: Receiving live annotation updates.", "success");
    };

    state.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleLiveWebSocketEvent(payload);
      } catch (e) {
        console.error("Malformed WebSocket payload:", e);
      }
    };

    state.ws.onclose = () => {
      if (!state.simulatedDrop) {
        updateWsStatus("reconnecting", `Reconnecting (${state.wsReconnectAttempts + 1})...`);
        scheduleReconnect();
      } else {
        updateWsStatus("offline", "Simulated Disconnect");
      }
    };

    state.ws.onerror = () => {
      updateWsStatus("reconnecting", "Connection error");
    };

  } catch (err) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (state.simulatedDrop) return;

  if (state.wsReconnectAttempts >= state.maxReconnectAttempts) {
    updateWsStatus("offline", "Stream Offline");
    showToast("WebSocket connection failed after maximum retries. Re-trying periodically...", "warning");
    return;
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, up to 15s max
  const delay = Math.min(1000 * Math.pow(2, state.wsReconnectAttempts), 15000);
  state.wsReconnectAttempts++;

  clearTimeout(state.reconnectTimeoutId);
  state.reconnectTimeoutId = setTimeout(() => {
    initWebSocket(state.currentTaskId);
  }, delay);
}

function switchWebSocketTask(newTaskId) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ action: "switch_task", task_id: newTaskId }));
  } else {
    initWebSocket(newTaskId);
  }
}

function handleLiveWebSocketEvent(payload) {
  if (payload.type === "initial_state" || payload.type === "annotation_created" || payload.type === "annotation_deleted" || payload.type === "annotation_updated") {
    if (payload.analytics) {
      state.analyticsData = payload.analytics;
      renderDashboard(payload.analytics);

      if (payload.type === "annotation_created") {
        showToast(`Live update: New [${payload.details.label}] annotation added!`, "success");
      } else if (payload.type === "annotation_deleted") {
        showToast(`Live update: Annotation removed for [${payload.details.label}].`, "warning");
      }
    }
  }
}

function simulateLiveAnnotationAction(actionName) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    // Pick an active class to increment
    const classes = state.analyticsData ? state.analyticsData.classes : [];
    const sampleLabel = classes.length > 0 ? classes[Math.floor(Math.random() * classes.length)].name : "person";
    state.ws.send(JSON.stringify({ action: actionName, label_name: sampleLabel }));
  } else {
    showToast("Cannot simulate: WebSocket is currently disconnected.", "warning");
  }
}

function toggleSimulatedWsDrop() {
  const btn = document.getElementById("simDropWsBtn");
  if (!state.simulatedDrop) {
    // Engage simulated connection drop
    state.simulatedDrop = true;
    if (state.ws) state.ws.close();
    updateWsStatus("offline", "Simulated Disconnect");
    btn.textContent = "Restore Connection";
    btn.classList.add("btn-primary");
    btn.classList.remove("btn-secondary");
    showToast("Requirement 9 Demo: Connection dropped. Watch status indicator.", "warning");
  } else {
    // Restore connection
    state.simulatedDrop = false;
    btn.textContent = "Simulate Drop";
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-secondary");
    showToast("Restoring connection and recovering state...", "success");
    initWebSocket(state.currentTaskId);
    loadTaskAnalytics(state.currentTaskId); // Auto-recover state
  }
}

function updateWsStatus(statusClass, labelText) {
  const pill = document.getElementById("wsStatusPill");
  const text = document.getElementById("wsStatusText");
  if (pill && text) {
    pill.className = `status-pill ${statusClass}`;
    text.textContent = labelText;
  }
}

/* ==========================================================================
   Toast Notification System
   ========================================================================== */
function showToast(message, type = "success") {
  let toast = document.getElementById("globalToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "globalToast";
    toast.className = "toast-banner";
    document.body.appendChild(toast);
  }

  toast.className = `toast-banner toast-${type} show`;
  toast.innerHTML = `<span>${type === "success" ? "✓" : "⚠"}</span> <div>${message}</div>`;

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}
