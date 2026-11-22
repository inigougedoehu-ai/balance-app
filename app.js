const DATABASE = "balance-local-v1";
const DB_VERSION = 1;
let db;
let entries = [];
let goal = null;
let editingWeightId = null;
let editingMealId = null;
let toastTimer;

const $ = (id) => document.getElementById(id);
const byDateAscending = (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
const byDateDescending = (a, b) => -byDateAscending(a, b);
const todayLocal = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
};
const fmtWeight = (weight) => Number(weight).toLocaleString("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " kg";
const fmtDate = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
};
function showToast(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3300);
}
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DATABASE, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains("entries")) {
        database.createObjectStore("entries", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function save(storeName, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function remove(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function refresh() {
  entries = await getAll("entries");
  const settings = await getAll("settings");
  goal = settings.find(s => s.key === "goal")?.value ?? null;
  renderAll();
}
function route(name) {
  document.querySelectorAll("[data-view]").forEach(el => { el.hidden = el.dataset.view !== name; });
  document.querySelectorAll(".nav-item").forEach(el => {
    const current = el.dataset.route === name;
    el.classList.toggle("active", current);
    if (current) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function makeText(tag, content, className = "") {
  const element = document.createElement(tag);
  element.textContent = content;
  if (className) element.className = className;
  return element;
}
function renderAll() {
  const weights = entries.filter(e => e.kind === "weight").sort(byDateAscending);
  const meals = entries.filter(e => e.kind === "meal").sort(byDateDescending);
  const latest = weights.at(-1);
  $("metric-weight").textContent = latest ? fmtWeight(latest.value) : "—";
  $("metric-weight-date").textContent = latest ? "Registrado el " + fmtDate(latest.date) : "Aún no hay registros";
  $("metric-goal").textContent = goal !== null ? fmtWeight(goal) : "—";
  $("metric-goal-info").textContent = latest && goal !== null
    ? "Diferencia con objetivo: " + fmtWeight(Math.abs(latest.value - goal))
    : "Puedes definirlo cuando quieras";
  $("metric-meals").textContent = String(meals.length);
  $("local-count").textContent = entries.length
    ? entries.length + " registro(s) guardado(s) solo en este dispositivo."
    : "Todos los cambios se guardan en este dispositivo.";
  $("weight-count").textContent = weights.length + " registros";
  $("meal-count").textContent = meals.length + " registros";
  if (document.activeElement !== $("goal-value")) $("goal-value").value = goal ?? "";
  drawWeightChart(weights);
  renderList("weight-list", weights.slice().reverse(), "weight");
  renderList("meal-list", meals, "meal");
  $("weight-trend").textContent = weights.length > 1
    ? "Cambio desde el primer registro: " + (latest.value - weights[0].value > 0 ? "+" : "") + (latest.value - weights[0].value).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " kg"
    : "Sin tendencia aún";
}
function renderList(containerId, records, kind) {
  const parent = $(containerId);
  parent.replaceChildren();
  if (!records.length) {
    parent.append(makeText("p", kind === "weight" ? "Todavía no has registrado ningún peso." : "Todavía no has registrado ninguna comida.", "empty-state"));
    return;
  }
  records.forEach(record => {
    const item = makeText("div", "", "record");
    const main = makeText("div", "");
    if (kind === "weight") {
      main.append(makeText("strong", fmtWeight(record.value)));
    } else {
      main.append(makeText("strong", record.description));
      main.append(makeText("span", record.type, "secondary-line"));
      if (record.notes) main.append(makeText("span", record.notes, "notes"));
    }
    main.append(makeText("time", fmtDate(record.date)));
    const buttons = makeText("div", "", "record-actions");
    const edit = makeText("button", "Editar");
    edit.type = "button";
    edit.addEventListener("click", () => startEdit(record));
    const del = makeText("button", "Borrar");
    del.type = "button";
    del.addEventListener("click", () => deleteEntry(record));
    buttons.append(edit, del);
    item.append(main, buttons);
    parent.append(item);
  });
}
function drawWeightChart(weights) {
  const host = $("weight-chart");
  host.replaceChildren();
  if (weights.length === 0) {
    host.append(makeText("p", "Aquí aparecerá tu gráfica cuando registres pesajes.", "empty-state"));
    return;
  }
  const W = 700, H = 225, padX = 46, padY = 28;
  const min = Math.min(...weights.map(w => w.value));
  const max = Math.max(...weights.map(w => w.value));
  const range = Math.max(2, max - min);
  const low = min - (range - (max - min)) / 2;
  const high = low + range;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Evolución de los pesos registrados");
  function svgEl(tag, attrs, value) {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, String(val)));
    if (value !== undefined) el.textContent = value;
    svg.append(el);
    return el;
  }
  for (let i = 0; i < 3; i++) {
    const y = padY + i * ((H - padY * 2) / 2);
    svgEl("line", { x1: padX, y1: y, x2: W - 15, y2: y, stroke: "#e9eee9", "stroke-width": 1 });
    svgEl("text", { x: 1, y: y + 4, fill: "#829489", "font-size": 12 }, (high - i * range / 2).toLocaleString("es-ES", { maximumFractionDigits: 1 }));
  }
  const x = (i) => weights.length === 1 ? W / 2 : padX + (W - padX - 25) * i / (weights.length - 1);
  const y = (v) => H - padY - (v - low) * (H - 2 * padY) / range;
  const points = weights.map((w, i) => [x(i), y(w.value)]);
  svgEl("polyline", {
    points: points.map(p => p.join(",")).join(" "),
    fill: "none", stroke: "#3a7561", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round"
  });
  for (const [px, py] of points) svgEl("circle", { cx: px, cy: py, r: 4, fill: "#3a7561", stroke: "#fff", "stroke-width": 1.6 });
  svgEl("text", { x: padX, y: H - 5, fill: "#829489", "font-size": 12 }, fmtDate(weights[0].date));
  if (weights.length > 1) svgEl("text", { x: W - 15, y: H - 5, fill: "#829489", "font-size": 12, "text-anchor": "end" }, fmtDate(weights.at(-1).date));
  host.append(svg);
}
function startEdit(record) {
  if (record.kind === "weight") {
    editingWeightId = record.id;
    $("weight-date").value = record.date;
    $("weight-value").value = record.value;
    $("weight-form-title").textContent = "Editar pesaje";
    $("weight-submit").textContent = "Guardar cambios";
    $("weight-cancel").hidden = false;
    route("peso");
    $("weight-value").focus();
  } else {
    editingMealId = record.id;
    $("meal-date").value = record.date;
    $("meal-type").value = record.type;
    $("meal-description").value = record.description;
    $("meal-notes").value = record.notes || "";
    $("meal-form-title").textContent = "Editar comida";
    $("meal-submit").textContent = "Guardar cambios";
    $("meal-cancel").hidden = false;
    route("comidas");
    $("meal-description").focus();
  }
}
function resetWeightForm() {
  editingWeightId = null;
  $("weight-form").reset();
  $("weight-date").value = todayLocal();
  $("weight-form-title").textContent = "Añadir un pesaje";
  $("weight-submit").textContent = "Guardar peso";
  $("weight-cancel").hidden = true;
}
function resetMealForm() {
  editingMealId = null;
  $("meal-form").reset();
  $("meal-date").value = todayLocal();
  $("meal-form-title").textContent = "Añadir una comida";
  $("meal-submit").textContent = "Guardar comida";
  $("meal-cancel").hidden = true;
}
async function deleteEntry(record) {
  if (!window.confirm("¿Eliminar este registro de prueba?")) return;
  try {
    await remove("entries", record.id);
    if (editingWeightId === record.id) resetWeightForm();
    if (editingMealId === record.id) resetMealForm();
    await refresh();
    showToast("Registro eliminado");
  } catch (error) { console.error(error); showToast("No se ha podido eliminar el registro"); }
}
function bindEvents() {
  document.querySelectorAll("[data-route]").forEach(button =>
    button.addEventListener("click", (event) => { event.preventDefault(); route(button.dataset.route); })
  );
  $("weight-cancel").addEventListener("click", resetWeightForm);
  $("meal-cancel").addEventListener("click", resetMealForm);
  $("weight-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = $("weight-date").value;
    const value = Number($("weight-value").value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value < 15 || value > 500) {
      showToast("Comprueba la fecha y el peso"); return;
    }
    const current = entries.find(e => e.id === editingWeightId);
    const now = new Date().toISOString();
    const item = { id: current?.id ?? crypto.randomUUID(), kind: "weight", date, value, createdAt: current?.createdAt ?? now, updatedAt: now, syncStatus: "local" };
    try {
      await save("entries", item);
      resetWeightForm();
      await refresh();
      showToast("Peso guardado en este dispositivo");
    } catch (error) { console.error(error); showToast("No se ha podido guardar el peso"); }
  });
  $("meal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const date = $("meal-date").value;
    const type = $("meal-type").value;
    const description = $("meal-description").value.trim();
    const notes = $("meal-notes").value.trim();
    if (!date || !description || description.length > 400 || notes.length > 600) {
      showToast("Comprueba los campos de la comida"); return;
    }
    const current = entries.find(e => e.id === editingMealId);
    const now = new Date().toISOString();
    const item = { id: current?.id ?? crypto.randomUUID(), kind: "meal", date, type, description, notes, createdAt: current?.createdAt ?? now, updatedAt: now, syncStatus: "local" };
    try {
      await save("entries", item);
      resetMealForm();
      await refresh();
      showToast("Comida guardada en este dispositivo");
    } catch (error) { console.error(error); showToast("No se ha podido guardar la comida"); }
  });
  $("goal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = $("goal-value").value.trim();
    const value = raw ? Number(raw) : null;
    if (value !== null && (!Number.isFinite(value) || value < 15 || value > 500)) {
      showToast("Introduce un objetivo válido"); return;
    }
    try {
      await save("settings", { key: "goal", value });
      await refresh();
      showToast("Objetivo guardado en este dispositivo");
    } catch (error) { console.error(error); showToast("No se ha podido guardar el objetivo"); }
  });
  $("export-data").addEventListener("click", () => {
    const payload = { format: "balance-demo-v1", exportedAt: new Date().toISOString(), goal, entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "balance-copia-prueba-" + todayLocal() + ".json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
async function start() {
  try {
    db = await openDb();
    $("weight-date").value = todayLocal();
    $("meal-date").value = todayLocal();
    bindEvents();
    await refresh();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(console.warn);
  } catch (error) {
    console.error(error);
    document.querySelector(".privacy-note").textContent = "No se puede utilizar el almacenamiento local en este navegador. Comprueba que no esté bloqueado e inténtalo de nuevo.";
  }
}
start();