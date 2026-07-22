// ========== Variables globales del sistema de pago ==========
var _paymentApprovedLocally = false;
var _mpFlowActive = false; // BUGFIX #2: bloquea race condition entre timer y retorno MP
var _successShown = false; // BUGFIX #5: evita que polling muestre no-exito después de éxito
var _connectionLost = false; // Estado actual de conexión (true = offline)
var _autoRetryTimer = null; // Timer para reintento automático al reconectarse
var _sinConexionModalShown = false; // Evita mostrar el modal de sin conexión duplicado
var _sinConnRetryCount = 0; // Contador de reintentos del modal sin conexión
var _maxSinConnRetries = 3; // Máximo de reintentos antes de mostrar modal final
var _verifyingConnection = false; // Flag anti-duplicado para verificación tras reconexión
var _tiempoAgotadoShown = false; // Flag para evitar que polling sobrescriba "Tiempo Agotado"
var _connectionDetectionActive = true; // Desactivar cuando se muestra un modal de resultado final
var _sinConnModalHasReintentar = true; // Si true, el modal tiene botón "Reintentar". Si false, es modal FINAL (sin reintentar)

// ========== Helper fetch con timeout (BUGFIX #3) ==========
function fetchWithTimeout(url, options, timeoutMs) {
    if (!timeoutMs) timeoutMs = 20000;
    console.log("⏱️ [FETCH-TIMEOUT] fetchWithTimeout: " + url.substring(0, 80) + "... timeout=" + timeoutMs + "ms");
    return Promise.race([
        fetch(url, options),
        new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error("TIMEOUT")); }, timeoutMs);
        })
    ]);
}

// ========== Timestamp helper para logs de debug ==========
function _ts() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    var ms = String(now.getMilliseconds()).padStart(3, '0');
    return '[' + h + ':' + m + ':' + s + '.' + ms + ']';
}

// ========== BLOQUEO ANTI-DOBLE-PAGO EN LINK DE MP ==========
function blockDoublePayment(event, idTurno) {
    // Prevenir múltiples clicks en el link de pago
    if (window._paymentLinkBlocked) {
        event.preventDefault();
        event.stopPropagation();
        console.log("🚫 [PAGO] Doble-click bloqueado para turno " + idTurno);
        return;
    }
    
    // Marcar como bloqueado inmediatamente
    window._paymentLinkBlocked = true;
    
    // Deshabilitar el link visualmente
    var linkBtn = document.getElementById('paymentLinkBtn');
    if (linkBtn) {
        linkBtn.style.opacity = '0.5';
        linkBtn.style.pointerEvents = 'none';
        linkBtn.textContent = '⏳ Abriendo Mercado Pago...';
    }
    
    // Mostrar overlay de bloqueo sobre TODO el contenido
    var existingOverlay = document.getElementById('paymentBlockOverlay');
    if (existingOverlay) existingOverlay.remove();
    
    var overlay = document.createElement('div');
    overlay.id = 'paymentBlockOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,51,102,0.85);z-index:99998;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;pointer-events:none;';
    overlay.innerHTML = '<div style="color:#FFD700;font-size:1.3rem;font-weight:bold;text-align:center;padding:24px 48px;background:rgba(0,30,60,0.95);border-radius:16px;border:2px solid #C4A16D;box-shadow:0 8px 32px rgba(0,0,0,0.4)"><div style="font-size:2rem;margin-bottom:8px">⏳</div><div>Redirigiendo a Mercado Pago...</div></div>';
    document.body.appendChild(overlay);
    
    console.log("🔒 [PAGO] Link de pago bloqueado para turno " + idTurno);
    
    // Auto-limpiar el overlay despues de 8 segundos (caso borde: si MP no cargó)
    setTimeout(function() {
        removePaymentOverlay();
    }, 8000);
}

// ========== Limpiar overlay de pago (se llama al volver a la pagina) ==========
function removePaymentOverlay() {
    var overlay = document.getElementById('paymentBlockOverlay');
    if (overlay) {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '0';
        setTimeout(function() {
            if (overlay.parentNode) overlay.remove();
        }, 300);
    }
    window._paymentLinkBlocked = false;
    
    // Reactivar el link de pago
    var linkBtn = document.getElementById('paymentLinkBtn');
    if (linkBtn) {
        linkBtn.style.opacity = '1';
        linkBtn.style.pointerEvents = 'auto';
        linkBtn.textContent = '💳 Pagar Seña con Tarjeta o Mercado Pago';
    }
}

// Detectar cuando el usuario vuelve a la pagina desde Mercado Pago (tab switch)
(function() {
    var hidden, visibilityChange;
    if (typeof document.hidden !== "undefined") {
        hidden = "hidden";
        visibilityChange = "visibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
        hidden = "webkitHidden";
        visibilityChange = "webkitvisibilitychange";
    }
    
    document.addEventListener(visibilityChange, function() {
        // Si la pagina vuelve a estar visible (usuario volvio de MP)
        if (!document[hidden]) {
            console.log("🔄 [PAGO] Pagina restaurada - limpiando overlay");
            setTimeout(removePaymentOverlay, 500);
        }
    });
    
    // Tambien detectar cuando la ventana pierde y recupera foco (mobile)
    window.addEventListener('blur', function() {
        console.log("📱 [PAGO] Ventana perdió foco (usuario fue a MP)");
    });
    
    window.addEventListener('focus', function() {
        console.log("🔄 [PAGO] Ventana recupero foco - limpiando overlay");
        setTimeout(removePaymentOverlay, 500);
    });
})();

// ========== Auto-timestamp en TODOS los console.log (sin cambiar código existente) ==========
(function() {
    try {
        var _origLog = console.log;
        console.log = function() {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(_ts());
            _origLog.apply(console, args);
        };
    } catch(e) {}
})();

// ========== Date/Time Formatters ==========
var MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function formatFechaDisplay(val) {
    if (!val) return "";
    try {
        var d = new Date(val);
        if (isNaN(d.getTime())) {
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(val))) return val;
            return val;
        }
        return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
    } catch(e) { return val; }
}

function formatHoraDisplay(val) {
    if (!val) return "";
    try {
        var d = new Date(val);
        if (!isNaN(d.getTime())) {
            return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        }
        var m = String(val).match(/(\d{1,2}):(\d{2})/);
        if (m) return String(parseInt(m[1])).padStart(2,'0') + ':' + m[2];
        return val;
    } catch(e) { return val; }
}

function formatHoraDesdeSheets(val) {
    if (!val) return "";
    try {
        var d = new Date(val);
        if (isNaN(d.getTime())) {
            var m = String(val).match(/(\d{1,2}):(\d{2})/);
            return m ? String(parseInt(m[1])).padStart(2,'0') + ':' + m[2] : val;
        }
        if (d.getFullYear() === 1899 || d.getFullYear() === 1970) {
            var h = d.getUTCHours();
            var min = d.getUTCMinutes();
            return String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
        }
        if (d.getFullYear() >= 2020) {
            return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        }
        var m = String(val).match(/(\d{1,2}):(\d{2})/);
        if (m) return String(parseInt(m[1])).padStart(2,'0') + ':' + m[2];
        return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    } catch(e) { return String(val); }
}

// ========== Get clean display data from _pendingSenaData ==========
function getDisplayDataFromPending() {
    if (!window._pendingSenaData || !window._pendingSenaData.tratamiento) {
        return { tratamiento: '', fecha: '', horaInicio: '', horaFin: '', horaDisplay: '', email: '' };
    }
    
    var trat = window._pendingSenaData.tratamiento || '';
    var nombre = window._pendingSenaData.nombre || '';
    var email = window._pendingSenaData.email || '';
    
    // Clean date - DD/MM/YYYY format -> "3 de Julio de 2026"
    var fechaRaw = window._pendingSenaData.fecha || '';
    var fechaClean = '';
    if (fechaRaw) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(fechaRaw)) {
            var parts = fechaRaw.split('/');
            var dd = parseInt(parts[0], 10);
            var mm = parseInt(parts[1], 10) - 1;
            var yyyy = parseInt(parts[2], 10);
            if (yyyy >= 1970 && dd >= 1 && dd <= 31 && mm >= 0 && mm <= 11) {
                fechaClean = dd + ' de ' + MESES_ES[mm] + ' de ' + yyyy;
            } else {
                fechaClean = fechaRaw;
            }
        } else {
            var d = new Date(fechaRaw);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 1970) {
                fechaClean = d.getDate() + ' de ' + MESES_ES[d.getMonth()] + ' de ' + d.getFullYear();
            } else {
                fechaClean = '';
            }
        }
    }
    
    // Time range: "de 13:00 a 15:00" - calcular horaFin si no existe
    var horaInicioRaw = window._pendingSenaData.hora || '';
    var horaFinRaw = window._pendingSenaData.horaFin || '';
    
    // Si no hay horaFin, calcularla dinámicamente desde la duracion del tratamiento
    if (!horaFinRaw && horaInicioRaw) {
        var tratObj = ALL_TREATMENTS.find(function(t){ return t.nombre === (window._pendingSenaData.tratamiento || ''); });
        var durMin = 120; // default 2 horas
        if (tratObj && tratObj.duracionFilas) {
            durMin = tratObj.duracionFilas * 60;
        }
        var mInicio = String(horaInicioRaw).match(/(\d{1,2}):(\d{2})/);
        if (mInicio) {
            var totalMin = parseInt(mInicio[1], 10) * 60 + parseInt(mInicio[2], 10) + durMin;
            var finH = Math.floor(totalMin / 60);
            var finM = totalMin % 60;
            horaFinRaw = String(finH).padStart(2, '0') + ':' + String(finM).padStart(2, '0');
        }
    }
    
    var horaDisplay = '';
    if (horaInicioRaw) {
        var mInicio = String(horaInicioRaw).match(/(\d{1,2}):(\d{2})/);
        var hInicio = mInicio ? String(parseInt(mInicio[1], 10)).padStart(2, '0') + ':' + mInicio[2] : '';
        
        if (horaFinRaw) {
            var mFin = String(horaFinRaw).match(/(\d{1,2}):(\d{2})/);
            var hFin = mFin ? String(parseInt(mFin[1], 10)).padStart(2, '0') + ':' + mFin[2] : '';
            
            if (hInicio && hFin) {
                horaDisplay = 'de ' + hInicio + ' a ' + hFin;
            } else if (hInicio) {
                horaDisplay = hInicio + ' hs';
            }
        } else if (hInicio) {
            horaDisplay = hInicio + ' hs';
        }
    }
    
    return { tratamiento: trat, nombre: nombre, email: email, fecha: fechaClean, horaInicio: horaInicioRaw, horaFin: horaFinRaw, horaDisplay: horaDisplay };
}

// Helper: calcular hora fin basada en la duracion del tratamiento
function calcularHoraFin(horaInicio) {
    if (!horaInicio) return "";
    var parts = horaInicio.split(":");
    var horas = parseInt(parts[0]) || 0;
    // Fallback: sumar 1 hora por defecto si no viene de la API
    var finHoras = horas + 1;
    return String(finHoras).padStart(2, "0") + ":00";
}

// ========== STORAGE HELPERS: Persist active turno across page reloads ==========
function saveActiveTurno(idTurno, minutosExpiracion) {
    try {
        var expiryTime = Date.now() + (minutosExpiracion * 60 * 1000);
        sessionStorage.setItem(STORAGE_KEY_ACTIVE_TURN, idTurno);
        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(expiryTime));
    } catch(e) {}
}

function saveMontoSena(monto) {
    try { sessionStorage.setItem("yessenia_monto_sena", String(monto || 0)); } catch(e) {}
}

function clearActiveTurnoStorage() {
    try {
        console.log("🧹 [STORAGE] === LIMPIANDO STORAGE ===");
        var turnoAntes = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
        var expiryAntes = sessionStorage.getItem(STORAGE_KEY_EXPIRY_TS);
        var prefAntes = sessionStorage.getItem("yessenia_preference_id");
        sessionStorage.removeItem(STORAGE_KEY_ACTIVE_TURN);
        sessionStorage.removeItem(STORAGE_KEY_EXPIRY_TS);
        sessionStorage.removeItem("yessenia_preference_id");
        sessionStorage.removeItem("yessenia_init_point");
        sessionStorage.removeItem("yessenia_monto_sena");
        sessionStorage.removeItem("_pendingSenaData_json");
        // Also clear localStorage keys for fallback
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf("yessenia_pref_turn_") === 0) {
                keysToRemove.push(key);
            }
        }
        for (var j = 0; j < keysToRemove.length; j++) {
            localStorage.removeItem(keysToRemove[j]);
        }
        console.log("✅ [STORAGE] Limpiado. Turno antes: " + turnoAntes + ", expiry: " + expiryAntes + ", pref: " + prefAntes + ", localStorage keys removed: " + keysToRemove.length);
    } catch(e) {
        console.error("❌ [STORAGE] Error limpiando storage:", e);
    }
}

function getStoredTurnoData() {
    try {
        var turno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
        var expiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY_TS);
        if (turno && expiry) {
            return { idTurno: turno, expiryTime: parseInt(expiry, 10) };
        }
    } catch(e) {}
    return null;
}

// ========== LOADER PARA VERIFICACION DE PRE-RESERVA ==========
function showPreReservationLoader() {
    var existing = document.getElementById('preReservaLoaderOverlay');
    if (existing) existing.remove();
    
    var overlay = document.createElement('div');
    overlay.id = 'preReservaLoaderOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(45,62,62,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;';
    overlay.innerHTML = '<div style="color:#FFD700;font-size:1.5rem;font-weight:bold;text-align:center">Verificando tu reserva...</div>' +
        '<div style="width:40px;height:40px;border:3px solid rgba(255,215,0,0.3);border-top-color:#FFD700;border-radius:50%;animation:spin 0.8s linear infinite"></div>' +
        '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(overlay);
}

function hidePreReservationLoader() {
    var loader = document.getElementById('preReservaLoaderOverlay');
    if (loader) loader.remove();
}

function restoreSenaTimerFromStorage() {
    console.log("🔄 [RESTORE] === RESTAURANDO TIMER DESDE STORAGE ===");
    showPreReservationLoader();
    
    var storedTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
    var storedExpiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY_TS);
    var storedPref = sessionStorage.getItem("yessenia_preference_id");
    console.log("📦 [RESTORE] sessionStorage raw - turno: " + storedTurno + ", expiry: " + storedExpiry + ", pref: " + storedPref);
    
    var data = getStoredTurnoData();
    if (!data) {
        console.log("❌ [RESTORE] No hay datos en storage (turno o expiry ausente)");
        hidePreReservationLoader();
        return false;
    }
    
    var now = Date.now();
    var remainingMs = data.expiryTime - now;
    console.log("⏱️ [RESTORE] now: " + now + ", expiryTime: " + data.expiryTime + ", remainingMs: " + remainingMs + " (" + (remainingMs/1000).toFixed(0) + "s)");
    
    if (remainingMs <= 0) {
        console.log("⏰ [RESTORE] Timer LOCAL EXPIRADO - verificando webhook para turno:", data.idTurno);
        return verificarEstadoTurno(data.idTurno)
            .then(function(apiData) {
                hidePreReservationLoader();
                console.log("📡 [RESTORE] API response after timer expiry: " + JSON.stringify({id: apiData.id, estado: apiData.estado, clienteNombre: apiData.clienteNombre, tratamiento: apiData.tratamiento}));
                var mpNotApproved = false;
                try { mpNotApproved = sessionStorage.getItem('_mp_returned_not_approved') === 'true'; if(mpNotApproved) sessionStorage.removeItem('_mp_returned_not_approved'); } catch(e) {}
                if (apiData.estado === 'Reservado' && apiData.id && apiData.id.toString().trim() === data.idTurno.toString().trim()) {
                    console.log("✅ [RESTORE] Webhook YA confirmó el turno! Estado=Reservado, id match");
                    if (mpNotApproved) {
                        console.log("⚠️ [RESTORE] Pero MP retorno con status != approved — no mostrando éxito (usuario canceló en pasarela)");
                        clearActiveTurnoStorage();
                        releaseStoredTurno(data.idTurno);
                        return false;
                    }
                    console.log("Webhook ya confirmó el turno al expirar timer local, mostrando éxito");
                    clearActiveTurnoStorage();
                    stopStatusPolling();
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    window._senaTimerId = null;
                    
                    var nombreSuccess = (window._pendingSenaData && window._pendingSenaData.nombre) ? window._pendingSenaData.nombre : (apiData.clienteNombre || "Cliente");
                    var tratSuccess = (window._pendingSenaData && window._pendingSenaData.tratamiento) ? window._pendingSenaData.tratamiento : (apiData.tratamiento || "");
                    
                    var fechaSuccess = (window._pendingSenaData && window._pendingSenaData.fecha) ? window._pendingSenaData.fecha : (apiData.fecha ? formatFechaDisplay(apiData.fecha) : "");
                    var horaSuccess = (window._pendingSenaData && window._pendingSenaData.hora) ? window._pendingSenaData.hora : (apiData.horaInicio ? formatHoraDisplay(apiData.horaInicio) : "no definido");
                    var horaFinSuccess = apiData.horaFin ? formatHoraDesdeSheets(apiData.horaFin) : "";
                    
                    showBookingSuccess(nombreSuccess, tratSuccess, fechaSuccess, horaSuccess, horaFinSuccess, data.idTurno || "");
                    return true;
                }
                console.log("Turno no confirmado, liberando...");
                clearActiveTurnoStorage();
                releaseStoredTurno(data.idTurno);
                return false;
            })
            .catch(function(err) {
                console.error("Error verificando estado al expirar timer:", err);
                clearActiveTurnoStorage();
                releaseStoredTurno(data.idTurno);
                hidePreReservationLoader();
                return false;
            });
    }
    
    verificarEstadoTurno(data.idTurno)
        .then(function(apiData) {
            hidePreReservationLoader();
            
            if (apiData.estado === 'Reservado') {
                var mpNotApproved2 = false;
                try { mpNotApproved2 = sessionStorage.getItem('_mp_returned_not_approved') === 'true'; if(mpNotApproved2) sessionStorage.removeItem('_mp_returned_not_approved'); } catch(e) {}
                if (apiData.id && apiData.id.toString().trim() === data.idTurno.toString().trim()) {
                    if (mpNotApproved2) {
                        console.log("MP retorno con status != approved aunque turno confirmado — liberando (usuario canceló)");
                        clearActiveTurnoStorage();
                        releaseStoredTurno(data.idTurno);
                        return;
                    }
                    console.log("Turno ya confirmado al restaurar desde storage, liberando...");
                    clearActiveTurnoStorage();
                    stopStatusPolling();
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    window._senaTimerId = null;
                    var nombreSuc = (window._pendingSenaData && window._pendingSenaData.nombre) ? window._pendingSenaData.nombre : (apiData.clienteNombre || "Cliente");
                    var tratSuc = (window._pendingSenaData && window._pendingSenaData.tratamiento) ? window._pendingSenaData.tratamiento : (apiData.tratamiento || "");
                    
                    var fechaSuc = (window._pendingSenaData && window._pendingSenaData.fecha) ? window._pendingSenaData.fecha : (apiData.fecha ? formatFechaDisplay(apiData.fecha) : "");
                    var horaSuc = (window._pendingSenaData && window._pendingSenaData.hora) ? window._pendingSenaData.hora : (apiData.horaInicio ? formatHoraDisplay(apiData.horaInicio) : "no definido");
                    var horaFinSuc = apiData.horaFin ? formatHoraDesdeSheets(apiData.horaFin) : "";
                    
                    showBookingSuccess(nombreSuc, tratSuc, fechaSuc, horaSuc, horaFinSuc, data.idTurno || "");
                    return;
                } else {
                    console.log("Turno ya tomado por otra persona al restaurar, liberando...");
                    clearActiveTurnoStorage();
                    resetBookingForm();
                    return;
                }
            }
            if (apiData.estado === 'Disponible' || apiData.estado === 'Vencido Sin Confirmar') {
                console.log("Turno ya disponible en API aunque localmente no expiró, liberando...");
                clearActiveTurnoStorage();
                resetBookingForm();
                return;
            }
            
            // Si sigue en otro estado, continuar al bloque que crea nueva preferencia
            
            console.log("Creando nueva preferencia MP para turno:", data.idTurno);
            
            crearNuevaPreferenciaMP(data.idTurno)
                .then(function(prefData) {
                    if (!prefData.success || !prefData.initPoint) {
                        console.error("Error creando nueva preferencia:", prefData);
                        var senaDiv2 = document.getElementById("senaRequired");
                        if (senaDiv2) {
                            senaDiv2.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                                + '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>'
                                + '<h3 style="color:#FFD700;margin-bottom:8px">Error al cargar el pago</h3>'
                                + '<p>No pudimos generar el link de pago. Intenta nuevamente o contactanos por telefono.</p>'
                                + '<a href="tel:' + CONFIG.negocio.telefonoRaw + '" target="_blank" style="display:inline-block;margin-top:16px;background:#003366;color:white;padding:14px 28px;border-radius:50px;text-decoration:none;font-weight:600">📞 Contactar por Telefono</a></div>';
                            senaDiv2.style.display = "block";
                        }
                        return;
                    }
                    
                    console.log("Nueva preferencia creada:", prefData.preferenceId);
                    
                    try {
                        sessionStorage.setItem("yessenia_preference_id", prefData.preferenceId);
                        sessionStorage.setItem("yessenia_init_point", prefData.initPoint);
                    } catch(e) {}
                    
                    var storedNombre = (window._pendingSenaData && window._pendingSenaData.nombre) ? window._pendingSenaData.nombre : (apiData.clienteNombre || "Cliente");
                    var storedTratamiento = (window._pendingSenaData && window._pendingSenaData.tratamiento) ? window._pendingSenaData.tratamiento : (apiData.tratamiento || "");
                    
                    var storedFecha = (window._pendingSenaData && window._pendingSenaData.fecha) ? window._pendingSenaData.fecha : (apiData.fecha ? formatFechaDisplay(apiData.fecha) : "");
                    var storedHora = (window._pendingSenaData && window._pendingSenaData.hora) ? window._pendingSenaData.hora : (apiData.horaInicio ? formatHoraDisplay(apiData.horaInicio) : "no definido");
                    
                    var storedMontoSena = (window._pendingSenaData && window._pendingSenaData.montoSena) ? window._pendingSenaData.montoSena : 0;
                    if (!storedMontoSena || storedMontoSena === 0) {
                        try { var ssMonto = sessionStorage.getItem("yessenia_monto_sena"); storedMontoSena = ssMonto ? Number(ssMonto) || 0 : 0; } catch(e) {}
                    }
                    
                    var emailFromRestore = '';
                    var emailInputRestore = document.getElementById("clienteEmail");
                    if (emailInputRestore) emailFromRestore = emailInputRestore.value.trim();
                    
                    window._pendingSenaData = {
                        idTurno: data.idTurno,
                        tratamiento: storedTratamiento,
                        nombre: storedNombre,
                        fecha: storedFecha,
                        hora: storedHora,
                        horaFin: storedHora && calcularHoraFin(storedHora),
                        email: emailFromRestore,
                        montoSena: storedMontoSena
                    };
                    
                    handleRequiresSena(data.idTurno, storedTratamiento, storedNombre, storedFecha, storedHora, storedMontoSena, prefData.initPoint, prefData.preferenceId);
                    
                    var timerEl = document.getElementById("senaTimer");
                    if (timerEl) timerEl.style.display = "block";
                    
                    if (remainingMs <= 0) {
                        console.log("⏰ [TIMER-RESTORE] Expirado al restaurar — turno ya vencido, liberando...");
                        clearActiveTurnoStorage();
                        releaseTempReservation();
                        return;
                    }
                    
                    var totalSeconds = Math.ceil(remainingMs / 1000);
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    
                    window._senaTimerId = setInterval(function() {
                        if (!window._senaTimerId) return;
                        totalSeconds--;
                        if (totalSeconds <= 0) {
                            clearInterval(window._senaTimerId);
                            releaseTempReservation();
                            return;
                        }
                        var m = Math.floor(totalSeconds / 60);
                        var s = totalSeconds % 60;
                        var td = m + ":" + ((s<10?"0":"")+s);

                        var te=document.getElementById("senaTimer"); if(te) te.textContent="⏳ Tiempo restante: "+td;
                        var tb=document.getElementById("senaTimerBig"); if(tb) tb.textContent=td;
                    }, 1000);
                })
                .catch(function(err) {
                    console.error("Error creando nueva preferencia:", err);
                    var senaDiv2 = document.getElementById("senaRequired");
                    if (!senaDiv2) return;
                    
                    var oldInitPoint = sessionStorage.getItem("yessenia_init_point") || "";
                    if (oldInitPoint) {
                        startSenaTimerFromRemaining(data.idTurno, remainingMs, oldInitPoint);
                    } else {
                        startSenaTimerFromRemaining(data.idTurno, remainingMs);
                    }
                });
        })
        .catch(function(err) {
            hidePreReservationLoader();
            console.warn("No se pudo verificar turno en API al restaurar, intentando crear nueva preferencia igual:", err);
            
            var storedNombre = window._pendingSenaData ? window._pendingSenaData.nombre : "Cliente";
            var storedTratamiento = window._pendingSenaData ? window._pendingSenaData.tratamiento : "";
            var storedFecha = window._pendingSenaData ? window._pendingSenaData.fecha : "";
            var storedHora = window._pendingSenaData ? window._pendingSenaData.hora : "";
            var storedMontoSena = window._pendingSenaData ? (window._pendingSenaData.montoSena || 0) : 0;
            if (!storedMontoSena) {
                try { var ssMonto3 = sessionStorage.getItem("yessenia_monto_sena"); storedMontoSena = ssMonto3 ? Number(ssMonto3) || 0 : 0; } catch(e) {}
            }

            crearNuevaPreferenciaMP(data.idTurno)
                .then(function(prefData) {
                    if (prefData.success && prefData.initPoint) {
                        console.log("Nueva preferencia creada despues de error de verificacion");
                        try {
                            sessionStorage.setItem("yessenia_preference_id", prefData.preferenceId);
                            sessionStorage.setItem("yessenia_init_point", prefData.initPoint);
                        } catch(e) {}
                        
                        var emailFromRestore2 = '';
                        try { var eInput2 = document.getElementById("clienteEmail"); if(eInput2) emailFromRestore2 = eInput2.value.trim(); } catch(e){}
                        
                        window._pendingSenaData = {
                            idTurno: data.idTurno,
                            tratamiento: storedTratamiento,
                            nombre: storedNombre,
                            fecha: storedFecha,
                            hora: storedHora,
                            horaFin: storedHora && calcularHoraFin(storedHora),
                            email: emailFromRestore2,
                            montoSena: storedMontoSena
                        };
                        
                        handleRequiresSena(data.idTurno, storedTratamiento, storedNombre, storedFecha, storedHora, storedMontoSena, prefData.initPoint, prefData.preferenceId);
                    } else {
                        console.log("No se pudo crear nueva preferencia, mostrando fallback");
                        var oldInitPoint = sessionStorage.getItem("yessenia_init_point") || "";
                        if (oldInitPoint) {
                            startSenaTimerFromRemaining(data.idTurno, remainingMs, oldInitPoint);
                        } else {
                            startSenaTimerFromRemaining(data.idTurno, remainingMs);
                        }
                    }
                })
                .catch(function(err2) {
                    console.error("Error final creando preferencia:", err2);
                    var senaDiv3 = document.getElementById("senaRequired");
                    if (!senaDiv3) return;
                    
                    var oldInitPoint = sessionStorage.getItem("yessenia_init_point") || "";
                    if (oldInitPoint) {
                        startSenaTimerFromRemaining(data.idTurno, remainingMs, oldInitPoint);
                    } else {
                        startSenaTimerFromRemaining(data.idTurno, remainingMs);
                    }
                });
        });
    
    return true;
}

function startSenaTimerFromRemaining(idTurno, remainingMs, optionalInitPoint) {
    var totalSeconds = Math.ceil(remainingMs / 1000);
    if (totalSeconds <= 0) return;
    
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    
    var currentMins = Math.floor(totalSeconds / 60);
    var currentSecs = totalSeconds % 60;
    var displayTime = currentMins + ":" + (currentSecs < 10 ? "0" : "") + currentSecs;
    
    var html = '';
    html += '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto">';
    html += '<div style="font-size:3rem;margin-bottom:16px">⏳</div>';
    html += '<h3 style="font-size:1.5rem;margin-bottom:8px;color:#FFD700">¡Tu Turno está Pre-Reservado!</h3>';
    html += '<p style="opacity:0.8;margin-bottom:4px">Guardamos tu lugar por <strong>' + (Math.ceil(remainingMs/60000)) + ' minutos</strong> para que pagues la seña y lo confirmes.</p>';
    html += '<p style="opacity:0.6;font-size:0.85rem;margin-bottom:12px">Turno <strong>'+idTurno+'</strong></p>';
    html += '<div id="senaTimerBig" style="text-align:center;font-size:2.5rem;font-weight:700;color:#FFD700;margin:16px 0">';
    html += displayTime + '</div>';
    html += '<p style="text-align:center;opacity:0.6;font-size:0.85rem;margin-bottom:20px">Tiempo restante para completar el pago</p>';
    
    if (optionalInitPoint) {
        html += '<a id="paymentLinkBtn" href="'+optionalInitPoint+'" target="_blank" onclick="blockDoublePayment(event, \''+idTurno+'\')" style="display:block;margin:0 auto 12px;background:#003366;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;text-decoration:none;font-weight:600;text-align:center;cursor:pointer">💳 Pagar Seña con Tarjeta o Mercado Pago</a>';
    }
    
    html += '<button id="cancelarReservaBtnRestored" style="display:block;margin:8px auto 0;background:transparent;color:#ff6b6b;border:2px solid #ff6b6b;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">Cancelar y elegir otro turno</button>';
    html += '</div>';
    
    senaDiv.innerHTML = html;
    senaDiv.style.display = "block";
    
    var form = document.getElementById("bookingForm");
    if (form) form.style.display = "none";
    
    var remainingSeconds = totalSeconds;
    if(window._senaTimerId) clearInterval(window._senaTimerId);
    
    window._senaTimerId = setInterval(function() {
        if (!window._senaTimerId) return;
        remainingSeconds--;
        if (remainingSeconds <= 0) {
            clearInterval(window._senaTimerId);
            releaseTempReservation();
            return;
        }
        var m = Math.floor(remainingSeconds / 60);
        var s = remainingSeconds % 60;
        var td = m + ":" + ((s<10?"0":"")+s);
        
        var te=document.getElementById("senaTimer"); if(te) te.textContent="⏳ Tiempo restante: "+td;
        var tb=document.getElementById("senaTimerBig"); if(tb) tb.textContent=td;
    }, 1000);
    
    setTimeout(function(){
        var cb=document.getElementById("cancelarReservaBtnRestored");
        if(cb) cb.addEventListener("click", function(){ cancelarReservaTemporal(idTurno); });
    }, 100);
}

// ========== Handle REQUIERE_SEÑA: Mercado Pago Payment Flow ==========
function handleRequiresSena(idTurno, tratamiento, nombre, fecha, hora, montoSena, initPoint, preferenceId, email) {
    console.log("🎯 [REQUIERE_SENA] === INICIANDO FLUJO DE PAGO ===");
    markReservaFlowActive();
    
    if(window._senaTimerId) clearInterval(window._senaTimerId);
    var form=document.getElementById("bookingForm");
    if(form) form.style.display="none";
    var senaDiv=document.getElementById("senaRequired");
    if(!senaDiv) return;
    
    // Si los datos vienen vacíos, intentar obtenerlos del select
    if (!tratamiento) {
        console.error('handleRequiresSena: tratamiento vacío, buscando en select');
        var sel = document.getElementById("treatmentSelect");
        tratamiento = sel ? sel.value : "";
        if (tratamiento) tratamiento = tratamiento.split(" - ")[0];
    }
    
    // Email viene como parámetro directo del formulario o se lee del DOM
    var emailFromForm = email || '';
    if (!emailFromForm) {
        try { var eInputDom = document.getElementById("clienteEmail"); if(eInputDom) emailFromForm = eInputDom.value.trim(); } catch(e){}
    }
    
    window._pendingSenaData = {idTurno:idTurno, tratamiento:tratamiento, nombre:nombre, fecha:fecha, hora:hora, horaFin: calcularHoraFin(hora || ''), email:emailFromForm, montoSena:montoSena||0};
    try { sessionStorage.setItem("_pendingSenaData_json", JSON.stringify(window._pendingSenaData)); } catch(e) {}
    
    // ====================================================
    // SNAPSHOT PERSISTENTE: guardar en localStorage para caso borde
    // Si el timer expira y lazyCleanup borra los datos de Sheets,
    // podemos usar estos datos del frontend para armar modales
    // ====================================================
    try {
        var snapshot = {
            idTurno: idTurno,
            tratamiento: tratamiento,
            nombre: nombre,
            fecha: fecha,
            hora: hora,
            horaFin: window._pendingSenaData.horaFin || '',
            email: emailFromForm,
            montoSena: montoSena || 0,
            timestamp: Date.now(),
            source: 'frontend_form'
        };
        localStorage.setItem("yessenia_booking_snapshot", JSON.stringify(snapshot));
        console.log("💾 [SNAPSHOT] Guardado en localStorage para caso borde:", idTurno);
    } catch(e) {}
    var selectedTreatment = ALL_TREATMENTS.find(function(t){return t.nombre===tratamiento||(t.nombre||"").split(" - ")[0]===tratamiento;});
    window._pendingDuracionFilas = selectedTreatment ? (selectedTreatment.duracionFilas||1) : 1;
    
    var mpLink = initPoint || (selectedTreatment ? (selectedTreatment.linkSena || "") : "");
    window._pendingPreferenceId = preferenceId || "";
    
    var totalMin = TIEMPO_EXPIRACION_RESERVA_MINUTOS || 5;
    var expiryTime = Date.now() + (totalMin * 60 * 1000);
    
    console.log("💾 [REQUIERE_SENA] Guardando en storage:");
    console.log("   - idTurno: " + idTurno);
    console.log("   - preferenceId: " + preferenceId);
    console.log("   - initPoint (mpLink): " + mpLink.substring(0, 50) + "...");
    console.log("   - expiryTime: " + expiryTime + " (" + totalMin + " min desde now=" + Date.now() + ")");
    console.log("   - montoSena: $" + montoSena);
    console.log("   - nombre: " + nombre + ", tratamiento: " + tratamiento);
    
    try {
        sessionStorage.setItem(STORAGE_KEY_ACTIVE_TURN, idTurno);
        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(expiryTime));
        sessionStorage.setItem("yessenia_preference_id", preferenceId || "");
        sessionStorage.setItem("yessenia_init_point", mpLink || "");
        localStorage.setItem("yessenia_pref_turn_" + preferenceId, idTurno);
    } catch(e) {}
    
    senaDiv.style.display="block";
    _mpFlowActive = true; // BUGFIX #2: marca que el flujo de pago MP está activo
    _tiempoAgotadoShown = false; // Reset flag de tiempo agotado
    resetSinConnRetryCount(); // Reset retry counter para nuevo flujo
    console.log("🔒 [MP-FLOW] _mpFlowActive = true (flujo iniciado)");
    
    if (senaDiv.firstChild && senaDiv.firstChild.nodeType === 1) {
        senaDiv.firstChild.style.marginTop = Math.max(senaDiv.firstChild.style.marginTop || '0', '20px');
    }
    
    try { sessionStorage.setItem("yessenia_monto_sena", String(montoSena || 0)); } catch(e) {}
    
    var montoDisplay = " $" + Number(montoSena).toLocaleString("es-AR") + " ARS";
    
    try {
        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(expiryTime));
    } catch(e) {}
    
    var html = '';
    senaDiv.style.paddingTop = '0';
    senaDiv.style.paddingBottom = '0';
    senaDiv.style.paddingLeft = '0';
    senaDiv.style.paddingRight = '0';
    html += '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:16px 16px !important;max-width:550px;margin:0 auto">';
    html += '<div style="font-size:2rem;margin-bottom:4px">⏳</div>';
    html += '<h3 style="font-size:1.1rem;margin-bottom:2px;color:#FFD700">¡Tu Turno está Pre-Reservado!</h3>';
    html += '<p style="opacity:0.8;margin-bottom:0;font-size:0.8rem">Guardamos tu lugar por <strong>'+totalMin+' minutos</strong></p>';
    html += '<p style="opacity:0.6;font-size:0.7rem;margin-bottom:6px">Turno <strong>'+idTurno+'</strong></p>';
    html += '<div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:8px 10px;margin-bottom:6px">';
    html += '<div style="font-size:0.6rem;opacity:0.7;text-transform:uppercase;letter-spacing:1px;margin-bottom:1px">Tratamiento</div>';
    html += '<div style="font-size:0.9rem;font-weight:600;margin-bottom:1px">'+tratamiento+'</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:0.75rem"><span style="opacity:0.7">Fecha</span><span>'+fecha+' - '+hora+'</span></div>';
    html += '</div>';
    html += '<div style="text-align:center;margin-bottom:6px;padding:8px;background:rgba(196,161,109,0.2);border-radius:10px;border:1px solid rgba(196,161,109,0.3)">';
    html += '<div style="font-size:0.6rem;opacity:0.7;text-transform:uppercase;letter-spacing:1px;margin-bottom:1px">Seña a pagar</div>';
    html += '<div style="font-size:1.4rem;font-weight:700;color:#C4A16D">'+montoDisplay+'</div>';
    html += '</div>';
    
    html += '<div style="text-align:center;margin-bottom:4px">';
    html += '<a id="paymentLinkBtn" href="'+mpLink+'" target="_blank" onclick="blockDoublePayment(event, \''+idTurno+'\')" style="display:inline-block;background:#003366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;font-weight:600;cursor:pointer">💳 Pagar Seña con Tarjeta o Mercado Pago</a>';
    html += '</div>';
    html += '<p style="text-align:center;opacity:0.75;font-size:0.7rem;margin-bottom:2px">Pago 100% seguro</p>';
    
    html += '<div id="senaTimerBig" style="text-align:center;font-size:1.5rem;font-weight:700;color:#FFD700;margin:6px 0">';
    html += totalMin + ':00</div>';
    html += '<p style="text-align:center;opacity:0.6;font-size:0.7rem;margin-bottom:4px">Tiempo restante para completar el pago</p>';

    if (!mpLink) {
        console.log("⚠️ [REQUIERE_SENA] mpLink vacío — mostrando botón de simulación");
        html = html.replace(
            '<a href="'+mpLink+'" target="_blank" style="display:inline-block;background:#003366;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;text-decoration:none;font-weight:600">💳 Pagar Seña con Tarjeta o Mercado Pago</a>',
            '<button id="simularPagoBtn" style="display:inline-block;background:#FF8C00;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;border:none;cursor:pointer">⚠️ Simular Confirmación de Pago (Modo Testeo)</button>'
        );
        html += '<p style="text-align:center;opacity:0.6;font-size:0.8rem;margin-top:10px">Links de pago no configurados. Este botón simula el pago para testear.</p>';
    } else {
        console.log("🔗 [REQUIERE_SENA] mpLink generado: " + mpLink.substring(0, 60) + "...");
    }
    
    html += '<button id="cancelarReservaBtn" style="display:block;margin:8px auto 4px;background:transparent;color:#ff6b6b;border:2px solid #ff6b6b;padding:10px 28px;font-size:0.9rem;border-radius:50px;cursor:pointer">Cancelar y elegir otro turno</button>';
    html += '</div>';
    senaDiv.innerHTML = html;
    
    setTimeout(function(){var b=document.getElementById("cancelarReservaBtn");if(b)b.addEventListener("click",function(){cancelarReservaTemporal(idTurno);});},100);
    if (!mpLink) {
        setTimeout(function(){var b=document.getElementById("simularPagoBtn");if(b)b.addEventListener("click",function(){handlePaymentConfirmation(idTurno, tratamiento);});},100);
    }

    function scrollToShowPayment() {
        var target = senaDiv;
        var headerHeight = 0;
        var headerEl = document.querySelector('.header');
        if (headerEl) {
            headerHeight = headerEl.offsetHeight;
        }
        
        var targetRect = target.getBoundingClientRect();
        var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        var targetTop = scrollTop + targetRect.top;
        
        var scrollTarget = Math.max(0, targetTop - headerHeight - 16);
        
        window.scrollTo({
            top: scrollTarget,
            behavior: 'smooth'
        });
    }
    
    function repositionAfterMercadoPago() {
        var walletBtn = document.getElementById('walletPaymentButton');
        if (!walletBtn) return;
        
        var headerHeight = 0;
        var headerEl = document.querySelector('.header');
        if (headerEl) {
            headerHeight = headerEl.offsetHeight;
        }
        
        var walletRect = walletBtn.getBoundingClientRect();
        
        if (walletRect.top < headerHeight) {
            var walletTop = window.pageYOffset + walletRect.top;
            var scrollTarget = Math.max(0, walletTop - headerHeight - 210);
            
            window.scrollTo({
                top: scrollTarget,
                behavior: 'smooth'
            });
        } else if (walletRect.bottom > window.innerHeight) {
            var walletBottom = window.pageYOffset + walletRect.bottom;
            var scrollTarget = Math.max(0, walletBottom - window.innerHeight + 20);
            
            window.scrollTo({
                top: scrollTarget,
                behavior: 'smooth'
            });
        }
    }
    
    var walletBtn = document.getElementById('walletPaymentButton');
    if (walletBtn) {
        var observer = new MutationObserver(function(mutations) {
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes.length > 0) {
                    var hasIframe = false;
                    for (var j = 0; j < mutations[i].addedNodes.length; j++) {
                        var node = mutations[i].addedNodes[j];
                        if (node.nodeType === 1 && node.tagName === 'IFRAME') {
                            hasIframe = true;
                            break;
                        }
                        if (node.nodeType === 1) {
                            var innerIframes = node.querySelectorAll ? node.querySelectorAll('iframe') : [];
                            if (innerIframes.length > 0) {
                                hasIframe = true;
                                break;
                            }
                        }
                    }
                    if (hasIframe) {
                        setTimeout(repositionAfterMercadoPago, 500);
                        setTimeout(repositionAfterMercadoPago, 1500);
                        setTimeout(repositionAfterMercadoPago, 3000);
                        observer.disconnect();
                    }
                }
            }
        });
        observer.observe(walletBtn, { childList: true, subtree: true });
    }
    
    (function initPaymentScroll() {
        function safeScrollTo(selector, duration) {
            var savedTimerId = window._senaTimerId;
            window._senaTimerId = null;
            window._silenceBeforeUnload = { _ts: Date.now() };
            _popstateSilenceTs = Date.now();
            setTimeout(function() {
                try {
                    if (typeof selector === 'function') {
                        selector();
                    } else {
                        window.scrollTo(selector);
                    }
                } finally {
                    setTimeout(function() {
                        window._senaTimerId = savedTimerId;
                        window._silenceBeforeUnload = false;
                    }, 1000);
                }
            }, duration || 0);
        }
        safeScrollTo({ top: 0, behavior: 'instant' }, 0);
        setTimeout(function() {
            if (!senaDiv) return;
            var rect = senaDiv.getBoundingClientRect();
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            var targetTop = scrollTop + rect.top;
            var headerHeight = 0;
            var headerEl = document.querySelector('.header');
            if (headerEl) headerHeight = headerEl.offsetHeight;
            var scrollTarget = Math.max(0, targetTop - headerHeight - 210);
            safeScrollTo({ top: scrollTarget, behavior: 'smooth' }, 50);
        }, 200);
    })();
    
    startSenaTimer();
    startStatusPolling(idTurno, function(turnoId) { showNoExitoModal(turnoId); });
}

// ========== Confirm Payment ==========
function handlePaymentConfirmation(idTurno, tratamiento, comprobanteId, mpStatus) {
    var senaDiv=document.getElementById("senaRequired");
    if(senaDiv){senaDiv.innerHTML+='<div class="spinner" style="margin:40px auto"></div><p style="text-align:center;margin-top:20px;opacity:0.9">Confirmando pago con ' + CONFIG.negocio.nombreCorto + '</p>';}
    
    var duracionFilas = window._pendingDuracionFilas || 1;
    var comprobante = comprobanteId || "MP-Confirmado-"+Date.now().toString(36);
    var status = mpStatus || "approved";
    var prefId = window._pendingPreferenceId || "";
    
    // Timeout de seguridad: si no hay respuesta en 30s, mostrar error
    var _paymentConfirmTimeout = setTimeout(function() {
        var sdTimeout = document.getElementById("senaRequired");
        if (sdTimeout && sdTimeout.querySelector('.spinner')) {
            console.log("⏰ [CONFIRM] Timeout 30s — confirmando pago se demoró demasiado");
            var ddTimeout = getDisplayDataFromPending();
            var nombreTimeout = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
            var waTimeout;
            if (ddTimeout.tratamiento && ddTimeout.fecha) {
                waTimeout = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreTimeout + '.\nQueria reservar: ' + ddTimeout.tratamiento + ' el ' + ddTimeout.fecha + ' de ' + ddTimeout.horaInicio + ' a ' + ddTimeout.horaFin + '. Email: ' + (ddTimeout.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
            } else {
                waTimeout = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreTimeout + '. Adjunto comprobante para completar mi reserva.');
            }
            sdTimeout.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⏰</div><h3 style="color:#FFD700;margin-bottom:12px">Tiempo de espera agotado</h3><p>Tuvimos problemas para confirmar tu pago. Tu dinero está seguro en Mercado Pago.</p><a href="https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waTimeout + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a><br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
        }
    }, 30000);
    
    // BUGFIX #3: fetch con timeout para handlePaymentConfirmation
    fetchWithTimeout(API_URL, {
        method: "POST", 
        body: JSON.stringify({
            token: API_TOKEN, 
            action: "confirmarPago", 
            idTurno: idTurno, 
            comprobanteId: comprobante, 
            preferenceId: prefId, 
            status: status, 
            duracionFilas: duracionFilas
        })
    }, 20000)
    .then(function(r){return r.json()})
    .then(function(data) {
        clearTimeout(_paymentConfirmTimeout);
        stopStatusPolling();
        if (data.status === "PAGO_HUERFANO") {
            showPagoHuerranoModal(data.mensaje || "Tu pago fue registrado de forma segura. Nos comunicaremos contigo.");
        } else if(data.success) {
            clearActiveTurnoStorage();
            if(window._senaTimerId) clearInterval(window._senaTimerId);
            showBookingSuccess(window._pendingSenaData.nombre, window._pendingSenaData.tratamiento, window._pendingSenaData.fecha, window._pendingSenaData.hora, window._pendingSenaData.horaFin || "");
        } else {
            var senaDivFail = document.getElementById("senaRequired");
            if (senaDivFail) {
                senaDivFail.style.display = "block";
                
               var ddFail = getDisplayDataFromPending(); var hasDataFail = ddFail.tratamiento && ddFail.fecha;
                var nombreFail = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
                var waMsgF;
                if (hasDataFail) {
                    waMsgF = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreFail + '.\nQueria reservar: ' + ddFail.tratamiento + ' el ' + ddFail.fecha + ' de ' + ddFail.horaInicio + ' a ' + ddFail.horaFin + '. Email: ' + (ddFail.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
                } else {
                    waMsgF = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreFail + '. Adjunto comprobante para completar mi reserva.');
                }
                var waLinkF = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waMsgF;
                senaDivFail.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                    + '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>'
                    + '<h3 style="color:#FFD700;margin-bottom:12px">Error al confirmar pago</h3>'
                    + '<p>Tu pago no se pudo registrar. No te preocupes, escribinos por WhatsApp y lo resolvemos.</p>'
                    + '<a href="' + waLinkF + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Escribir por WhatsApp</a>'
                    + '<br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
            } else {
                showError(CONFIG.mensajes.pagoAceptado + " Escribinos por WhatsApp para gestionarlo.");
            }
        }
    })
    .catch(function() { 
        clearTimeout(_paymentConfirmTimeout);
        // Si la función de sin conexión está disponible, usarla (v8)
        if (typeof showSinConexionModal === 'function') {
            console.log("📴 [CONFIRM] Error en confirmación de pago — mostrando modal sin conexión");
            showSinConexionModal(idTurno, false);
            return;
        }
        
        var senaDivCatch = document.getElementById("senaRequired");
        if (senaDivCatch) {
            senaDivCatch.style.display = "block";
            
           var ddCatch2 = getDisplayDataFromPending(); var hasDataCatch2 = ddCatch2.tratamiento && ddCatch2.fecha;
            var nombreCatch2 = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
            var waMsgCatch2;
            if (hasDataCatch2) {
                waMsgCatch2 = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCatch2 + '.\nQueria reservar: ' + ddCatch2.tratamiento + ' el ' + ddCatch2.fecha + ' de ' + ddCatch2.horaInicio + ' a ' + ddCatch2.horaFin + '. Email: ' + (ddCatch2.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
            } else {
                waMsgCatch2 = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCatch2 + '. Adjunto comprobante para completar mi reserva.');
            }
            var waLinkCatch2 = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waMsgCatch2;
            senaDivCatch.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                + '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>'
                + '<h3 style="color:#FFD700;margin-bottom:12px">Error de conexion</h3>'
                + '<p>No pudimos verificar tu pago en este momento. Tu dinero esta seguro en Mercado Pago.</p>'
                + '<a href="' + waLinkCatch2 + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a>'
                + '<br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
        }
    });
}

// ========== Mercado Pago Return Handler ==========
function handleMercadoPagoReturn() {
    console.log("🔙 [MP-RETURN] === INGRESANDO A HANDLE MERCADO PAGO RETURN ===");
    
    // BUGFIX TIMER HANG: Limpiar timer inmediatamente para evitar que expire
    // mientras se procesa el retorno. Esto previene la race condition donde
    // releaseTempReservation se dispara con _mpFlowActive=true.
    if (window._senaTimerId) {
        clearInterval(window._senaTimerId);
        window._senaTimerId = null;
        console.log("🧹 [MP-RETURN] Timer limpiado al inicio del retorno");
    }
    
    // BUGFIX #2: Bloquear inmediatamente para evitar race con releaseTempReservation
    // Esto debe estar ANTES de cualquier otro código para que releaseTempReservation
    // detecte que el flujo MP está activo y se cancele silenciosamente
    if (!_mpFlowActive) {
        _mpFlowActive = true;
        console.log("🔒 [MP-RETURN] _mpFlowActive = true (bloqueando timer/release)");
    } else {
        console.log("⚠️ [MP-RETURN] _mpFlowActive ya era true — MP ya estaba activo");
    }
    
    // BUGFIX #2: Si releaseTempReservation ya está procesando, esperar a que termine
    var storedTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
    if (storedTurno && _mpFlowActive) {
        var currentMpFlow = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
        console.log("⚠️ [MP-RETURN] _mpFlowActive ya es true — verificando si hay conflicto...");
        // Si el turno activo coincide con lo que hay en storage, dejar que releaseTempReservation siga
        // Si no hay turno activo o es diferente, proceder con MP return
        if (currentMpFlow) {
            console.log("🔒 [MP-RETURN] Turno activo detectado, esperando 1s para ver si se resuelve...");
            var mpFlowCheck = function() {
                if (!_mpFlowActive || !sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN)) {
                    console.log("✅ [MP-RETURN] Flujo anterior liberado, reintentando MP return...");
                    // Re-ejecutar con estado fresco
                    handleMercadoPagoReturnRetry();
                } else if (mpFlowCheck._retries < 5) {
                    mpFlowCheck._retries++;
                    setTimeout(mpFlowCheck, 1000);
                } else {
                    console.log("❌ [MP-RETURN] Timeout esperando flujo anterior — procediendo de todas formas");
                    handleMercadoPagoReturnRetry();
                }
            };
            mpFlowCheck._retries = 0;
            setTimeout(mpFlowCheck, 1000);
            return true;
        }
    }
    
    var params = new URLSearchParams(window.location.search);
     var collectionId = params.get('collection_id');
     var status = params.get('status');
     var externalRef = params.get('external_reference');
     var preferenceId = params.get('preference_id');
     
     console.log("📋 [MP-RETURN] URL params: collection_id=" + collectionId + ", status=" + status + ", external_ref=" + externalRef + ", pref_id=" + preferenceId);
     console.log("📋 [MP-RETURN] Full URL: " + window.location.href);

     // SIEMPRE verificar status primero — incluso sin collection_id (ej: usuario clickea "Volver a la tienda")
     if (status && status !== 'approved') {
         console.log("❌ [MP-RETURN] Status NO aprobado: " + status + " — limpiando y volviendo al formulario");
         try { sessionStorage.setItem('_mp_returned_not_approved', 'true'); } catch(e) {}
         clearActiveTurnoStorage();
         stopStatusPolling();
         if(window._senaTimerId) clearInterval(window._senaTimerId);
         var currentHash2 = window.location.hash || '';
         var cleanUrl2 = window.location.origin + window.location.pathname + currentHash2;
         window.history.replaceState({}, document.title, cleanUrl2);
         releaseStoredTurno(sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN) || '');
         location.reload();
         return true;
     }

    if (!collectionId || !status) {
           console.log("📱 [MP-RETURN] Sin collection_id/status — verificando Estado en Sheets + columna AA...");
           
           // Buscar turno en sessionStorage → localStorage
           var mobileTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
           if (!mobileTurno) {
               var savedPrefId = sessionStorage.getItem("yessenia_preference_id") || '';
               if (preferenceId && preferenceId !== savedPrefId) {
                   var fallbackTurno = localStorage.getItem("yessenia_pref_turn_" + preferenceId);
                   if (fallbackTurno) mobileTurno = fallbackTurno;
               } else if (!preferenceId || !savedPrefId || preferenceId === savedPrefId) {
                   if (preferenceId) {
                       var fb2 = localStorage.getItem("yessenia_pref_turn_" + preferenceId);
                       if (fb2) mobileTurno = fb2;
                   }
               }
           }
          
          if (!mobileTurno) {
                console.log("🔍 [MP-RETURN] Sin turno en storage — la pestaña principal probablemente ya mostró éxito");
                return true;
            }
          
            console.log("📡 [MP-RETURN] LLAMADA UNICA DOBLE VERIFICACION para turno: " + mobileTurno);
            
            // UNA SOLA LLAMADA: Sheets + Columna AA en paralelo
            // BUGFIX #3: fetch con timeout
            fetchWithTimeout(API_URL, {
                method: "POST",
                body: JSON.stringify({
                    token: API_TOKEN,
                    action: "dobleVerificacionMP",
                    idTurno: mobileTurno
                })
            }, 15000)
            .then(function(r){return r.json()})
            .then(function(data) {
                console.log("📡 [MP-RETURN] DOBLE VERIF → estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
                
                if (data.encontrado === false) {
                    console.log("❌ [MP-RETURN] Turno no encontrado — NO EXITO");
                    showNoExitoModal(mobileTurno);
                    return;
                }
                
                // CASO 1: Sheets ya tiene Reservado → ÉXITO inmediato
                if (data.estado === "Reservado") {
                    console.log("✅ [MP-RETURN] SHEETS=Reservado → ÉXITO inmediato");
                    window._pendingSenaData = {
                        idTurno: mobileTurno,
                        tratamiento: data.tratamiento || "",
                        nombre: data.clienteNombre || "Cliente",
                        fecha: data.fecha ? formatFechaDisplay(data.fecha) : "",
                        hora: data.horaInicio ? formatHoraDesdeSheets(data.horaInicio) : "",
                        horaFin: data.horaFin ? formatHoraDesdeSheets(data.horaFin) : "",
                        email: data.clienteEmail || "",
                        montoSena: 0
                    };
                    showBookingSuccess(
                        window._pendingSenaData.nombre,
                        window._pendingSenaData.tratamiento,
                        window._pendingSenaData.fecha,
                        window._pendingSenaData.hora,
                        window._pendingSenaData.horaFin,
                        mobileTurno
                    );
                    return;
                }
                
                // CASO 2: Columna AA tiene pago confirmado pero Sheets no actualizó → polling corto ~15s
                if (data.pagoConfirmadoAA) {
                    console.log("💳 [MP-RETURN] AA=pagoConfirmado + Sheets≠Reservado — esperando webhook (" + data.detectedBy + ")");
                    var pollCount2 = 0;
                    var maxPolls2 = 3;
                    
                    function pollAA() {
                        pollCount2++;
                        console.log("🔄 [MP-RETURN] Poll AA #" + pollCount2 + "/" + maxPolls2);
                        
                        // BUGFIX #3: fetch con timeout
                        fetchWithTimeout(API_URL, {
                            method: "POST",
                            body: JSON.stringify({
                                token: API_TOKEN,
                                action: "dobleVerificacionMP",
                                idTurno: mobileTurno
                            })
                        }, 10000)
                        .then(function(r){return r.json()})
                        .then(function(pollData) {
                            console.log("📡 [MP-RETURN] Poll AA #" + pollCount2 + " → estado=" + pollData.estado);
                            
                            if (pollData.estado === "Reservado") {
                                console.log("✅ [MP-RETURN] Sheets=Reservado en poll AA #" + pollCount2 + " → ÉXITO");
                                window._pendingSenaData = {
                                    idTurno: mobileTurno,
                                    tratamiento: pollData.tratamiento || "",
                                    nombre: pollData.clienteNombre || "Cliente",
                                    fecha: pollData.fecha ? formatFechaDisplay(pollData.fecha) : "",
                                    hora: pollData.horaInicio ? formatHoraDesdeSheets(pollData.horaInicio) : "",
                                    horaFin: pollData.horaFin ? formatHoraDesdeSheets(pollData.horaFin) : "",
                                    email: pollData.clienteEmail || "",
                                    montoSena: 0
                                };
                                showBookingSuccess(
                                    window._pendingSenaData.nombre,
                                    window._pendingSenaData.tratamiento,
                                    window._pendingSenaData.fecha,
                                    window._pendingSenaData.hora,
                                    window._pendingSenaData.horaFin,
                                    mobileTurno
                                );
                            } else if (pollCount2 < maxPolls2) {
                                setTimeout(pollAA, 4000);
                            } else {
                                console.log("🚨 [MP-RETURN] Poll AA agotado (" + maxPolls2 + " polls en ~12s) — NO EXITO con advertencia");
                                showNoExitoModal(mobileTurno, true);
                            }
                        })
                        .catch(function(err) {
                            console.error("❌ [MP-RETURN] Error poll AA #" + pollCount2 + ": " + err.message);
                            if (pollCount2 < maxPolls2) {
                                setTimeout(pollAA, 4000);
                            } else {
                                showNoExitoModal(mobileTurno, true);
                            }
                        });
                    }
                    
                    setTimeout(pollAA, 1500);
                    return;
                }
                
                // CASO 3: Ni Sheets ni AA tienen datos — polling ~15s para ver si webhook actualiza
                console.log("⏳ [MP-RETURN] Ni Sheets ni AA tienen datos — empezando polling 3 intentos × 4s");
                
                var pollCount = 0;
                var maxPolls = 3;
                
                function pollTurno() {
                    pollCount++;
                    console.log("🔄 [MP-RETURN] Poll #" + pollCount + "/" + maxPolls);
                    
                    verificarEstadoTurno(mobileTurno).then(function(pollData) {
                        console.log("📡 [MP-RETURN] Poll #" + pollCount + " → estado=" + pollData.estado);
                        
                        if (pollData.estado === "Reservado") {
                            console.log("✅ [MP-RETURN] Sheets=Reservado en poll #" + pollCount + " → ÉXITO");
                            window._pendingSenaData = {
                                idTurno: mobileTurno,
                                tratamiento: pollData.tratamiento || "",
                                nombre: pollData.clienteNombre || "Cliente",
                                fecha: pollData.fecha ? formatFechaDisplay(pollData.fecha) : "",
                                hora: pollData.horaInicio ? formatHoraDesdeSheets(pollData.horaInicio) : "",
                                horaFin: pollData.horaFin ? formatHoraDesdeSheets(pollData.horaFin) : "",
                                email: pollData.clienteEmail || "",
                                montoSena: 0
                            };
                            showBookingSuccess(
                                window._pendingSenaData.nombre,
                                window._pendingSenaData.tratamiento,
                                window._pendingSenaData.fecha,
                                window._pendingSenaData.hora,
                                window._pendingSenaData.horaFin,
                                mobileTurno
                            );
                        } else if (pollCount < maxPolls) {
                            setTimeout(pollTurno, 4000);
                        } else {
                            console.log("🚨 [MP-RETURN] Polling agotado (" + maxPolls + " polls en ~12s) → NO EXITO");
                            showNoExitoModal(mobileTurno);
                        }
                    });
                }
                
                setTimeout(pollTurno, 1500);
            })
            .catch(function(err) {
                console.error("❌ [MP-RETURN] Error en dobleVerificacionMP: " + err.message);
                showNoExitoModal(mobileTurno);
            });
          
           return true;
       }

     try {
         if (sessionStorage.getItem('_mp_approved_handled') === 'true' && status === 'approved') {
             console.log("🔁 [MP-RETURN] Ya procesado (_mp_approved_handled=true) — evitando re-procesar");
             window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
             return true;
         }
     } catch(e) {}

     if (status === 'approved' && collectionId && sessionStorage.getItem('_mp_processing_turno') === 'true') {
         console.log("🔁 [MP-RETURN] Ya en proceso (_mp_processing_turno=true) — evitando duplicar");
         return true;
     }

     if (!externalRef) {
         var storedTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
         console.log("🔍 [MP-RETURN] Sin external_reference, buscando turno... sessionStorage activo: " + !!storedTurno + " (" + storedTurno + ")");
         if (storedTurno) {
             externalRef = storedTurno;
             console.log('✅ [MP-RETURN] Encontrado en sessionStorage:', externalRef);
         } else {
             var savedPrefId = sessionStorage.getItem("yessenia_preference_id") || '';
             console.log("🔍 [MP-RETURN] sessionStorage vacío, intentando localStorage con preference_id... pref_actual=" + preferenceId + ", guardado=" + savedPrefId);
             if (preferenceId && preferenceId !== savedPrefId) {
                 var fallbackTurno = localStorage.getItem("yessenia_pref_turn_" + preferenceId);
                 if (fallbackTurno) {
                     externalRef = fallbackTurno;
                     console.log('✅ [MP-RETURN] Encontrado en localStorage via preference_id:', externalRef);
                 }
             } else if (!preferenceId || !savedPrefId || preferenceId === savedPrefId) {
                 // Si preference_id es igual al guardado, también buscar en localStorage (caso: sessionStorage limpio pero pref_id coincide)
                 console.log("🔍 [MP-RETURN] preference_id coincide o ausente, buscando fallback en localStorage...");
                 if (preferenceId) {
                     var fb2 = localStorage.getItem("yessenia_pref_turn_" + preferenceId);
                     if (fb2) {
                         externalRef = fb2;
                         console.log('✅ [MP-RETURN] Encontrado en localStorage (match pref):', externalRef);
                     }
                 }
             }
             if (!externalRef) {
                 console.log("❌ [MP-RETURN] Sin external_reference y sin turno en sessionStorage ni localStorage — ignorando");
                 return false;
             }
         }
     }

     var idTurno = externalRef;
     console.log("🎯 [MP-RETURN] idTurno resuelto: " + idTurno);

     // Marcar que ya se esta procesando este pago para evitar duplicar en recargas
     try { sessionStorage.setItem('_mp_processing_turno', 'true'); } catch(e) {}
     console.log("🔒 [MP-RETURN] Marcado _mp_processing_turno = true");

     // Mercado Pago confirmó el pago (status=approved y tenemos collectionId)
     var paymentConfirmed = (status === 'approved' && collectionId);
     console.log("💰 [MP-RETURN] paymentConfirmed: " + paymentConfirmed + " (status=" + status + ", collectionId=" + !!collectionId + ")");

     var currentHash = window.location.hash || '';
      var cleanUrl = window.location.origin + window.location.pathname + currentHash;
      window.history.replaceState({}, document.title, cleanUrl);

    // BUGFIX #2: Bloquear flujo de timer mientras MP return procesa
       _mpFlowActive = true;
       console.log("🔒 [MP-RETURN] _mpFlowActive = true — bloqueando releaseTempReservation");

       hideAllSections();
      console.log("👁️ [MP-RETURN] Secciones ocultas (hideAllSections)");

       // Timeout de seguridad global: 45s para todo el flujo de retorno MP
       var _mpReturnTimeout = null;
       var _mpReturnTimedOut = false;
       _mpReturnTimeout = setTimeout(function() {
           if (_mpReturnTimedOut) return;
           _mpReturnTimedOut = true;
           console.log("⏰ [MP-RETURN] Timeout 45s — flujo tardó demasiado");
           var sd = document.getElementById('senaRequired');
           if (sd && sd.querySelector('.spinner')) {
               clearActiveTurnoStorage();
               stopStatusPolling();
               if(window._senaTimerId) clearInterval(window._senaTimerId);
               window._senaTimerId = null;
               var ddMp = getDisplayDataFromPending();
               var nombreMp = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
               var waMp;
               if (ddMp.tratamiento && ddMp.fecha) {
                   waMp = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreMp + '.\nQueria reservar: ' + ddMp.tratamiento + ' el ' + ddMp.fecha + ' de ' + ddMp.horaInicio + ' a ' + ddMp.horaFin + '. Email: ' + (ddMp.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
               } else {
                   waMp = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreMp + '. Adjunto comprobante para completar mi reserva.');
               }
               sd.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⏰</div><h3 style="color:#FFD700;margin-bottom:12px">Tiempo de espera agotado</h3><p>Tuvimos problemas para confirmar tu pago. Tu dinero está seguro en Mercado Pago.</p><a href="https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waMp + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a><br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
           }
           _mpFlowActive = false;
       }, 45000);

     // Activar conteo de fallos SOLO cuando sabemos que el usuario pagó en la pasarela de MP.
     // Se activa si hay: collectionId (pago real) + turno activo en sessionStorage O localStorage.
     var ssTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
     var lsPref = localStorage.getItem("yessenia_pref_turn_" + preferenceId);
     console.log("🔍 [MP-RETURN] Verificando turno: sessionStorage=" + !!ssTurno + " (" + ssTurno + "), localStorage pref=" + !!lsPref + " (" + lsPref + ")");
     
     if (paymentConfirmed && (sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN) || localStorage.getItem("yessenia_pref_turn_" + preferenceId))) {
         _paymentApprovedLocally = true;
         console.log('✅ [MP-RETURN] Pago confirmado + turno encontrado — activando conteo de fallos');
     } else if (paymentConfirmed) {
         console.log('⚠️ [MP-RETURN] Pago confirmado PERO sin turno disponible — NO activando conteo');
     }

    var form = document.getElementById("bookingForm"); if(form) form.style.display="none";
    
    // Ocultar h2 y primer parrafo de .cta-content (igual que booking.js)
    var ctaContent = document.querySelector('.cta-content');
    if(ctaContent){
        var h2 = ctaContent.querySelector("h2"); if(h2) h2.style.display="none";
        var firstP = ctaContent.querySelectorAll("p")[0]; if(firstP) firstP.style.display="none";
        ctaContent.style.paddingTop = "10px !important";
        ctaContent.style.paddingBottom = "10px !important";
    }

    // Reducir padding de la seccion completa (igual que booking.js)
    var reservarSection = document.getElementById('reservar');
    if(reservarSection){
        reservarSection.style.paddingTop = "4px !important";
        reservarSection.style.paddingBottom = "8px !important";
    }

    // Reducir margen del texto de politica (esta FUERA del form, hay que buscarlo directo)
    var policyTextBefore = document.getElementById('policyText');
    if(policyTextBefore){
        policyTextBefore.style.marginTop = "4px !important";
        policyTextBefore.style.marginBottom = "2px !important";
    }

    var senaDiv = document.getElementById('senaRequired');
    if (!senaDiv) {
        senaDiv = document.createElement('div');
        senaDiv.id = 'senaRequired';
        senaDiv.style.display = 'block';
    } else {
        senaDiv.style.display = 'block';
    }
    var mainContent = document.querySelector('.cta-content');
    if (mainContent) {
        var loadHtml = '<div style="background:rgba(0,80,80,0.2);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25)">'
            + '<div style="font-size:3rem;margin-bottom:16px">⏳</div>'
            + '<h3 style="color:#FFD700;margin-bottom:8px;font-size:1.4rem">Confirmando tu pago...</h3>'
            + '<p style="opacity:0.9;margin-bottom:16px;color:rgba(255,255,255,0.9)">Estamos validando tu comprobante con Mercado Pago</p>'
            + '<div class="spinner" style="margin:20px auto"></div></div>';
        senaDiv.innerHTML = loadHtml;
        if (mainContent.contains(senaDiv)) {
            mainContent.appendChild(senaDiv);
        } else {
            mainContent.insertBefore(senaDiv, mainContent.firstChild);
        }
    }

// DOBLE VERIFICACION UNIFICADA ( Sheets + columna AA en 1 llamada )
            // BUGFIX #3: fetch con timeout para evitar spinner eterno
            fetchWithTimeout(API_URL, {
                method: "POST",
                body: JSON.stringify({
                    token: API_TOKEN,
                    action: "dobleVerificacionMP",
                    idTurno: idTurno
                })
            }, 20000)
            .then(function(r){return r.json()})
            .then(function(data) {
                console.log("📡 [MP-RETURN] DOBLE VERIF response → estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
            // Guardar datos del backend en _pendingSenaData para usarlos en errores
            var restoredFromSS = null;
            try { var ssStr = sessionStorage.getItem("_pendingSenaData_json"); if(ssStr) restoredFromSS = JSON.parse(ssStr); } catch(e) {}
            
            var apiHasData = !!(data.tratamiento && data.horaInicio);
            if (apiHasData) {
                var formHora = data.horaInicio ? formatHoraDesdeSheets(data.horaInicio) : '';
                window._pendingSenaData = {
                    idTurno: idTurno,
                    tratamiento: data.tratamiento || '',
                    nombre: data.clienteNombre || 'Cliente',
                    fecha: data.fecha ? formatFechaDisplay(data.fecha) : '',
                    hora: formHora,
                    horaFin: data.horaFin ? formatHoraDesdeSheets(data.horaFin) : (formHora ? calcularHoraFin(formHora) : ''),
                    email: data.clienteEmail || '',
                    montoSena: 0
                };
            } else if (restoredFromSS && restoredFromSS.tratamiento) {
                var horaFix = formatHoraDesdeSheets(restoredFromSS.hora);
                var horaFinFix = horaFix ? calcularHoraFin(horaFix) : '';
                window._pendingSenaData = {
                    idTurno: restoredFromSS.idTurno || idTurno,
                    tratamiento: restoredFromSS.tratamiento || '',
                    nombre: restoredFromSS.nombre || 'Cliente',
                    fecha: restoredFromSS.fecha || '',
                    hora: horaFix,
                    horaFin: horaFinFix,
                    email: restoredFromSS.email || '',
                    montoSena: restoredFromSS.montoSena || 0
                };
            } else {
                var formHora2 = data.horaInicio ? formatHoraDesdeSheets(data.horaInicio) : '';
                window._pendingSenaData = {
                    idTurno: idTurno,
                    tratamiento: data.tratamiento || '',
                    nombre: data.clienteNombre || 'Cliente',
                    fecha: data.fecha ? formatFechaDisplay(data.fecha) : '',
                    hora: formHora2,
                    horaFin: data.horaFin ? formatHoraDesdeSheets(data.horaFin) : (formHora2 ? calcularHoraFin(formHora2) : ''),
                    email: data.clienteEmail || '',
                    montoSena: 0
                };
            }
            
            if (data.estado === 'Reservado') {
                console.log("✅ [MP-RETURN] Estado=Reservado — mostrando éxito");
                clearActiveTurnoStorage();
                if(window._senaTimerId) clearInterval(window._senaTimerId);

                var senaDiv2 = document.getElementById('senaRequired');
                if (senaDiv2) {
                    senaDiv2.style.display = 'block';
                    
                    var form = document.getElementById("bookingForm"); if(form) form.style.display="none";
                    
                    // Compactar la sección para igualar EXACTAMENTE el flujo directo (booking.js linea 534-552)
                    var reservarSection2 = document.getElementById("reservar");
                    if(reservarSection2){
                        reservarSection2.style.paddingTop = "4px !important";
                        reservarSection2.style.paddingBottom = "8px !important";
                    }
                    var ctaContent2 = reservarSection2?.querySelector(".cta-content");
                    if(ctaContent2){
                        // Ocultar h2 y subtitulo (primer p) para eliminar espacios gigantes
                        var h2r = ctaContent2.querySelector("h2"); if(h2r) h2r.style.display="none";
                        var firstP2 = ctaContent2.querySelectorAll("p")[0]; if(firstP2) firstP2.style.display="none";
                        // Reducir padding del contenedor para eliminar espacios vacios
                        ctaContent2.style.paddingTop = "10px !important";
                        ctaContent2.style.paddingBottom = "10px !important";
                        // Reducir margen del parrafo de politica (CSS tiene margin-bottom: 40px en .cta-content p)
                        var allPs2 = Array.from(ctaContent2.querySelectorAll("p"));
                        var policyP2 = allPs2.find(function(p){ return p.textContent.indexOf("Política de reservas") !== -1; });
                        if(policyP2) policyP2.style.marginBottom = "2px !important";
                    }
                    
                    // Reducir margen del texto de politica (esta FUERA del form, hay que buscarlo directo)
                    var policyText2 = document.getElementById("policyText");
                    if(policyText2){
                        policyText2.style.marginTop = "4px !important";
                        policyText2.style.marginBottom = "2px !important";
                    }
                    
                    var nombreSuccess = (data.clienteNombre || "").trim() || (window._pendingSenaData ? window._pendingSenaData.nombre : "Cliente");
                    var tratSuccess = (data.tratamiento || "").trim() || (window._pendingSenaData ? window._pendingSenaData.tratamiento : "");
                    var fechaSuccess = data.fecha ? formatFechaDisplay(data.fecha) : (window._pendingSenaData ? window._pendingSenaData.fecha : "");
                    var horaSuccess = data.horaInicio ? formatHoraDesdeSheets(data.horaInicio) : (window._pendingSenaData ? window._pendingSenaData.hora : "");
                    var horaFinFormateada = data.horaFin ? formatHoraDesdeSheets(data.horaFin) : calcularHoraFin(horaSuccess);
                    
                    window._bookingData = { 
                        nombre: nombreSuccess, 
                        trat: tratSuccess, 
                        fecha: fechaSuccess, 
                        hora: horaSuccess,
                        horaFin: horaFinFormateada,
                        idTurno: idTurno || ''
                    };

                    // Padding inferior consistente con pagina principal (~50px total)
                    var successHtml = '<div style="padding:28px 24px 30px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25);border-radius:16px;background:rgba(0,80,80,0.2)">'
                        + '<div style="font-size:3rem;margin-bottom:12px">✅</div>'
                        + '<h3 style="color:#FFD700;margin-bottom:6px">Turno Agendado con Exito!</h3>';

                    if (nombreSuccess && tratSuccess) {
                        successHtml += '<p style="opacity:0.9;margin-bottom:16px">' + CONFIG.mensajes.confirmacionTurno + '</p>';
                        successHtml += '<p style="color:#FFD700;font-size:0.8rem;margin-bottom:16px;opacity:0.85">⚠️ Si no recibes el email en 2 minutos, revisá la carpeta de SPAM o Correos no deseados.</p>';

                        successHtml += '<div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.35);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">';
                        successHtml += '<h4 style="color:rgba(255,255,255,0.85);margin:0 0 12px;font-size:0.95rem;text-align:center">📋 Tus Datos de Reserva</h4>';
                        
                        successHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
                        successHtml += '<span style="opacity:0.7;font-size:0.85rem">Cliente:</span>';
                        successHtml += '<strong style="color:#fff;font-size:0.9rem">' + (nombreSuccess || "") + '</strong>';
                        successHtml += '</div>';
                        
                        if (idTurno) {
                            successHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
                            successHtml += '<span style="opacity:0.7;font-size:0.85rem">Turno:</span>';
                            successHtml += '<strong style="color:#FFD700;font-size:0.9rem">' + idTurno + '</strong>';
                            successHtml += '</div>';
                        }
                        
                        successHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
                        successHtml += '<span style="opacity:0.7;font-size:0.85rem">Tratamiento:</span>';
                        successHtml += '<strong style="color:#fff;font-size:0.9rem">' + (tratSuccess || "") + '</strong>';
                        successHtml += '</div>';
                        
                        successHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
                        successHtml += '<span style="opacity:0.7;font-size:0.85rem">Fecha:</span>';
                        successHtml += '<strong style="color:#fff;font-size:0.9rem">' + (fechaSuccess || "") + '</strong>';
                        successHtml += '</div>';
                        
                        successHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0">';
                        successHtml += '<span style="opacity:0.7;font-size:0.85rem">Horario:</span>';
                        successHtml += '<strong style="color:#fff;font-size:0.9rem">' + (horaSuccess || "") + ' hs</strong>';
                        successHtml += '</div>';
                        
                        successHtml += '</div>';
                        
                        successHtml += '<p style="opacity:0.6;font-size:0.7rem;margin:0 0 10px;line-height:1.4">⚠️ Te recomendamos hacer captura de pantalla como comprobante de tu reserva.</p>';

                        successHtml += '<div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.35);border-radius:14px;padding:16px;margin-bottom:16px">';
                        successHtml += '<p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:0.8rem">📍 Direccion del consultorio</p>';
                        successHtml += '<p style="margin:0 0 8px;color:rgba(255,255,255,0.9);font-size:0.8rem;line-height:1.4">' + CONFIG.negocio.direccion + '</p>';
                        successHtml += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">';
                        successHtml += '<a href="' + (CONFIG.negocio.googleMapsUrl || "https://maps.google.com") + '" target="_blank" style="display:inline-block;background:#4285F4;color:white;padding:8px 16px;border-radius:50px;text-decoration:none;font-size:0.75rem;font-weight:600">🗺️ Ver en Google Maps</a>';
                        successHtml += '<a href="https://wa.me/' + CONFIG.negocio.telefonoRaw + '?text=' + encodeURIComponent('Hola! Confirmé mi turno ' + (idTurno || '') + ' para ' + (tratSuccess || '') + ' el ' + (fechaSuccess || '') + ' a las ' + (horaSuccess || '') + ' hs. Necesito hacer una consulta.') + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:8px 16px;border-radius:50px;text-decoration:none;font-size:0.75rem;font-weight:600">📱 Consultar por WhatsApp</a>';
                        successHtml += '</div></div>';
                        
                        successHtml += '<p style="opacity:0.9;margin-bottom:8px;font-size:0.85rem">Guardalo en tu Google Calendar (con recordatorios):</p>';
                        
                        var calendarUrl = buildGoogleCalendarUrl(
                            tratSuccess || '',
                            fechaSuccess || '',
                            horaSuccess || '09:00',
                            horaFinFormateada || '',
                            CONFIG.calendar.ubicacionDefault,
                            nombreSuccess || '',
                            idTurno || ''
                        );
                        
                        successHtml += '<a href="' + calendarUrl + '" target="_blank" style="display:inline-block;background:white;color:#A8864F;padding:12px 24px;font-size:0.9rem;border-radius:50px;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:pointer;display:block;margin:0 auto 20px auto">📅 Guardar en Google Calendar</a>';
                        successHtml += '</div>';
                        
                        senaDiv2.innerHTML = successHtml;
                        // Usar padding del HTML inline (ya no sumar extra)
                    } else {
                        successHtml += '<p>Tu pago fue validado exitosamente. Estamos actualizando tu agenda.</p>'
                        + '<button onclick="location.reload()" style="display:inline-block;margin:20px auto 0;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Ver mi turno confirmado</button></div>';
                        senaDiv2.innerHTML = successHtml;
                    }
                }
            // CASO INTERMEDIO: AA tiene pago confirmado pero Sheets no actualizó aún → llamar confirmarPago + polling
            } else if (data.pagoConfirmadoAA && data.estado !== 'Reservado') {
                console.log("💳 [MP-RETURN] AA=pagoConfirmado + Sheets≠Reservado — llamando confirmarPago + polling");
                var senaDivIntermediate = document.getElementById('senaRequired');
                if (senaDivIntermediate) {
                    senaDivIntermediate.style.display = 'block';
                    senaDivIntermediate.innerHTML = '<div style="background:rgba(0,80,80,0.2);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25)">'
                        + '<div style="font-size:3rem;margin-bottom:16px">⏳</div>'
                        + '<h3 style="color:#FFD700;margin-bottom:8px;font-size:1.4rem">Pago detectado — confirmando...</h3>'
                        + '<p style="opacity:0.9;margin-bottom:16px;color:rgba(255,255,255,0.9)">Detectamos tu pago pero la agenda aún no se actualizó. Estamos forzando la confirmación...</p>'
                        + '<div class="spinner" style="margin:20px auto"></div></div>';
                    
                    // Llamar confirmarPago para ejecutar webhook sincrono
                    // BUGFIX #3: fetch con timeout
                    fetchWithTimeout(API_URL, {
                        method: "POST",
                        body: JSON.stringify({
                            token: API_TOKEN,
                            action: "confirmarPago",
                            idTurno: idTurno,
                            comprobanteId: data.paymentId || collectionId,
                            status: "approved"
                        })
                    }, 15000)
                    .then(function(r){ return r.json(); })
                    .then(function(confirmData) {
                        console.log("📡 [MP-RETURN] confirmarPago response: " + JSON.stringify(confirmData));
                        // Igualar timing de pestaña principal: max ~15s total, 3 polls cada 4s
                        var maxRetries = 3;
                        var retryCount = 0;
                        
                        function pollIntermediate() {
                            retryCount++;
                            console.log("🔄 [MP-RETURN] Poll confirmacion #" + retryCount + "/" + maxRetries);
                            
                            // BUGFIX #3: fetch con timeout
                           fetchWithTimeout(API_URL, {
                                method: "POST",
                                body: JSON.stringify({
                                    token: API_TOKEN,
                                    action: "dobleVerificacionMP",
                                    idTurno: idTurno
                                })
                            }, 10000)
                            .then(function(r){ return r.json(); })
                            .then(function(dPoll) {
                                console.log("📡 [MP-RETURN] Poll confirmacion #" + retryCount + " → estado=" + dPoll.estado);
                                if (dPoll.estado === 'Reservado') {
                                    console.log("✅ [MP-RETURN] Sheets=Reservado en poll confirmacion #" + retryCount + " → ÉXITO");
                                    clearActiveTurnoStorage();
                                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                                    window.location.reload();
                                } else if (retryCount < maxRetries) {
                                    setTimeout(pollIntermediate, 4000);
                                } else {
                                    console.log("❌ [MP-RETURN] Poll confirmacion AGOTADO (" + maxRetries + " polls en ~12s) — NO EXITO con advertencia");
                                    showNoExitoModal(idTurno, true);
                                }
                            })
                            .catch(function(err) {
                                console.error("❌ [MP-RETURN] Error poll confirmacion #" + retryCount + ": " + err.message);
                                if (retryCount < maxRetries) {
                                    setTimeout(pollIntermediate, 4000);
                                } else {
                                    showNoExitoModal(idTurno, true);
                                }
                            });
                        }
                        
                        setTimeout(pollIntermediate, 1500);
                    })
                    .catch(function(err) {
                        console.error("❌ [MP-RETURN] Error en confirmarPago fetch — NO EXITO con advertencia", err);
                        showNoExitoModal(idTurno, true);
                    });
                }
            } else if (data.estado === 'Reservado Temporal' || data.estado === 'Reservado Temp.') {
                console.log("⏳ [MP-RETURN] Estado=Reservado Temporal — esperando webhook confirmación");
                var senaDivTemp = document.getElementById('senaRequired');
                if (senaDivTemp) {
                    senaDivTemp.style.display = 'block';
                    if (status === 'approved') {
                        console.log("✅ [MP-RETURN] Status=approved + Reservado Temporal — enviando confirmarPago a backend");
                        senaDivTemp.innerHTML = '<div style="background:rgba(0,80,80,0.2);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25)">'
                            + '<div style="font-size:3rem;margin-bottom:16px">⏳</div>'
                            + '<h3 style="color:#FFD700;margin-bottom:8px;font-size:1.4rem">Procesando tu pago...</h3>'
                            + '<p style="opacity:0.9;margin-bottom:16px;color:rgba(255,255,255,0.9)">Mercado Pago confirmó el pago. Actualizando tu agenda...</p>'
                            + '<div class="spinner" style="margin:20px auto"></div></div>';
                        
                        // BUGFIX #3: fetch con timeout
                        fetchWithTimeout(API_URL, {
                            method: "POST", 
                            body: JSON.stringify({
                                token: API_TOKEN, 
                                action: "confirmarPago", 
                                idTurno: idTurno, 
                                comprobanteId: collectionId,
                                status: "approved"
                            })
                        }, 15000)
                        .then(function(r){ return r.json(); })
                        .then(function(confirmData) {
                            console.log("📡 [MP-RETURN] confirmarPago response: " + JSON.stringify(confirmData));
                            // Igualar timing de pestaña principal: max ~15s total, 3 polls cada 4s
                            var maxRetries = 3;
                            var retryCount = 0;
                            
                            function pollConfirm() {
                                retryCount++;
                                console.log("🔄 [MP-RETURN] Poll confirmacion #" + retryCount + "/" + maxRetries);
                                verificarEstadoTurno(idTurno).then(function(dPoll) {
                                    console.log("📡 [MP-RETURN] Poll confirmacion #" + retryCount + " → estado=" + dPoll.estado);
                                    if (dPoll.estado === 'Reservado') {
                                        console.log("✅ [MP-RETURN] Polling EXITOSO — turno confirmado, recargando");
                                        clearActiveTurnoStorage();
                                        if(window._senaTimerId) clearInterval(window._senaTimerId);
                                        window.location.reload();
                                    } else if (retryCount < maxRetries) {
                                        setTimeout(pollConfirm, 4000);
                                    } else {
                                        console.log("❌ [MP-RETURN] Polling AGOTADO (" + maxRetries + " polls en ~12s) — mostrando NO EXITO");
                                        showNoExitoModal(idTurno);
                                    }
                                });
                            }
                            
                            setTimeout(pollConfirm, 1500);
                        })
                        .catch(function(err) {
                            console.error("❌ [MP-RETURN] Error en confirmarPago fetch — mostrando NO EXITO", err);
                            showNoExitoModal(idTurno);
                        });
                    } else {
                        var senaDiv3 = document.getElementById('senaRequired');
                        if (senaDiv3) {
                            senaDiv3.style.display = 'block';
                            senaDiv3.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                                + '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>'
                                + '<h3 style="color:#FFD700;margin-bottom:12px">Turno no confirmado</h3>'
                                + '<p>Tu turno no se ha podido gestionar correctamente. No te preocupes, contactanos por WhatsApp y te lo solucionamos.</p>'
                                + '<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin:0 auto 16px;max-width:400px;text-align:left;font-size:0.85rem;line-height:1.6">'
                                + '<p style="margin:0 0 8px">Si tenes el comprobante de pago, envianoslo por WhatsApp (puede ser captura de pantalla).</p>'
                                + '<p style="margin:0;opacity:0.7;font-size:0.8rem">Si no lo tenes a mano no te preocupes, escribinos igual y te ayudamos.</p></div>'
                                + '<a href="' + (function(){ var dd = getDisplayDataFromPending(); var nombreRT = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente"; if(dd.tratamiento && dd.fecha) return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreRT + '.\nQueria reservar: ' + dd.tratamiento + ' el ' + dd.fecha + ' de ' + dd.horaInicio + ' a ' + dd.horaFin + '. Email: ' + (dd.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.'); })() + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a>'
                                + '<br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
                        }
                    }
                }
            } else if (data.estado === 'Disponible' || data.estado === 'Vencido Sin Confirmar') {
                console.log("❌ [MP-RETURN] Estado=" + data.estado + " — turno ya no está temporal");
                var senaDiv3 = document.getElementById('senaRequired');
                if (senaDiv3) {
                    senaDiv3.style.display = 'block';
                    if (status === 'approved') {
                        console.log("⚠️ [MP-RETURN] Status=approved + Disponible/Vencido — NO EXITO directo (timer expiró antes de webhook)");
                        clearActiveTurnoStorage();
                        if(window._senaTimerId) clearInterval(window._senaTimerId);
                        try { sessionStorage.setItem('_mp_approved_handled', 'true'); } catch(e) {}
                        console.log("🚨 [MP-RETURN] Mostrando showNoExitoModal(idTurno=" + idTurno + ")");
                        showNoExitoModal(idTurno);
                        return;
                    } else {
                        var retryHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                            + '<div style="font-size:3rem;margin-bottom:16px">⏳</div>'
                            + '<h3 style="color:#FFD700;margin-bottom:8px">Validando tu pago...</h3>'
                            + '<p>El webhook de Mercado Pago puede tardar unos segundos. Reintentando automaticamente...</p>'
                            + '<button id="reintentarBtn" style="display:inline-block;margin:20px auto 0;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Reintentar</button><br><a href="tel:' + CONFIG.negocio.telefonoRaw + '" target="_blank" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;cursor:pointer">📞 Contactar por Telefono</a></div>';
                        senaDiv3.innerHTML = retryHtml;

                        var retries = 0;
                        var maxRetries = 3;
                        function retryCheck() {
                            retries++;
                            if (retries > maxRetries) {
                                showPagoHuerranoModal('Tu turno no se ha podido gestionar correctamente. No te preocupes, contactanos por WhatsApp y te lo solucionamos.');
                                return;
                            }
                            verificarEstadoTurno(idTurno).then(function(d2) {
                                if (d2.estado === 'Reservado') {
                                    clearActiveTurnoStorage();
                                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                                    location.reload();
                                } else {
                                    setTimeout(retryCheck, 3000);
                                }
                            });
                        }

                        setTimeout(retryCheck, 2000);

                        setTimeout(function(){
                            var btn = document.getElementById('reintentarBtn');
                            if(btn) btn.addEventListener('click', function(){ retryCheck(); });
                        }, 100);
                    }
                }
            } else {
                var ddTurno = getDisplayDataFromPending();
                var hasDataTurno = ddTurno.tratamiento && ddTurno.fecha;
                var nombreTurno = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
                var whatsappMsgTurno;
                if (hasDataTurno) {
                    whatsappMsgTurno = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreTurno + '.\nQueria reservar: ' + ddTurno.tratamiento + ' el ' + ddTurno.fecha + ' de ' + ddTurno.horaInicio + ' a ' + ddTurno.horaFin + '. Email: ' + (ddTurno.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
                } else {
                    whatsappMsgTurno = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreTurno + '. Adjunto comprobante para completar mi reserva.');
                }
                var whatsappLinkTurno = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + whatsappMsgTurno;

                var senaDiv4 = document.getElementById('senaRequired');
                if (senaDiv4) {
                    senaDiv4.style.display = 'block';
                    var errorHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                        + '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>'
                        + '<h3 style="color:#FFD700;margin-bottom:12px">Turno no confirmado</h3>'
                        + '<p>Tu turno no se ha podido gestionar correctamente. No te preocupes, contactanos por WhatsApp y te lo solucionamos.</p>'
                        + '<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin:0 auto 16px;max-width:400px;text-align:left;font-size:0.85rem;line-height:1.6">'
                        + '<p style="margin:0 0 8px">Si tenes el comprobante de pago, envianoslo por WhatsApp (puede ser captura de pantalla).</p>'
                        + '<p style="margin:0;opacity:0.7;font-size:0.8rem">Si no lo tenes a mano no te preocupes, escribinos igual y te ayudamos.</p></div>'
                        + '<a href="' + whatsappLinkTurno + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a>'
                        + '<br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
                    senaDiv4.innerHTML = errorHtml;
                }
            }
        })
       .catch(function(err) {
              console.error('Error verificando turno despues de MP:', err);
              var isTimeout = err.message && err.message.indexOf("TIMEOUT") !== -1;
              if (isTimeout) console.log("⏰ [MP-RETURN] TIMEOUT — mostrando no-exito con fallback");

              // Si el fallo es por conexión, usar modal sin conexión (v8)
              var isConnError = err.message && (
                  err.message.includes('Failed to fetch') ||
                  err.message.includes('TIMEOUT') ||
                  err.message.includes('network') ||
                  err.message.includes('NetworkError')
              );

              if (isConnError && typeof showSinConexionModal === 'function') {
                  console.log("📴 [MP-RETURN] Error de conexión tras retorno MP — mostrando modal sin conexión");
                  showSinConexionModal(idTurno, false);
                  return;
              }

       var ddCatch = getDisplayDataFromPending();

               var nombreCatch = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
               var senaDiv5 = document.getElementById('senaRequired');
              if (senaDiv5) {
                  senaDiv5.style.display = 'block';
                  var catchMsg;
                  if (ddCatch.tratamiento && ddCatch.fecha) {
                      catchMsg = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCatch + '.\nQueria reservar: ' + ddCatch.tratamiento + ' el ' + ddCatch.fecha + ' de ' + ddCatch.horaInicio + ' a ' + ddCatch.horaFin + '. Email: ' + (ddCatch.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
                  } else {
                      catchMsg = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCatch + '. Adjunto comprobante para completar mi reserva.');
                  }
                  var catchLink = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + catchMsg;
                  var catchHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                      + '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>'
                      + '<h3 style="color:#FFD700;margin-bottom:12px">Turno no confirmado</h3>'
                      + '<p>Tu turno no se ha podido gestionar correctamente. No te preocupes, contactanos por WhatsApp y te lo solucionamos.</p>'
                      + '<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin:0 auto 16px;max-width:400px;text-align:left;font-size:0.85rem;line-height:1.6">'
                      + '<p style="margin:0 0 8px">Si tenes el comprobante de pago, envianoslo por WhatsApp (puede ser captura de pantalla).</p>'
                      + '<p style="margin:0;opacity:0.7;font-size:0.8rem">Si no lo tenes a mano no te preocupes, escribinos igual y te ayudamos.</p></div>'
                      + '<a href="' + catchLink + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a>'
                      + '<br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
                  senaDiv5.innerHTML = catchHtml;
              }
          })
        // BUGFIX #3: finally — limpiar _mpFlowActive siempre que termine el retorno
        .finally(function() {
            clearTimeout(_mpReturnTimeout);
            _mpReturnTimedOut = false;
            console.log("🧹 [MP-RETURN] Finally — liberando _mpFlowActive");
            _mpFlowActive = false;
            window._successShown = false;
            clearReservaFlowFlag();
        });
    
    // Limpiar flag de flujo activo al salir del retorno MP (exito o error)
    // NOTA: El .finally() anterior ya lo limpia, esto es fallback por si falla
    if (!_mpFlowActive) {
        clearReservaFlowFlag();
    }
}

// BUGFIX #2: Retry wrapper para cuando _mpFlowActive estaba bloqueando
function handleMercadoPagoReturnRetry() {
    console.log("🔙 [MP-RETURN-RETRY] === REINTENTANDO MP RETURN DESPUES DE ESPERAR ===");
    
    var params = new URLSearchParams(window.location.search);
    var collectionId = params.get('collection_id');
    var status = params.get('status');
    var externalRef = params.get('external_reference');
    var preferenceId = params.get('preference_id');
    
    // Re-usar la misma lógica pero con estado fresco
    if (status && status !== 'approved') {
        console.log("❌ [MP-RETURN-RETRY] Status NO aprobado — limpiando y recargando");
        try { sessionStorage.setItem('_mp_returned_not_approved', 'true'); } catch(e) {}
        clearActiveTurnoStorage();
        stopStatusPolling();
        if(window._senaTimerId) clearInterval(window._senaTimerId);
        var cleanUrl = window.location.origin + window.location.pathname + (window.location.hash || '');
        window.history.replaceState({}, document.title, cleanUrl);
        releaseStoredTurno(sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN) || '');
        location.reload();
        return true;
    }
    
    // Si hay collection_id/status, llamar al handler principal de nuevo
    if (collectionId || status) {
        console.log("✅ [MP-RETURN-RETRY] Parámetros MP presentes, reinvocando handleMercadoPagoReturn");
        // Limpiar el flag para permitir que el handler principal corra normalmente
        _mpFlowActive = false;
        setTimeout(function() { handleMercadoPagoReturn(); }, 100);
        return true;
    }
    
    // Sin parámetros MP — verificar estado del turno
    var mobileTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
    if (!mobileTurno) {
        console.log("🔍 [MP-RETURN-RETRY] Sin turno en storage — ya mostró éxito probablemente");
        return true;
    }
    
    // Hacer verificación del estado
    fetchWithTimeout(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "dobleVerificacionMP",
            idTurno: mobileTurno
        })
    }, 15000)
    .then(function(r){ return r.json(); })
    .then(function(data) {
        console.log("📡 [MP-RETURN-RETRY] Estado turno: " + data.estado);
        if (data.estado === "Reservado") {
            showBookingSuccess(
                data.clienteNombre || "Cliente",
                data.tratamiento || "",
                data.fecha ? formatFechaDisplay(data.fecha) : "",
                data.horaInicio ? formatHoraDesdeSheets(data.horaInicio) : "",
                data.horaFin ? formatHoraDesdeSheets(data.horaFin) : "",
                mobileTurno
            );
        } else {
            showNoExitoModal(mobileTurno);
        }
    })
    .catch(function(err) {
        console.error("❌ [MP-RETURN-RETRY] Error verificando turno:", err);
        showNoExitoModal(mobileTurno);
    })
    .finally(function() {
        _mpFlowActive = false;
        window._successShown = false;
    });
    
    return true;
}

function showPagoHuerranoModal(mensaje) {
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    senaDiv.style.display = "block";
    
    var ddHue = getDisplayDataFromPending();
    var nombreHue = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
    var huellaMsg;
    if (ddHue.tratamiento && ddHue.fecha) {
        huellaMsg = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreHue + '.\nQueria reservar: ' + ddHue.tratamiento + ' el ' + ddHue.fecha + ' de ' + ddHue.horaInicio + ' a ' + ddHue.horaFin + '. Email: ' + (ddHue.email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
    } else {
        huellaMsg = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreHue + '. Adjunto comprobante para completar mi reserva.');
    }
    var huellaLink = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + huellaMsg;
    senaDiv.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⚠️</div><h3 style="color:#FFD700;margin-bottom:12px">Turno no confirmado</h3><p style="opacity:0.9;max-width:450px;margin:0 auto 16px">' + mensaje + '</p><div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin:0 auto 16px;max-width:400px;text-align:left;font-size:0.85rem;line-height:1.6"><p style="margin:0 0 8px">Si tenes el comprobante de pago, envianoslo por WhatsApp (puede ser captura de pantalla).</p><p style="margin:0;opacity:0.7;font-size:0.8rem">Si no lo tenes a mano no te preocupes, escribinos igual y te ayudamos.</p></div><a href="' + huellaLink + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a><br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
}

function startSenaTimer() {
    console.log("⏱️ [TIMER] === INICIANDO TIMER DE EXPIRACIÓN ===");
    var timerEl = document.getElementById("senaTimer");
    if(timerEl) timerEl.style.display="block";
    
    var storedExpiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY_TS);
    var totalSeconds;
    if (storedExpiry) {
        var remainingMs = parseInt(storedExpiry, 10) - Date.now();
        if (remainingMs <= 0) {
            console.log("⏰ [TIMER] Expirado al restaurar — turno ya vencido, liberando...");
            clearActiveTurnoStorage();
            releaseTempReservation();
            return;
        }
        totalSeconds = Math.ceil(remainingMs / 1000);
        console.log("   - Timer restaurado desde sessionStorage: " + storedExpiry + ", remainingMs=" + remainingMs + ", totalSeconds=" + totalSeconds);
    } else {
        totalSeconds = (TIEMPO_EXPIRACION_RESERVA_MINUTOS || 5) * 60;
        console.log("   - Timer nuevo desde cero: " + totalSeconds + "s (" + (totalSeconds/60) + " min)");
    }
    
    if(window._senaTimerId) clearInterval(window._senaTimerId);
    
    window._senaTimerId = setInterval(function() {
        // Guard: si el timer fue limpiado externamente (ej: handleMercadoPagoReturn, releaseTempReservation), no actualizar display
        if (!window._senaTimerId) {
            return;
        }
        totalSeconds--;
        if (totalSeconds <= 0) {
            console.log("⏰ [TIMER] CRONOMETRO LLEGÓ A CERO — llamando releaseTempReservation()");
            clearInterval(window._senaTimerId);
            window._senaTimerId = null;
            releaseTempReservation();
            return;
        }
        var m = Math.floor(totalSeconds / 60);
        var s = totalSeconds % 60;
        var td = m + ":" + ((s<10?"0":"")+s);
        
        var te=document.getElementById("senaTimer"); if(te) te.textContent="⏳ Tiempo restante: "+td;
        var tb=document.getElementById("senaTimerBig"); if(tb) tb.textContent=td;
    }, 1000);
    console.log("✅ [TIMER] Timer iniciado — expira en " + totalSeconds + " segundos");
}

function releaseTempReservation() {
    console.log("⏰ [RELEASE] === TIMER EXPIRADO — mostrando loading y verificando ===");
    
    // BUGFIX #2: Si MP return ya está activo, verificar si el usuario pagó o no
    if (_mpFlowActive) {
        console.log("⏳ [RELEASE] _mpFlowActive=true — timer expiró pero MP sigue procesando");
        
        // Limpiar timer pero NO detener el polling existente
        if (window._senaTimerId) {
            clearInterval(window._senaTimerId);
            window._senaTimerId = null;
        }
        clearReservaFlowFlag();
        
        // IMPORTANTE: No detener el polling de 5s. Pero SI mostrar un aviso al usuario
        // que el timer expiró mientras se verifica. El polling seguirá corriendo
        // y si Sheets=Reservado, mostrará éxito. Si expira el timeout global del polling (90s),
        // el polling mostrará "Tiempo Agotado" automáticamente.
        
        // Verificar si el usuario PAGÓ (AA=pagoConfirmado). Si sí, mostrar spinner.
        // Si no, mostrar "Tiempo Agotado" inmediatamente.
        var idTurnoRelease2 = window._pendingSenaData ? window._pendingSenaData.idTurno : '';
        if (idTurnoRelease2) {
            fetchWithTimeout(API_URL, {
                method: "POST",
                body: JSON.stringify({
                    token: API_TOKEN,
                    action: "dobleVerificacionMP",
                    idTurno: idTurnoRelease2
                })
            }, 8000)
            .then(function(r){return r.json()})
            .then(function(releaseCheckData) {
                if (releaseCheckData.pagoConfirmadoAA) {
                    console.log("💳 [RELEASE] Usuario SÍ pagó (AA confirmado) — mostrando spinner de espera");
                    var sdRelease = document.getElementById('senaRequired');
                    if (sdRelease) {
                        sdRelease.style.display = 'block';
                        sdRelease.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⏳</div><h3 style="color:#FFD700;margin-bottom:8px">Verificando tu pago...</h3><p style="opacity:0.9;margin-bottom:16px">Detectamos tu pago. La agenda se está actualizando...</p><div class="spinner" style="margin:20px auto"></div></div>';
                    }
                } else {
                    console.log("🚫 [RELEASE] Usuario NO pagó (AA sin confirmación) — mostrando Tiempo Agotado");
                    var sdRelease2 = document.getElementById('senaRequired');
                    if (sdRelease2 && !_successShown) {
                        sdRelease2.style.display = 'block';
                        var ddRelease = getDisplayDataFromPending();
                        var nombreRelease = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
                        var waRelease;
                        if (ddRelease.tratamiento && ddRelease.fecha) {
                            waRelease = encodeURIComponent('Hola! Tuve un problema al reservar online.\nMi nombre: ' + nombreRelease + '.\nQueria reservar: ' + ddRelease.tratamiento + ' el ' + ddRelease.fecha + ' de ' + ddRelease.horaInicio + ' a ' + ddRelease.horaFin + '. Email: ' + (ddRelease.email || 'no especificado') + '.\nEl turno expiró antes de que pudiera completar el pago.');
                        } else {
                            waRelease = encodeURIComponent('Hola! Tuve un problema al reservar online.\nMi nombre: ' + nombreRelease + '.\nEl turno expiró antes de completar el pago.');
                        }
                        sdRelease2.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⏳</div><h3 style="color:#FFD700;margin-bottom:12px">Tiempo Agotado</h3><p style="opacity:0.9;margin-bottom:8px">Tu tiempo para pagar expiró y el turno ya no está disponible.</p><p style="opacity:0.7;font-size:0.9rem;margin-bottom:16px">Alguien más lo tomó o nadie lo confirmó a tiempo.</p><button id="otroTurnoBtnRelease" style="display:block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button></div>';
                        setTimeout(function(){
                            var btn = document.getElementById('otroTurnoBtnRelease');
                            if(btn) btn.addEventListener('click', function(){
                                resetBookingForm();
                                loadAvailableSlots();
                            });
                        }, 100);
                    }
                }
            })
            .catch(function(err) {
                console.error("❌ [RELEASE] Error verificando AA tras timer expirado: " + err.message);
                    // Si la API falla, confiar en que el timeout global del polling (90s) manejará el caso
            });
        }
        
        return;
    }
    
    // Si NO hay _mpFlowActive (timer expiró sin MP activo), mostrar Tiempo Agotado directo
    if (!_mpFlowActive) {
        console.log("⏰ [RELEASE] _mpFlowActive=false — mostrando Tiempo Agotado");
        var sdRelease3 = document.getElementById('senaRequired');
        if (sdRelease3 && !_successShown) {
            sdRelease3.style.display = 'block';
            sdRelease3.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⏳</div><h3 style="color:#FFD700;margin-bottom:8px">Tiempo Agotado</h3><p style="opacity:0.9;max-width:450px;margin:0 auto 16px">El tiempo de espera para completar el pago expiró. Se liberó el turno seleccionado.</p><button id="otroTurnoBtnRelease2" style="display:block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button></div>';
            setTimeout(function(){
                var btn = document.getElementById('otroTurnoBtnRelease2');
                if(btn) btn.addEventListener('click', function(){
                    resetBookingForm();
                    loadAvailableSlots();
                });
            }, 100);
        }
        clearActiveTurnoStorage();
        return;
    }
    
    if (window._senaTimerId) {
        clearInterval(window._senaTimerId);
        window._senaTimerId = null;
        console.log("   - Timer limpiado");
    }

    stopStatusPolling();
    clearReservaFlowFlag();
    
    // Mostrar estado de carga inmediatamente
    var senaDiv = document.getElementById('senaRequired');
    if (senaDiv) {
        senaDiv.style.display = 'block';
        senaDiv.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div class="spinner" style="margin:20px auto"></div><p style="opacity:0.9;margin-top:16px;font-size:1rem">Verificando agenda...</p></div>';
    }
    
    var idTurnoRelease = window._pendingSenaData ? window._pendingSenaData.idTurno : '';
    
    if (idTurnoRelease) {
        console.log("📡 [RELEASE] Última consulta DOBLE VERIFICACION antes de liberar turno " + idTurnoRelease);
        
        // BUGFIX #3: fetch con timeout
        fetchWithTimeout(API_URL, {
            method: "POST",
            body: JSON.stringify({
                token: API_TOKEN,
                action: "dobleVerificacionMP",
                idTurno: idTurnoRelease
            })
        })
        .then(function(r){return r.json()})
        .then(function(data) {
            console.log("📡 [RELEASE] DOBLE VERIF final → estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
            
            // CASO 1: Sheets ya tiene Reservado → ÉXITO (webhook llegó tarde)
            if (data.estado === "Reservado") {
                console.log("✅ [RELEASE] SHEETS=Reservado — mostrando éxito");
                
                // Guardar preferenceId en localStorage ANTES de limpiar storage
                var prefIdGuardada = sessionStorage.getItem("yessenia_preference_id") || '';
                if (prefIdGuardada && window._pendingSenaData) {
                    try { localStorage.setItem("yessenia_pref_turn_" + prefIdGuardada, idTurnoRelease); } catch(e) {}
                    console.log("💾 [RELEASE] preferenceId guardada en localStorage: " + prefIdGuardada);
                }
                
                clearActiveTurnoStorage();
                
                showBookingSuccess(
                    window._pendingSenaData ? window._pendingSenaData.nombre : (data.clienteNombre || "Cliente"),
                    window._pendingSenaData ? window._pendingSenaData.tratamiento : "",
                    window._pendingSenaData ? window._pendingSenaData.fecha : "",
                    window._pendingSenaData ? window._pendingSenaData.hora : "",
                    data.horaFin || "", idTurnoRelease
                );
                return;
            }
            
            // CASO 2: Sheets no Reservado pero AA tiene pago confirmado → NO EXITO con datos
            if (data.pagoConfirmadoAA) {
                console.log("🚨 [RELEASE] AA=pagoConfirmado + Sheets≠Reservado — mostrando NO EXITO");
                showNoExitoModalFromRelease(idTurnoRelease, data);
                return;
            }
            
            // CASO 3: Ni Sheets ni AA tienen pago confirmado → turno expiró normalmente
            console.log("⏰ [RELEASE] Sin confirmación de pago en AA — turno expirado");
            proceedWithRelease();
        })
        .catch(function(err) {
            console.error("❌ [RELEASE] Error en última consulta DOBLE: " + err.message);
            var isTimeout = err.message && err.message.indexOf("TIMEOUT") !== -1;
            var isConnError = err.message && (
                err.message.includes('Failed to fetch') || 
                err.message.includes('TIMEOUT') ||
                err.message.includes('network') ||
                err.message.includes('NetworkError')
            );
            if (isTimeout) console.log("⏰ [RELEASE] TIMEOUT — asumiendo turno expirado");
            
            // Timer expiró LOCALMENTE — el usuario no pagó a tiempo.
            // SO mostrar "Sin Conexión" si YA SABEMOS que pagó (AA=pagoConfirmado).
            // Si la API falló por conexión, verificar AA ANTES de decidir.
            if (isConnError) {
                console.log("📴 [RELEASE] Error de conexión — verificando AA para decidir modal");
                fetchWithTimeout(API_URL, {
                    method: "POST",
                    body: JSON.stringify({
                        token: API_TOKEN,
                        action: "dobleVerificacionMP",
                        idTurno: idTurnoRelease
                    })
                }, 10000)
                .then(function(r){ return r.json(); })
                .then(function(aaData) {
                    console.log("📡 [RELEASE] AA fallback → pagoConfirmadoAA=" + aaData.pagoConfirmadoAA);
                    if (aaData.pagoConfirmadoAA) {
                        showSinConexionModal(idTurnoRelease, true);
                    } else {
                        clearActiveTurnoStorage();
                        proceedWithRelease();
                    }
                })
                .catch(function(err2) {
                    console.error("❌ [RELEASE] Error en verificación AA fallback: " + err2.message);
                    clearActiveTurnoStorage();
                    proceedWithRelease();
                });
                return;
            }
            
            // Si la API falló (no por conexión), asumir que no hay pago confirmado
            clearActiveTurnoStorage();
            proceedWithRelease();
        });
    } else {
        // No hay ID de turno — turno expirado sin datos
        console.log("⏰ [RELEASE] Sin idTurno — turno expirado");
        clearActiveTurnoStorage();
        proceedWithRelease();
    }
    
    function proceedWithRelease() {
        if (_successShown) { console.log("⏰ [RELEASE] Success ya mostrado, saltando proceedWithRelease"); return; }
        
        var senaDiv = document.getElementById('senaRequired');
        if (senaDiv) {
            senaDiv.style.display = 'block';
            senaDiv.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                + '<div style="font-size:3rem;margin-bottom:16px">⏳</div>'
                + '<h3 style="color:#FFD700;margin-bottom:12px">Tiempo Agotado</h3>'
                + '<p style="opacity:0.9;margin-bottom:8px">Tu tiempo para pagar expiró y el turno ya no está disponible.</p>'
                + '<p style="opacity:0.7;font-size:0.9rem;margin-bottom:16px">Alguien más lo tomó o nadie lo confirmó a tiempo.</p>'
                + '<button id="otroTurnoBtnExpired" style="display:block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button></div>';
            
            setTimeout(function(){
                var btn = document.getElementById('otroTurnoBtnExpired');
                if(btn) btn.addEventListener('click', function(){
                    resetBookingForm();
                    loadAvailableSlots();
                });
            }, 100);
        }
        
        showAllSections();
        var relTimerId = window._senaTimerId;
        window._senaTimerId = null;
        window._silenceBeforeUnload = { _ts: Date.now() };
        _popstateSilenceTs = Date.now();
        // NO scroll al top — el usuario ya está viendo el modal, dejarlo donde quedó
        setTimeout(function() { window._senaTimerId = relTimerId; window._silenceBeforeUnload = false; }, 1000);
        console.log("✅ [RELEASE] Turno liberado y UI actualizada");
    }
}

// ========== Verificar resultado después de que MP termina de procesar ==========
function verificarResultadoPostMP() {
    console.log("✅ [RELEASE-MP] === VERIFICANDO RESULTADO POST-MP ===");
    
    if (_successShown) {
        console.log("✅ [RELEASE-MP] Success ya mostrado, saltando");
        return;
    }
    
    var idTurno = window._pendingSenaData ? window._pendingSenaData.idTurno : '';
    if (!idTurno) {
        console.log("⚠️ [RELEASE-MP] Sin idTurno — mostrando expirado");
        proceedWithRelease();
        return;
    }
    
    fetchWithTimeout(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "dobleVerificacionMP",
            idTurno: idTurno
        })
    }, 15000)
    .then(function(r){return r.json()})
    .then(function(data) {
        console.log("📡 [RELEASE-MP] DOBLE VERIF → estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
        
        // CASO 1: Sheets ya tiene Reservado → ÉXITO
        if (data.estado === "Reservado") {
            console.log("✅ [RELEASE-MP] SHEETS=Reservado — mostrando éxito");
            
            var prefIdGuardada = sessionStorage.getItem("yessenia_preference_id") || '';
            if (prefIdGuardada) {
                try { localStorage.setItem("yessenia_pref_turn_" + prefIdGuardada, idTurno); } catch(e) {}
            }
            
            clearActiveTurnoStorage();
            
            showBookingSuccess(
                window._pendingSenaData ? window._pendingSenaData.nombre : (data.clienteNombre || "Cliente"),
                window._pendingSenaData ? window._pendingSenaData.tratamiento : "",
                window._pendingSenaData ? window._pendingSenaData.fecha : "",
                window._pendingSenaData ? window._pendingSenaData.hora : "",
                data.horaFin || "", idTurno
            );
            return;
        }
        
        // CASO 2: AA tiene pago confirmado → NO EXITO
        if (data.pagoConfirmadoAA) {
            console.log("🚨 [RELEASE-MP] AA=pagoConfirmado + Sheets≠Reservado — mostrando no-exito");
            showNoExitoModalFromRelease(idTurno, data);
            return;
        }
        
        // CASO 3: Ni Sheets ni AA tienen confirmación → expirado normal
        console.log("⏰ [RELEASE-MP] Sin confirmación de pago — turno expirado");
        proceedWithRelease();
    })
    .catch(function(err) {
        console.error("❌ [RELEASE-MP] Error verificando resultado: " + err.message);
        proceedWithRelease();
    });
}

// ========== NO EXITO desde release (timer expiró pero AA tiene pago) ==========
function showNoExitoModalFromRelease(idTurno, doubleData) {
    console.log("🚨 [NO-EXITO-RELEASE] === TIMER EXPIRÓ PERO AA TIENE PAGO ===");
    
    // BUGFIX #5: Si éxito ya fue mostrado, no mostrar no-exito
    if (_successShown) {
        console.log("🚨 [NO-EXITO-RELEASE] _successShown=true — cancelando no-exito desde release");
        return;
    }
    
    if (!window._noExitoAlertSent) window._noExitoAlertSent = new Set();
    if (window._noExitoAlertSent.has(idTurno)) {
        console.log("🚨 [NO-EXITO-RELEASE] Ya procesado, saltando");
        return;
    }
    window._noExitoAlertSent.add(idTurno);
    
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) { console.error("❌ [NO-EXITO-RELEASE] senaDiv no encontrado"); return; }
    senaDiv.style.display = "block";
    
    // Usar datos de la doble verificacion o fallback a pending
    var nombreCliente = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
    var tratamiento = doubleData.tratamiento || "";
    var fechaRaw = doubleData.fecha || "";
    var horaInicio = doubleData.horaInicio ? formatHoraDesdeSheets(doubleData.horaInicio) : "";
    var horaFin = doubleData.horaFin ? formatHoraDesdeSheets(doubleData.horaFin) : "";
    var email = doubleData.clienteEmail || "";
    
    // Fallback a pending data si la doble verificacion no tiene datos completos
    if (!tratamiento) {
        var dd = getDisplayDataFromPending();
        tratamiento = dd.tratamiento;
        fechaRaw = dd.fecha;
        horaInicio = dd.horaInicio;
        horaFin = dd.horaFin;
        email = dd.email;
    }
    
    // Fallback FINAL: localStorage snapshot (caso borde - lazyCleanup borró todo)
    var snap = getBookingSnapshotFromStorage();
    if (snap && !tratamiento) {
        console.log("📦 [NO-EXITO-RELEASE] Usando localStorage snapshot como fallback final");
        tratamiento = snap.tratamiento || "";
        fechaRaw = snap.fecha || "";
        horaInicio = snap.hora || "";
        horaFin = snap.horaFin || "";
        email = snap.email || "";
    }
    
    var fecha = fechaRaw ? formatFechaDisplay(fechaRaw) : "";
    
    // Mensaje de WhatsApp con datos del turno
    var waMsg;
    if (tratamiento && fecha) {
        waMsg = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCliente + '.\nQueria reservar: ' + tratamiento + ' el ' + fecha + ' de ' + horaInicio + ' a ' + horaFin + '. Email: ' + (email || 'no especificado') + '.\nAdjunto comprobante para completar mi reserva.');
    } else {
        waMsg = encodeURIComponent('Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCliente + '. Adjunto comprobante para completar mi reserva.');
    }
   var waLink = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waMsg;
    
        senaDiv.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⚠️</div><h3 style="color:#FFD700;margin-bottom:12px">Turno no confirmado</h3><p style="opacity:0.9;max-width:450px;margin:0 auto 16px">Tu turno no se ha podido gestionar correctamente. No te preocupes, contactanos por WhatsApp y te lo solucionamos.</p><div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin:0 auto 16px;max-width:400px;text-align:left;font-size:0.85rem;line-height:1.6"><p style="margin:0 0 8px">Si tenes el comprobante de pago, envianoslo por WhatsApp (puede ser captura de pantalla).</p><p style="margin:0;opacity:0.7;font-size:0.8rem">Si no lo tenes a mano no te preocupes, escribinos igual y te ayudamos.</p></div><a href="' + waLink + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a><br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
    
    // NOTA: Las alertas al admin se manejan exclusivamente desde el backend (webhook con sleep 5s)
    // El frontend solo muestra el modal al cliente con botón WhatsApp
    
    // Liberar storage
    clearActiveTurnoStorage();
}

function cancelarReservaTemporal(idTurno) {
    console.log("❌ [CANCELAR] === CANCELANDO RESERVA TEMPORAL ===");
    console.log("   - idTurno: " + idTurno);
    clearReservaFlowFlag();
    
    if (!idTurno) {
        console.log("   - Sin idTurno, limpiando storage localmente");
        clearActiveTurnoStorage();
        stopStatusPolling();
        resetBookingForm();
        return;
    }
    
    clearActiveTurnoStorage();
    stopStatusPolling();
    if(window._senaTimerId) clearInterval(window._senaTimerId);
    
    fetch(API_URL, {method:"POST", body:JSON.stringify({token:API_TOKEN, action:"cancelarReservaTemporal", idTurno:idTurno})})
        .then(function(r){return r.json()})
        .then(function(data) {
            console.log("✅ [CANCELAR] API response: " + JSON.stringify(data));
        })
        .catch(function(err) {
            console.warn("⚠️ [CANCELAR] API cancel error (ignored):", err);
        });
    
    resetBookingForm();
}

// ========== Modal de NO EXITO (agenda no muestra RESERVADO despues de verificacion inteligente) ==========
function showNoExitoModal(idTurno, hasPayment) {
    console.log("🚨 [NO-EXITO] === INICIANDO MODAL DE NO EXITO ===");
    console.log("   - idTurno: " + idTurno + ", hasPayment: " + hasPayment);
    
    // BUGFIX #5: Si éxito ya fue mostrado para ESTE turno, NO mostrar no-exito después
    // Pero SI mostrar si es un turno diferente (ej: re-intento de reserva)
    if (_successShown) {
        var storedTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
        if (storedTurno && storedTurno === idTurno) {
            console.log("🚨 [NO-EXITO] _successShown=true para mismo turno — cancelando");
            return;
        }
        console.log("🚨 [NO-EXITO] _successShown=true pero turno diferente (" + storedTurno + " vs " + idTurno + ") — mostrando igual");
    }
    
    // Evitar disparos multiples del mismo modal/alerta por polling + return handler
    if (!window._noExitoAlertSent) window._noExitoAlertSent = new Set();
    if (window._noExitoAlertSent.has(idTurno)) {
        console.log("🚨 [NO-EXITO] Ya procesado para este turno, saltando");
        return;
    }
    window._noExitoAlertSent.add(idTurno);
    
    // DESACTIVAR detección de conexión una vez que se muestra este modal
    _connectionDetectionActive = false;
    console.log("🔕 [NO-EXITO] Detección de conexión DESACTIVADA — este es el resultado final");
    
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) {
        console.error("❌ [NO-EXITO] senaDiv no encontrado en DOM");
        return;
    }
    senaDiv.style.display = "block";
    
    // Limpiar spinner de "Pago detectado" si está visible (v8.1)
    var spinnerEl = senaDiv.querySelector('.payment-detected-spinner');
    if (spinnerEl) {
        spinnerEl.remove();
    }
    
    // BUGFIX #4: Mostrar modal INMEDIATAMENTE con datos de fallback (síncrono)
    // Nunca dejar spinner atascado — el usuario ve el error al instante
    var ddFallback = getDisplayDataFromPending();
    var nombreCliente = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
    
    var waMsgFallback;
    if (ddFallback.tratamiento && ddFallback.fecha) {
        var baseWA = 'Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCliente + '.\nQueria reservar: ' + ddFallback.tratamiento + ' el ' + ddFallback.fecha + ' de ' + ddFallback.horaInicio + ' a ' + ddFallback.horaFin;
        if (ddFallback.email) baseWA += '. Email: ' + ddFallback.email;
        baseWA += '.\nAdjunto comprobante para completar mi reserva.';
        if (hasPayment) baseWA += '\nVi que mi pago fue confirmado pero la agenda no se actualizó.';
        waMsgFallback = encodeURIComponent(baseWA);
    } else {
        var baseWA2 = 'Hola! Tuve un problema al reservar online pero ya aboné.\nMi nombre: ' + nombreCliente + '.\nAdjunto comprobante para completar mi reserva.';
        if (hasPayment) baseWA2 += '\nVi que mi pago fue confirmado pero la agenda no se actualizó.';
        waMsgFallback = encodeURIComponent(baseWA2);
    }
    
    var noExitoHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">⚠️</div><h3 style="color:#FFD700;margin-bottom:12px">Turno no confirmado</h3><p style="opacity:0.9;max-width:450px;margin:0 auto 16px">Tu turno no se ha podido gestionar correctamente. No te preocupes, contactanos por WhatsApp y te lo solucionamos.</p><div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin:0 auto 16px;max-width:400px;text-align:left;font-size:0.85rem;line-height:1.6"><p style="margin:0 0 8px">Si tenes el comprobante de pago, envianoslo por WhatsApp (puede ser captura de pantalla).</p><p style="margin:0;opacity:0.7;font-size:0.8rem">Si no lo tenes a mano no te preocupes, escribinos igual y te ayudamos.</p></div><a href="https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waMsgFallback + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📱 Enviar comprobante por WhatsApp</a><br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
    
    senaDiv.innerHTML = noExitoHtml;
    console.log("✅ [NO-EXITO] Modal mostrado inmediatamente (fallback síncrono)");
    
    // Ahora consultar API en background para tener datos actualizados si el admin consulta
    console.log("📡 [NO-EXITO] Consultando DOBLE VERIFICACION en background...");
    fetchWithTimeout(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "dobleVerificacionMP",
            idTurno: idTurno
        })
    }, 10000)
    .then(function(r){ return r.json(); })
    .then(function(data) {
        console.log("📡 [NO-EXITO] DOBLE VERIF response: estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
        // Si resultó ser que SÍ está Reservado, actualizar a éxito
        if (data.estado === "Reservado") {
            console.log("✅ [NO-EXITO] Resulta que el turno SÍ está Reservado — mostrando éxito");
            showBookingSuccess(
                data.clienteNombre || nombreCliente,
                data.tratamiento || "",
                data.fecha ? formatFechaDisplay(data.fecha) : "",
                data.horaInicio ? formatHoraDesdeSheets(data.horaInicio) : "",
                data.horaFin ? formatHoraDesdeSheets(data.horaFin) : "",
                idTurno
            );
        } else if (data.pagoConfirmadoAA) {
            console.log("💳 [NO-EXITO] Pago confirmado en AA — modal correcto con advertencia de pago");
        }
    })
    .catch(function(err) {
        console.log("⚠️ [NO-EXITO] Error API en background (ignorado, modal ya mostrado): " + err.message);
    });
}

// ========== BUGFIX #1: Auto-detectar retorno de Mercado Pago al cargar la página ==========
// Cuando MP redirige con ?status=approved&collection_id=xxx, esta función se ejecuta
// automáticamente y muestra el modal correcto (éxito o no-exito)
(function checkMpReturnOnLoad() {
    try {
        var params = new URLSearchParams(window.location.search);
        var hasMpParams = params.get('status') || params.get('collection_id');
        
        if (hasMpParams) {
            console.log("🔙 [MP-LOAD] Parámetros MP detectados al cargar — invocando handleMercadoPagoReturn");
            // Pequeño delay para asegurar que todos los scripts del DOM están cargados
            setTimeout(function() {
                try { handleMercadoPagoReturn(); } catch(e) { console.error("❌ [MP-LOAD] Error invocando handler:", e); }
            }, 300);
        } else {
            // También verificar hash — a veces MP redirige con # en vez de ?
            var hashParams = new URLSearchParams((window.location.hash || '').split('?')[1] || '');
            if (hashParams.get('status') || hashParams.get('collection_id')) {
                console.log("🔙 [MP-LOAD] Parámetros MP detectados en hash — invocando handleMercadoPagoReturn");
                setTimeout(function() {
                    try { handleMercadoPagoReturn(); } catch(e) { console.error("❌ [MP-LOAD] Error invocando handler:", e); }
                }, 300);
            } else {
                console.log("ℹ️ [MP-LOAD] Sin parámetros MP al cargar — flujo normal");
            }
        }
    } catch(e) {
        console.error("❌ [MP-LOAD] Error verificando retorno MP:", e);
    }
})();

// ═══════════════════════════════════════════════════════════════════════
// DETECCIÓN DE PÉRDIDA DE CONEXIÓN DURANTE FLUJO DE PAGO (v8)
// ═══════════════════════════════════════════════════════════════════════
(function initConnectionDetection() {
    console.log("📡 [CONN] === INICIANDO DETECCIÓN DE CONEXIÓN ===");
    
    // Detectar si estaba offline al cargar la página
    if (!navigator.onLine) {
        _connectionLost = true;
        console.log("⚠️ [CONN] Página cargó SIN conexión — activando modo offline");
    }
    
    // Escuchar cambio a offline
    window.addEventListener('offline', function() {
        if (!_connectionDetectionActive) return;
        _connectionLost = true;
        console.log("📴 [CONN] Conexión perdida durante flujo de pago");
        
        // Si hay un turno activo, mostrar banner sutil
        var turnoActivo = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
        if (turnoActivo && !_sinConexionModalShown) {
            showConnectionBanner("⚠️ Perdiste la conexión. Reintentando automáticamente...");
        }
    });
    
    // Escuchar recuperación de conexión — UN SOLO flujo controlado
    window.addEventListener('online', function() {
        if (!_connectionDetectionActive) return;
        _connectionLost = false;
        console.log("📶 [CONN] Conexión recuperada — verificando estado del turno");
        
        hideConnectionBanner();
        
        // Limpiar TODOS los reintentos anteriores para evitar duplicados
        if (_autoRetryTimer) clearTimeout(_autoRetryTimer);
        
        // Si ya se está verificando, NO iniciar otro flujo
        if (_verifyingConnection) {
            console.log("⏳ [CONN] Ya hay una verificación en curso — ignorando");
            return;
        }
        
        // Si el modal de sin conexión está visible, ocultarlo inmediatamente
        // (es TEMPORAL — se reemplaza por el resultado correcto)
        var sinConnModal = document.getElementById('senaRequired');
        if (sinConnModal) {
            var modalContent = sinConnModal.innerHTML;
            if (modalContent && modalContent.indexOf('📴') !== -1) {
                console.log("📴 [CONN] Modal sin conexión visible — ocultando para mostrar resultado correcto");
            }
        }
        
        // Si había un turno activo, reintento automático (UN SOLO intento controlado)
        var turnoActivo = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
        if (turnoActivo) {
            console.log("🔄 [CONN] Reintento único para turno: " + turnoActivo);
            _verifyingConnection = true;
            
            verificarYMostrarResultadoPorConexion(turnoActivo, function() {
                // Cuando termina la verificación, limpiar flags
                _verifyingConnection = false;
                console.log("✅ [CONN] Verificación tras reconexión completada");
            });
        } else {
            // No hay turno activo — si el modal sin conexión está visible, limpiarlo
            if (sinConnModal) {
                var modalContent2 = sinConnModal.innerHTML;
                if (modalContent2 && modalContent2.indexOf('📴') !== -1) {
                    console.log("📴 [CONN] Sin turno activo — limpiando modal sin conexión residual");
                    sinConnModal.style.display = 'none';
                    sinConnModal.innerHTML = '';
                    _sinConexionModalShown = false;
                }
            }
        }
    });
})();

// Banner sutil de "sin conexión" (no modal, solo aviso visual)
function showConnectionBanner(message) {
    var existing = document.getElementById('connectionStatusBanner');
    if (existing) existing.remove();
    
    var banner = document.createElement('div');
    banner.id = 'connectionStatusBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:rgba(255,165,0,0.95);color:#fff;text-align:center;padding:10px 16px;font-size:0.85rem;z-index:999999;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-weight:500;';
    banner.textContent = message || "⚠️ Sin conexión — Reintentando automáticamente...";
    document.body.appendChild(banner);
    
    console.log("📢 [CONN] Banner mostrado: " + (message || "Sin conexión"));
}

function hideConnectionBanner() {
    var banner = document.getElementById('connectionStatusBanner');
    if (banner) {
        banner.style.transition = 'opacity 0.3s ease';
        banner.style.opacity = '0';
        setTimeout(function() {
            if (banner.parentNode) banner.remove();
        }, 300);
    }
}

  // Verificar estado del turno tras recuperar conexión y mostrar resultado apropiado
// Lógica de negocio:
// 1. Estado=Reservado → ÉXITO (webhook confirmó)
// 2. AA vacía + Reservado Temporal → Tiempo Agotado (no pagó)
// 3. AA con valor + Reservado Temporal → No Exito (pagó pero Sheets no actualizó)
// onDone: callback opcional cuando termina el flujo (para limpiar _verifyingConnection)
function verificarYMostrarResultadoPorConexion(idTurno, onDone) {
    // Si la detección de conexión ya se desactivó (modal de resultado final mostrado), no hacer nada
    if (!_connectionDetectionActive) {
        console.log("⏳ [CONN] Detección de conexión desactivada — saltando verificación");
        if (onDone) onDone();
        return;
    }
    
    console.log("📡 [CONN] === VERIFICANDO TURNO TRAS RECONEXIÓN: " + idTurno + " ===");
    
    fetchWithTimeout(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "dobleVerificacionMP",
            idTurno: idTurno
        })
    }, 15000)
    .then(function(r){ return r.json(); })
    .then(function(data) {
        console.log("📡 [CONN] Resultado tras reconexión → estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
        
        // CASO 1: Estado=Reservado → ÉXITO inmediato (webhook ya confirmó)
        if (data.estado === "Reservado") {
            console.log("✅ [CONN] ÉXITO: Sheets=Reservado — mostrando éxito");
            _connectionDetectionActive = false;
            _sinConexionModalShown = true;
            
            clearActiveTurnoStorage();
            stopStatusPolling();
            if(window._senaTimerId) clearInterval(window._senaTimerId);
            window._senaTimerId = null;
            
            var nombreSuccess = data.clienteNombre || (window._pendingSenaData ? window._pendingSenaData.nombre : "Cliente");
            var tratSuccess = data.tratamiento || (window._pendingSenaData ? window._pendingSenaData.tratamiento : "");
            var fechaSuccess = data.fecha ? formatFechaDisplay(data.fecha) : (window._pendingSenaData ? window._pendingSenaData.fecha : "");
            var horaSuccess = data.horaInicio ? formatHoraDesdeSheets(data.horaInicio) : (window._pendingSenaData ? window._pendingSenaData.hora : "");
            
            showBookingSuccess(nombreSuccess, tratSuccess, fechaSuccess, horaSuccess, data.horaFin || "", idTurno);
            if (onDone) onDone();
            return;
        }
        
        // CASO 2: AA con valor (pagó) + Reservado Temporal (Sheets no actualizó)
        // → No Exito con polling de 10s para ver si Sheets cambia a Reservado
        if (data.pagoConfirmadoAA && (data.estado === "Reservado Temporal" || data.estado === "Reservado Temp.")) {
            console.log("💳 [CONN] NO EXITO POTENCIAL: AA=pagoConfirmado + Sheets=Reservado Temporal");
            console.log("   → Usuario pagó pero Sheets no actualizó. Esperando 10s a que webhook actualice Sheets...");
            
            // Mostrar spinner "Verificando..."
            var senaDiv = document.getElementById("senaRequired");
            if (senaDiv) {
                senaDiv.style.display = "block";
                senaDiv.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25)"><div style="font-size:3rem;margin-bottom:16px">⏳</div><h3 style="color:#FFD700;margin-bottom:8px">Detectamos tu pago — confirmando...</h3><p style="opacity:0.9;margin-bottom:16px">Tu pago fue registrado. Actualizando tu agenda...</p><div class="spinner" style="margin:20px auto"></div></div>';
            }
            
            // Polling cada 2s durante 10s (5 polls) para ver si Sheets cambia a Reservado
            var pollCount = 0;
            var maxPolls = 5;
            var pollInterval = 2000;
            
            function pollSheetsUpdate() {
                pollCount++;
                console.log("🔄 [CONN] Poll #" + pollCount + "/" + maxPolls + " — esperando que Sheets cambie a Reservado");
                
                fetchWithTimeout(API_URL, {
                    method: "POST",
                    body: JSON.stringify({
                        token: API_TOKEN,
                        action: "dobleVerificacionMP",
                        idTurno: idTurno
                    })
                }, 10000)
                .then(function(r){ return r.json(); })
                .then(function(pollData) {
                    console.log("📡 [CONN] Poll #" + pollCount + " → estado=" + pollData.estado + ", pagoConfirmadoAA=" + pollData.pagoConfirmadoAA);
                    
                    if (pollData.estado === "Reservado") {
                        // ÉXITO — Sheets se actualizó durante el polling
                        console.log("✅ [CONN] ÉXITO: Sheets=Reservado en poll #" + pollCount);
                        _connectionDetectionActive = false;
                        _sinConexionModalShown = true;
                        clearActiveTurnoStorage();
                        stopStatusPolling();
                        if(window._senaTimerId) { clearInterval(window._senaTimerId); window._senaTimerId = null; }
                        
                        showBookingSuccess(
                            pollData.clienteName || (window._pendingSenaData ? window._pendingSenaData.nombre : "Cliente"),
                            pollData.tratamiento || (window._pendingSenaData ? window._pendingSenaData.tratamiento : ""),
                            pollData.fecha ? formatFechaDisplay(pollData.fecha) : (window._pendingSenaData ? window._pendingSenaData.fecha : ""),
                            pollData.horaInicio ? formatHoraDesdeSheets(pollData.horaInicio) : (window._pendingSenaData ? window._pendingSenaData.hora : ""),
                            pollData.horaFin || "", idTurno
                        );
                        return;
                    }
                    
                    // Si sigue sin cambiar y quedan polls → seguir intentando
                    if (pollCount < maxPolls) {
                        setTimeout(pollSheetsUpdate, pollInterval);
                    } else {
                        // Agotó polls — Sheets no cambió en 10s → NO EXITO
                        console.log("🚨 [CONN] 10s agotados — Sheets no cambió → NO EXITO con aviso de pago");
                        _connectionDetectionActive = false;
                        _sinConexionModalShown = true;
                        showNoExitoModal(idTurno, true);
                    }
                })
                .catch(function(err) {
                    console.error("❌ [CONN] Error poll #" + pollCount + ": " + err.message);
                    if (pollCount < maxPolls) {
                        setTimeout(pollSheetsUpdate, pollInterval);
                    } else {
                        console.log("🚨 [CONN] Polls agotados por error → NO EXITO");
                        _connectionDetectionActive = false;
                        _sinConexionModalShown = true;
                        showNoExitoModal(idTurno, true);
                    }
                });
            }
            
            // Primer poll inmediato
            setTimeout(pollSheetsUpdate, 500);
            return;
        }
        
        // CASO 3: AA vacía + Reservado Temporal → Tiempo Agotado (usuario no pagó)
        if (!data.pagoConfirmadoAA && (data.estado === "Reservado Temporal" || data.estado === "Reservado Temp.")) {
            console.log("⏰ [CONN] Tiempo Agotado: AA vacía + Reservado Temporal — usuario no pagó");
            _connectionDetectionActive = false;
            _sinConexionModalShown = true;
            showTiempoAgotadoModal(idTurno);
            if (onDone) onDone();
            return;
        }
        
        // CASO 4: Disponible/Vencido → Tiempo Agotado
        if (data.estado === "Disponible" || data.estado === "Vencido Sin Confirmar") {
            console.log("⏰ [CONN] Tiempo Agotado: estado=" + data.estado);
            _connectionDetectionActive = false;
            _sinConexionModalShown = true;
            showTiempoAgotadoModal(idTurno);
            if (onDone) onDone();
            return;
        }
        
        // CASO 5: Sin datos claros → mostrar modal sin conexión (con reintentar)
        if (_sinConnModalHasReintentar) {
            console.log("⚠️ [CONN] Sin datos claros — mostrando modal sin conexión");
            showSinConexionModal(idTurno, false);
        } else {
            console.log("⚠️ [CONN] Sin datos claros — mostrando Tiempo Agotado");
            showTiempoAgotadoModal(idTurno);
        }
        if (onDone) onDone();
    })
    .catch(function(err) {
        console.error("❌ [CONN] Error verificando tras reconexión: " + err.message);
        showSinConexionModal(idTurno, false);
        if (onDone) onDone();
    });
}

// ═══════════════════════════════════════════════════════════════════════
// SPINNER: "Verificando tu reserva..." (v9)
// Se muestra cuando AA tiene pago confirmado pero Sheets aún no cambió.
// Hace polling cada 3s hasta que Sheets cambie o expire (~15s).
// ═══════════════════════════════════════════════════════════════════════
function showVerifyingSpinner(idTurno, onDone) {
    console.log("🔄 [VERIFY] === MOSTRANDO SPINNER DE VERIFICACIÓN PARA: " + idTurno + " ===");
    
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) {
        console.error("❌ [VERIFY] senaDiv no encontrado en DOM");
        onDone(null);
        return;
    }
    senaDiv.style.display = "block";
    
    // Limpiar spinner anterior si existe
    var oldSpinner = senaDiv.querySelector('.verifying-spinner-overlay');
    if (oldSpinner) oldSpinner.remove();
    
    // Crear overlay de spinner sobre el contenido existente
    var overlay = document.createElement('div');
    overlay.className = 'verifying-spinner-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,51,102,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;';
    overlay.innerHTML = '<div style="color:#FFD700;font-size:1.3rem;font-weight:bold;text-align:center;padding:24px 48px;background:rgba(0,30,60,0.95);border-radius:16px;border:2px solid #C4A16D;box-shadow:0 8px 32px rgba(0,0,0,0.4)">'
        + '<div style="width:40px;height:40px;border:3px solid rgba(255,215,0,0.3);border-top-color:#FFD700;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px"></div>'
        + '<div>Verificando tu reserva...</div>'
        + '<style>@keyframes spin{to{transform:rotate(360deg)}}</style></div>';
    document.body.appendChild(overlay);
    
    // Polling: máximo 4 polls cada 3s (~12s total)
    var pollCount = 0;
    var maxPolls = 4;
    var _pollTimer = null;
    
    // Timeout global de seguridad: 25s máximo para todo el spinner
    var _verifyTimeout = setTimeout(function() {
        console.log("⏰ [VERIFY] Timeout 25s — spinner tardó demasiado");
        overlay.remove();
        if (onDone) onDone(null);
    }, 25000);
    
    function poll() {
        pollCount++;
        console.log("🔄 [VERIFY] Poll #" + pollCount + "/" + maxPolls);
        
        fetchWithTimeout(API_URL, {
            method: "POST",
            body: JSON.stringify({
                token: API_TOKEN,
                action: "dobleVerificacionMP",
                idTurno: idTurno
            })
        }, 10000)
        .then(function(r){ return r.json(); })
        .then(function(dPoll) {
            console.log("📡 [VERIFY] Poll #" + pollCount + " → estado=" + dPoll.estado + ", pagoConfirmadoAA=" + dPoll.pagoConfirmadoAA);
            
            if (dPoll.estado === "Reservado") {
                // Sheets cambió! Remover spinner y llamar callback con éxito
                clearTimeout(_verifyTimeout);
                overlay.remove();
                console.log("✅ [VERIFY] Sheets=Reservado en poll #" + pollCount + " — ÉXITO");
                onDone('RESERVADO');
            } else if (pollCount < maxPolls) {
                _pollTimer = setTimeout(poll, 3000);
            } else {
                // Agotó polls — remover spinner y llamar callback sin resultado
                clearTimeout(_verifyTimeout);
                overlay.remove();
                console.log("🚨 [VERIFY] Polls agotados (" + maxPolls + " polls en ~12s) — Sheets sigue sin cambiar");
                onDone(null);
            }
        })
        .catch(function(err) {
            console.error("❌ [VERIFY] Error poll #" + pollCount + ": " + err.message);
            if (pollCount < maxPolls) {
                _pollTimer = setTimeout(poll, 3000);
            } else {
                clearTimeout(_verifyTimeout);
                overlay.remove();
                onDone(null);
            }
        });
    }
    
    // Primer poll inmediato
    poll();
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL: TIEMPO AGOTADO (usuario no pagó a tiempo)
// Se muestra cuando el timer expiró y el usuario no completó el pago
// ═══════════════════════════════════════════════════════════════════════
function showTiempoAgotadoModal(idTurno) {
    console.log("⏰ [TIEMPO-AGOTADO] === MOSTRANDO MODAL TIEMPO AGOTADO ===");
    _sinConexionModalShown = true;
    _tiempoAgotadoShown = true;
    _connectionDetectionActive = false;
    
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    senaDiv.style.display = "block";
    
    // Detener polling activo
    stopStatusPolling();
    if(window._senaTimerId) { clearInterval(window._senaTimerId); window._senaTimerId = null; }
    
    var sinConnHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25)">';
    sinConnHtml += '<div style="font-size:3rem;margin-bottom:16px">⏳</div>';
    sinConnHtml += '<h3 style="color:#FFD700;margin-bottom:8px">Tiempo Agotado</h3>';
    sinConnHtml += '<p style="opacity:0.9;max-width:450px;margin:0 auto 16px">El tiempo de espera para completar el pago expiró. Se liberó el turno seleccionado.</p>';
    sinConnHtml += '<button id="otroTurnoBtnFinal" style="display:block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button>';
    sinConnHtml += '</div>';
    
    senaDiv.innerHTML = sinConnHtml;
    
    setTimeout(function() {
        var btn = document.getElementById('otroTurnoBtnFinal');
        if (btn) {
            btn.addEventListener('click', function() {
                console.log("🔄 [TIEMPO-AGOTADO] Usuario eligió otro turno");
                resetBookingForm();
                loadAvailableSlots();
            });
        }
    }, 100);
    
    // Liberar storage
    clearActiveTurnoStorage();
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL DE SIN CONEXIÓN (v8)
// Similar a No Exito pero adaptado para pérdida de conexión durante pago
// Se muestra cuando el usuario perdió internet justo después de pagar
// ═══════════════════════════════════════════════════════════════════════
function showSinConexionModal(idTurno, hasPaymentInAA) {
    console.log("📴 [SIN-CONN] === MOSTRANDO MODAL SIN CONEXIÓN ===");
    console.log("   - idTurno: " + idTurno + ", hasPaymentInAA: " + hasPaymentInAA);
    
    // Evitar disparos múltiples (pero SIEMPRE mostrar si es la primera vez)
    if (_sinConexionModalShown && _successShown) {
        console.log("📴 [SIN-CONN] Ya mostrado Y éxito ya visto — cancelando");
        return;
    }
    _sinConexionModalShown = true;
    
    // NO desactivar detección de conexión aquí — este modal es INTERMEDIO (tiene botón reintentar)
    // Solo se desactiva en modales FINALES: ÉXITO, NO EXITO, EXPIRADO
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) {
        console.error("❌ [SIN-CONN] senaDiv no encontrado en DOM");
        return;
    }
    senaDiv.style.display = "block";
    
    // Limpiar spinner de "Pago detectado" si está visible (v8.1)
    var spinnerEl = senaDiv.querySelector('.payment-detected-spinner');
    if (spinnerEl) {
        spinnerEl.remove();
    }
    
    // Detener polling activo
    stopStatusPolling();
    if(window._senaTimerId) { clearInterval(window._senaTimerId); window._senaTimerId = null; }
    
    // Recopilar datos del turno para el mensaje de WhatsApp
    var ddPending = getDisplayDataFromPending();
    var snap = getBookingSnapshotFromStorage();
    var nombreCliente = window._pendingSenaData ? (window._pendingSenaData.nombre || "Cliente") : "Cliente";
    
    // Usar datos disponibles (prioridad: pending → snapshot → vacío)
    var tratamiento = ddPending.tratamiento || (snap ? snap.tratamiento : "");
    var fechaRaw = ddPending.fecha || (snap ? snap.fecha : "");
    var horaInicio = ddPending.horaInicio || (snap ? snap.hora : "");
    var horaFin = ddPending.horaFin || "";
    var email = ddPending.email || (snap ? snap.email : "");
    
    // Si no hay datos de pending, intentar desde API en background
    console.log("📡 [SIN-CONN] Consultando API en background para datos actualizados...");
    fetchWithTimeout(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "dobleVerificacionMP",
            idTurno: idTurno
        })
    }, 10000)
    .then(function(r){ return r.json(); })
    .then(function(apiData) {
        console.log("📡 [SIN-CONN] API response → estado=" + apiData.estado + ", pagoConfirmadoAA=" + apiData.pagoConfirmadoAA);
        
        // Si resultó que SÍ está Reservado, mostrar éxito en lugar de modal
        if (apiData.estado === "Reservado") {
            console.log("✅ [SIN-CONN] Resulta que el turno SÍ está Reservado — mostrando éxito");
            _sinConexionModalShown = true;
            clearActiveTurnoStorage();
            
            var nombreSuc = apiData.clienteNombre || nombreCliente;
            var tratSuc = apiData.tratamiento || tratamiento;
            var fechaSuc = apiData.fecha ? formatFechaDisplay(apiData.fecha) : (ddPending.fecha || "");
            var horaSuc = apiData.horaInicio ? formatHoraDesdeSheets(apiData.horaInicio) : (horaInicio || "");
            
            showBookingSuccess(nombreSuc, tratSuc, fechaSuc, horaSuc, apiData.horaFin || "", idTurno);
            return;
        }
        
        // Actualizar datos con info de API si está disponible
        if (apiData.tratamiento) {
            tratamiento = apiData.tratamiento;
            fechaRaw = apiData.fecha || fechaRaw;
            horaInicio = apiData.horaInicio ? formatHoraDesdeSheets(apiData.horaInicio) : horaInicio;
            horaFin = apiData.horaFin ? formatHoraDesdeSheets(apiData.horaFin) : horaFin;
            email = apiData.clienteEmail || email;
        }
        
        // Si AA tiene pago confirmado, actualizar mensaje
        if (apiData.pagoConfirmadoAA && !hasPaymentInAA) {
            hasPaymentInAA = true;
        }
    })
    .catch(function(err) {
        console.log("⚠️ [SIN-CONN] Error API en background (ignorado, modal ya mostrado): " + err.message);
    });
    
    var fecha = fechaRaw ? formatFechaDisplay(fechaRaw) : "";
    
    // Construir mensaje de WhatsApp con datos del turno
    var waMsg;
    if (tratamiento && fecha) {
        var baseMsg = 'Hola! Pagué pero quedé sin conexión al confirmar mi reserva.\n';
        baseMsg += 'Mi nombre: ' + nombreCliente + '.\n';
        baseMsg += 'Quería reservar: ' + tratamiento + ' el ' + fecha + ' de ' + horaInicio + ' a ' + horaFin + '.';
        if (email) baseMsg += '\nEmail: ' + email;
        baseMsg += '\nYa revisé mi correo (incluido SPAM) y no llegó confirmación.';
        baseMsg += '\nAdjunto comprobante para completar mi reserva.';
        waMsg = encodeURIComponent(baseMsg);
    } else {
        var baseMsg2 = 'Hola! Pagué pero quedé sin conexión al confirmar mi reserva.\n';
        baseMsg2 += 'Mi nombre: ' + nombreCliente + '.\n';
        baseMsg2 += 'Ya revisé mi correo (incluido SPAM) y no llegó confirmación.';
        baseMsg2 += '\nAdjunto comprobante para completar mi reserva.';
        waMsg = encodeURIComponent(baseMsg2);
    }
    
    var waLink = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + waMsg;
    
    // Construir HTML del modal — adaptado para pérdida de conexión
    var sinConnHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25)">';
    sinConnHtml += '<div style="font-size:3rem;margin-bottom:16px">📴</div>';
    sinConnHtml += '<h3 style="color:#FFD700;margin-bottom:8px">Turno no confirmado por error de conexión</h3>';
    sinConnHtml += '<p style="opacity:0.9;max-width:450px;margin:0 auto 16px">Perdimos la conexión al intentar verificar tu pago. <strong>No sabemos si el pago se completó</strong>.</p>';
    sinConnHtml += '<p style="opacity:0.85;font-size:0.9rem;margin-bottom:16px">No te preocupes, escribinos por WhatsApp con los datos de tu reserva y lo resolvemos al instante.</p>';
    
    if (tratamiento && fecha) {
        sinConnHtml += '<div style="background:rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin:0 auto 16px;max-width:400px;text-align:left;font-size:0.85rem;line-height:1.6">';
        sinConnHtml += '<p style="margin:0 0 4px;opacity:0.7;font-size:0.75rem;text-transform:uppercase;letter-spacing:1px">Tu reserva</p>';
        if (tratamiento) sinConnHtml += '<p style="margin:0 0 4px"><strong>Tratamiento:</strong> ' + tratamiento + '</p>';
        if (fecha) sinConnHtml += '<p style="margin:0 0 4px"><strong>Fecha:</strong> ' + fecha;
        if (horaInicio) sinConnHtml += ' de ' + horaInicio;
        if (horaFin) sinConnHtml += ' a ' + horaFin;
        sinConnHtml += '</p>';
        if (nombreCliente && nombreCliente !== "Cliente") sinConnHtml += '<p style="margin:0"><strong>Nombre:</strong> ' + nombreCliente + '</p>';
        sinConnHtml += '</div>';
    }
    
    sinConnHtml += '<p style="opacity:0.7;font-size:0.8rem;margin-bottom:16px">Si tenes el comprobante de pago, envianoslo por WhatsApp (puede ser captura de pantalla).</p>';
    sinConnHtml += '<a href="' + waLink + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-bottom:10px;font-weight:600">📱 Enviar comprobante por WhatsApp</a><br>';
    sinConnHtml += '<button id="reintentarBtnSinConn" style="display:inline-block;margin:0 auto 8px;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Reintentar conexión</button><br>';
    sinConnHtml += '<button onclick="location.reload()" style="display:inline-block;margin:0 auto;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button>';
    sinConnHtml += '</div>';
    
    senaDiv.innerHTML = sinConnHtml;
    
    // Botón de reintentar manualmente (solo si no excedimos los reintentos)
    setTimeout(function() {
        var btn = document.getElementById('reintentarBtnSinConn');
        if (btn) {
            btn.addEventListener('click', function() {
                _sinConnRetryCount++;
                console.log("🔄 [SIN-CONN] Reintento manual activado (intento " + _sinConnRetryCount + "/" + _maxSinConnRetries + ")");
                
                // Limpiar cualquier spinner de verificación activo
                var verifyingOverlay = document.querySelector('.verifying-spinner-overlay');
                if (verifyingOverlay) verifyingOverlay.remove();
                
                // Si excedimos los reintentos, mostrar Tiempo Agotado en lugar de reintentar
                if (_sinConnRetryCount >= _maxSinConnRetries) {
                    console.log("🚫 [SIN-CONN] Reintentos agotados (" + _maxSinConnRetries + ") — mostrando Tiempo Agotado");
                    _sinConexionModalShown = true;
                    _tiempoAgotadoShown = true;
                    _connectionDetectionActive = false;
                    showTiempoAgotadoModal(idTurno);
                    return;
                }
                
                // Resetear flags para permitir nueva verificación
                _sinConexionModalShown = false;
                _verifyingConnection = false;
                verificarYMostrarResultadoPorConexion(idTurno);
            });
        }
    }, 100);
    
    // NO liberar storage aquí — el evento 'online' necesita el turno activo
    // Se libera cuando hay éxito confirmado o el usuario recarga la página.
}

// Resetear contador de reintentos cuando el usuario empieza un nuevo flujo
function resetSinConnRetryCount() {
    _sinConnRetryCount = 0;
}