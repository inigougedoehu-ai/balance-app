/**
 * Balance — backend de sesiones, registros y perfil personal.
 *
 * IMPORTANTE:
 * El acceso a datos privados exige una sesión validada.
 * Backend de dos cuentas, con sesiones y registros separados por usuario.
 * Los datos personales y las contraseñas solo viajan a través de HTMLService
 * + google.script.run; jamás por endpoints JSONP o URLs públicas.
 * Copiar junto al archivo Bridge.html actualizado.
 *
 * Instalación: abrir "Balance - Base de datos" > Extensiones > Apps Script,
 * pegar todo este archivo en Code.gs y ejecutar setupDatabase una vez.
 */

const BALANCE_VERSION = "0.6.0-health-profile";

const BALANCE_TABLES = Object.freeze({
  Users: [
    "user_id", "display_name", "password_salt", "password_hash",
    "created_at", "active"
  ],
  Weights: [
    "record_id", "user_id", "date", "weight_kg",
    "created_at", "updated_at", "deleted_at"
  ],
  Meals: [
    "record_id", "user_id", "date", "meal_type", "description",
    "notes", "created_at", "updated_at", "deleted_at"
  ],
  Settings: [
    "user_id", "goal_weight_kg", "updated_at", "height_cm", "birth_date"
  ],
  Operations: [
    "operation_id", "user_id", "entity_type", "record_id",
    "action", "applied_at"
  ],
  Sessions: [
    "session_hash", "user_id", "created_at", "expires_at",
    "revoked_at"
  ]
});

/**
 * Amplía Settings sin borrar el objetivo ya guardado (A:C).
 * También puede invocarse al guardar el perfil, sin reinstalar el proyecto.
 */
function ensureProfileColumns_(sheet) {
  const expected = ["height_cm", "birth_date"];
  const existing = sheet.getRange(1, 4, 1, 2).getValues()[0];
  if (existing[0] === "" && existing[1] === "") {
    sheet.getRange(1, 4, 1, 2).setValues([expected]);
    sheet.getRange(1, 4, 1, 2)
      .setBackground("#385e54").setFontColor("#ffffff").setFontWeight("bold");
    sheet.autoResizeColumns(4, 2);
  } else if (JSON.stringify(existing) !== JSON.stringify(expected)) {
    throw new Error("Las columnas de perfil de Settings no coinciden; no se modifica.");
  }
}

function setupDatabase() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      "Ejecuta setupDatabase desde el Apps Script vinculado a la hoja de Balance."
    );
  }

  PropertiesService.getScriptProperties()
    .setProperty("BALANCE_SPREADSHEET_ID", spreadsheet.getId());

  Object.keys(BALANCE_TABLES).forEach(function (name) {
    const columns = BALANCE_TABLES[name];
    const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, columns.length)
        .setBackground("#385e54")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
      sheet.autoResizeColumns(1, columns.length);
    } else {
      if (name === "Settings") ensureProfileColumns_(sheet);
      const existing = sheet.getRange(1, 1, 1, columns.length).getValues()[0];
      if (JSON.stringify(existing) !== JSON.stringify(columns)) {
        throw new Error("La pestaña " + name + " tiene columnas diferentes. No se modifica.");
      }
    }
  });

  SpreadsheetApp.flush();
  Logger.log("Balance preparado. Hoja: " + spreadsheet.getUrl());
}

/**
 * Configura o cambia las dos contraseñas sin introducirlas en el código.
 *
 * Preparación privada en Configuración del proyecto > Propiedades de secuencia:
 * BALANCE_PASSWORD_INIGO = clave de Iñigo (mínimo 14 caracteres)
 * BALANCE_PASSWORD_CLARA = clave de Clara (mínimo 14 caracteres)
 *
 * Tras ejecutar, borra las dos propiedades de texto en claro.
 * Los valores almacenados en Users son hashes salados con un secreto (pepper)
 * exclusivo del script, nunca las contraseñas.
 *
 * Esta función es ADMINISTRATIVA: ejecútala manualmente en el editor.
 */
function provisionAccounts() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty("BALANCE_SPREADSHEET_ID");
  if (!spreadsheetId) {
    throw new Error("Ejecuta setupDatabase antes de provisionAccounts.");
  }
  const users = [
    { id: "inigo", name: "Iñigo", prop: "BALANCE_PASSWORD_INIGO" },
    { id: "clara", name: "Clara", prop: "BALANCE_PASSWORD_CLARA" }
  ];
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName("Users");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // Verificar todas las entradas antes de hacer cualquier cambio.
    const passwords = users.map(user => {
      const value = props.getProperty(user.prop);
      if (!value || value.length < 14 || value.length > 200) {
        throw new Error("Configura " + user.prop + " con una clave de entre 14 y 200 caracteres.");
      }
      return value;
    });
    let pepper = props.getProperty("BALANCE_PASSWORD_PEPPER");
    if (!pepper) {
      pepper = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
      props.setProperty("BALANCE_PASSWORD_PEPPER", pepper);
    }
    const rows = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
      : [];
    const now = new Date().toISOString();
    users.forEach((user, index) => {
      const salt = Utilities.getUuid() + Utilities.getUuid();
      const digest = balancePasswordHash_(passwords[index], salt, pepper);
      const row = [user.id, user.name, salt, digest, now, true];
      const existingIndex = rows.findIndex(r => String(r[0]) === user.id);
      if (existingIndex >= 0) {
        row[4] = rows[existingIndex][4] || now;
        sheet.getRange(existingIndex + 2, 1, 1, 6).setValues([row]);
      } else {
        sheet.appendRow(row);
      }
    });
    SpreadsheetApp.flush();
    // No dejar contraseñas en claro guardadas después de configurar.
    users.forEach(user => props.deleteProperty(user.prop));
    Logger.log("Cuentas de Balance configuradas: inigo y clara. No se ha registrado ninguna contraseña.");
  } finally {
    lock.releaseLock();
  }
}

function balancePasswordHash_(password, salt, pepper) {
  const bytes = Utilities.computeHmacSha256Signature(salt + ":" + password, pepper);
  return Utilities.base64EncodeWebSafe(bytes);
}

function verifyAccount_(userId, password) {
  if (!["inigo", "clara"].includes(userId) ||
      typeof password !== "string" || !password || password.length > 200) {
    return false;
  }
  const props = PropertiesService.getScriptProperties();
  const pepper = props.getProperty("BALANCE_PASSWORD_PEPPER");
  const id = props.getProperty("BALANCE_SPREADSHEET_ID");
  if (!id || !pepper) return false;

  const sheet = SpreadsheetApp.openById(id).getSheetByName("Users");
  if (!sheet || sheet.getLastRow() < 2) return false;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const account = rows.find(row => String(row[0]) === userId);
  if (!account || account[5] !== true) return false;
  const calculated = balancePasswordHash_(password, String(account[2]), pepper);
  const expected = String(account[3]);
  // Evita terminar prematuramente al encontrar un carácter distinto.
  let diff = calculated.length ^ expected.length;
  for (let i = 0; i < Math.max(calculated.length, expected.length); i++) {
    diff |= (calculated.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function testAccount_(body) {
  const requestId = String(body.request_id || "");
  const userId = String(body.user_id || "").toLowerCase();
  if (!/^[a-zA-Z0-9_-]{24,100}$/.test(requestId) ||
      !["inigo", "clara"].includes(userId)) {
    return { ok: false, error: "Solicitud incorrecta" };
  }

  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const attemptsKey = "balance:attempts:" + userId;
    const attempts = Number(cache.get(attemptsKey) || "0");
    let outcome = "invalid";
    if (attempts >= 6) {
      outcome = "limited";
    } else {
      const valid = verifyAccount_(userId, body.password);
      if (valid) {
        outcome = "valid";
        cache.remove(attemptsKey);
      } else {
        cache.put(attemptsKey, String(attempts + 1), 600);
      }
    }
    // Respuesta breve; la clave NO vuelve al navegador por JSONP.
    cache.put("balance:account:" + requestId, outcome, 180);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/**
 * Diagnóstico del puente HTMLService, que también sirve las llamadas privadas.
 */
function bridgeHealthCheck() {
  return {
    ok: true,
    app: "Balance",
    version: BALANCE_VERSION,
    bridge: "ready"
  };
}

function balanceBridgePage_(params) {
  const nonce = String(params.nonce || "");
  if (!/^[a-f0-9-]{36}$/.test(nonce)) {
    return HtmlService.createHtmlOutput("Solicitud incorrecta");
  }
  const template = HtmlService.createTemplateFromFile("Bridge");
  template.bridgeNonce = nonce;
  return template.evaluate()
    .setTitle("Balance - Conexión privada")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet(event) {
  const params = (event && event.parameter) || {};
  if (params.action === "bridge") return balanceBridgePage_(params);
  let result;

  if (params.action === "health") {
    result = {
      ok: true,
      app: "Balance",
      version: BALANCE_VERSION,
      stage: "connection-test",
      configured: Boolean(
        PropertiesService.getScriptProperties()
          .getProperty("BALANCE_SPREADSHEET_ID")
      )
    };
  } else if (params.action === "probe_status") {
    const id = String(params.request_id || "");
    if (!/^[a-zA-Z0-9_-]{24,100}$/.test(id)) {
      result = { ok: false, error: "Identificador no válido" };
    } else {
      result = {
        ok: true,
        received: CacheService.getScriptCache().get("probe:" + id) === "ok"
      };
    }

  } else {
    result = { ok: false, error: "Acción no disponible" };
  }

  return balanceReply_(result, params.callback);
}

function doPost(event) {
  let result = { ok: false, error: "Acción no disponible" };

  try {
    const body = JSON.parse(
      (event && event.postData && event.postData.contents) || "{}"
    );

    // Prueba inofensiva: no lee ni escribe ninguna fila y no acepta datos.
    if (body.action === "probe") {
      const id = String(body.request_id || "");
      if (!/^[a-zA-Z0-9_-]{24,100}$/.test(id)) {
        result = { ok: false, error: "Identificador no válido" };
      } else {
        CacheService.getScriptCache().put("probe:" + id, "ok", 120);
        result = { ok: true };
      }
    }
  } catch (error) {
    // No añadir contraseñas ni el cuerpo POST al registro de errores.
    result = { ok: false, error: "Solicitud incorrecta" };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/** JSONP solo para comprobaciones públicas: nunca devuelve datos personales. */
function balanceReply_(result, callback) {
  const json = JSON.stringify(result);
  const safeCallback = String(callback || "");

  if (safeCallback && /^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(safeCallback)) {
    return ContentService.createTextOutput(safeCallback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


/* ------------------------ Sesiones y datos privados ------------------------ */

/**
 * Nunca se llama desde doGet/doPost. Únicamente desde Bridge.html,
 * a través de google.script.run, después de comprobar el origen del padre.
 * El propio Apps Script sigue siendo el responsable de comprobar el token.
 */
const SESSION_LENGTH_MS_ = 7 * 24 * 60 * 60 * 1000;
const MAX_BATCH_ = 30;

function balanceSignIn(userId, password) {
  userId = String(userId || "").toLowerCase();
  if (!["inigo", "clara"].includes(userId) ||
      typeof password !== "string" ||
      password.length < 14 || password.length > 200) {
    return { ok: false, error: "Credenciales incorrectas" };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cache = CacheService.getScriptCache();
    const key = "balance:attempts:" + userId;
    const attempts = Number(cache.get(key) || "0");
    if (attempts >= 6) {
      return { ok: false, error: "Demasiados intentos. Espera unos minutos." };
    }
    if (!verifyAccount_(userId, password)) {
      cache.put(key, String(attempts + 1), 600);
      return { ok: false, error: "Credenciales incorrectas" };
    }
    cache.remove(key);
    const token = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_LENGTH_MS_).toISOString();
    const hash = sessionHash_(token);
    const book = privateBook_();
    book.getSheetByName("Sessions").appendRow([
      hash, userId, new Date(now).toISOString(), expiresAt, ""
    ]);
    return { ok: true, token: token, userId: userId, expiresAt: expiresAt };
  } finally {
    lock.releaseLock();
  }
}

function privateBook_() {
  const id = PropertiesService.getScriptProperties()
    .getProperty("BALANCE_SPREADSHEET_ID");
  if (!id) throw new Error("Base de datos sin configurar");
  return SpreadsheetApp.openById(id);
}

function sha256Hex_(data) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data);
  return digest.map(function (byte) {
    return ("0" + (byte & 0xff).toString(16)).slice(-2);
  }).join("");
}

function sessionHash_(token) {
  const pepper = PropertiesService.getScriptProperties()
    .getProperty("BALANCE_PASSWORD_PEPPER");
  if (!pepper) throw new Error("Servidor sin configurar");
  return sha256Hex_(pepper + ":" + token);
}

/** Devuelve siempre el usuario derivado del token, nunca de una petición. */
function sessionUser_(token) {
  if (typeof token !== "string" || !/^[a-f0-9-]{100,130}$/.test(token)) {
    throw new Error("Sesión no válida. Vuelve a iniciar sesión.");
  }
  const hash = sessionHash_(token);
  const sheet = privateBook_().getSheetByName("Sessions");
  if (sheet.getLastRow() < 2) {
    throw new Error("Sesión no válida. Vuelve a iniciar sesión.");
  }
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const session = rows.find(function (row) { return String(row[0]) === hash; });
  if (!session || String(session[4] || "") !== "" ||
      !Number.isFinite(Date.parse(String(session[3]))) ||
      Date.parse(String(session[3])) <= Date.now()) {
    throw new Error("Sesión caducada o cerrada. Vuelve a iniciar sesión.");
  }
  const userId = String(session[1]);
  const usersSheet = privateBook_().getSheetByName("Users");
  const users = usersSheet.getLastRow() > 1
    ? usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 6).getValues()
    : [];
  if (!users.some(function (row) {
    return String(row[0]) === userId && row[5] === true;
  })) {
    throw new Error("Cuenta desactivada. Contacta con el administrador.");
  }
  return userId;
}

function balanceSignOut(token) {
  if (typeof token !== "string") return { ok: true };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const hash = sessionHash_(token);
    const sheet = privateBook_().getSheetByName("Sessions");
    if (sheet.getLastRow() > 1) {
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      const i = rows.findIndex(function (r) { return String(r[0]) === hash; });
      if (i >= 0) sheet.getRange(i + 2, 5).setValue(new Date().toISOString());
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function dateText_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "").replace(/^'/, "").slice(0, 10);
}

function weightFromRow_(row) {
  return {
    id: String(row[0]), kind: "weight", date: dateText_(row[2]),
    value: Number(row[3]), createdAt: String(row[4]),
    updatedAt: String(row[5])
  };
}

function mealFromRow_(row) {
  return {
    id: String(row[0]), kind: "meal", date: dateText_(row[2]),
    type: String(row[3]), description: String(row[4]),
    notes: String(row[5] || ""), createdAt: String(row[6]),
    updatedAt: String(row[7])
  };
}

function readState_(book, userId) {
  const weightsSheet = book.getSheetByName("Weights");
  const mealsSheet = book.getSheetByName("Meals");
  const settingsSheet = book.getSheetByName("Settings");
  const weights = weightsSheet.getLastRow() > 1
    ? weightsSheet.getRange(2, 1, weightsSheet.getLastRow() - 1, 7).getValues()
      .filter(function (r) { return String(r[1]) === userId && !r[6]; })
      .map(weightFromRow_)
    : [];
  const meals = mealsSheet.getLastRow() > 1
    ? mealsSheet.getRange(2, 1, mealsSheet.getLastRow() - 1, 9).getValues()
      .filter(function (r) { return String(r[1]) === userId && !r[8]; })
      .map(mealFromRow_)
    : [];
  let goal = null;
  let heightCm = null;
  let birthDate = null;
  if (settingsSheet.getLastRow() > 1) {
    const rows = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 5).getValues();
    const row = rows.find(function (r) { return String(r[0]) === userId; });
    if (row) {
      if (row[1] !== "" && row[1] !== null) goal = Number(row[1]);
      if (row[3] !== "" && row[3] !== null) heightCm = Number(row[3]);
      if (row[4] !== "" && row[4] !== null) birthDate = dateText_(row[4]);
    }
  }
  return {
    ok: true, weights: weights, meals: meals, goal: goal,
    heightCm: heightCm, birthDate: birthDate, serverAt: new Date().toISOString()
  };
}

function balanceGetState(token) {
  const userId = sessionUser_(token);
  return readState_(privateBook_(), userId);
}

function assertOp_(op) {
  if (!op || typeof op !== "object" ||
      !/^[0-9a-f-]{36}$/i.test(String(op.id || ""))) {
    throw new Error("Identificador de operación inválido");
  }
  if (op.kind === "profile") {
    const value = op.value;
    if (op.action !== "set" || !value || typeof value !== "object") {
      throw new Error("Operación de perfil inválida");
    }
    if (value.heightCm !== null &&
        (!Number.isFinite(value.heightCm) || value.heightCm < 90 || value.heightCm > 250)) {
      throw new Error("Altura no válida");
    }
    if (value.birthDate !== null) {
      if (typeof value.birthDate !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate)) {
        throw new Error("Fecha de nacimiento inválida");
      }
      const date = new Date(value.birthDate + "T12:00:00Z");
      const maxDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (!Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value.birthDate ||
          value.birthDate < "1900-01-01" || value.birthDate > maxDate) {
        throw new Error("Fecha de nacimiento fuera de rango");
      }
    }
    return;
  }
  if (op.kind === "goal") {
    if (op.action !== "set") throw new Error("Operación de objetivo inválida");
    if (op.value !== null && (!Number.isFinite(op.value) || op.value < 15 || op.value > 500)) {
      throw new Error("Objetivo no válido");
    }
    return;
  }
  if (!["weight", "meal"].includes(op.kind) ||
      !["upsert", "delete"].includes(op.action) ||
      !/^[0-9a-f-]{36}$/i.test(String(op.recordId || ""))) {
    throw new Error("Operación no válida");
  }
  if (op.action === "delete") return;
  const record = op.record;
  if (!record || record.id !== op.recordId ||
      record.kind !== op.kind ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(record.date || ""))) {
    throw new Error("Registro no válido");
  }
  const parsed = new Date(String(record.date) + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== record.date) {
    throw new Error("Fecha no válida");
  }
  if (op.kind === "weight") {
    if (!Number.isFinite(record.value) || record.value < 15 || record.value > 500) {
      throw new Error("Peso no válido");
    }
  } else {
    if (!["Desayuno", "Media mañana", "Comida", "Merienda", "Cena", "Otro"].includes(record.type) ||
        typeof record.description !== "string" ||
        !record.description.trim() || record.description.length > 400 ||
        typeof record.notes !== "string" || record.notes.length > 600) {
      throw new Error("Comida no válida");
    }
  }
}

function safeCell_(value) {
  const text = String(value === undefined || value === null ? "" : value);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function applyEntry_(book, userId, op, now) {
  const weight = op.kind === "weight";
  const sheet = book.getSheetByName(weight ? "Weights" : "Meals");
  const width = weight ? 7 : 9;
  const storedRows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    : [];
  const found = storedRows.findIndex(function (r) {
    return String(r[0]) === op.recordId && String(r[1]) === userId;
  });
  const rowIndex = found < 0 ? -1 : found + 2;

  if (op.action === "delete") {
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, width).setValue(now);
      sheet.getRange(rowIndex, width - 1).setValue(now);
    }
    return;
  }

  const record = op.record;
  // No se admiten cambios de propiedad: solo el usuario del token.
  const createdAt = rowIndex > 0
    ? sheet.getRange(rowIndex, weight ? 5 : 7).getValue() || now
    : now;
  const values = weight
    ? [op.recordId, userId, "'" + record.date, record.value, createdAt, now, ""]
    : [op.recordId, userId, "'" + record.date, record.type,
      safeCell_(record.description), safeCell_(record.notes),
      createdAt, now, ""];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, width).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}

function applyGoal_(book, userId, op, now) {
  const sheet = book.getSheetByName("Settings");
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
  const i = rows.findIndex(function (r) { return String(r[0]) === userId; });
  const values = [userId, op.value === null ? "" : op.value, now];
  if (i >= 0) sheet.getRange(i + 2, 1, 1, 3).setValues([values]);
  else sheet.appendRow(values);
}

function applyProfile_(book, userId, op, now) {
  const sheet = book.getSheetByName("Settings");
  ensureProfileColumns_(sheet);
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
  const index = rows.findIndex(function (r) { return String(r[0]) === userId; });
  const height = op.value.heightCm === null ? "" : op.value.heightCm;
  const birth = op.value.birthDate === null ? "" : "'" + op.value.birthDate;
  if (index >= 0) {
    // Conservar siempre el objetivo que ya estaba guardado en la columna B.
    sheet.getRange(index + 2, 3, 1, 3).setValues([[now, height, birth]]);
  } else {
    sheet.appendRow([userId, "", now, height, birth]);
  }
}

function balanceApplyOperations(token, ops) {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_BATCH_) {
    throw new Error("Lote de sincronización no válido");
  }
  ops.forEach(assertOp_);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const userId = sessionUser_(token);
    const book = privateBook_();
    const history = book.getSheetByName("Operations");
    const historyRows = history.getLastRow() > 1
      ? history.getRange(2, 1, history.getLastRow() - 1, 2).getValues() : [];
    const already = {};
    historyRows.forEach(function (r) {
      if (String(r[1]) === userId) already[String(r[0])] = true;
    });
    const confirmed = [];
    ops.forEach(function (op) {
      if (!already[op.id]) {
        const now = new Date().toISOString();
        if (op.kind === "goal") applyGoal_(book, userId, op, now);
        else if (op.kind === "profile") applyProfile_(book, userId, op, now);
        else applyEntry_(book, userId, op, now);
        // El marcador se guarda después de aplicar el cambio.
        history.appendRow([op.id, userId, op.kind, op.recordId || "", op.action, now]);
        already[op.id] = true;
      }
      confirmed.push(op.id);
    });
    SpreadsheetApp.flush();
    return { ok: true, confirmed: confirmed };
  } finally {
    lock.releaseLock();
  }
}
