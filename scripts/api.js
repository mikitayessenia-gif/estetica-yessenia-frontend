// Cargar configuración desde Google Sheets al iniciar
function loadConfigFromAPI() {
    return fetch(API_URL + "?action=obtenerConfiguracion&token=" + encodeURIComponent(API_TOKEN))
        .then(function(r){return r.json()})
        .then(function(data) {
            if (data.error && data.error.includes("infringen las reglas de validaci")) {
                console.error("ERROR CRITICO: Validacion de datos bloquea la API.", data.error);
                CONFIG_LOADED = true;
                return;
            }
            if (data.config) {
                CONFIG_LOADED = true;
                if (data.config.Tiempo_Expiracion_Reserva_Minutos) {
                    TIEMPO_EXPIRACION_RESERVA_MINUTOS = Number(data.config.Tiempo_Expiracion_Reserva_Minutos);
                    console.log("Configuracion cargada: expiracion =", TIEMPO_EXPIRACION_RESERVA_MINUTOS, "minutos");
                }
            }
        })
        .catch(function() {
            CONFIG_LOADED = true;
            console.log("No se pudo cargar configuracion desde API, usando valor por defecto (10 min)");
        });
}

function verificarEstadoTurno(idTurno) {
    var url = API_URL + '?action=verificarTurno&idTurno=' + encodeURIComponent(idTurno) + '&token=' + encodeURIComponent(API_TOKEN);
    console.log("📡 [API] verificarEstadoTurno → " + idTurno);
    return fetch(url)
        .then(function(r){return r.json()})
        .then(function(data) {
            console.log("📡 [API] Response verificarEstadoTurno: " + JSON.stringify({id: data.id, estado: data.estado, clienteNombre: data.clienteNombre, tratamiento: data.tratamiento, fecha: data.fecha, horaInicio: data.horaInicio, horaFin: data.horaFin}));
            return data;
        })
        .catch(function(err) {
            console.error('❌ [API] Error verificando turno:', err);
            return { error: err.toString() };
        });
}

function releaseStoredTurno(idTurno) {
    fetch(API_URL, {method:"POST", body:JSON.stringify({token:API_TOKEN, action:"cancelarReservaTemporal", idTurno:idTurno})}).catch(function(){});
}

// ========== VERIFICAR RESERVA ACTIVA POR EMAIL O TELEFONO (detectar pre-reserva al recargar pagina) ==========
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

// ========== CREAR NUEVA PREFERENCIA MP AL RESTAURAR SESION (evitar webhook expirado) ==========
function crearNuevaPreferenciaMP(idTurno) {
    return fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "crearNuevaPreferencia",
            idTurno: idTurno
        })
    })
    .then(function(r){return r.json()})
    .then(function(data) { return data; })
    .catch(function(err) {
        console.error('Error creando nueva preferencia MP:', err);
        return { error: err.toString() };
    });
}

// ========== Polling: Fase 1 (cada 5s buscando Reservado) + Fase 2 (AA detectado → 12s, cada 3s) ==========
var _statusPollInterval = null;
var _confirmadoLocalmente = false;
var _aaDetectedAt = null; // timestamp cuando se detectó AA por primera vez
var _aaPollTimer = null; // timer independiente para la fase 2 (12s con polls cada 3s)
var _aaPhaseInterval = null; // interval de polls dentro de fase 2
var POLLING_INTERVAL_MS = 5000;
var _consecutiveFailures = 0; // contador de fallos consecutivos por conexión (v8)
var _maxConsecutiveFailures = 3; // mostrar modal sin conexión tras 3 fallos (~15s)

function startStatusPolling(idTurno, onNoExito) {
    console.log("🔄 [POLLING] === INICIANDO POLLING FASE 1 (cada 5s buscando Reservado) ===");
    console.log("   - idTurno: " + idTurno);
    
    if (_statusPollInterval) clearInterval(_statusPollInterval);
    if (_aaPollTimer) clearTimeout(_aaPollTimer);
    if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
    _aaPhaseInterval = null;
    _confirmadoLocalmente = false;
    _aaDetectedAt = null;
    _consecutiveFailures = 0; // Reset contador de fallos (v8)
    
    // Primera consulta inmediata con DOBLE VERIFICACION
    doDobleVerificacionCheck(idTurno, onNoExito, true);
    
    // Consultas cada 5 segundos buscando "Reservado" en fase 1
    _statusPollInterval = setInterval(function() {
        if (_confirmadoLocalmente) {
            console.log("✅ [POLLING] _confirmadoLocalmente=true — deteniendo polling");
            clearInterval(_statusPollInterval);
            _statusPollInterval = null;
            return;
        }
        doDobleVerificacionCheck(idTurno, onNoExito, false);
    }, POLLING_INTERVAL_MS);
}

// ========== Helper principal: ejecutar doble verificacion y procesar resultado ==========
function doDobleVerificacionCheck(idTurno, onNoExito, isFirst) {
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "dobleVerificacionMP",
            idTurno: idTurno
        })
    })
    .then(function(r){return r.json()})
    .then(function(data) {
        if (data.error || data.encontrado === false) return;
        
        console.log("🔄 [POLLING] Check → estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
        
        // Actualizar snapshot localStorage con datos frescos de Sheets
        try {
            var existingSnap = localStorage.getItem("yessenia_booking_snapshot");
            if (existingSnap) {
                var snap = JSON.parse(existingSnap);
                // Actualizar solo campos que la API puede tener (nombre, email) - no sobreescribir tratamiento/fecha/hora del frontend
                if (data.clienteNombre && data.clienteNombre !== "" && data.clienteNombre !== "Cliente") {
                    snap.nombre = data.clienteNombre;
                }
                if (data.clienteEmail && data.clienteEmail !== "") {
                    snap.email = data.clienteEmail;
                }
                snap.timestamp = Date.now();
                snap.source = 'api_poll';
                localStorage.setItem("yessenia_booking_snapshot", JSON.stringify(snap));
            }
        } catch(e) {}
        
        // BUGFIX #5: Si éxito ya fue mostrado, no seguir pollando
        if (_successShown) {
            console.log("🛑 [POLLING] _successShown=true — deteniendo polling");
            clearInterval(_statusPollInterval);
            _statusPollInterval = null;
            if (_aaPollTimer) clearTimeout(_aaPollTimer);
            _aaPollTimer = null;
            if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
            return;
        }
        
        // ═══════════════════════════════════════════════════
        // FASE 1: Buscar "Reservado" — éxito inmediato sin esperar
        // ═══════════════════════════════════════════════════
        if (data.estado === "Reservado") {
            console.log("✅ [POLLING] SHEETS=Reservado — turno confirmado!");
            _confirmadoLocalmente = true;
            
            clearInterval(_statusPollInterval);
            _statusPollInterval = null;
            if (_aaPollTimer) clearTimeout(_aaPollTimer);
            _aaPollTimer = null;
            if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
            
            stopStatusPolling();
            clearActiveTurnoStorage();
            if(window._senaTimerId) {
                clearInterval(window._senaTimerId);
                window._senaTimerId = null;
            }
            
            showBookingSuccess(
                window._pendingSenaData ? window._pendingSenaData.nombre : (data.clienteNombre || "Cliente"),
                window._pendingSenaData ? window._pendingSenaData.tratamiento : "",
                window._pendingSenaData ? window._pendingSenaData.fecha : "",
                window._pendingSenaData ? window._pendingSenaData.hora : "",
                data.horaFin || "", idTurno
            );
            return;
        }
        
        // ═══════════════════════════════════════════════════
        // DETECCIÓN DE PAGO EN AA → iniciar Fase 2 (12s de polling cada 3s)
        // ═══════════════════════════════════════════════════
        if (data.pagoConfirmadoAA && !_aaDetectedAt) {
            _aaDetectedAt = Date.now();
            console.log("💳 [POLLING] Pago confirmado en AA detectado — DETENIENDO Phase 1, iniciando Fase 2 (12s, polls cada 3s)");
            
            // Mostrar spinner de carga "Pago detectado — confirmando..."
            showPaymentDetectedSpinner(idTurno);
            
            // DETENER Phase 1 inmediatamente - ya no necesitamos polls cada 5s
            if (_statusPollInterval) {
                clearInterval(_statusPollInterval);
                _statusPollInterval = null;
                console.log("   - Phase 1 detenido (poll cada 5s) — ahora solo Phase 2");
            }
            
            // Iniciar ventana de 12 segundos con polls cada 3s
            startAAPollingPhase(idTurno, onNoExito);
        }
        
        // ═══════════════════════════════════════════════════
        // Turno liberado (Disponible o Vencido Sin Confirmar)
        // ═══════════════════════════════════════════════════
        if (data.estado === "Disponible" || data.estado === "Vencido Sin Confirmar") {
            console.log("📢 [POLLING] Estado=" + data.estado + " — turno liberado");
            clearInterval(_statusPollInterval);
            _statusPollInterval = null;
            if (_aaPollTimer) clearTimeout(_aaPollTimer);
            _aaPollTimer = null;
            if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
            
            var senaDiv2 = document.getElementById("senaRequired");
            if (!senaDiv2) return;
            
            if (window._pendingSenaData && window._pendingSenaData.idTurno === idTurno) {
                console.log("❌ [POLLING] Nuestro turno se liberó — mostrando Tiempo Agotado");
                if (window._senaTimerId) {
                    clearInterval(window._senaTimerId);
                    window._senaTimerId = null;
                }
                clearActiveTurnoStorage();
                
                var libHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">';
                libHtml += '<div style="font-size:3rem;margin-bottom:16px">⏳</div>';
                libHtml += '<h3 style="color:#FFD700;margin-bottom:12px">Tiempo Agotado</h3>';
                libHtml += '<p style="opacity:0.9;margin-bottom:8px">Tu tiempo para pagar expiró y el turno ya no está disponible.</p>';
                libHtml += '<p style="opacity:0.7;font-size:0.9rem;margin-bottom:16px">Alguien más lo tomó o nadie lo confirmó a tiempo.</p>';
                libHtml += '<button id="otroTurnoBtn2" style="display:block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button>';
                libHtml += '</div>';
                senaDiv2.innerHTML = libHtml;
                
                setTimeout(function(){
                    var btn = document.getElementById("otroTurnoBtn2");
                    if(btn) btn.addEventListener("click", function(){
                        resetBookingForm();
                        loadAvailableSlots();
                    });
                }, 100);
            }
            return;
        }
        
        // Fase 1 normal — esperando que Sheets actualice o AA se llene
        console.log("⏳ [POLLING] Esperando — estado=" + data.estado + ", pagó=" + data.pagoConfirmadoAA);
        
        // Reset contador de fallos en respuesta exitosa
        if (_consecutiveFailures > 0) {
            console.log("✅ [POLLING] Fallos consecutivos reseteados (era: " + _consecutiveFailures + ")");
            _consecutiveFailures = 0;
        }
    })
    .catch(function(err) {
        _consecutiveFailures++;
        console.error("❌ [POLLING] Error en dobleVerificacionMP (falló #" + _consecutiveFailures + "/" + _maxConsecutiveFailures + "): " + err.message);
        
        // Después de 3 fallos consecutivos (~15s), asumir problema de conexión
        if (_consecutiveFailures >= _maxConsecutiveFailures) {
            console.log("🚨 [POLLING] " + _maxConsecutiveFailures + " fallos consecutivos — mostrando modal sin conexión");
            
            // Detener polling
            clearInterval(_statusPollInterval);
            _statusPollInterval = null;
            if (_aaPollTimer) clearTimeout(_aaPollTimer);
            _aaPollTimer = null;
            if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
            
            // Mostrar modal de sin conexión (si la función existe en mp-handler.js)
            if (typeof showSinConexionModal === 'function') {
                showSinConexionModal(idTurno, false);
            } else {
                console.warn("⚠️ [POLLING] showSinConexionModal no disponible — mostrando No Exito");
                if (onNoExito && !_successShown) {
                    onNoExito(idTurno);
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════
// FASE 2: AA detectado — ventana de 12s, poll cada 3s
// El último poll se hace cuando quedan ~3s para expirar
// ═══════════════════════════════════════════════════
function startAAPollingPhase(idTurno, onNoExito) {
    var phaseDuration = 12000; // 12 segundos
    var pollInterval = 3000;   // cada 3 segundos
    var pollsDone = 0;
    
    console.log("⏱️ [POLLING-FASE2] Ventana de " + (phaseDuration/1000) + "s iniciada — polls cada " + (pollInterval/1000) + "s");
    
    // Primer poll inmediato dentro de la fase 2
    performAAPoll(idTurno, onNoExito);
    
    // Polls subsiguientes cada 3s
    _aaPhaseInterval = setInterval(function() {
        pollsDone++;
        var remainingTime = phaseDuration - ((pollsDone + 1) * pollInterval);
        console.log("🔄 [POLLING-FASE2] Poll #" + (pollsDone + 1) + " — quedan ~" + Math.max(0, remainingTime/1000) + "s antes de expirar");
        
        // Cuando queda ~3s para expirar → último poll (antes de que el timer principal muestre expirado)
        if (remainingTime <= 3000) {
            console.log("⚠️ [POLLING-FASE2] Último poll — quedan menos de 3s, verificando estado final antes de decidir");
        }
        
        performAAPoll(idTurno, onNoExito);
    }, pollInterval);
    
    // Timer principal: al expirar los 12s, si no se resolvió → hacer último check y decidir
    _aaPollTimer = setTimeout(function() {
        if (_aaPhaseInterval) {
            clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
        }
        console.log("⏰ [POLLING-FASE2] Ventana de 12s expirada — realizando última verificación");
        
        // Última consulta antes de decidir
        fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                token: API_TOKEN,
                action: "dobleVerificacionMP",
                idTurno: idTurno
            })
        })
        .then(function(r){ return r.json(); })
        .then(function(finalData) {
            console.log("📡 [POLLING-FASE2] Última consulta → estado=" + finalData.estado + ", pagoConfirmadoAA=" + finalData.pagoConfirmadoAA);
            
            if (finalData.estado === "Reservado") {
                console.log("✅ [POLLING-FASE2] SHEETS=Reservado en último check — webhook llegó tarde, mostrando éxito");
                _confirmadoLocalmente = true;
                clearInterval(_statusPollInterval);
                _statusPollInterval = null;
                clearActiveTurnoStorage();
                if(window._senaTimerId) { clearInterval(window._senaTimerId); window._senaTimerId = null; }
                
                showBookingSuccess(
                    window._pendingSenaData ? window._pendingSenaData.nombre : (finalData.clienteNombre || "Cliente"),
                    window._pendingSenaData ? window._pendingSenaData.tratamiento : "",
                    window._pendingSenaData ? window._pendingSenaData.fecha : "",
                    window._pendingSenaData ? window._pendingSenaData.hora : "",
                    finalData.horaFin || "", idTurno
                );
            } else {
                // Sheets no Reservado — decidir según si pagó o no
                if (finalData.pagoConfirmadoAA) {
                    console.log("💳 [POLLING-FASE2] Pago en AA pero Sheets≠Reservado — NO EXITO con advertencia de pago");
                } else {
                    console.log("🚨 [POLLING-FASE2] Sin confirmación en 12s — turno expiró sin pago");
                }
                // BUGFIX #5: No llamar onNoExito si éxito ya fue mostrado
                if (onNoExito && !_successShown) {
                    console.log("📢 [POLLING-FASE2] Llamando onNoExito...");
                    onNoExito(idTurno);
                } else if (_successShown) {
                    console.log("🛑 [POLLING-FASE2] _successShown=true — saltando onNoExito");
                }
            }
        })
        .catch(function(err) {
            console.error("❌ [POLLING-FASE2] Error última consulta: " + err.message);
            _consecutiveFailures++;
            
            // Si el fallo es por conexión, mostrar modal sin conexión (v8)
            var isConnError = err.message && (
                err.message.includes('Failed to fetch') || 
                err.message.includes('TIMEOUT') ||
                err.message.includes('network') ||
                err.message.includes('NetworkError')
            );
            
            if (isConnError || _consecutiveFailures >= _maxConsecutiveFailures) {
                console.log("📴 [POLLING-FASE2] Error de conexión detectado — mostrando modal sin conexión");
                if (typeof showSinConexionModal === 'function') {
                    showSinConexionModal(idTurno, false);
                } else if (onNoExito && !_successShown) {
                    onNoExito(idTurno);
                }
            } else {
                // BUGFIX #5: No llamar onNoExito si éxito ya fue mostrado
                if (onNoExito && !_successShown) {
                    onNoExito(idTurno);
                } else if (_successShown) {
                    console.log("🛑 [POLLING-FASE2] _successShown=true — saltando onNoExito");
                }
            }
        });
    }, phaseDuration);
}

// Realiza un poll dentro de la fase 2 y verifica resultado
function performAAPoll(idTurno, onNoExito) {
    fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
            token: API_TOKEN,
            action: "dobleVerificacionMP",
            idTurno: idTurno
        })
    })
    .then(function(r){ return r.json(); })
    .then(function(data) {
        console.log("📡 [POLLING-FASE2] Poll → estado=" + data.estado + ", pagoConfirmadoAA=" + data.pagoConfirmadoAA);
        
        // Reset contador de fallos en respuesta exitosa (v8)
        if (_consecutiveFailures > 0) {
            console.log("✅ [POLLING-FASE2] Fallos consecutivos reseteados (era: " + _consecutiveFailures + ")");
            _consecutiveFailures = 0;
        }
        
        // Si Sheets se actualizó a Reservado → éxito inmediato, sin esperar más
        if (data.estado === "Reservado") {
            console.log("✅ [POLLING-FASE2] SHEETS=Reservado — turno confirmado!");
            _confirmadoLocalmente = true;
            
            if (_aaPollTimer) clearTimeout(_aaPollTimer);
            _aaPollTimer = null;
            if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
            
            clearActiveTurnoStorage();
            if(window._senaTimerId) { clearInterval(window._senaTimerId); window._senaTimerId = null; }
            
            showBookingSuccess(
                window._pendingSenaData ? window._pendingSenaData.nombre : (data.clienteNombre || "Cliente"),
                window._pendingSenaData ? window._pendingSenaData.tratamiento : "",
                window._pendingSenaData ? window._pendingSenaData.fecha : "",
                window._pendingSenaData ? window._pendingSenaData.hora : "",
                data.horaFin || "", idTurno
            );
        }
        // Si el turno se liberó → tiempo agotado
        else if (data.estado === "Disponible" || data.estado === "Vencido Sin Confirmar") {
            console.log("📢 [POLLING-FASE2] Estado=" + data.estado + " — turno liberado");
            if (_aaPollTimer) clearTimeout(_aaPollTimer);
            _aaPollTimer = null;
            if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
        }
        // Ni Reservado ni liberado → seguir esperando (webhook puede llegar en cualquier momento)
    })
    .catch(function(err) {
        _consecutiveFailures++;
        console.error("❌ [POLLING-FASE2] Error poll (falló #" + _consecutiveFailures + "/" + _maxConsecutiveFailures + "): " + err.message);
        
        // Después de 3 fallos consecutivos en Fase 2, mostrar modal sin conexión
        if (_consecutiveFailures >= _maxConsecutiveFailures) {
            console.log("🚨 [POLLING-FASE2] " + _maxConsecutiveFailures + " fallos en Fase 2 — mostrando modal sin conexión");
            
            if (_aaPollTimer) clearTimeout(_aaPollTimer);
            _aaPollTimer = null;
            if (_aaPhaseInterval) clearInterval(_aaPhaseInterval);
            _aaPhaseInterval = null;
            
            // Mostrar modal de sin conexión
            if (typeof showSinConexionModal === 'function') {
                showSinConexionModal(idTurno, false);
            } else if (onNoExito && !_successShown) {
                onNoExito(idTurno);
            }
        }
    });
}

function stopStatusPolling() {
    console.log("🛑 [POLLING] === DETINIENDO POLLING ===");
    if (_statusPollInterval) {
        clearInterval(_statusPollInterval);
        _statusPollInterval = null;
        console.log("   - Interval fase 1 limpiado");
    }
    if (_aaPollTimer) {
        clearTimeout(_aaPollTimer);
        _aaPollTimer = null;
        console.log("   - Timer fase 2 limpiado");
    }
    if (_aaPhaseInterval) {
        clearInterval(_aaPhaseInterval);
        _aaPhaseInterval = null;
        console.log("   - Interval fase 2 polls limpiado");
    }
    // Reset contador de fallos al detener polling (v8)
    _consecutiveFailures = 0;
}

var treatmentsLoaded = false;

function loadTreatmentsFromAPI() {
    fetch(API_URL + "?action=obtenerTratamientos&token=" + encodeURIComponent(API_TOKEN))
        .then(function(r){return r.json()})
        .then(function(data) {
            // Detectar error de validacion de datos de Google Sheets
            if (data.error && data.error.includes("infringen las reglas de validaci")) {
                console.error("ERROR CRITICO: Regla de validacion en Google Sheets bloquea la API.", data.error);
                ALL_TREATMENTS = [];
                treatmentsLoaded = true;
                renderServicesFromData();
                populateTreatmentSelect();
                renderFooterTratamientos([]);
                // Mostrar aviso visible
                var senaDiv = document.getElementById("senaRequired");
                if (senaDiv) {
                    senaDiv.style.display = "block";
                    senaDiv.innerHTML = '<div style="background:rgba(255,193,7,0.15);border:2px solid #ffc107;border-radius:16px;padding:24px;text-align:center"><div style="font-size:2rem;margin-bottom:12px">⚠️</div><h3 style="color:#ffc107;margin-bottom:8px">Error de configuracion del servidor</h3><p style="opacity:0.9;font-size:0.9rem;max-width:450px;margin:0 auto 16px">La agenda necesita una actualizacion rapida en Google Sheets.</p><a href="tel:' + CONFIG.negocio.telefonoRaw + '" target="_blank" style="display:inline-block;background:#003366;color:white;padding:12px 24px;border-radius:50px;text-decoration:none;font-weight:600">📞 Contactar por Telefono</a></div>';
                }
                return;
            }
            if (data.tratamientos && data.tratamientos.length) {
                ALL_TREATMENTS = data.tratamientos.map(function(t) {
                    var precioStr = "$" + Number(t.precio).toLocaleString("es-AR");
                    var catRaw = (t.categoria || "").trim();
                    var catSlug = "";
                    if (catRaw) {
                        catSlug = catRaw.toLowerCase().replace(/\s+/g, '');
                    }
                    if (!catSlug) catSlug = 'all';
                    return {
                        id: t.id, nombre: t.nombre, precio: t.precio,
                        precioDisplay: precioStr, duracionFilas: t.duracionFilas || 1,
                        duracionTexto: t.duracionTexto || "2 horas",
                        linkSena: t.linkSena || "",
                        imagen: t.imagen || "", descripcionLarga: t.descripcionLarga || "",
                        descripcionCorta: t.descripcionCorta || "",
                        badge: t.badge || "", category: catSlug,
                        reservaManual: t.reservaManual !== false,
                        msjWs: t.msjWs || "",
                        colorBorde: t.colorBorde || "",
                        esSoloWhatsApp: (t.reservaManual === false)
                    };
                });
            } else {
                console.warn("API devolvio tratamientos vacios. Mostrando mensaje de carga.");
                ALL_TREATMENTS = [];
            }
            treatmentsLoaded = true;
            renderCategoryButtons(data.tratamientos);
            renderServicesFromData();
            populateTreatmentSelect();
            renderFooterTratamientos(data.tratamientos);
        })
        .catch(function() { 
            console.warn("Error cargando tratamientos desde API.");
            ALL_TREATMENTS = [];
            treatmentsLoaded = true;
            renderFooterTratamientos([]);
        });

    // If fetch takes too long, show message instead of wrong fallback data
    setTimeout(function() {
        if (!treatmentsLoaded) {
            treatmentsLoaded = true;
            console.warn("API tardó mucho en responder. Mostrando mensaje de espera.");
            ALL_TREATMENTS = [];
            renderServicesFromData();
            populateTreatmentSelect();
            renderFooterTratamientos([]);
            // Show error in the treatment select dropdown
   var sel = document.getElementById("treatmentSelect");
            if (sel) {
                sel.innerHTML = '<option value="">Seleccioná un tratamiento</option>';
            }
            // No mostrar tarjeta grande — el mensaje sutil de booking.js (showError) ya se encarga
        }
    }, 8000);
}

// Render footer treatments list dynamically from API data
function renderFooterTratamientos(tratamientos) {
    var container = document.getElementById("footerTratamientosList");
    if (!container) return;
    
    if (!tratamientos || tratamientos.length === 0) {
        container.innerHTML = '<li><a href="#servicios">Consultanos por WhatsApp</a></li>';
        return;
    }
    
    var html = '';
    tratamientos.forEach(function(t) {
        var id = t.id || '';
        if (id) {
            html += '<li><a href="javascript:void(0)" onclick="window.scrollToTreatmentCard(\'' + id + '\');return false;">' + (t.nombre || '') + '</a></li>';
        } else {
            html += '<li><a href="#servicios">' + (t.nombre || '') + '</a></li>';
        }
    });
    container.innerHTML = html;
    
    // Attach hover and click handlers to mark active link for hashchange detection
    var links = container.querySelectorAll('a[data-scroll-to]');
    links.forEach(function(link) {
        link.addEventListener('mouseenter', function() {
            this.classList.add('active-link');
        });
        link.addEventListener('mouseleave', function() {
            this.classList.remove('active-link');
        });
        link.addEventListener('click', function(e) {
            // Mark as active before navigation happens
            links.forEach(function(l) { l.classList.remove('active-link'); });
            this.classList.add('active-link');
        });
    });
}

// Scroll to a specific treatment card and highlight it
function scrollToTreatmentCard(treatmentId) {
    var card = document.querySelector('.service-card[data-treatment-id="' + treatmentId + '"]');
    if (!card) return;
    
    // Wait for services grid to be visible (it might be collapsed)
    var serviciosSection = document.getElementById('servicios');
    if (serviciosSection) {
        serviciosSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    setTimeout(function() {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight the card with a flash effect
        card.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
        card.style.boxShadow = '0 0 0 3px #C4A16D, 0 8px 32px rgba(196, 161, 109, 0.4)';
        card.style.transform = 'scale(1.03)';
        
        setTimeout(function() {
            card.style.boxShadow = '';
            card.style.transform = '';
        }, 2500);
    }, 400);
}

// Expose globally for use from main.js
window.scrollToTreatmentCard = scrollToTreatmentCard;

// Render category filter buttons dynamically from treatments data
function renderCategoryButtons(tratamientos) {
    var container = document.querySelector(".services-filters");
    if (!container) return;
    
    // Extract unique categories preserving order, with proper capitalization
    // Only include meaningful categories (at least 2 chars, not empty/whitespace)
    var catSet = [];
    var catLowerSet = new Set();
    tratamientos.forEach(function(t) {
        var cat = (t.categoria || "").trim();
        if (!cat || cat.length < 2) return; // Skip empty or too-short categories
        var catLower = cat.toLowerCase();
        if (!catLowerSet.has(catLower)) {
            catLowerSet.add(catLower);
            catSet.push({ nombre: cat, slug: catLower.replace(/\s+/g, '') });
        }
    });
    
    var html = '<button class="filter-btn active" data-filter="all">Todos</button>';
    catSet.forEach(function(c) {
        html += '<button class="filter-btn" data-filter="' + c.slug + '">' + c.nombre + '</button>';
    });
    container.innerHTML = html;
    
    // Re-attach filter listeners
    var filterBtns = document.querySelectorAll(".filter-btn");
    filterBtns.forEach(function(btn) { 
        btn.addEventListener("click", function() { 
            filterBtns.forEach(function(b){ b.classList.remove("active"); }); 
            btn.classList.add("active"); 
            var f = btn.dataset.filter; 
            var serviceCards = document.querySelectorAll(".service-card");
            serviceCards.forEach(function(card){
                var cat = card.dataset.category || '';
                if (f === "all" || cat === "all") {
                    card.style.display = "block";
                } else if (cat.includes(f)) {
                    card.style.display = "block";
                } else {
                    card.style.display = "none";
                }
            }); 
        }); 
    });
}

// ====================================================
// SNAPSHOT: obtener datos persistentes del booking desde localStorage
// Se usa como fallback cuando la API no tiene datos (fila borrada por lazyCleanup)
// Devuelve { idTurno, nombre, email, tratamiento, fecha, hora, horaFin, montoSena, timestamp, source }
// ====================================================
function getBookingSnapshotFromStorage() {
    try {
        var snapStr = localStorage.getItem("yessenia_booking_snapshot");
        if (snapStr) {
            var snap = JSON.parse(snapStr);
            // Validar que no sea demasiado viejo (> 24 horas)
            if (snap.timestamp && (Date.now() - snap.timestamp) < 86400000) {
                console.log("📦 [SNAPSHOT] Cargado de localStorage:", JSON.stringify(snap));
                return snap;
            } else {
                console.log("🗑️ [SNAPSHOT] Snapshot expirado (>24h), eliminando");
                localStorage.removeItem("yessenia_booking_snapshot");
            }
        }
    } catch(e) {
        console.error("❌ [SNAPSHOT] Error leyendo localStorage:", e);
    }
    return null;
}

// ═══════════════════════════════════════════════════
// SPINNER: "Pago detectado — confirmando..." (igual que pasarela MP)
// Se muestra cuando AA tiene pago pero Sheets aún no actualizó
// ═══════════════════════════════════════════════════
function showPaymentDetectedSpinner(idTurno) {
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    
    // Si ya tiene el spinner, no reemplazar
    if (senaDiv.querySelector('.payment-detected-spinner')) return;
    
    senaDiv.style.display = "block";
    
    var spinnerHtml = '<div style="background:rgba(0,80,80,0.2);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25)" class="payment-detected-spinner">';
    spinnerHtml += '<div style="font-size:3rem;margin-bottom:16px">⏳</div>';
    spinnerHtml += '<h3 style="color:#FFD700;margin-bottom:8px;font-size:1.4rem">Pago detectado — confirmando...</h3>';
    spinnerHtml += '<p style="opacity:0.9;margin-bottom:16px;color:rgba(255,255,255,0.9)">Detectamos tu pago pero la agenda aún no se actualizó.<br>Estamos forzando la confirmación...</p>';
    spinnerHtml += '<div class="spinner" style="margin:20px auto"></div></div>';
    
    senaDiv.innerHTML = spinnerHtml;
    
    console.log("⏳ [SPINNER] Mostrando 'Pago detectado — confirmando...' para turno " + idTurno);
}

