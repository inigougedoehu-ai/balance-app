/**
 * Balance — Fase 3: diagnóstico y comprobación de contraseñas.
 *
 * IMPORTANTE:
 * Este archivo NO implementa el acceso a datos personales.
 * Crea las pestañas y permite verificar las contraseñas de dos cuentas.
 * NO crea sesiones ni permite leer/escribir pesos o comidas. La contraseña
 * solo viaja por HTTPS en el cuerpo POST, nunca en una URL o repositorio.
 *
 * Instalación: abrir "Balance - Base de datos" > Extensiones > Apps Script,
 * pegar todo este archivo en Code.gs y ejecutar setupDatabase una vez.
 */

const BALANCE_VERSION = "0.4.0-bridge-test";

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
    "user_id", "goal_weight_kg", "updated_at"
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
 * Puente HTML seguro para comunicaciones privadas entre el front-end
 * GitHub Pages y Apps Script. Por ahora solo prueba conectividad.
 *
 * No hay ninguna operación de datos ni sesiones habilitada aquí.
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
  } else if (params.action === "account_test_status") {
    const id = String(params.request_id || "");
    if (!/^[a-zA-Z0-9_-]{24,100}$/.test(id)) {
      result = { ok: false, error: "Identificador no válido" };
    } else {
      // Un resultado de validación, nunca datos personales ni sesiones.
      result = {
        ok: true,
        status: CacheService.getScriptCache().get("balance:account:" + id) || "pending"
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
    } else if (body.action === "account_test") {
      result = testAccount_(body);
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
