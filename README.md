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

## Nueva vista privada en pruebas (0.5)

La versión clásica de Balance sigue en `index.html`. Para probar el acceso privado y la sincronización, abre `private.html` **solo después de actualizar Apps Script**.

### Preparación

1. Abre el proyecto de Apps Script vinculado a `Balance - Base de datos`.
2. Reemplaza el archivo `Code.gs` completo con `backend/Code.gs` de este repositorio.
3. Reemplaza el archivo HTML `Bridge.html` con `backend/Bridge.html`. No es necesario repetir `provisionAccounts`: las cuentas ya están creadas.
4. Guarda ambos archivos. En **Implementar → Gestionar implementaciones → Editar**, selecciona **Nueva versión** y publica conservando la URL `/exec`.
5. Prueba `https://inigougedoehu-ai.github.io/balance-app/private.html`. Accede con las contraseñas establecidas y registra **solo datos ficticios**. Comprueba la sincronización al recargar y abrir otra cuenta.

### Aislamiento

- Cada operación se autentica en Apps Script mediante un token de sesión temporal y se vincula al usuario derivado del token, **no** a un userId proporcionado por la web.
- La sesión solo se conserva en memoria, por lo que al cerrar o recargar es necesario introducir la contraseña de nuevo.
- Los datos locales se cifran con AES-GCM y clave derivada de la contraseña (PBKDF2). Se almacenan en una base IndexedDB distinta de la antigua versión de prueba.
- Los datos de prueba de la versión antigua **no se importan** al nuevo almacén.
- La cola de cambios tiene UUID únicos para no crear registros duplicados tras reintentos.
- La copia local puede abrirse sin conexión cuando el dispositivo ya ha accedido antes, pero para sincronizar será necesario iniciar sesión con internet.
- La hoja de cálculo sigue siendo legible para la cuenta Google propietaria.

### Limitaciones de esta fase

**No introducir todavía datos personales reales hasta validar manualmente el funcionamiento con las dos cuentas, las ediciones, los borrados y la recuperación en otro dispositivo.** La sincronización es idempotente y usa última operación recibida para resolver cambios concurrentes; no implementa todavía resolución avanzada de conflictos ni borrado de datos de prueba.

Si cambias la contraseña de una cuenta, su copia local cifrada seguirá necesitando la contraseña anterior: exporta o sincroniza antes de cambiar contraseñas y no borres datos pendientes.

## Fase 4: prueba del canal privado con HTMLService

Esta fase solo prueba una alternativa a JSONP para operaciones privadas, sin modificar pesos ni comidas.

1. En Apps Script sustituir el contenido de `Code.gs` por `backend/Code.gs` actualizado.
2. Pulsar **+ (Archivos) → HTML**, crear un archivo llamado **Bridge** (Apps Script lo muestra como `Bridge.html`) y pegar el contenido íntegro de `backend/Bridge.html`.
3. Guardar y hacer **Implementar → Gestionar implementaciones → Editar → Nueva versión → Implementar**. Conservar la misma URL `/exec`.
4. Abrir Balance → **Ajustes → Conexión privada con Google → Probar conexión privada**.

La respuesta satisfactoria será `Puente privado conectado a Apps Script (0.4.0-bridge-test)`.

El puente usa la página HTML de Apps Script con `google.script.run`, intercambiando mensajes con `postMessage`, comprobación de origen y nonce aleatorio. En esta fase solo ejecuta `bridgeHealthCheck`. No transporta contraseñas, sesiones ni registros.

La incrustación de Apps Script depende del navegador. Si Safari bloquea esta vía, no usaremos un mecanismo inseguro para leer información personal; buscaremos otra configuración que no requiera servicios adicionales.

## Fase 3: configurar y comprobar dos contraseñas

La infraestructura está preparada, pero **aún no existen sesiones de usuario** y los datos registrados siguen siendo locales y de demostración.

1. Abre la hoja `Balance - Base de datos` → **Extensiones → Apps Script**.
2. Sustituye el contenido de `Code.gs` por el archivo actualizado `backend/Code.gs` de este repositorio. Guarda.
3. En **Configuración del proyecto** (rueda dentada) → **Propiedades de secuencia de comandos**, añade las dos propiedades privadas:
   - `BALANCE_PASSWORD_INIGO`: contraseña propia de Iñigo (14 a 200 caracteres).
   - `BALANCE_PASSWORD_CLARA`: contraseña propia de Clara (14 a 200 caracteres).
4. En el editor selecciona y ejecuta `provisionAccounts` manualmente. Esta función genera sales aleatorias, hashes HMAC-SHA256 con secreto adicional privado y guarda únicamente estos verificadores en `Users`. También elimina las dos propiedades con las contraseñas en claro. **No compartas las contraseñas en el chat ni en GitHub.**
5. Comprueba que las cuentas `inigo` y `clara` aparecen en `Users`, sin texto de contraseña.
6. Apps Script → **Implementar → Gestionar implementaciones → Editar** (icono lápiz) → **Versión: Nueva versión** → **Implementar**. Mantén la misma URL de la implementación `/exec`.
7. Abre Balance y ve a **Ajustes → Comprobar las cuentas privadas**. Selecciona cada persona y prueba su contraseña.

**Qué hace la prueba:** envía el usuario y su contraseña a Apps Script mediante HTTPS, dentro del cuerpo POST. El backend verifica un hash de la clave y almacena temporalmente solo el resultado ("valid", "invalid" o "limited") asociado a un identificador aleatorio. El navegador consulta ese resultado sin transmitir las contraseñas en la URL.

**Qué NO hace:** no crea sesiones, no devuelve tokens, no permite leer los datos privados y no sincroniza ninguna comida ni ningún peso. El formulario no conserva la contraseña después de la comprobación. El acceso a los registros requerirá otra fase técnica para evitar JSONP con datos personales. Solo tras comprobar ese canal podremos utilizar registros reales.

No uses nombres, contraseñas ni claves reales dentro de los archivos de GitHub. Las dos propiedades de contraseña se eliminan tras una ejecución satisfactoria.

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
