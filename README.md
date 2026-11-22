# Balance

Aplicación web personal para registrar el peso, las comidas y un objetivo de peso, con dos cuentas independientes. La aplicación se publica en GitHub Pages; los registros se guardan en una hoja privada de Google Sheets y en una copia cifrada de cada dispositivo.

**Aplicación:** https://inigougedoehu-ai.github.io/balance-app/

## Funcionalidades

La aplicación tiene dos apartados principales: **Peso** y **Comidas**. El nombre de la cuenta, situado en la parte superior, abre el menú con **Ajustes**, **Sincronizar ahora** y **Cerrar sesión**. El objetivo personal, el estado de sincronización y la exportación se encuentran dentro de Ajustes.

- Inicio de sesión independiente para Iñigo y Clara.
- Registro, edición y borrado de pesajes con fecha, historial y gráfica.
- Registro de comidas por fecha y tipo, con descripción y notas opcionales, sin cálculo de calorías.
- Objetivo de peso personal.
- Guardado local cifrado con IndexedDB y Web Crypto (AES-GCM, PBKDF2).
- Sincronización con Google Sheets a través de Google Apps Script cuando hay conexión.
- Cola de cambios para reintentar las operaciones pendientes cuando se abre la aplicación con una sesión válida.
- Exportación de los registros de la cuenta abierta en JSON (archivo **sin cifrar**).
- Instalación como aplicación web (PWA).

## Instalación en iPhone

En Safari, abrir la dirección principal de Balance y seleccionar **Compartir → Añadir a pantalla de inicio**. El manifiesto usa `start_url: "./"`, por lo que el icono abre el inicio de sesión sin añadir un nombre de archivo al enlace.

En el Mac y otros dispositivos se puede utilizar la misma URL directamente. Cada cuenta necesita su contraseña.

## Arquitectura

| Archivo | Función |
|---|---|
| `index.html` | Entrada principal y pantalla de inicio de sesión |
| `private-app.js` y `lib/` | Interfaz, cifrado local, cola y sincronización |
| `styles.css` | Diseño adaptable |
| `manifest.webmanifest`, `sw.js`, `icon.svg` | Instalación PWA y recursos sin conexión |
| `backend/Code.gs` | Verificación de contraseñas, sesiones y operaciones autorizadas sobre Sheets |
| `backend/Bridge.html` | Comunicación entre la web pública y Apps Script mediante `google.script.run` |

La hoja privada contiene las pestañas `Users`, `Weights`, `Meals`, `Settings`, `Operations` y `Sessions`. Las contraseñas no se incorporan al repositorio. El servidor asocia cada lectura y escritura al usuario autenticado mediante su sesión, no a un identificador suministrado por la interfaz.

La página `private.html` sigue disponible como acceso alternativo. `demo.html` conserva la antigua interfaz de demostración, con una base local **distinta y sin cifrar**; no debe utilizarse para información personal.

## Actualizaciones del servidor

Cuando se cambien `backend/Code.gs` o `backend/Bridge.html`, hay que copiar esos cambios al editor vinculado a la hoja y publicar **una nueva versión de la implementación existente** de Apps Script. No hace falta ejecutar de nuevo `setupDatabase` ni `provisionAccounts` para una actualización habitual.

Las actualizaciones de la web se publican desde la rama `main` con GitHub Pages.

## Privacidad, límites y copias de seguridad

- La copia local de cada cuenta se cifra utilizando una clave derivada de su contraseña. La contraseña no se almacena en el navegador. Las sesiones remotas se conservan solamente en memoria; después de cerrar o recargar es necesario volver a entrar.
- El contenido de Google Sheets **no está cifrado frente al propietario de la cuenta de Google**. La hoja debe mantenerse privada y la cuenta protegida con autenticación en dos pasos.
- Las exportaciones JSON no están cifradas. Deben almacenarse de forma segura.
- Los cambios entre varios dispositivos pueden resolverse según el orden de aplicación en el servidor; no hay un sistema avanzado de resolución de conflictos.
- La sincronización sin conexión no continúa garantizadamente cuando la aplicación está cerrada en iOS. Los cambios pendientes se envían al volver a utilizarla y establecer una sesión con conexión.
- Conviene mantener una copia de seguridad periódica de la hoja y comprobar que los cambios se han sincronizado antes de borrar datos locales o cambiar contraseñas. Cambiar una contraseña puede impedir descifrar la copia local creada con la anterior.
- Los datos de prueba registrados antes de la puesta en uso no se eliminan automáticamente. Es necesario borrarlos desde cada cuenta y comprobar que el borrado se sincroniza.

El proyecto utiliza GitHub Pages, Apps Script y Sheets sin servicios externos adicionales ni sistema de compilación.
