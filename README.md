# Balance

Aplicación web instalable (PWA) para el seguimiento personal del peso y de las comidas. Código público; los registros personales no deben publicarse en GitHub.

## Estado del proyecto

**Versión de prueba local. No utilices aún información personal real.**

La interfaz inicial permite:
- Registrar, modificar y eliminar pesajes con su fecha.
- Visualizar el historial y una gráfica de evolución.
- Registrar comidas con fecha, tipo, descripción y notas opcionales, sin calorías.
- Establecer o eliminar un objetivo de peso.
- Exportar los registros locales a un archivo JSON.
- Consultar el contenido sin conexión después de la primera carga.

Los registros se guardan exclusivamente en **IndexedDB, en el navegador actual**. Todavía no existen autenticación, separación de usuarios, cifrado local ni sincronización con Sheets. Los datos locales se pueden perder si se borran los datos del navegador. **No introduzcas datos reales de salud en esta versión.**

## Comprobación de conexión con Google Apps Script

En la pestaña **Ajustes → Conexión con Google** pulsa **Probar conexión con Google**.
La prueba utiliza la URL pública del Apps Script y efectúa:

1. Una consulta JSONP `health` sin datos personales.
2. Un POST `probe` con un identificador aleatorio.
3. Una consulta `probe_status` que confirma que Apps Script recibió el identificador.

**Esto no es todavía sincronización con Google Sheets.** Ninguna fila de peso ni comida se envía, lee o guarda en la hoja. Las solicitudes de prueba solo acceden a propiedades del script y a una caché temporal.

La URL pública de Apps Script no es una credencial. Nunca almacenar claves de usuario en el repositorio. Si cambias la URL de implementación, habrá que actualizar `BACKEND_URL` en `app.js`.

Si se actualiza el archivo `backend/Code.gs`, publicar una **nueva versión de la implementación** en Apps Script para que los cambios lleguen a la URL `/exec`.

## Publicar la prueba en GitHub Pages

En el repositorio, abre **Settings → Pages**:
1. En **Build and deployment**, selecciona **Deploy from a branch**.
2. Selecciona **main** y **/(root)**.
3. Pulsa **Save**.

Al publicarse, la aplicación estará en `https://inigougedoehu-ai.github.io/balance-app/`.

## Arquitectura prevista

- Interfaz estática publicada en GitHub Pages.
- Base local IndexedDB y cola de sincronización sin bloqueo.
- Dos cuentas privadas autenticadas por el backend.
- Google Apps Script como API de autorización y persistencia.
- Google Sheets privado como base de datos central.

**No se utilizarán Cloudflare, servicios de terceros adicionales ni claves incluidas en el repositorio.** Antes de habilitar los registros reales, implementar y verificar el control de acceso, la sincronización, la separación de perfiles y la seguridad de las sesiones.

## Estructura

- `index.html`: interfaz.
- `styles.css`: diseño adaptable.
- `app.js`: formularios, IndexedDB, historial y gráficos.
- `sw.js`: caché para uso sin conexión.
- `manifest.webmanifest` e `icon.svg`: instalación como PWA.

No requiere instalar Node.js ni compilar la versión actual.
