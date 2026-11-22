/**
 * Balance — Fase 2: preparar la base de datos y comprobar Apps Script.
 *
 * IMPORTANTE:
 * Este archivo NO implementa el acceso a datos personales.
 * Únicamente crea las pestañas y ofrece una comprobación de conectividad
 * sin credenciales ni información privada. No registra pesos ni comidas.
 *
 * Instalación: abrir "Balance - Base de datos" > Extensiones > Apps Script,
 * pegar todo este archivo en Code.gs y ejecutar setupDatabase una vez.
 */

const BALANCE_VERSION = "0.2.0-setup";

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

function doGet(event) {
  const params = (event && event.parameter) || {};
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
