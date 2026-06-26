# DOCUMENTACION COMPLETA - SISTEMA DE RESERVAS YESSANIA ESTETICA

**Fecha:** 2026-06-25  
**Backend:** `codigo.gs` (Google Apps Script)  
**Frontend:** `user-app/scripts/` (Vanilla JS, sin framework)

---

## PARTE 1 - BACKEND (`codigo.gs`)

### Columnas de la hoja AGENDA_TURNOS (mapeo exacto)
| Col | Constante | Uso |
|-----|-----------|-----|
| 1 | COL_ID_TURNO | ID del turno (ej: T-107) |
| 2 | COL_FECHA | Fecha DD/MM/YYYY |
| 3 | COL_DIA | Dia de la semana |
| 4 | COL_HORA_INICIO | Hora inicio |
| 5 | COL_HORA_FIN | Hora fin |
| 6 | COL_ESTADO_TURNO | Disponible / Reservado Temporal / Reservado Temp. / Reservado / Bloqueado / Vencido Sin Confirmar |
| 7-13 | Cliente, tratamiento, notas | Datos del cliente |
| 14 | COL_DURACION_FILAS | Nro de filas que ocupa el turno (1 = 2h, 2 = 4h) |
| 15 | COL_ID_BLOQUEADO | ID del turno padre que bloquea esta fila |
| 16 | COL_NOTAS_INTERNAS | Auditoria del sistema |
| 17 | COL_ID_PREFERENCIA_MP | Preference ID de Mercado Pago |
| 18 | COL_PAGO_SENA | Pendiente / Aprobado / No Requiere |
| 19 | COL_FECHA_REGISTRO | Timestamp de cuando se creo la reserva temporal |

---

### ✅ FUNCIONALIDADES EXISTENTES EN BACKEND

#### 1. Control ANTI-ACAPARADOR (Líneas 1244-1269)
**Ubicación:** `doPost` → action `"reservar"`
```
FLUJO:
1. Al recibir una solicitud de reserva, recorre toda la agenda
2. Busca filas con estado "Reservado Temporal" o "Reservado Temp."
3. Compara cada reserva temporal activa por: telefono, email O nombre normalizado
4. Si encuentra match → RECHAZA la nueva reserva
5. Devuelve: { success: false, error: "Ya tenés una reserva en proceso de pago", idTurnoBloqueado: "T-107" }

PROTECCION: Si un usuario intenta reservar otro turno mientras tiene uno pendiente, el backend lo bloquea.
```

#### 2. CANCELAR RESERVA TEMPORAL VOLUNTARIA (Líneas 1453-1478)
**Ubicación:** `doPost` → action `"cancelarReservaTemporal"`
```
FLUJO:
1. Busca el turno por ID
2. Lo pone en estado "Disponible" + limpia campos del cliente (columnas 1-14)
3. Libera todas las filas hijas bloqueadas (duracionFilas > 1)
4. NO penaliza, NO agrega a lista negra
5. Devuelve: { success: true, mensaje: "Turno temporal liberado" }

USO: Frontend lo llama cuando el usuario presiona "Cancelar y elegir otro turno"
```

#### 3. LIMPIEZA AUTOMATICA DE EXPIRADOS (Líneas 879-970 `lazyCleanupAgenda`)
**Ubicación:** Se ejecuta en cada GET (linea 1046) y despues de reservar (linea 1326)
```
FLUJO:
1. Lee tiempo maximo desde CONFIGURACION (Tiempo_Expiracion_Reserva_Minutos, default 10 min)
2. Busca reservas con estado "Reservado Temporal" o "Reservado Temp."
3. Calcula diferencia desde COL_FECHA_REGISTRO
4. Si > limiteMinutos → cambia a "Vencido Sin Confirmar" + limpia datos del cliente
5. Libera filas hijas bloqueadas

NOTA: El backend usa 10 min por defecto, el frontend muestra 5 min en el timer.
Hay una discrepancia de 5 minutos entre frontend y backend.
```

#### 4. WEBHOOK MERCADO PAGO (Líneas 296-500 `procesarWebhookMP`)
**Ubicación:** `doPost` → procesa ID de pago de MP ANTES de cualquier validacion
```
FLUJO:
1. Recibe paymentId de MP (GET o POST body)
2. Consulta estado del pago en API de MP
3. Si esta "approved" → busca turno en agenda por external_reference
4. Si el turno sigue "Reservado Temporal" → lo confirma como "Reservado"
5. Envia email de confirmacion al cliente + notificacion al admin
6. Maneja casos: ya procesado, pago tardio, conflicto de superposicion

PROTECCION: Usa PropertiesService lock para evitar race conditions con webhooks duplicados de MP.
```

#### 5. VERIFICAR ESTADO DE TURNO (Líneas 1130-1146)
**Ubicación:** `doGet` → action `"verificarTurno"` con parametro `idTurno`
```
ENTRADA: idTurno (ej: "T-107")
SALIDA: { id: "T-107", estado: "Reservado Temporal", clienteNombre: "..." }

LIMITACION: SOLO acepta ID de turno. NO puede buscar por email o telefono.
```

---

### ❌ LO QUE NO EXISTE EN BACKEND (NECESARIO)

#### FALTA: Endpoint GET para verificar reserva activa por email/telefono
**Problema:** No hay endpoint que reciba email o telefono y devuelva si el usuario tiene una pre-reserva temporal activa.
```
NECESARIO:
doGet → action "verificarReservaActiva" con parametros email y/o telefono

ENTRADA: { email: "user@mail.com", telefono: "1123178918" }
SALIDA: 
  - Si tiene reserva temporal activa: { tieneReserva: true, idTurno: "T-107", estado: "Reservado Temporal", tratamiento: "...", fecha: "...", hora: "...", montoSena: 13500 }
  - Si NO tiene: { tieneReserva: false }

USO: Frontend lo llama al cargar la pagina para detectar si el usuario ya tenia una pre-reserva activa ANTES de que se guardara en sessionStorage (ej: si el usuario nunca llego a completar el formulario, solo selecciono fecha/hora y recargo).
```

---

## PARTE 2 - FRONTEND

### Estructura de archivos
```
user-app/
├── index.html                    # HTML principal
├── styles.css                    # Estilos
├── scripts/
│   ├── config-global.js          # CONFIG, API_URL, API_TOKEN, constantes globales
│   ├── config.js                 # MAX_MESES_RESERVA, STORAGE_KEY_*, funciones helper
│   ├── api.js                    # Llamadas a la API (obtenerTratamientos, obtenerTurnos, etc.)
│   ├── main.js                   # Orquestador: DOMContentLoaded, visibilitychange, beforeunload
│   ├── booking.js                # Formulario de reserva, submit, manejo de errores
│   ├── mp-handler.js             # Mercado Pago flow, sessionStorage, timer, restore
│   └── ui.js                     # DOM manipulation, modal de salida, hamburger menu
```

### Flujo de almacenamiento de pre-reserva
```
1. handleRequiresSena() en mp-handler.js (linea 140):
   - Guarda en sessionStorage: idTurno + expiryTime
   - Muestra pantalla de pago con Wallet Brick de Mercado Pago
   - Inicia timer de 5 minutos

2. getStoredTurnoData() (mp-handler.js linea 17):
   - Lee sessionStorage
   - Devuelve { idTurno, expiryTime } o null

3. clearActiveTurnoStorage() (mp-handler.js linea 10):
   - Remueve ambos items de sessionStorage
```

### Flujo de restauracion al recargar pagina
```
main.js linea 127-139: window "load" event
├─ getStoredTurnoData() → si hay datos en sessionStorage
│  ├─ remainingMs > 0 → restoreSenaTimerFromStorage()
│  └─ remainingMs <= 0 → clearActiveTurnoStorage() + releaseStoredTurno()

mp-handler.js linea 28-83: restoreSenaTimerFromStorage()
├─ verificarEstadoTurno(idTurno) → llama al backend
│  ├─ estado === "Reservado" → turno confirmado, muestra success
│  ├─ estado === "Disponible" / "Vencido Sin Confirmar" → turno perdido, resetea form
│  └─ sigue activo → startSenaTimerFromRemaining() → muestra pantalla de pre-reserva

main.js linea 28-107: visibilitychange event
├─ Usuario vuelve a la pestaña
├─ Verifica con API si el turno sigue activo
├─ Si ya fue confirmado por webhook → muestra success
└─ Si ya expiró → libera y resetea
```

### Flujo de pago Mercado Pago
```
1. usuario llena formulario + selecciona fecha/hora → submit (booking.js linea 309)
2. POST action="reservar" al backend
3. Backend crea preference MP + estado "Reservado Temporal" en agenda
4. Frontend recibe { status: "REQUIERE_SEÑA", initPoint, idTurno }
5. handleRequiresSena() muestra pantalla de pago con Wallet Brick (mp-handler.js linea 140)
6. Usuario paga → MP redirige con ?collection_id=&status=&external_reference=
7. handleMercadoPagoReturn() procesa el retorno (mp-handler.js linea 460)
8. Verifica estado del turno en backend
9. Si confirmado → muestra success. Si no → retry o pago huérfano
```

---

## PARTE 3 - BUGS Y PROBLEMAS IDENTIFICADOS

### BUG 1: Overlay oscuro al recargar pagina con pre-reserva activa
**Manifestacion:** Al hacer F5/recargar mientras se tiene un turno en pantalla de pago, la pagina muestra brevemente un overlay/menú oscuro tapando el contenido principal con "Cargando tratamientos..." en el footer.

**Causa raiz:** Es un problema de timing:
1. `index.html` carga → DOM ready → se ejecuta `loadTreatmentsFromAPI()` (async)
2. Al mismo tiempo, `main.js` "load" event llama a `restoreSenaTimerFromStorage()`
3. Pero `loadTreatmentsFromAPI()` puede mostrar mensajes de error si tarda mucho (>8 seg), mostrando overlays en el footer
4. El menu hamburguer del footer queda abierto por defecto o se abre accidentalmente

**Impacto:** El usuario ve la pagina "rota" brevemente antes de que se muestre la pantalla de pre-reserva.

**Solucion:** 
- Opcion A: Mostrar un spinner/overlay de carga mientras `restoreSenaTimerFromStorage()` verifica con la API
- Opcion B: Ocultar el footer completamente durante la verificacion de pre-reserva
- Opcion C: Agregar un flag CSS para ocultar elementos hasta que la pagina este lista

### BUG 2: Discrepancia de tiempo entre frontend y backend
**Frontend:** Timer muestra 5 minutos (configurable via CONFIG.comportamiento.tiempoExpiracionReservaMinutos)
**Backend:** `lazyCleanupAgenda` usa default de 10 minutos (configurable via CONFIGURACION sheet Tiempo_Expiracion_Reserva_Minutos)

**Impacto:** El frontend libera el turno despues de 5 min, pero el backend lo mantiene activo hasta 10 min. Si el usuario espera 6-9 minutos y recarga, puede ver que su turno sigue activo aunque el timer ya expiró.

**Solucion:** Unificar ambos valores. Backend debe usar el mismo valor que el frontend (5 min).

### BUG 3: No hay deteccion de pre-reserva sin sessionStorage
**Escenario:** Si un usuario llena el formulario, selecciona fecha/hora, pero NO envia el formulario (o la pagina se cierra antes del submit), no hay nada en sessionStorage. Al recargar, la pagina vuelve al estado normal sin saber que habia una intencion de reserva.

**Impacto:** Bajo, porque este flujo nunca se completó en el backend tampoco (el backend solo crea la pre-reserva DESPUES del submit exitoso).

**Nota:** Este NO es un bug real. El backend solo marca la pre-reserva cuando el POST "reservar" es exitoso, y en ese momento ya se guarda en sessionStorage.

---

## PARTE 4 - LO QUE SE NECESITA HACER

### PRIORIDAD ALTA: Endpoint GET para verificar reserva activa por email/telefono

**Backend (codigo.gs):**
```javascript
// En doGet, agregar despues del action "verificarTurno" (linea 1146):

if (action === "verificarReservaActiva") {
  const email = e.parameter.email;
  const telefono = e.parameter.telefono;
  
  if (!email && !telefono) {
    return crearRespuestaJSON({ error: "Falta email o telefono" }, 400);
  }
  
  const datosAgenda = sheetAgenda.getDataRange().getDisplayValues();
  
  for (let i = 1; i < datosAgenda.length; i++) {
    let estado = datosAgenda[i][COL_ESTADO_TURNO - 1];
    if (estado !== "Reservado Temporal" && estado !== "Reservado Temp.") continue;
    
    let emailReg = datosAgenda[i][COL_CLIENTE_EMAIL - 1].toString().trim().toLowerCase();
    let telReg = datosAgenda[i][COL_CLIENTE_TELEFONO - 1].toString().trim();
    
    let match = false;
    if (email && emailReg === email.toLowerCase()) match = true;
    if (telefono && telReg === telefono) match = true;
    
    if (match) {
      return crearRespuestaJSON({
        tieneReserva: true,
        idTurno: datosAgenda[i][COL_ID_TURNO - 1],
        estado: estado,
        nombre: datosAgenda[i][COL_CLIENTE_NOMBRE - 1] || "",
        tratamiento: datosAgenda[i][COL_TRATAMIENTO - 1] || "",
        fecha: datosAgenda[i][COL_FECHA - 1] || "",
        horaInicio: datosAgenda[i][COL_HORA_INICIO - 1] || "",
        horaFin: datosAgenda[i][COL_HORA_FIN - 1] || "",
        montoSena: datosAgenda[i][COL_MONTO_ABONADO - 1] || 0,
        precioTotal: (datosAgenda[i][COL_MONTO_ABONADO - 1] || 0) + (datosAgenda[i][COL_MONTO_FALTANTE - 1] || 0),
        fechaRegistro: datosAgenda[i][COL_FECHA_REGISTRO - 1] || ""
      });
    }
  }
  
  return crearRespuestaJSON({ tieneReserva: false });
}
```

**Frontend (api.js):**
```javascript
// Agregar nueva funcion en api.js:

function verificarReservaActivaPorContacto(email, telefono) {
    var params = 'token=' + encodeURIComponent(API_TOKEN);
    if (email) params += '&email=' + encodeURIComponent(email.toLowerCase());
    if (telefono) params += '&telefono=' + encodeURIComponent(telefono);
    
    var url = API_URL + '?action=verificarReservaActiva&' + params;
    return fetch(url)
        .then(function(r){return r.json()})
        .then(function(data) { return data; })
        .catch(function(err) {
            console.error('Error verificando reserva activa:', err);
            return { error: err.toString() };
        });
}
```

**Frontend (main.js):**
```javascript
// En window "load" event, ANTES de restoreSenaTimerFromStorage():

window.addEventListener("load", function() {
    // Primero verificar si hay pre-reserva activa en el backend por email/telefono
    var emailInput = document.getElementById("clienteEmail");
    var telInput = document.getElementById("clienteTelefono");
    
    if ((emailInput && emailInput.value.trim()) || (telInput && telInput.value.trim())) {
        var emailVal = emailInput ? emailInput.value.trim().toLowerCase() : "";
        var telVal = telInput ? telInput.value.trim() : "";
        
        verificarReservaActivaPorContacto(emailVal, telVal)
            .then(function(data) {
                if (data.tieneReserva && data.idTurno) {
                    // Hay pre-reserva en backend - restaurar timer
                    var remainingMs = calcularTiempoRestante(data.fechaRegistro);
                    if (remainingMs > 0) {
                        // Guardar en sessionStorage para que el resto del flujo funcione
                        try {
                            sessionStorage.setItem(STORAGE_KEY_ACTIVE_TURN, data.idTurno);
                            sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(Date.now() + remainingMs));
                        } catch(e) {}
                        
                        window._pendingSenaData = {
                            idTurno: data.idTurno,
                            tratamiento: data.tratamiento,
                            nombre: data.nombre,
                            fecha: data.fecha,
                            hora: data.horaInicio,
                            montoSena: data.montoSena
                        };
                        
                        restoreSenaTimerFromStorage();
                    } else {
                        // Expirada en backend - liberar
                        releaseStoredTurno(data.idTurno);
                        clearActiveTurnoStorage();
                    }
                    return;
                }
                // No hay reserva activa en backend, continuar con flujo normal (sessionStorage)
            });
    }
    
    // Flujo normal de sessionStorage
    var stored = getStoredTurnoData();
    if (stored) {
        var remainingMs = stored.expiryTime - Date.now();
        if (remainingMs > 0) {
            restoreSenaTimerFromStorage();
        } else {
            clearActiveTurnoStorage();
            releaseStoredTurno(stored.idTurno);
        }
    }
});
```

### PRIORIDAD MEDIA: Unificar tiempos de expiracion
**Backend:** Cambiar default en linea 882 de `lazyCleanupAgenda` de 10 a 5 minutos.
```javascript
// Linea 882, cambiar:
let limiteMinutos = 10; // Default if config not found (increased for safety)
// Por:
let limiteMinutos = 5; // Debe coincidir con frontend
```

### PRIORIDAD MEDIA: Mejorar UX al recargar con pre-reserva activa
**Frontend (mp-handler.js o ui.js):**
```javascript
// Agregar spinner de carga mientras se verifica la pre-reserva:

function showPreReservationLoader() {
    var overlay = document.createElement('div');
    overlay.id = 'preReservaLoader';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div style="color:white;text-align:center"><div class="spinner" style="margin:0 auto 16px"></div><p>Verificando tu reserva...</p></div>';
    document.body.appendChild(overlay);
}

function hidePreReservationLoader() {
    var loader = document.getElementById('preReservaLoader');
    if (loader) loader.remove();
}

// Llamar showPreReservationLoader() al inicio de restoreSenaTimerFromStorage()
// y hidePreReservationLoader() cuando termine (exitoso o fallido)
```

---

## PARTE 5 - RESUMEN DE ACCIONES

| # | Accion | Archivo | Prioridad | Estado |
|---|--------|---------|-----------|--------|
| 1 | Endpoint GET `verificarReservaActiva` por email/telefono | codigo.gs | ALTA | NO HECHO |
| 2 | Funcion frontend `verificarReservaActivaPorContacto()` | api.js | ALTA | NO HECHO |
| 3 | Actualizar main.js load handler para verificar backend primero | main.js | ALTA | NO HECHO |
| 4 | Unificar tiempo de expiracion (5 min en backend) | codigo.gs | MEDIA | NO HECHO |
| 5 | Spinner de carga al detectar pre-reserva al recargar | mp-handler.js / ui.js | MEDIA | NO HECHO |
| 6 | Ocultar footer durante verificacion de pre-reserva | ui.js | BAJA | NO HECHO |

---

## PARTE 6 - FLUJO COMPLETO DEBUQUEADO (como funciona HOY)

### Flujo normal de reserva:
```
1. Usuario ve landing page → hace scroll a "Reservar"
2. Selecciona tratamiento → se cargan turnos disponibles
3. Selecciona fecha/hora → llena nombre, telefono, email
4. Presiona "Confirmar Turno" → POST action="reservar" al backend
5. Backend verifica ANTI-ACAPARADOR (lineas 1244-1269)
   - Si usuario ya tiene reserva temporal → RECHAZA con error + idTurnoBloqueado
6. Backend crea preference Mercado Pago + estado "Reservado Temporal" en agenda
7. Frontend recibe respuesta → handleRequiresSena() muestra pantalla de pago
8. Frontend guarda idTurno + expiryTime en sessionStorage
9. Timer de 5 min comienza a contar
10. Usuario paga con Wallet Brick de Mercado Pago
11. Mercado Pago redirige con ?collection_id=&status=
12. handleMercadoPagoReturn() verifica estado del turno
13. Si confirmado → muestra success. Si no → retry o pago huérfano
```

### Flujo de recarga durante pre-reserva (HOY):
```
1. Usuario tiene pantalla de pago abierta (timer corriendo)
2. Presiona F5/recarga la pagina
3. index.html carga → DOM ready
4. main.js "load" event → getStoredTurnoData() lee sessionStorage
5. Si hay datos → restoreSenaTimerFromStorage()
6. Llama verificarEstadoTurno(idTurno) al backend
7. Backend responde con estado actual del turno
8. Si sigue activo → startSenaTimerFromRemaining() muestra pantalla de pre-reserva
9. startStatusPolling() verifica cada 5 seg si el turno expiró o fue confirmado
```

### Flujo de recarga DESPUES de completar pago (HOY):
```
1. Usuario pagó con Mercado Pago
2. MP redirige a la landing page con ?collection_id=&status=&external_reference=
3. main.js "DOMContentLoaded" → handleMercadoPagoReturn() detecta params de MP
4. Si tiene collection_id → procesa retorno MP (no restoreSenaTimerFromStorage)
5. Verifica estado del turno en backend
6. Muestra success o retry según corresponda
```

---

## PARTE 7 - NOTAS TECNICAS IMPORTANTES

### sessionStorage vs localStorage
- El sistema usa **sessionStorage** (se borra al cerrar el tab/ventana)
- Claves: `yessenia_active_turno` y `yessenia_expiry_timestamp`
- Esto es correcto porque si el usuario cierra el navegador, la reserva debe liberarse

### Polling de estado
- Cada 5 segundos se verifica el estado del turno con `verificarEstadoTurno(idTurno)`
- Si el turno fue confirmado (webhook de MP) → muestra success
- Si el turno expiró o fue tomado por otro → muestra error con opcion de elegir otro turno

### Webhook de Mercado Pago
- Se ejecuta en `procesarWebhookMP()` (lineas 296-500)
- Usa PropertiesService lock para evitar race conditions
- Actualiza el estado del turno a "Reservado" y envia emails

### Limpieza de expirados
- `lazyCleanupAgenda()` se ejecuta en CADA GET request (linea 1046)
- Tambien despues de crear una reserva (linea 1326)
- Esto garantiza que las reservas expiradas se liberen rapidamente

### Anti-acaparador
- Se ejecuta EN EL POST "reservar" (lineas 1244-1269)
- Compara por telefono, email O nombre normalizado (sin acentos, minusculas)
- Si encuentra match → rechaza y devuelve `idTurnoBloqueado`
- El frontend usa esto para mostrar el modal "Cancelar esa reserva y elegir otro turno"
