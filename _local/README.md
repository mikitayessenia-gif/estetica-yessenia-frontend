# Yessenia Centro de Estetica - Landing Page + Sistema de Turnos Online

**Version actual:** v47  
**Ultima actualizacion:** 2026-06-25

---

## Resumen del Proyecto

Landing page profesional para centro de estetica con sistema de reservas online integrado. El frontend (HTML/CSS/JS modularizado) se conecta a una API hospedada en Google Apps Script que lee/escribe datos en un Google Sheet. No hay base de datos externa ni servidor propio: Google Sheets es la fuente unica de verdad.

**Caracteristicas principales:**
- Sistema de turnos online con seleccion de tratamiento, fecha y hora disponible
- Cobro de sena via Mercado Pago (Checkout Pro) con timer de expiracion dual (frontend + backend)
- Gestion de tratamientos multi-fila (tratamientos de 4h = 2 bloques consecutivos)
- Panel de administracion para gestion de agenda, estadisticas y configuracion
- Control anti-acaparador (evita que un cliente reserve multiples turnos simultaneamente)
- Lista negra con penalizacion automatica por cancelaciones tardias
- Sistema de pagos conflictivos como red de seguridad
- Sistema completo de emails automaticos: confirmacion al cliente + notificacion al admin + recordatorios programados (24h y 3h antes) con CSS inline, boton "Agregar a Google Calendar" y sin archivos .ics adjuntos
- Diseño responsive mobile-first con animaciones scroll
- Configuracion centralizada en config-global.js (negocio, calendario, mensajes, comportamiento)

---

## Arquitectura

```
Usuario (navegador)
    |
    v
user-app/index.html + styles.css (frontend estatico, sin build)
    |
    |-- scripts/config-global.js   -> Configuracion centralizada del negocio
    |-- scripts/config.js          -> Overrides locales + utilidades Calendar
    |-- scripts/utils.js           -> Parsing de fechas/horas, validaciones
    |-- scripts/api.js             -> Comunicacion con API + polling de estado
    |-- scripts/booking.js         -> Flujo de reservas + render de turnos
    |-- scripts/mp-handler.js      -> Mercado Pago flow + session storage
    |-- scripts/ui.js              -> Componentes UI, modales, scroll effects
    |-- scripts/main.js            -> Orquestador de eventos del DOM
    |
    | HTTPS
    v
Google Apps Script API (endpoint publico) <- codigo.gs
     |
     v
Google Sheets (8 pestañas: AGENDA_TURNOS, TRATAMIENTOS, CONFIGURACION, LISTA_NEGRA, PAGOS_CONFLICTIVOS, HISTORIAL_CANCELACIONES, RESENAS, INSTAGRAM_REELS)
```

---

## Archivos del Proyecto

### Root

| Archivo | Descripcion |
|---------|-------------|
| `README.md` | Este archivo - documentacion completa del proyecto |
| `codigo.gs` | Backend Google Apps Script: API endpoints, logica de negocio, webhooks MP, emails (CSS inline sin .ics), recordatorios automaticos |
| `plan de implementacion de admin` | Plan de implementacion del panel admin |

### user-app/ (Frontend)

| Archivo | Descripcion | Lineas aprox. |
|---------|-------------|---------------|
| `index.html` | Landing page: hero, tratamientos, galeria Instagram, reseñas, ubicacion, formulario reserva, footer | ~380 |
| `styles.css` | Estilos con tema dorado, responsive mobile-first, animaciones scroll, componentes UI | ~400 |
| `scripts/config-global.js` | **CONFIGURACION CENTRALIZADA**: nombre del negocio, direccion, telefono, redes sociales, mensajes, comportamiento (WhatsApp CTA on/off) | ~80 |
| `scripts/config.js` | Overrides locales + funciones de utilidad para Google Calendar (formato fechas/horas, build URL) | ~85 |
| `scripts/utils.js` | Parsing de fechas (multiples formatos), parsing de horas, normalizacion de texto, validaciones frontend (nombre argentino, telefono argentino) | ~180 |
| `scripts/api.js` | Carga config/tratamientos desde API, polling de estado del turno cada 5s, comparacion por ID para confirmacion sin flickering + `verificarReservaActivaPorContacto()` para detectar pre-reservas al cargar pagina con datos autocomplete + `crearNuevaPreferenciaMP()` para crear preferencias frescas al restaurar sesion | ~400 |
| `scripts/booking.js` | Generacion de slots desde estructura del sheet, carga de turnos disponibles, submit del formulario, modal de exito con Google Calendar, calculo automatico de hora fin segun duracion del tratamiento + `selectTreatmentAndScroll()` para pre-seleccion de tratamiento desde service-cards y modal detalle | ~870 |
| `scripts/mp-handler.js` | Session storage helpers (turno temporal), timer restoration al recargar pagina con creacion de nueva preferencia MP fresca, deteccion automatica de webhook confirmado mediante polling, modal de Mercado Pago, confirmacion de pago con card completa de datos del turno, retorno de MP, manejo de pagos huérfanos | ~915 |
| `scripts/google-reviews-config.js` | Datos centralizados de reseñas de Google (fallback local) | ~60 |
| `scripts/google-reviews.js` | Loader que renderiza las tarjetas de reseñas en el DOM | ~120 |
| `scripts/ui.js` | Menu hamburguesa, header scroll effect, show/hide sections, exit confirmation modal, navigation interceptor, Intersection Observer para fade-in animations | ~215 |
| `scripts/main.js` | DOMContentLoaded boot sequence, Mercado Pago return detection, verificacion automatica de pre-reservas por contacto al cargar pagina con datos autocomplete (con flags `_reservaFlowActive`/`_reservaCheckCompleted` para evitar interferencias), visibility change handler (recuperacion al volver a pestaña + polling de webhook), beforeunload warning, popstate interceptor, session restore on reload | ~270 |
| `scripts/instagram-gallery.js` | Carga los reels de Instagram desde Google Sheets (API `obtenerReelsPublic`) con fallback a `CONFIG.reels` del array en config-global.js. Renderiza iframes embed oficiales de Instagram y carga el script embed.js asincronicamente. | ~50 |

### admin-app/ (Panel de Administracion)

| Archivo | Descripcion |
|---------|-------------|
| `admin.html` | Panel de administracion con dashboard, agenda visual, gestion de tratamientos, reseñas, reels de Instagram, configuracion con dropdowns validados |
| `admin.js` | Logica del panel: login SHA-256, sesiones persistentes, CRUD de turnos/tratamientos/configuracion/resenas/reels, carga dinamica de settings con select SI/NO para campos booleanos |
| `styles.css` | Estilos del panel admin |

---

## Google Sheets - Pestañas y Estructura

### 0. RESENAS (Admin Panel)

Pestaña utilizada por el Admin Panel para gestionar reseñas individuales que se muestran en la landing page:

| Col | Nombre | Ejemplo |
|-----|--------|---------|
| A (1) | ID_Resena | REV-1 |
| B (2) | Nombre | Verónica Gago |
| C (3) | Calificacion | 5 |
| D (4) | Comentario | "Excelente profesional!!" |
| E (5) | Servicio | General |
| F (6) | Fecha | 2026-06-06 |
| G (7) | Respuesta_Propietario | "Muchas gracias por compartir tu experiencia." |
| H (8) | Visible | SI / NO (controla si se muestra en el carrusel de la landing) |

**Como se usa:** El Admin Panel (`admin.html`) permite agregar, editar, eliminar y marcar como visible/oculta cada reseña. Solo las reseñas con `Visible === 'SI'` aparecen en el carrusel de reseñas individuales de la landing page (debajo del Hero Badge).

> **Nota importante:** El rating general y cantidad total de opiniones que se muestran en el Hero Badge NO vienen de esta pestaña. Esos datos se leen en tiempo real desde el widget externo review-widget.net (grwapi.net), que refleja los datos reales de Google. Esta pestaña solo controla qué reseñas individuales se muestran en el carrusel inferior.

---

### 1. AGENDA_TURNOS (26 columnas)

Cada fila = bloque horario de 2 horas. Columnas:

| Col | Nombre | Ejemplo |
|-----|--------|---------|
| A (1) | ID_Turno | T-1 |
| B (2) | Fecha | 27/05/2026 |
| C (3) | Dia_Semana | Miércoles |
| D (4) | Hora_Inicio | 9:00 |
| E (5) | Hora_Fin | 11:00 |
| F (6) | Estado_Turno | Disponible, Reservado Temporal, Reservado, Bloqueado, Vencido Sin Confirmar |
| G (7) | Cliente_Nombre | Maria Gomez |
| H (8) | Cliente_Email | maria@email.com |
| I (9) | Cliente_Telefono | 1112345678 |
| J (10) | Tratamiento | Limpieza Facial Profunda |
| K (11) | Monto_Abonado | 13500 (sena pagada via MP) |
| L (12) | Monto_Faltante | 31500 (saldo restante a pagar en local) |
| M (13) | Notas_Cliente | "Tengo piel sensible" (aclaraciones del formulario web) |
| N (14) | Duracion_Filas | 1 (1 = 2h, 2 = 4h, etc.) |
| O (15) | ID_Bloqueado_Por_Duracion | T-1 (referencia al turno padre) |
| P (16) | Notas_Internas | "Reserva web (Webhook) - Sena validada automaticamente. Comprobante: 123456" |
| Q (17) | ID_Preferencia_MP | pref_xxxxxx (token dinamico de Mercado Pago) |
| R (18) | Pago_Sena | Pendiente, Aprobado, No Requiere |
| S (19) | Fecha_Reserva_Registro | 2026-05-28T02:18:58.415Z (ISO timestamp) |
| T (20) | Email_Enviado | SI / NO / ERROR - Si el email de confirmacion original se envio bien |
| U (21) | Ics_Adjunto | SI / NO - Si se adjunto archivo .ics al email de confirmacion |
| V (22) | Recordatorio_24h_Enviado | PENDIENTE / SI / ERROR / NO - Estado del recordatorio de 24h antes |
| W (23) | Recordatorio_3h_Enviado | PENDIENTE / SI / ERROR / NO - Estado del recordatorio de 3h antes |
| X (24) | Admin_Aprobo_24h | SI / NO / NA - Aprobacion manual del admin para recordatorio 24h |
| Y (25) | Admin_Aprobo_3h | SI / NO / NA - Aprobacion manual del admin para recordatorio 3h |
| Z (26) | Notas_Emails | Texto libre para notas sobre envios de email |

**Estados posibles de Estado_Turno (Columna F):**
- **Disponible** -> El turno esta libre para reservar
- **Reservado Temporal** -> El cliente seleccionó el turno y tiene `Tiempo_Expiracion_Reserva_Minutos` (configurable, actualmente 5 min) para pagar la sena. Timer activo en frontend Y backend. Se genera preferencia dinamica de Mercado Pago con init_point y preference_id.
- **Reservado** -> Pago confirmado. Turno agendado definitivamente.
- **Bloqueado** -> Fila reservada por duracion multi-fila de otro turno (ej: tratamiento de 4h = 2 turnos consecutivos).
- **Vencido Sin Confirmar** -> El turno estaba en "Reservado Temporal" y superó el tiempo sin confirmacion. `lazyCleanupAgenda` cambia el estado, limpia datos del cliente pero conserva ID_Preferencia_MP para auditoría. Si el cliente luego paga y retorna de MP, el pago se registra en PAGOS_CONFLICTIVOS.

**Validacion obligatoria:** La columna F debe tener una regla de validacion en Google Sheets que acepte EXACTAMENTE estos 5 valores. Si falta alguno, la API falla con error de validacion.

### 2. TRATAMIENTOS

| Col | Nombre | Ejemplo |
|-----|--------|---------|
| A (1) | ID_Tratamiento | TRAT-1 |
| B (2) | Nombre_Tratamiento | Limpieza Facial Profunda |
| C (3) | Precio | 45000 |
| D (4) | Duracion_Filas | 1 (1 = 2h, 2 = 4h) |
| E (5) | Duracion_Texto | "2 horas" |
| F (6) | Link_Sena_MP | (OBSOLETO - ya no se usa) |
| G (7) | Imagen_URL | URL de imagen del tratamiento |
| H (8) | Descripcion | JSON con intro + sections (descripcion larga estructurada) |
| I (9) | Categoria | "Facial", "Corporal", etc. |
| J (10) | descripcion_corta | "Protocolo completo diseñado para renovar, higienizar y revitalizar la piel." |

> **Nota:** La columna F (Link_Sena_MP) es oficialmente obsoleta. El sistema ahora usa la API dinamica con `MERCADO_PAGO_ACCESS_TOKEN` para generar preferencias de pago en tiempo real. Los links estaticos fueron reemplazados por Checkout Pro dinamico.
>
> **Nota:** La columna H (Descripcion) almacena un JSON estructurado con `intro` y `sections` que el frontend usa para renderizar las tarjetas de detalle de tratamientos. La columna J (`descripcion_corta`) es una version resumida usada en listas y previews.

### 3. CONFIGURACION (clave-valor)

| Parametro | Valor | Descripcion | Unidad |
|-----------|-------|-------------|--------|
| Horas_Anticipacion_Cancelacion | 24 | Horas previas al turno para cancelar gratis | horas |
| Porcentaje_Sena_Tratamiento | 30 | Porcentaje del valor que se cobra como sena | % |
| Margen_Error_Minutos | 15 | Minutos tolerables para cancelar gratis despues de reservar (margen por equivocacion) | minutos |
| Monto_Minimo_Sena_Pesos | 2000 | Monto minimo en pesos por si el porcentaje da muy bajo | ARS |
| Tiempo_Expiracion_Reserva_Minutos | 5 | Minutos para completar pago del turno temporal antes de liberarlo | minutos |
| Exigir_Sena_Todos | SI | SI = cobra sena a todos. NO = solo a clientes de LISTA_NEGRA | - |
| Activar_Recordatorio_Dia_Anterior | SI | Activa el envío automático de correos el día previo al turno (SI/NO) | - |
| Hora_Envio_Recordatorio | 19 | Hora recomendada (formato 24h) para enviar los avisos sin molestar al cliente (ej: 19 para las 7 PM) | hora |
| Admin_Email_Notificacion_Recordatorios | (vacío) | Email alternativo para recibir notificaciones de recordatorios. Dejar vacio para usar el email predeterminado del negocio | email |

**Como se usa:** El frontend lee esta pestaña con `action=obtenerConfiguracion` al cargar la pagina. `Tiempo_Expiracion_Reserva_Minutos` define los minutos del timer de pago (lee el valor dinamicamente, NO esta hardcodeado). Los demas valores se usan en el backend para calcular penalizaciones y montos de sena.

Los campos booleanos (`Exigir_Sena_Todos`, `Activar_Recordatorio_Dia_Anterior`) se muestran como **dropdowns SI/NO** en el panel admin (no inputs de texto), para evitar errores de tipeo. El campo `Hora_Envio_Recordatorio` se muestra como input numerico (0-23).

> **Nota:** A partir de v48, el sistema solo usa recordatorio de 24h (dia anterior). Se eliminó el recordatorio de 3h para simplificar el flujo. El admin puede configurar la hora de envio en CONFIGURACION.

### 4. LISTA_NEGRA

| Col | Nombre | Ejemplo |
|-----|--------|---------|
| A (1) | Email | malo@email.com |
| B (2) | Telefono | 1199999999 |
| C (3) | Nombre | Malo Ejemplo |
| D (4) | Motivo_Penalizacion | Cancelacion tardia x3 |

Si un cliente esta en la lista negra, SIEMPRE se le exige sena (independientemente de `Exigir_Sena_Todos`).

### 5. PAGOS_CONFLICTIVOS (Red de seguridad)

Pestaña automatica donde caen los pagos que llegaron fuera del tiempo limite de expiracion. Actua como red de seguridad para evitar perder dinero ni vender turnos dos veces.

| Col | Nombre | Ejemplo |
|-----|--------|---------|
| A (1) | Fecha_Alerta | 04/06/2026 5:40:48 |
| B (2) | ID_Turno_Original | T-20 |
| C (3) | ID_Pago_Real_MP | 162076001060 |
| D (4) | Cliente_Nombre | hola2 |
| E (5) | Cliente_Email | holados@mail.com |
| F (6) | Cliente_Telefono | 1133700730 |
| G (7) | Tratamiento | Peeling Quimico Renovador |
| H (8) | Monto_Pagado | 5400 |
| I (9) | Estado_Turno_Al_Cargarse | Disponible / Vencido Sin Confirmar / Bloqueado |
| J (10) | Accion_Requerida | "El turno expiro y fue tomado por otra clienta." |
| K (11) | Notas_Cliente | Aclaraciones originales del cliente |

**Cuando cae algo en PAGOS_CONFLICTIVOS:**
- Pago fuera de tiempo + turno libre -> El cliente pago pero tardo mas de los minutos de expiracion. Nadie mas lo habia tomado. Accion: Llamar al cliente y asignar otro horario manualmente.
- Pago fuera de tiempo + turno ya ocupado -> El cliente pago tarde, pero otra persona legitima ya tomo ese horario. Accion: Verificar en MP si realmente entro plata. Decidir si ofrece otro turno o gestiona reembolso.

### 6. HISTORIAL_CANCELACIONES

Registro de auditoria de todas las cancelaciones.

| Col | Nombre | Ejemplo |
|-----|--------|---------|
| A (1) | Fecha_Cancelacion | 27/05/2026 21:48:07 |
| B (2) | ID_Turno_Cancelado | T-3 |
| C (3) | Cliente_Email | maria@test.com |
| D (4) | Cliente_Telefono | 1199999999 |
| E (5) | Tratamiento | Limpieza Facial Profunda |
| F (6) | Origen | "Cancelacion Gratuita" / "Penalizado: Cancelacion tardia" |

---

### 7. INSTAGRAM_REELS (Landing Page Gallery)

Pestaña utilizada para gestionar los reels de Instagram que se muestran en la galeria de la landing page. Los reels se cargan automaticamente via API `obtenerReelsPublic` y se renderizan con el embed oficial de Instagram.

| Col | Nombre | Ejemplo |
|-----|--------|---------|
| A (1) | ID | reel_001 (identificador unico, auto-generado si se deja vacio) |
| B (2) | URL | https://www.instagram.com/reel/DYo8waxATgQ/ (URL copiada desde la app de Instagram) |
| C (3) | Caption | "Tratamiento en acción" (texto descriptivo opcional debajo del reel) |
| D (4) | Emoji | 🎬 (emoji opcional para identificar visualmente el reel) |
| E (5) | Visible | SI / NO (controla si se muestra en la galeria de la landing) |
| F (6) | Orden | 1 (numero que define el orden de aparicion. Menor = aparece primero) |

**Como agregar un nuevo reel:**
1. Abrir Instagram → ir al reel que se quiere mostrar
2. Tocar **...** → Compartir → Copiar enlace
3. Ir a Google Sheets → pestaña INSTAGRAM_REELS → pegar la URL en columna B
4. (Opcional) Agregar caption, emoji y orden
5. Poner **SI** en Visible
6. Listo — se actualiza automaticamente en la landing page

> **Nota tecnica:** El backend extrae automaticamente el shortcode de la URL (ej: `DYo8waxATgQ`) y genera el embedUrl (`https://www.instagram.com/p/DYo8waxATgQ/embed/`). El frontend usa este embed para renderizar el iframe oficial de Instagram.

**Como se usa:**
- **Landing page:** `instagram-gallery.js` carga los reels desde la API `obtenerReelsPublic`. Si falla o la hoja no existe, hace fallback a `CONFIG.reels` del array en config-global.js.
- **Admin Panel:** Nueva seccion "Instagram" permite agregar, editar, eliminar y marcar como visible/oculta cada reel. Incluye busqueda por caption y filtro por visibilidad.

---

## Flujo de Reservas Completo

### Escenario A: Sin sena (`Exigir_Sena_Todos = NO` + cliente no en lista negra)

1. Usuario selecciona tratamiento en el dropdown -> se cargan turnos disponibles
2. Frontend llama a API: `GET action=obtenerTurnos&duracionFilas=1`
3. API devuelve turnos con estado=`Disponible` (filtrados por duracion del tratamiento)
4. Usuario elige dia y hora -> se llena form con nombre, email, telefono + notas opcionales
5. Usuario clickea "Confirmar Turno" -> `POST action=reservar`
6. Backend verifica que el turno sigue disponible (double-check anti-concurrencia)
7. Backend marca fila como **Reservado** + datos del cliente + Monto_Abonado=0 + Monto_Faltante=precioTotal
8. Si `duracionFilas > 1`: bloquea filas siguientes consecutivas del mismo dia
9. Frontend muestra "Turno Agendado con Exito!" + boton Google Calendar
10. **Email automatico** se envia al cliente con los datos del turno (MailApp de Google Apps Script)

### Escenario B: Con sena (`Exigir_Sena_Todos = SI` o cliente en lista negra)

1-4. Igual al escenario A
5. Usuario clickea "Confirmar Turno" -> `POST action=reservar`
6. Backend calcula monto de sena: `max(precio * porcentaje/100, montoMinimoSena)`
7. Backend crea **Preferencia Dinamica Mercado Pago** via API (`crearPreferenciaMercadoPago`) - genera un link unico con `init_point` e `id` (`preference_id`)
8. Backend guarda el `ID_Preferencia_MP` en columna Q(17), marca fila como **Reservado Temporal** + datos del cliente + Monto_Abonado + Monto_Faltante + timestamp (ISO)
9. Si `duracionFilas > 1`: bloquea filas siguientes con estado=`Bloqueado` + idTurno referencia
10. API responde con `{status: "REQUIERE_SEÑA", initPoint: url, preferenceId: pref_xxx}` -> Frontend muestra MODAL de Mercado Pago:
    - Monto de la sena calculado (ej: $19.500 ARS para un tratamiento de $65.000 con 30%)
    - Timer countdown (ej: 4:39) leido dinamicamente desde CONFIGURACION
    - Boton "Pagar Sena con Mercado Pago" -> abre `initPoint` (Checkout Pro real) en nueva pestaña
    - Boton "Cancelar Reserva y Elegir Otro Turno" -> libera el turno temporal inmediatamente
11. **Timer corre en frontend Y backend simultaneamente:**
    - **FRONTEND:** countdown en JS, al llegar a 0 -> llama `action=cancelarReservaTemporal` para liberar el turno
    - **BACKEND:** `lazyCleanupAgenda` detecta turnos > `Tiempo_Expiracion_Reserva_Minutos` -> los cambia a "Vencido Sin Confirmar" (limpia datos del cliente pero conserva `ID_Preferencia_MP` para auditoría)
12. **Webhook automatico (primera via de confirmacion):** Mercado Pago envia una notificacion al backend (webhook) que procesa el pago en `procesarWebhookMP()`. Al confirmar: cambia estado a "Reservado", escribe datos del cliente, y envia email de confirmacion al cliente + notificacion al admin.
13. **Deteccion automatica en pestaña original (polling):** La pestaña 1 (landing original) tiene un polling silencioso que verifica cada 5 segundos si el turno ya cambio a "Reservado". Cuando detecta el cambio, muestra inmediatamente "✅ Turno Agendado con Exito!" con TODOS los datos del turno (cliente, ID, tratamiento, fecha, horario, direccion, botones Maps/WhatsApp/Google Calendar). No requiere redireccion ni accion del usuario.
14. **Flujo de retorno de MP (segunda via):** Cuando el usuario termina el pago en la pestaña 2, MP redirige a la landing con `?collection_id=XXX&status=approved&external_reference=T-XX`. `handleMercadoPagoReturn()` detecta los params, verifica el estado del turno via `verificarTurno` (que ahora devuelve fecha, hora y tratamiento), y muestra el mismo card completo de datos del turno que en la pestaña 1. Si al recargar la pagina el timer local expiro pero el webhook ya confirmo, se detecta automaticamente y se muestra el éxito sin perder el turno.
15. **Flujo PAGO_HUERFANO (pago fuera de tiempo):** El cliente pago pero tardo mas que el timer. El `lazyCleanup` ya lo cambio a "Vencido Sin Confirmar". Cuando MP redirige, la API detecta que el turno expiro -> registra el pago en PAGOS_CONFLICTIVOS, devuelve status `PAGO_HUERFANO`. El frontend muestra un modal elegante explicando que su dinero esta seguro y ofreciendo contacto por telefono.
16. Si el cliente cancela manualmente:
    - Frontend llama POST `action=cancelarReservaTemporal`
    - Backend libera la fila principal Y las filas hijas bloqueadas -> todo vuelve a Disponible
    - Se limpia sessionStorage y se resetea el formulario

**Nota sobre preferencias expiradas:** Cuando el usuario recarga la pagina durante un timer activo, el sistema detecta que la preference MP original puede estar expirada (el `notification_url` apunta a una URL de Apps Script que puede haber cambiado). En ese caso, llama automaticamente a `crearNuevaPreferencia` para generar una nueva preferencia con webhook actualizado, garantiza que el pago se pueda confirmar y evita turnos atascados en "Reservado Temporal".

### Escenario C: Tratamiento multi-fila (ej: 4 horas = 2 filas consecutivas)

Ejemplo: Dermapen glow peeling tiene `duracionFilas = 2`

Cuando un cliente reserva T-10 a las 9:00 en el dia X:
- Fila T-10 (9:00-11:00) -> se marca como Reservado Temporal o Reservado
- La FILA SIGUIENTE (11:00-13:00 del MISMO DIA) se marca automaticamente como Bloqueado:
  - Columna F = Bloqueado
  - Columna O(15) = ID del turno padre (T-10)
  - Columna P(16) = "Bloqueado por duracion de T-10"
  - Columna R(18) = No Requiere

**REGLAS IMPORTANTES:**
- El sistema NO salta turnos ni mezcla dias
- Si el turno de las 9:00 esta disponible PERO el de las 11:00 ya tiene otro cliente, el de las 9:00 NO se muestra como disponible para tratamientos largos (`duracionFilas > 1`)
- Solo se muestran horarios que tengan espacio libre CONTIGUO en el MISMO dia
- Si no hay espacio contiguo suficiente -> mensaje: "No hay horarios con espacio suficiente de X horas seguidas"

Cuando se libera una reserva multi-fila (cancelacion o expiracion):
- Se limpia la fila principal (vuelve a Disponible)
- Se buscan TODAS las filas del sheet buscando columna O(15) = ID_Turno
- Cada fila encontrada se limpia: estado -> Disponible, notas vacias, etc.

---

## Sistema de Tiempos y Expiracion (Doble Proteccion)

El sistema tiene DOS mecanismos independientes que trabajan juntos para liberar turnos vencidos:

### 1. Timer del Frontend (JavaScript - mp-handler.js + api.js)

- Se inicia cuando la API responde `status="REQUIERE_SEÑA"`
- Lee `Tiempo_Expiracion_Reserva_Minutos` desde CONFIGURACION (actualmente 5 minutos)
- Muestra countdown en pantalla grande dentro del modal de pago
- Al llegar a 0: llama POST `action=cancelarReservaTemporal` para liberar el turno
- Si el usuario recarga la pagina (F5) durante el timer:
  - sessionStorage guardo el `idTurno` y el `expiryTimestamp` (Unix time en ms)
  - Al cargar, se detecta el turno activo y se restaura el countdown desde el tiempo restante exacto
  - Si al recargar ya expiro -> verifica API primero. Si webhook ya confirmo ("Reservado") -> muestra éxito con datos completos. Si no confirmado -> libera turno via API + limpia sessionStorage

**Mejora v27:** El polling del frontend ahora compara el ID del turno directamente (`data.id === idTurno`) en vez de depender del nombre del cliente. Esto evita el problema de flickering donde el usuario veia "Turno No Disponible" intermitentemente porque los datos del cliente tardaban en propagarse en Google Sheets.

**Mejora v27:** El polling ahora se ejecuta cada 5 segundos (antes 10s) para respuesta mas rapida, y detiene automaticamente una vez que confirma el turno con un flag `_confirmadoLocalmente`.

**Mejora v47:** Se agrego polling silencioso en la pestaña original (landing) que detecta automaticamente cuando el webhook confirma el pago. Al detectar el cambio a "Reservado", muestra inmediatamente "✅ Turno Agendado con Exito!" con todos los datos del turno sin necesidad de redireccion ni accion del usuario.

**Mejora v47:** Se agrego `verificarPreReservaPorContacto()` en main.js que detecta al cargar la pagina si hay una reserva temporal activa para el email/telefono ya escrito en el formulario (autocomplete). Usa flags `_reservaFlowActive` y `_reservaCheckCompleted` para no interferir con el flujo activo de confirmacion.

**Mejora v47:** `handleMercadoPagoReturn()` ahora usa los datos extendidos de `verificarTurno` (fecha, horaInicio, tratamiento) para mostrar el card completo de datos del turno en la redireccion de MP, igual que en la pestaña original.

Funciones clave en mp-handler.js:
- `handleRequiresSena()` -> muestra modal de pago con initPoint de Checkout Pro, guarda en sessionStorage
- `startSenaTimer()` -> inicia countdown de 1 seg
- `restoreSenaTimerFromStorage()` -> restaura timer al recargar pagina. Si timer expirado pero webhook confirmo -> muestra éxito. Si no confirmado -> libera turno. Ademas crea nueva preferencia MP fresca si la original esta expirada.
- `startSenaTimerFromRemaining()` -> muestra UI con tiempo restante
- `releaseTempReservation()` -> libera turno cuando el timer llega a 0
- `cancelarReservaTemporal()` -> libera turno al pulsar boton cancelar
- `handleMercadoPagoReturn()` -> detecta retorno de MP con collection_id/status/external_reference, valida pago, muestra card completo de datos del turno (fecha, hora, tratamiento) desde API extendida

Funciones clave en api.js:
- `startStatusPolling(idTurno)` -> polling cada 5s para verificar estado del turno
- `verificarEstadoTurno(idTurno)` -> llama API GET action=verificarTurno (devuelve ahora fecha, horaInicio, tratamiento ademas de id/estado/clienteNombre)
- `verificarReservaActivaPorContacto(email, telefono)` -> llama API GET action=verificarReservaActiva para detectar pre-reservas por email/telefono
- `crearNuevaPreferenciaMP(idTurno)` -> llama API POST action=crearNuevaPreferencia para generar nueva preferencia MP fresca con webhook actualizado
- Comparacion por ID directo (NO por nombre) para evitar race conditions

### 2. Lazy Cleanup del Backend (Google Apps Script - codigo.gs)

- Se ejecuta automaticamente cada vez que cualquier usuario carga la landing y la API lee turnos (`action=obtenerTurnos` o `action=obtenerConfiguracion`)
- Recorre TODAS las filas de AGENDA_TURNOS buscando Estado_Turno = "Reservado Temporal" o "Reservado Temp."
- Compara el timestamp (columna S, formato ISO) con la hora actual del servidor
- Si la diferencia >= `Tiempo_Expiracion_Reserva_Minutos`:
  - Cambia el estado a "Vencido Sin Confirmar" (NO lo borra a lo loco)
  - Limpia datos personales del cliente (para liberar visualmente el slot en la web)
  - Conserva ID_Preferencia_MP en columna Q(17) para auditoria
  - Libera las filas hijas bloqueadas
- Es la red de seguridad: si el frontend falla, el usuario cierra el navegador sin pagar, o hay un bug en JS, el backend igual protege los datos del cliente y registra el estado. Si el cliente luego paga (MP redirige), el pago cae en PAGOS_CONFLICTIVOS para resolucion manual.

Funcion clave en codigo.gs: `lazyCleanupAgenda()` - se ejecuta al inicio de `doGet()` antes de cada accion de lectura.

**Mejora v27:** Se agrego proteccion contra turnos muy recientes (menos de 2 minutos) para evitar que el cleanup toque turnos recien creados por race conditions entre el frontend y el backend.

---

## Webhook de Mercado Pago (v27 - Reparado)

**Problema anterior:** El webhook de Mercado Pago era rechazado porque el codigo validaba un token secreto que MP nunca envia. Esto hacia que los pagos no se confirmaran automaticamente en Google Sheets.

**Solucion implementada (codigo.gs:863-896):**
- Se reorganizo `doPost()` para procesar webhooks de MP **ANTES** de cualquier validacion de token
- Si detecta un payment ID de Mercado Pago (por GET param o POST body JSON), procesa el webhook inmediatamente
- Solo si NO es un webhook de MP, valida el token secreto
- Se agregaron `Logger.log()` para debug en la consola de Apps Script

**Flujo del webhook:**
1. MP envia notificacion al backend con formato: `{"type":"payment","data":{"id":"123456"}}`
2. `doPost()` extrae el payment ID y llama a `procesarWebhookMP(paymentId)`
3. `procesarWebhookMP()` consulta el pago en la API de MP (`consultarPagoMP`)
4. Si el pago esta aprobado:
   - Busca el turno en AGENDA_TURNOS por `external_reference` (que es el ID del turno)
   - Cambia estado a "Reservado" + escribe datos del cliente
   - Bloquea filas hijas si `duracionFilas > 1`
   - **Envia email de confirmacion al cliente** via `enviarEmailConfirmacion()` (CSS inline, sin .ics adjunto, con boton Google Calendar)
   - **Envia notificacion al admin** via `enviarEmailNotificacionAdmin()`
5. Si el pago llego tarde (turno ya liberado): registra en PAGOS_CONFLICTIVOS

---

## Sistema de Emails (v27 - Nuevo, v43 ampliado)

Se implemento envio de emails automaticos usando `MailApp` de Google Apps Script:

### Email de confirmacion (`enviarEmailConfirmacion`)
- Se envia cuando el turno se confirma exitosamente (via webhook MP, reserva directa o reserva manual admin)
- HTML profesional con branding "Yessenia.", detalles del turno, boton de WhatsApp y Maps
- Incluye: ID del turno, tratamiento, fecha, horario, direccion
- **Sin archivo .ics adjunto** (causaba que Gmail mobile reemplazara el email con una tarjeta gris de evento oculta detras del enlace "Show original")
- Usa **CSS 100% inline** (sin `<style>` tags) con layout basado en tablas HTML para maxima compatibilidad en clientes de email mobiles
- Atributo `translate="no"` en contenedor principal para evitar traduccion automatica por Gmail/Chrome que rompia el layout HTML
- Atributo `lang="es"` en la etiqueta `<html>` para declaracion correcta del idioma
- Boton **"Agregar a Google Calendar"** que abre Google Calendar con todos los detalles del turno pre-llenados (fecha, hora, ubicacion, tratamiento) — sin necesidad de archivo .ics
- Tarjeta de resumen de pago rediseñada con CSS inline: usa ícono ✅ para "Abonado" y 💳 para "Saldo a pagar", montos alineados a la derecha con colores (#2e7d32 verde, #e65100 naranja)
- Escribe en columna T(20) `Email_Enviado` (SI/NO/ERROR). La columna U(21) `Ics_Adjunto` ya no se usa.

### Email al admin (`enviarEmailNotificacionAdmin`)
- Se envia cuando un nuevo turno se confirma
- Resumen completo del turno en formato tabla
- Notifica por cada reserva nueva para que el equipo este al tanto

---

## Sistema de Recordatorios Automaticos (v43 - Nuevo)

Se implemento un sistema completo de recordatorios por email con dos ventanas temporales: **24h antes** (automatico) y **3h antes** (requiere aprobacion del admin). Los emails usan CSS 100% inline con layout basado en tablas HTML, sin archivo .ics adjunto.

### Como funciona

1. **Trigger horario:** `setupTriggers()` crea un trigger que ejecuta `verificarYEnviarRecordatorios()` cada 30 minutos durante horario laboral (7am-21pm, todos los dias)
2. **Deteccion automatica:** La funcion `obtenerPendientesRecordatorios()` escanea AGENDA_TURNOS buscando turnos confirmados dentro de las ventanas de 24h o 3h antes del turno
3. **Envio inline CSS:** Los recordatorios usan el mismo enfoque de CSS inline con tablas HTML que los emails de confirmacion — sin `<style>` tags, sin archivo .ics adjunto

### Recordatorio de 24 horas (Automatico)
- Se envia automaticamente cuando un turno esta entre 25h y 23h de distancia
- No requiere aprobacion previa (a menos que se configure lo contrario en la columna X/24)
- El email tiene estilo profesional con mensaje: "Mañana tienes tu turno confirmado"

### Recordatorio de 3 horas (Requiere Aprobacion del Admin)
- Se detecta cuando un turno esta entre 4h y 2h de distancia
- Por defecto **requiere aprobacion manual** del admin (columna Y/25 = "SI") antes de enviarse
- Si `Activar_Recordatorio_3h_Admin_Aprobacion = NO` en CONFIGURACION, se envia automatico
- El email tiene estilo profesional con mensaje: "Tu turno es hoy a las HH:MM hs"

### Columnas de seguimiento (AGENDA_TURNOS)

| Col | Nombre | Valores posibles | Descripcion |
|-----|--------|-----------------|-------------|
| V (22) | Recordatorio_24h_Enviado | PENDIENTE / SI / ERROR / NO | Estado del recordatorio de 24h |
| W (23) | Recordatorio_3h_Enviado | PENDIENTE / SI / ERROR / NO | Estado del recordatorio de 3h |
| X (24) | Admin_Aprobo_24h | SI / NO / NA | Aprobacion manual para 24h |
| Y (25) | Admin_Aprobo_3h | SI / NO / NA | Aprobacion manual requerida para 3h |

### Funciones del backend (`codigo.gs`)

| Funcion | Descripcion |
|---------|-------------|
| `generarIcsContent()` | Genera contenido .ics calendario valido con fecha/hora del turno (ya no se usa para envios) |
| `enviarEmailConIcs()` | Envia email con .ics adjunto (reutilizable para confirmacion y recordatorios — ya no se llama en v45+) |
| `buildRecordatorioHTML()` | Construye HTML profesional para recordatorios (diferente estilo segun 24h o 3h) |
| `obtenerPendientesRecordatorios()` | Escanea la hoja y devuelve turnos que entran en ventanas de 24h o 3h |
| `verificarYEnviarRecordatorios()` | Funcion principal: detecta recordatorios pendientes y los envia automaticamente |
| `aprobarRecordatorioDesdeAdmin()` | Permite al admin aprobar/rechazar recordatorios desde el panel |
| `setupTriggers()` | Crea el trigger horario (cada 30 min durante horario laboral) - ejecutar UNA VEZ |
| `getRecordatorioStatus()` | Devuelve estadisticas del sistema de recordatorios para el panel admin |
| `testEnviarRecordatorios()` | Funcion de debug para forzar el envio manual de recordatorios |

### Como activar los recordatorios

1. Ir al editor de Apps Script (`codigo.gs`)
2. Ejecutar la funcion `setupTriggers()` una vez desde el editor
3. Verificar en **Recursos > Mis triggers** que aparece el trigger programado
4. Para probar: ejecutar `testEnviarRecordatorios()` y revisar los logs

### Configuracion (hardcodeada en codigo.gs, lineas 145-150)

```javascript
const ACTIVAR_RECORDATORIO_24H = true;           // Activar recordatorio 24h
const RECORDATORIO_3H_REQUIERE_APROBACION = true; // Requiere aprobacion admin para 3h
const HORA_RECORDATORIO_24H = 24;                 // Ventana: 24h +/- tolerancia
const HORA_RECORDATORIO_3H = 3;                   // Ventana: 3h +/- tolerancia
const MARGEN_TOLERANCIA_MINUTOS = 60;             // Margen de tolerancia en minutos
```

> **Nota:** Para cambiar estos valores, editar directamente `codigo.gs` y desplegar la nueva version del script. Los valores en CONFIGURACION (hoja Google Sheets) son para referencia del admin via panel, pero los que realmente se usan estan hardcodeados como constantes globales.

---

## Configuracion Centralizada (v27 - Nuevo)

**Archivo:** `user-app/scripts/config-global.js`

Toda la configuracion del negocio esta centralizada en un unico objeto `CONFIG`. Para personalizar para otro cliente, solo hay que cambiar este archivo:

```javascript
var CONFIG = {
    negocio: {
        nombre: "Yessenia Centro de Estetica",
        nombreCorto: "Yessenia.",
        direccion: "Av. Acoyte 25, Piso 5, Of. C - Caballito, CABA",
        telefono: "+54 11 2317-8918",
        telefonoRaw: "541123178918",
        instagram: "@mikita_yessenia",
        instagramUrl: "https://www.instagram.com/mikita_yessenia",
        facebookUrl: "https://facebook.com/luminaestetica",
        tiktokUrl: "https://tiktok.com/@lumina.estetica"
    },
    calendar: {
        zonaHoraria: "America/Argentina/Buenos Aires",
        nombreEventoDefault: "Turno en Yessenia Centro de Estetica",
        recordatorioMinutos: 30,
        ubicacionDefault: "Av. Acoyte 25, Piso 5, Of. C - Caballito, CABA"
    },
    mensajes: {
        confirmacionTurno: "Te enviamos la confirmacion por email.",
        turnoNoDisponible: "El turno ya fue tomado por otra persona.",
        tiempoAgotado: "Tu tiempo para pagar expiro y el turno ya no esta disponible."
    },
    comportamiento: {
        maxMesesReserva: 3,
        tiempoExpiracionReservaMinutos: 5,
        mostrarWhatsAppCta: false  // true = muestra WhatsApp CTA, false = lo oculta
    }
};
```

**Para activar/desactivar el boton flotante de WhatsApp:** Cambiar `mostrarWhatsAppCta` a `true` en config-global.js. Por defecto esta en `false` porque por ahora no se envian notificaciones por WhatsApp (no hay API de WhatsApp implementada). El boton flotante y la seccion "O reservá facil por WhatsApp" estaran ocultos hasta que se active.

**Google Calendar:** La funcion `buildGoogleCalendarUrl()` en config.js construye URLs con fecha, hora inicio, hora fin Y direccion CORRECTAS. Antes el calendario usaba la fecha actual y una direccion incorrecta ("Av. Corrientes 1234, CABA"). Ahora usa los datos reales del turno seleccionado.

---

## API - Acciones Disponibles

### GET (lectura desde el frontend)

| Action | Parametros | Descripcion | Respuesta |
|--------|-----------|-------------|-----------|
| `obtenerTratamientos` | token | Lee sheet TRATAMIENTOS y devuelve lista de tratamientos con precio, duracion, imagen, descripcion, categoria | `{tratamientos: [{id, nombre, precio, duracionFilas, duracionTexto, imagen, descripcion, categoria}]}` |
| `obtenerTurnos` | token, duracionFilas | Lee AGENDA_TURNOS, filtra disponibles. Ejecuta lazyCleanup antes de responder. Si duracionFilas > 1 verifica que las siguientes filas consecutivas del MISMO dia tambien esten libres | `{turnos: [{id, fecha, dia, horaInicio, horaFin}]}` |
| `obtenerConfiguracion` | token | Lee sheet CONFIGURACION clave-valor | `{config: {Horas_Anticipacion_Cancelacion: 24, Porcentaje_Sena_Tratamiento: 30, ...}}` |
| `verificarTurno` | token, idTurno | Busca un turno especifico y devuelve su estado actual (extendido para retorno de MP) | `{id: "T-58", estado: "Reservado", clienteNombre: "marina", fecha: "27/06/2026", horaInicio: "11:00", tratamiento: "Limpieza Facial Profunda"}` |
| `verificarReservaActiva` | token, email o telefono | Busca reservas temporales activas por email o telefono (detectar pre-reserva al recargar pagina) | `{tieneReserva: true/false, idTurno: "T-58", estado: "Reservado Temporal", nombre: "marina", tratamiento: "...", fecha: "...", horaInicio: "...", montoSena: 13500, fechaRegistro: "..."}` |
| `obtenerResenasPublic` | token | Lee la pestaña RESENAS y devuelve solo las reseñas con `visible === 'SI'`. Se usa para el carrusel de reseñas individuales en la landing page. | `{resenas: [{id, autor, calificacion, comentario, fechaCreacion, visible, servicio}]}` |
| `obtenerReelsPublic` | token | Lee la pestaña INSTAGRAM_REELS y devuelve solo los reels con `visible === 'SI'`, ordenados por columna Orden. Extrae automaticamente el shortcode para generar embedUrl. Se usa para la galeria de Instagram en la landing page. | `{reels: [{id, url, embedUrl, caption, emoji, orden}]}` |
| `obtenerReelsAdmin` | token (POST) | Lee TODOS los reels de la pestaña INSTAGRAM_REELS (incluyendo ocultos). Se usa para el Admin Panel. Incluye columna `fila` con el numero de fila en el sheet para actualizacion directa. | `{reels: [{fila, id, url, embedUrl, caption, emoji, visible, orden}]}` |

### POST (escritura desde el frontend)

| Action | Parametros | Descripcion | Respuesta |
|--------|-----------|-------------|-----------|
| `reservar` | idTurno, nombre, email, telefono, tratamiento, duracionFilas, precioTotal, notasCliente, token | Verifica disponibilidad, crea Preferencia MP dinamica (si requiere sena), guarda ID_Preferencia_MP, marca como Reservado Temporal o Reservado. Control anti-acaparador (bloquea si el cliente ya tiene otro turno en Reservado Temporal con mismo telefono/email). | `{success: true, status: "REQUIERE_SEÑA"/"CONFIRMADO", idTurno, montoSena, initPoint:url, preferenceId:pref_xxx}` |
| `confirmarPago` | idTurno, comprobanteId, token | Valida pago MP via webhook. Si turno sigue activo -> confirma + envia email. Si expiro -> registra en PAGOS_CONFLICTIVOS. | `{success: true, status: "APROBADO_WEBHOOK"/"PAGO_HUERFANO", mensaje}` |
| `cancelarReservaTemporal` | idTurno, token | Libera inmediatamente una reserva temporal (boton Cancelar del modal) | `{success: true, mensaje: "Turno temporal liberado."}` |
| `crearNuevaPreferencia` | idTurno, token | Crea nueva preferencia MP fresca para un turno en "Reservado Temporal" (evitar webhook expirado al restaurar sesion despues de recargar pagina). Lee datos del cliente desde la hoja, genera preference con notification_url actualizado. | `{success: true, initPoint: "https://mpago.la/xxx", preferenceId: "pref_xxx"}` |
| `cancelar` | idTurno, token | Cancela turno definitivo. Evalua si aplica penalizacion (lista negra). Limpia fila + bloqueos hijos | `{success: true, mensaje: "Turno liberado con exito."}` |
| `agregarResena` | nombre, calificacion, comentario, servicio, visible, token | Agrega una nueva reseña a la pestaña RESENAS desde el admin panel. | `{success: true, id: "rev_X"}` |
| `actualizarResena` | id, nombre, calificacion, comentario, servicio, visible, token | Actualiza una reseña existente en la pestaña RESENAS. | `{success: true}` |
| `eliminarResena` | id, token | Elimina una reseña de la pestaña RESENAS. | `{success: true}` |
| `agregarReel` | url, caption, emoji, orden, visible, token | Agrega un nuevo reel a la pestaña INSTAGRAM_REELS desde el admin panel. Genera ID automatico si no se proporciona. | `{success: true, id: "reel_XXX"}` |
| `actualizarReel` | id, url, caption, emoji, orden, visible, token | Actualiza un reel existente en la pestaña INSTAGRAM_REELS. Solo actualiza los campos enviados. | `{success: true}` |
| `eliminarReel` | id, token | Elimina un reel de la pestaña INSTAGRAM_REELS. | `{success: true}` |
| `aprobarRecordatorioDesdeAdmin` | idTurno, tipoRecordatorio, decision | Aprueba (SI) o rechaza (NO) un recordatorio pendiente. tipoRecordatorio = "24h" o "3h". decision = "SI" o "NO". | `{success: true}` |
| `getRecordatorioStatus` | token | Devuelve estadisticas del sistema de recordatorios (turnos pendientes, enviados, errores). | `{totalTurnos, emailsEnviados, icsAdjuntos, recordatorios24h, recordatorios3h}` |

### Funciones sin endpoint API (ejecutar directamente en Apps Script)

| Funcion | Descripcion |
|---------|-------------|
| `setupTriggers()` | Crea el trigger horario para recordatorios automaticos. Ejecutar UNA VEZ desde el editor de Apps Script. |
| `testEnviarRecordatorios()` | Forza la ejecucion del sistema de recordatorios para testing/debug. |

### Credenciales

En config-global.js / config.js (frontend):
- `API_URL` = `https://script.google.com/macros/s/AKfycbxI5aDSlO3c6YOTkhRIDW_jlPdicP3CcOhUUkFjUPzwYJpYGfGkVyKageynWMmdlmAUig/exec`
- `API_TOKEN` = `MiCosmeticaSecretaToken2026_XYZ`

En Google Apps Script (backend - codigo.gs):
- `TOKEN_SECRETO` = `MiCosmeticaSecretaToken2026_XYZ` (debe coincidir)
- `MERCADO_PAGO_ACCESS_TOKEN` = `APP_USR-...` (para integracion real con MP)
- `NEGOCIO_NOMBRE` = `"Yessenia Centro de Estetica"`
- `NEGOCIO_DIRECCION` = `"Av. Acoyte 25, Piso 5, Of. C - Caballito, CABA"`

---

## Sistema de Reseñas (v41 - Actualizado)

### Estructura del proyecto

| Archivo | Descripcion |
|---------|-------------|
| `user-app/scripts/google-reviews-config.js` | Datos centralizados de reseñas (fallback local). Se usa solo si el widget externo no carga. |
| `user-app/scripts/google-reviews.js` | Loader que renderiza las tarjetas de reseñas en el DOM. Lee de google-reviews-config.js. |
| `user-app/index.html` | Contiene el widget externo de review-widget.net (embed via `grwapi.net`) y el Hero Widget con badge de Google Reviews. |
| `user-app/styles.css` | Estilos del hero floating card con badge de Google + animaciones. |
| `user-app/admin.html` / `admin-app/admin.js` | Panel admin con seccion para gestionar reseñas (CRUD: agregar, editar, eliminar, mostrar/ocultar). |

### Widget Externo de Google Reviews (review-widget.net)

**Ubicacion:** `user-app/index.html` linea ~104
```html
<script type="text/javascript" src="https://grwapi.net/widget.min.js" async></script>
<div class="review-widget_net" data-uuid="ac590562-0991-4514-8446-9d5402af8c16" data-template="10" data-lang="es" data-theme="light"></div>
```

El widget externo se carga desde `grwapi.net` y renderiza un badge de Google con:
- Rating real actualizado (ej: "5.0")
- Cantidad total de opiniones de Google (ej: "24 opiniones")
- Carrusel de reseñas individuales que tu tia gestiona desde el admin panel

### Hero Widget - Badge de Google Reviews en el Hero

**Ubicacion:** `user-app/index.html` linea ~56-67

Muestra un badge flotante sobre la imagen del hero con:
- Logo de Google + "Opiniones de Google X.X"
- Estrellas doradas (★★★★★)
- "Basado en N opiniones"

**Fuente de datos (prioridad):**
1. **review-widget.net** (widget externo) - lee directamente del DOM del widget renderizado, extrae rating y count via regex desde el enlace `a[href*="google.com/local/reviews"]` generado por grwapi.net
2. **Google Sheets (fallback)** - si el widget no carga, calcula el promedio desde las reseñas visibles (`visible === 'SI'`) en la pestaña RESENAS

**Mecanismo de retry:** Cada 500ms intenta leer del widget durante hasta 7.5 segundos (15 intentos). Si encuentra datos del widget, los usa inmediatamente. Si no, hace fallback al sheet despues de cargar los datos.

### Comportamiento general

1. **Hero Badge:** Lee rating y count del widget externo review-widget.net (datos reales de Google en tiempo real). Fallback al sheet si no encuentra widget.
2. **Carrusel de reseñas individuales:** Muestra las reseñas que tu tia elija mostrar desde el admin panel (las que tienen `visible === 'SI'`). Esto es independiente del rating general del hero.
3. **Admin Panel:** Permite agregar, editar, eliminar y marcar como visible/oculta cada reseña individual.

### Diferencia entre Hero Badge y Carrusel de Reseñas

- **Hero Badge (arriba):** Rating general + cantidad total de opiniones de Google (desde review-widget.net). Siempre refleja los datos reales de Google.
- **Carrusel (abajo):** Solo muestra las reseñas que tu tia quiera mostrar publicamente (puede ser 4, 10, 20, etc.). Son independientes del rating general.

---

## Notas Tecnicas Importantes

### Validacion de datos en Columna F (Estado_Turno)

IMPORTANTE: La columna F (Estado_Turno) debe tener una regla de validacion en Google Sheets que acepte EXACTAMENTE estos 5 valores: Disponible, Bloqueado, Reservado, Reservado Temporal, Vencido Sin Confirmar. Si falta alguno, la API falla con error: "Los datos introducidos en la celda infringen las reglas de validacion de datos". Esto se debe a que `lazyCleanupAgenda` escribe "Vencido Sin Confirmar" cuando un turno expira.

### Formato de fechas

El backend usa `getHoraArgentina()` que retorna DD/MM/YYYY HH:mm:ss en zona GMT-3 (Argentina). El timestamp de registro (columna S) usa formato ISO: `2026-05-28T02:18:58.415Z`. El frontend maneja ambos formatos para compatibilidad con turnos anteriores.

### Filtrado de horarios pasados para hoy

El frontend filtra automaticamente los turnos del dia actual: si son las 23:17, no se muestran slots de las 9:00, 11:00, etc. Solo se muestran horarios futuros del dia.

### Sesiones y almacenamiento

- **sessionStorage** (no localStorage): Los turnos temporales se almacenan en sessionStorage, lo que significa que se pierden al cerrar el tab/ventana del navegador. Esto es intencional para evitar turnos huérfanos.
- **MAX_MESES_RESERVA = 3**: El frontend solo muestra turnos hasta 3 meses en el futuro (configurable en config-global.js).

### Token de seguridad

El API_TOKEN se envia en cada peticion (GET y POST). Si alguien lo descubre, puede leer/escribir la agenda. Se recomienda rotar periodicamente cambiando tanto el token en config-global.js como en Google Apps Script (TOKEN_SECRETO en codigo.gs).

### Validaciones frontend

- `validarNombre()`: rechaza nombres invalidos (<2 chars), solo-numeros, patrones repetidos sospechosos (asdfasdf)
- `validarTelefonoAR()`: valida formato telefonico argentino (10-15 digitos despues de limpiar espacios/guiones/parentesis). Muestra guia al usuario sobre formato esperado (codigo de area sin 0 ni 15 inicial).

---

## Cambios por Version

### v47 - 2026-06-25
- **MEJORA:** Deteccion automatica de webhook confirmado en pestaña original (landing). Cuando el usuario abre Mercado Pago en nueva pestaña, la pestaña original tiene un polling silencioso que detecta cada 5s cuando el turno cambia a "Reservado" y muestra inmediatamente "✅ Turno Agendado con Exito!" con TODOS los datos del turno (cliente, ID, tratamiento, fecha, horario, direccion, botones Maps/WhatsApp/Google Calendar). No requiere redireccion ni accion del usuario.
- **MEJORA:** Retorno de Mercado Pago ahora muestra card completo de datos del turno en la pestaña de redireccion (la que cierra el usuario). La API `verificarTurno` ahora devuelve `fecha`, `horaInicio` y `tratamiento` ademas de los campos basicos, permitiendo mostrar la misma informacion completa que en la pestaña original.
- **MEJORA:** Al recargar pagina con timer expirado localmente pero webhook ya confirmado -> se detecta automaticamente y muestra éxito sin perder el turno. Antes se liberaba el turno al expirar el timer local.
- **MEJORA:** `verificarPreReservaPorContacto()` en main.js detecta al cargar la pagina si hay una reserva temporal activa para el email/telefono ya escrito en el formulario (autocomplete del navegador). Usa flags `_reservaFlowActive` y `_reservaCheckCompleted` para no interferir con el flujo activo de confirmacion.
- **MEJORA:** `restoreSenaTimerFromStorage()` ahora crea nueva preferencia MP fresca al restaurar sesion despues de recargar pagina. Esto evita el problema de preferencias expiradas donde el `notification_url` apuntaba a una URL de Apps Script que habia cambiado, rompiendo la entrega del webhook.
- **MEJORA:** Nueva API `crearNuevaPreferencia` en backend lee datos del cliente desde la hoja, genera nueva preference con `notification_url` actualizado, y devuelve `initPoint` + `preferenceId` frescos.
- **MEJORA:** Nueva API `verificarReservaActiva` busca reservas temporales activas por email o telefono, devuelve todos los datos necesarios para restaurar el flujo de pago completo.
- **Backend:** Default de expiracion de turnos cambiado de 10 a 5 minutos (linea ~882 de codigo.gs).

### v48 - 2026-06-25
- **NUEVO:** Sistema de gestion de Instagram Reels desde Google Sheets y Admin Panel. Pestaña `INSTAGRAM_REELS` con columnas: ID, URL, Caption, Emoji, Visible, Orden. Los reels se cargan automaticamente en la landing page via API `obtenerReelsPublic`.
- **NUEVO:** Backend: funciones `getReels()` (lectura publica + admin) y `postReels()` (CRUD: agregar, actualizar, eliminar). Se extrae automaticamente el shortcode de la URL para generar el embedUrl.
- **NUEVO:** Frontend: `instagram-gallery.js` ahora carga reels desde Google Sheets con fallback a `CONFIG.reels` del array en config-global.js. Si la hoja no existe o falla, usa los datos hardcodeados como respaldo.
- **NUEVO:** Admin Panel: nueva seccion "Instagram" con gestion completa de reels (agregar, editar, eliminar, mostrar/ocultar, buscar, filtrar por visibilidad).
- **IMPORTANTE API INSTAGRAM REELS:** 
  - `obtenerReelsPublic` → Se llama via **GET** desde `user-app/scripts/instagram-gallery.js`. Lee la pestaña INSTAGRAM_REELS y devuelve solo reels con `visible === 'SI'`, ordenados por columna Orden.
  - `obtenerReelsAdmin` → Se llama via **POST** desde el Admin Panel (admin.js). Devuelve TODOS los reels (incluyendo ocultos) para gestion completa. Tambien expuesto en GET pero se usa POST desde el admin.
  - `agregarReel`, `actualizarReel`, `eliminarReel` → Se llaman via **POST** desde el Admin Panel para CRUD de reels.
- **MEJORA:** Actualizacion de tildes en landing page: Dirección, Ubicación, Política, anticipación, será, comprensión, estación, línea.
- **MEJORA:** Link unificado de "Politica de Privacidad y Términos" con modal combinado (privacidad + términos + política de reservas) y botón X fijo arriba.
- **MEJORA:** Eliminado texto "Pin ajustable con tu direccion real en Google Maps" del embed del mapa.
- **MEJORA:** Link de WhatsApp agregado al footer entre "Seguinos" y el copyright.
- **MEJORA:** Link de tratamientos del footer actualizado para usar scroll JS en vez de `#servicios` (evita saltos raros).

### v27 - 2026-06-10
- **FIX CRITICO:** Webhook de Mercado Pago reparado. Antes era rechazado porque se validaba un token que MP nunca envia. Ahora se procesa antes de cualquier validacion.
- **FIX CRITICO:** Flickering del estado del turno resuelto. El polling ahora compara el ID del turno directamente en vez de depender del nombre del cliente (que podia tardar en propagarse en Google Sheets).
- **NUEVO:** Sistema de emails automaticos con MailApp de Google Apps Script. Email de confirmacion al cliente + notificacion al admin al confirmar turno.
- **NUEVO:** Configuracion centralizada en config-global.js. Nombre del negocio, direccion, telefono, redes sociales, mensajes, comportamiento (WhatsApp CTA on/off) todo en un solo archivo.
- **FIX:** Google Calendar ahora muestra fecha, hora inicio Y hora fin CORRECTAS del turno seleccionado. Antes usaba la fecha actual y una direccion incorrecta.
- **FIX:** Se eliminaron todos los textos hardcodeados de "Lumina Estetica" y reemplazados por el nombre real del negocio desde CONFIG.
- **FIX:** Se eliminaron todas las referencias a WhatsApp en mensajes de confirmacion (no se envian notificaciones por WhatsApp porque no hay API de WhatsApp implementada).
- **FIX:** Boton flotante ahora es de WhatsApp (no telefono), pero oculto por defecto (`mostrarWhatsAppCta: false`). Para activarlo, cambiar el valor a `true` en config-global.js.
- **MEJORA:** Polling del frontend reducido de 10s a 5s para respuesta mas rapida.
- **MEJORA:** Se agrego proteccion contra turnos muy recientes (<2 min) en lazyCleanupAgenda para evitar race conditions.
- **LIMPIEZA:** Eliminado directorio `user-app/data/` que contenia un archivo services.json sin usar (datos estaticos obsoletos reemplazados por la API de Google Sheets).

### v26 - 2026-05-28
- Sistema base de turnos con Mercado Pago Checkout Pro
- Timer de expiracion dual (frontend + backend)
- Tratamientos multi-fila con bloqueo automatico
- Panel de administracion basico
- Lista negra y pagos conflictivos

---

## Cambios por Version (continua)

### v46 - 2026-06-18
- **FIX:** Google Calendar time offset corrected. The `_toGoogleCalDate()` function now manually calculates UTC by adding 3 hours to Argentina time (GMT-3), instead of relying on the server's local timezone which was US/Eastern and caused a 3-hour shift
- **UPDATE:** Version in codigo.gs header updated to 46.0

### v45 - 2026-06-18
- **FIX:** Removed ICS file attachment from all emails to fix Gmail mobile rendering issue where the .ics attachment caused Gmail on mobile to replace the HTML email with a gray event card and hide the actual content behind "Show original" link
- **FIX:** Webhook duplicate prevention now uses PropertiesService as an atomic lock (not just sheet column check). This prevents Mercado Pago from sending 2 identical webhook notifications that could cause duplicate emails. The lock key is `webhook_lock_{externalRef}` stored in ScriptProperties - first webhook creates the lock, second webhook detects it and skips immediately
- **FIX:** Email confirmation now uses fully inline CSS (no `<style>` tags) for maximum email client compatibility on mobile devices. All styles are applied directly via `style="..."` attributes on each element using HTML tables instead of flexbox divs
- **NEW:** Added "Agregar a Google Calendar" button in email confirmations that opens Google Calendar with all turn details pre-filled (date, time, location, treatment info) - no ICS file needed
- **NEW:** Added `translate="no"` attribute to the main email container to prevent automatic translation by Gmail/Chrome on mobile which was breaking the HTML layout
- **NEW:** Added `lang="es"` attribute to the `<html>` tag for proper language declaration
- **NEW:** Payment summary card redesigned with inline CSS - uses green check icon (✅) for "Abonado" and orange credit card icon (💳) for "Saldo a pagar", amounts aligned right with proper colors (#2e7d32 for green, #e65100 for orange)
- **NEW:** WhatsApp link helper function `buildWhatsAppLink()` to properly encode the message parameters
- **UPDATED:** Both confirmation email and reminder emails (24h/3h) now use inline CSS with table-based layout instead of `<style>` tags
- **FIX:** Google Calendar URL now correctly calculates UTC time from Argentina timezone (GMT-3). Previously showed wrong times (e.g., 9:00am turn showed as 6:00am because the server was in US/Eastern timezone)

### v44 - 2026-06-17
- **FIX:** Duplicacion de email de confirmacion al cliente resuelta. Ahora se usa la columna `Email_Enviado` como guardia de deduplicacion ANTES de enviar, evitando race conditions entre webhook de MP y retorno frontend `confirmarPago`. Se agrego estado intermedio "EMAIL_ENVIANDO" para bloquear reenvios durante el proceso.

### v43 - 2026-06-17
- **NUEVO:** Sistema completo de recordatorios automaticos por email con dos ventanas: 24h (automatico) y 3h (requiere aprobacion del admin). Los emails incluyen archivo `.ics` adjunto para que los clientes puedan agregar el evento a su calendario.
- **NUEVO:** `enviarEmailConfirmacion()` ahora adjunta archivo .ics al email de confirmacion original (no se necesita Google Calendar externo).
- **NUEVO:** Columnas nuevas en AGENDA_TURNOS (T-Z / 20-26): Email_Enviado, Ics_Adjunto, Recordatorio_24h_Enviado, Recordatorio_3h_Enviado, Admin_Aprobo_24h, Admin_Aprobo_3h, Notas_Emails.
- **NUEVO:** Funciones backend: `generarIcsContent()`, `enviarEmailConIcs()`, `buildRecordatorioHTML()`, `obtenerPendientesRecordatorios()`, `verificarYEnviarRecordatorios()`, `aprobarRecordatorioDesdeAdmin()`, `setupTriggers()`, `getRecordatorioStatus()`, `testEnviarRecordatorios()`, `parseFechaArgentina()`.
- **NUEVO:** Trigger programable via `ScriptApp` que ejecuta recordatorios cada 30 min durante horario laboral.
- **MEJORA:** Las 3 llamadas a `enviarEmailConfirmacion` (webhook MP, reserva directa, reserva manual admin) ahora escriben en columnas Email_Enviado e Ics_Adjunto segun el resultado del envio.
- **MEJORA:** Panel admin: los campos de configuracion `Activar_Recordatorio_24h` y `Activar_Recordatorio_3h_Admin_Aprobacion` se muestran como dropdowns SI/NO en lugar de inputs de texto, para evitar errores de tipeo.
- **ACTUALIZADO:** Estructura de AGENDA_TURNOS de 19 a 26 columnas.
- **ACTUALIZADO:** Estructura de RESENAS: ahora usa ID_Resena/Nombre/Calificacion en lugar de ID/Autor/Rating. Incluye columna Respuesta_Propietario (G).
- **ACTUALIZADO:** Estructura de TRATAMIENTOS: columna H ahora almacena JSON estructurado (intro + sections) en vez de texto plano. Nueva columna J (`descripcion_corta`).

### v42 - 2026-06-13
- **NUEVO:** Links dinamicos en el footer: la seccion "Tratamientos" del footer ahora se genera automaticamente desde los datos de la API (`obtenerTratamientos`), reemplazando la lista estatica. Cada link tiene `onclick="window.scrollToTreatmentCard('TRAT-X')"` que smooth-scrolla a la card correspondiente y aplica un highlight visual (box-shadow dorado + scale up durante 2.5s).
- **NUEVO:** Boton "Reservar Ya" en cada service-card: al hacer clic, pre-selecciona el tratamiento en el dropdown `#treatmentSelect` mediante `window.selectTreatmentAndScroll(nombre)`, smooth-scrolla a la seccion `#reservar`, y dispara automaticamente un evento `change` que activa `loadAvailableSlots()` — los horarios disponibles aparecen sin que el usuario tenga que seleccionar nada manualmente.
- **NUEVO:** Funcion `selectTreatmentAndScroll(treatmentName)` en `booking.js:817-862`: normaliza nombres (trim + NFD accent removal), busca coincidencia exacta en las opciones del select con fallback a partial match, y dispara el evento change para activar el flujo de carga de slots.
- **NUEVO:** Funcion `scrollToTreatmentCard(treatmentId)` en `api.js:276-300`: busca la `.service-card[data-treatment-id="TRAT-X"]`, hace scroll suave doble (primero a #servicios, luego a la card), y aplica highlight con transicion CSS.
- **NUEVO:** Atributo `data-treatment-id` en cada `.service-card` generado por `renderServicesFromData()` — vincula cada card con su tratamiento desde el API (`t.id`).
- **NUEVO:** Boton "Reservar Este Tratamiento" en el modal de detalle (`.btn-book-lg`) usa la misma logica que "Reservar Ya": pre-selecciona tratamiento + carga slots.
- **FIX:** Se eliminó el interceptor de footer links en `main.js` que usaba `addEventListener('click')` — se reemplazo por handlers inline con `onclick="...return false;"` para garantizar compatibilidad con Chrome DevTools click simulation y navegadores donde los event listeners registrados despues del DOM no siempre se ejecutan.

---

## Despliegue a Produccion — Checklist de Credenciales

Este proyecto usa **dos pares de claves** de Mercado Pago. Cada uno va en un lugar diferente:

### 1. Backend (Google Apps Script) → `MP_ACCESS_TOKEN` (Access Token, PRIVADO)

| Dónde | Archivo | Método |
|-------|---------|--------|
| **Apps Script** → ⚙️ Configuracion del proyecto → Propiedades del script (Script properties) | Clave: `MP_ACCESS_TOKEN` | Valor: `APP_USR-xxxx` (tu access token de MP) |

⚠️ Este valor **NO debe estar en codigo.gs**. El archivo lee automáticamente desde las Script Properties. Si ves el token hardcodeado, borrá esa linea.

Tambien configurar la propiedad `API_TOKEN` con valor: `MiCosmeticaSecretaToken2026_XYZ` (debe coincidir con `config-global.js`).

### 2. Frontend (Landing Page) → `MP_PUBLIC_KEY` (Public Key, PUBLICA)

| Dónde | Archivo | Linea | Que cambiar |
|-------|---------|-------|-------------|
| `user-app/scripts/config-global.js` | `config-global.js` | ~132 | `var MP_PUBLIC_KEY = "APP_USR-xxxx"` (tu public key de MP) |

La Public Key es segura exponerla en el frontend. Se usa solo para renderizar el Wallet Brick (modal de pago).

### 3. URL de la Landing Page — `URL_FRONTEND` (BACK_URLS DE MP)

| Dónde | Archivo | Linea | Que cambiar |
|-------|---------|-------|-------------|
| Apps Script → codigo.gs | `codigo.gs` | ~132 | `const URL_FRONTEND = "https://esteticamikitayessenia.ar"` (tu dominio real) |

Este valor se usa en los `back_urls` de Mercado Pago para redirigir al cliente despues del pago.

### Resumen rapido de cambio test → produccion

| Entorno | MP_ACCESS_TOKEN (backend) | MP_PUBLIC_KEY (frontend) | URL_FRONTEND |
|---------|---------------------------|--------------------------|--------------|
| **Test** | `APP_USR-37689cf8-7f33-45a5-8687-a7cdd6c708ea` | `APP_USR-37689cf8-7f33-45a5-8687-a7cdd6c708ea` | `https://esteticamikitayessenia.ar` |
| **Produccion (tuya)** | Tu access token de produccion de MP | Tu public key de produccion de MP | Tu dominio real |

**Pasos para cambiar a produccion:**
1. Ir a https://www.mercadopago.com/developers/panel/credentials y generar credenciales de PRODUCCION
2. Copiar el `ACCESS TOKEN` → ir a Apps Script → ⚙️ Propiedades del script → actualizar `MP_ACCESS_TOKEN`
3. Copiar la `PUBLIC KEY` de produccion → abrir `user-app/scripts/config-global.js` linea ~132 → reemplazar valor
4. Actualizar `URL_FRONTEND` en `codigo.gs` linea ~132 si cambió el dominio
5. Guardar, desplegar nueva version en Apps Script, subir frontend al hosting

---

## Pendiente por Desarrollar

### 1. Webhook de Mercado Pago - URL de produccion

**Estado:** El webhook esta configurado en el codigo pero la `notification_url` apunta al endpoint de Apps Script desplegado. Los `back_urls` en `crearPreferenciaMercadoPago()` apuntan a la URL de la landing page.

**Para completar:** Reemplazar `https://TU_DOMINIO_O_GITHUB_PAGES.github.io/user-app/index.html` (codigo.gs:132) por la URL real de produccion de la landing page. Esto asegura que los back_urls de MP redirijan correctamente despues del pago.

### 2. Boton flotante de WhatsApp

**Estado:** El boton flotante esta implementado como enlace a WhatsApp (`https://wa.me/541123178918`), pero esta oculto por defecto porque `mostrarWhatsAppCta: false` en config-global.js.

**Para activar:** Cambiar `mostrarWhatsAppCta: true` en config-global.js y reemplazar los mensajes que dicen "Llamanos por telefono" por referencias a WhatsApp cuando se implemente la API de WhatsApp Business.

### 3. UI/UX para el negocio

Se va a trabajar en el diseno visual de la landing page para que quede pulida para la clienta final.

### 4. Sincronizacion directa con Google Calendar del negocio

**Estado actual:** El boton "Guardar en Google Calendar" abre un evento pre-llenado en una nueva pestaña del navegador para que el usuario lo guarde manualmente. Los emails de confirmacion incluyen un boton **"Agregar a Google Calendar"** que abre Google Calendar con todos los detalles del turno pre-llenados (fecha, hora, ubicacion, tratamiento) — sin necesidad de archivo .ics adjunto.

**Para implementar:** Evaluacion de usar Google Calendar API desde Apps Script para insertar automaticamente los eventos confirmados en el calendario del negocio (no solo abrirlo externamente).

### 5. Panel admin para aprobacion de recordatorios

**Estado actual:** A partir de v48, el sistema solo usa recordatorio de 24h (dia anterior). Se eliminó el recordatorio de 3h para simplificar el flujo. El admin puede configurar la hora de envio en CONFIGURACION (campo `Hora_Envio_Recordatorio`).

**Para implementar:** Seccion en `admin.html` con:
- Tabla de turnos pendientes de aprobacion (filtro por 24h cercanos)
- Botones SI/NO por cada turno pendiente
- Llamada a `aprobarRecordatorioDesdeAdmin()` para guardar la decision
- Boton "Verificar recordatorios ahora" que llama a `testEnviarRecordatorios()`
- Panel de estadisticas con `getRecordatorioStatus()`
