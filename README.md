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

## Mejoras de seguimiento y perfil (versión 0.6)

- En **Peso**, el gráfico muestra una línea horizontal discontinua para el peso objetivo; la escala incluye tanto los registros como el objetivo.
- En **Ajustes → Datos personales**, cada cuenta puede guardar **altura (cm)** y **fecha de nacimiento**. La edad se calcula automáticamente.
- En **Peso**, aparecen el IMC actual, la categoría orientativa para adultos de 20 años o más, el cambio respecto al pesaje anterior y la media de los últimos siete días con registros (máximo un pesaje por día y al menos dos días distintos).
- Los calendarios están adaptados a Safari en iPhone; en Peso y Comidas hay un botón **Hoy**.
- En **Comidas**, el historial se puede filtrar por tipo.

Las categorías de IMC utilizan los puntos de corte habituales para adultos: bajo peso menor que 18,5; normopeso entre 18,5 y menos de 25; sobrepeso entre 25 y menos de 30; obesidad a partir de 30. El IMC es un indicador orientativo y **no** mide composición corporal ni constituye un diagnóstico. Para menores de 20 años no se aplica esta clasificación.

### Actualizar Apps Script para sincronizar el perfil

La web conserva el acceso y la sincronización de peso y comidas con el backend anterior, pero el formulario de altura y nacimiento solo se habilita con el backend `0.6.0-health-profile`.

1. En la hoja privada, abrir **Extensiones → Apps Script**.
2. Sustituir el contenido de `Code.gs` por `backend/Code.gs` de este repositorio. **No hace falta modificar `Bridge.html`.**
3. Guardar y elegir **Implementar → Gestionar implementaciones → Editar (lápiz) → Nueva versión → Implementar**.
4. Comprobar el resultado de la URL `/exec?action=health`, que debe indicar `0.6.0-health-profile`. Cerrar sesión y volver a iniciar sesión en la web.
5. Entrar en **Ajustes → Datos personales** y rellenar altura y fecha de nacimiento para cada cuenta. La primera escritura amplía automáticamente `Settings` con las columnas `height_cm` y `birth_date`, sin borrar el objetivo ni las filas existentes.

La aplicación guarda esos datos cifrados en IndexedDB y sincronizados en `Settings`, accesibles únicamente para la sesión de su cuenta. Los datos de nacimiento **sí son legibles para el propietario del Google Sheets**.

## Registro rápido y seguimiento visual

La navegación principal tiene únicamente **Peso** y **Comidas**. El botón flotante **+**, situado abajo a la derecha, permite elegir entre **Registrar peso** y **Registrar comida**. Ambos formularios comparten una hoja inferior que funciona también en el iPhone. Editar un registro abre el mismo formulario con sus datos.

- La gráfica utiliza **la distancia temporal real entre las fechas**, permite elegir entre 30 días, 90 días, un año o todo el historial, y conserva la línea horizontal de objetivo. Cada punto puede tocarse para conocer la fecha y el peso exacto.
- El historial de comidas se agrupa por días; además de los filtros existentes, cada comida tiene una acción **Repetir**. El formulario muestra sugerencias privadas basadas en comidas recientes o repetidas, sin crear una base adicional de favoritos.
- Al guardar un peso en una fecha que ya tiene otro, se ofrece actualizar el existente para evitar duplicados accidentales.
- Tras eliminar un registro aparece un botón **Deshacer** durante unos segundos. Si el borrado ya se sincronizó, deshacer vuelve a enviar el registro con el mismo identificador.
- Ajustes muestra la **última sincronización confirmada** en el dispositivo; las operaciones de registro siguen guardándose localmente antes de enviarse.

No se necesitan cambios nuevos en Apps Script para estas funciones. Para guardar altura y fecha de nacimiento, sigue siendo necesario tener publicada la versión `0.6.0-health-profile` del backend.

## Organización de Ajustes

El menú de la cuenta abre una pantalla principal de **Ajustes** con dos grupos: **Personalización y seguimiento** (Apariencia, Datos personales, Objetivo de peso) y **Datos y privacidad** (Sincronización y Exportar datos). Cada opción abre su propio apartado y tiene un botón para regresar a la lista de Ajustes. El botón «Volver» de la lista regresa a la pestaña anterior.

Los formularios y controles existentes se reutilizan sin duplicarlos. Esta modificación solo afecta a la navegación y presentación; no altera la autenticación, el backend ni las operaciones de sincronización.

## Personalización del color

En **nombre de usuario → Ajustes → Apariencia** se puede seleccionar uno de los nueve colores: **verde, azul, rojo, rosa, morado, turquesa, naranja, mostaza y grafito**.

La selección se refleja inmediatamente en el logotipo, los botones, las tarjetas destacadas, la navegación, el gráfico y los controles interactivos. Cada cuenta recuerda su elección en el almacenamiento local del navegador, con una clave distinta para Iñigo y Clara. Al cerrar sesión se recupera el verde predeterminado en la pantalla de acceso.

**Importante:** es una preferencia visual local al dispositivo y navegador; no se sincroniza mediante Google Sheets. No modifica los datos de peso, comidas, altura, nacimiento ni las operaciones pendientes. Si se borran los datos del sitio, se recupera el verde por defecto. El icono ya instalado de la PWA conserva el icono original.

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
