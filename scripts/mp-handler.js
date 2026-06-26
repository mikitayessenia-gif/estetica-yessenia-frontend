// ========== Date/Time Formatters ==========
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
        sessionStorage.removeItem(STORAGE_KEY_ACTIVE_TURN);
        sessionStorage.removeItem(STORAGE_KEY_EXPIRY_TS);
        sessionStorage.removeItem("yessenia_preference_id");
        sessionStorage.removeItem("yessenia_init_point");
        sessionStorage.removeItem("yessenia_monto_sena");
    } catch(e) {}
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
    showPreReservationLoader();
    
    var data = getStoredTurnoData();
    if (!data) {
        hidePreReservationLoader();
        return false;
    }
    
    var now = Date.now();
    var remainingMs = data.expiryTime - now;
    
    if (remainingMs <= 0) {
        console.log("Timer local expirado, verificando si webhook ya confirmó turno:", data.idTurno);
        return verificarEstadoTurno(data.idTurno)
            .then(function(apiData) {
                hidePreReservationLoader();
                if (apiData.estado === 'Reservado' && apiData.id && apiData.id.toString().trim() === data.idTurno.toString().trim()) {
                    console.log("Webhook ya confirmó el turno al expirar timer local, mostrando éxito");
                    clearActiveTurnoStorage();
                    stopStatusPolling();
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    window._senaTimerId = null;
                    
                    var nombreSuccess = (window._pendingSenaData && window._pendingSenaData.nombre) ? window._pendingSenaData.nombre : (apiData.clienteNombre || "Cliente");
                    var tratSuccess = (window._pendingSenaData && window._pendingSenaData.tratamiento) ? window._pendingSenaData.tratamiento : (apiData.tratamiento || "");
                    
                    var fechaSuccess = (window._pendingSenaData && window._pendingSenaData.fecha) ? window._pendingSenaData.fecha : (apiData.fecha ? formatFechaDisplay(apiData.fecha) : "");
                    var horaSuccess = (window._pendingSenaData && window._pendingSenaData.hora) ? window._pendingSenaData.hora : (apiData.horaInicio ? formatHoraDisplay(apiData.horaInicio) : "no definido");
                    
                    showBookingSuccess(nombreSuccess, tratSuccess, fechaSuccess, horaSuccess);
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
                if (apiData.id && apiData.id.toString().trim() === data.idTurno.toString().trim()) {
                    console.log("Turno ya confirmado al restaurar desde storage, liberando...");
                    clearActiveTurnoStorage();
                    stopStatusPolling();
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    window._senaTimerId = null;
                    var nombreSuc = (window._pendingSenaData && window._pendingSenaData.nombre) ? window._pendingSenaData.nombre : (apiData.clienteNombre || "Cliente");
                    var tratSuc = (window._pendingSenaData && window._pendingSenaData.tratamiento) ? window._pendingSenaData.tratamiento : (apiData.tratamiento || "");
                    
                    var fechaSuc = (window._pendingSenaData && window._pendingSenaData.fecha) ? window._pendingSenaData.fecha : (apiData.fecha ? formatFechaDisplay(apiData.fecha) : "");
                    var horaSuc = (window._pendingSenaData && window._pendingSenaData.hora) ? window._pendingSenaData.hora : (apiData.horaInicio ? formatHoraDisplay(apiData.horaInicio) : "no definido");
                    
                    showBookingSuccess(nombreSuc, tratSuc, fechaSuc, horaSuc);
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
                    
                    window._pendingSenaData = {
                        idTurno: data.idTurno,
                        tratamiento: storedTratamiento,
                        nombre: storedNombre,
                        fecha: storedFecha,
                        hora: storedHora,
                        montoSena: storedMontoSena
                    };
                    
                    handleRequiresSena(data.idTurno, storedTratamiento, storedNombre, storedFecha, storedHora, storedMontoSena, prefData.initPoint, prefData.preferenceId);
                    
                    var timerEl = document.getElementById("senaTimer");
                    if (timerEl) timerEl.style.display = "block";
                    
                    var totalSeconds = Math.ceil(remainingMs / 1000);
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    
                    window._senaTimerId = setInterval(function() {
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
                        
                        window._pendingSenaData = {
                            idTurno: data.idTurno,
                            tratamiento: storedTratamiento,
                            nombre: storedNombre,
                            fecha: storedFecha,
                            hora: storedHora,
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
        html += '<a href="'+optionalInitPoint+'" target="_blank" style="display:block;margin:0 auto 12px;background:#003366;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;text-decoration:none;font-weight:600;text-align:center">💳 Pagar Seña con Tarjeta o Mercado Pago</a>';
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
function handleRequiresSena(idTurno, tratamiento, nombre, fecha, hora, montoSena, initPoint, preferenceId) {
    markReservaFlowActive();
    
    if(window._senaTimerId) clearInterval(window._senaTimerId);
    var form=document.getElementById("bookingForm");
    if(form) form.style.display="none";
    var senaDiv=document.getElementById("senaRequired");
    if(!senaDiv) return;
    
    window._pendingSenaData = {idTurno:idTurno, tratamiento:tratamiento, nombre:nombre, fecha:fecha, hora:hora, montoSena:montoSena||0};
    var selectedTreatment = ALL_TREATMENTS.find(function(t){return t.nombre===tratamiento||(t.nombre||"").split(" - ")[0]===tratamiento;});
    window._pendingDuracionFilas = selectedTreatment ? (selectedTreatment.duracionFilas||1) : 1;
    
    var mpLink = initPoint || (selectedTreatment ? (selectedTreatment.linkSena || "") : "");
    window._pendingPreferenceId = preferenceId || "";
    
    var totalMin = TIEMPO_EXPIRACION_RESERVA_MINUTOS || 5;
    var expiryTime = Date.now() + (totalMin * 60 * 1000);
    
    try {
        sessionStorage.setItem(STORAGE_KEY_ACTIVE_TURN, idTurno);
        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(expiryTime));
        sessionStorage.setItem("yessenia_preference_id", preferenceId || "");
        sessionStorage.setItem("yessenia_init_point", mpLink || "");
    } catch(e) {}
    
    senaDiv.style.display="block";
    
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
    html += '<a href="'+mpLink+'" target="_blank" style="display:inline-block;background:#003366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;font-weight:600">💳 Pagar Seña con Tarjeta o Mercado Pago</a>';
    html += '</div>';
    html += '<p style="text-align:center;opacity:0.75;font-size:0.7rem;margin-bottom:2px">Pago 100% seguro</p>';
    
    html += '<div id="senaTimerBig" style="text-align:center;font-size:1.5rem;font-weight:700;color:#FFD700;margin:6px 0">';
    html += totalMin + ':00</div>';
    html += '<p style="text-align:center;opacity:0.6;font-size:0.7rem;margin-bottom:4px">Tiempo restante para completar el pago</p>';

    if (!mpLink) {
        html = html.replace(
            '<a href="'+mpLink+'" target="_blank" style="display:inline-block;background:#003366;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;text-decoration:none;font-weight:600">💳 Pagar Seña con Tarjeta o Mercado Pago</a>',
            '<button id="simularPagoBtn" style="display:inline-block;background:#FF8C00;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;border:none;cursor:pointer">⚠️ Simular Confirmación de Pago (Modo Testeo)</button>'
        );
        html += '<p style="text-align:center;opacity:0.6;font-size:0.8rem;margin-top:10px">Links de pago no configurados. Este botón simula el pago para testear.</p>';
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
        window.scrollTo({ top: 0, behavior: 'instant' });
        setTimeout(function() {
            if (!senaDiv) return;
            var rect = senaDiv.getBoundingClientRect();
            var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            var targetTop = scrollTop + rect.top;
            var headerHeight = 0;
            var headerEl = document.querySelector('.header');
            if (headerEl) headerHeight = headerEl.offsetHeight;
            var scrollTarget = Math.max(0, targetTop - headerHeight - 210);
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        }, 200);
    })();
    
    startSenaTimer();
    startStatusPolling(idTurno);
}

// ========== Confirm Payment ==========
function handlePaymentConfirmation(idTurno, tratamiento, comprobanteId, mpStatus) {
    var senaDiv=document.getElementById("senaRequired");
    if(senaDiv){senaDiv.innerHTML+='<div class="spinner" style="margin:40px auto"></div><p style="text-align:center;margin-top:20px;opacity:0.9">Confirmando pago con ' + CONFIG.negocio.nombreCorto + '</p>';}
    
    var duracionFilas = window._pendingDuracionFilas || 1;
    var comprobante = comprobanteId || "MP-Confirmado-"+Date.now().toString(36);
    var status = mpStatus || "approved";
    var prefId = window._pendingPreferenceId || "";
    
    fetch(API_URL, {
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
    })
    .then(function(r){return r.json()})
    .then(function(data) {
        stopStatusPolling();
        if (data.status === "PAGO_HUERFANO") {
            showPagoHuerranoModal(data.mensaje || "Tu pago fue registrado de forma segura. Nos comunicaremos contigo.");
        } else if(data.success) {
            clearActiveTurnoStorage();
            if(window._senaTimerId) clearInterval(window._senaTimerId);
            showBookingSuccess(window._pendingSenaData.nombre, window._pendingSenaData.tratamiento, window._pendingSenaData.fecha, window._pendingSenaData.hora);
        } else {
            showError(CONFIG.mensajes.pagoAceptado + " Contactanos por telefono.");
        }
    })
    .catch(function() { 
        showBookingSuccess(window._pendingSenaData.nombre, window._pendingSenaData.tratamiento, window._pendingSenaData.fecha, window._pendingSenaData.hora); 
    });
}

// ========== Mercado Pago Return Handler ==========
function handleMercadoPagoReturn() {
    var params = new URLSearchParams(window.location.search);
    var collectionId = params.get('collection_id');
    var status = params.get('status');
    var externalRef = params.get('external_reference');
    var preferenceId = params.get('preference_id');

    if (!collectionId || !status) {
        // El usuario volvió de MP sin completar el proceso (clic en "Volver a la tienda")
        // NO hay pago que comprobar — simplemente limpiamos y redirigimos
        clearActiveTurnoStorage();
        if(window._senaTimerId) clearInterval(window._senaTimerId);
        
        releaseTempReservation();

        var senaDivNoParams = document.getElementById('senaRequired');
        if (!senaDivNoParams) {
            senaDivNoParams = document.createElement('div');
            senaDivNoParams.id = 'senaRequired';
            senaDivNoParams.style.display = 'block';
        } else {
            senaDivNoParams.style.display = 'block';
        }

        senaDivNoParams.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
            + '<div style="font-size:3rem;margin-bottom:16px">🛒</div>'
            + '<h3 style="color:#FFD700;margin-bottom:8px;font-size:1.3rem">Volviste a la tienda</h3>'
            + '<p style="opacity:0.85;margin-bottom:20px">Serás redirigido a la página principal en <strong id="countdownNP">8</strong> segundos.</p>'
            + '<p style="opacity:0.6;font-size:0.8rem;margin-bottom:16px">Si querés completar tu reserva, elegí otro turno desde el botón de abajo.</p>'
            + '<button id="btnElegirOtroTurnoNP" style="display:inline-block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button></div>';

        var redirectCountdownNP = 8;
        
        var redirectTimerNP = setInterval(function(){
            redirectCountdownNP--;
            var countdownSpan = document.getElementById('countdownNP');
            if(countdownSpan) {
                countdownSpan.textContent = Math.max(0, redirectCountdownNP);
            }
            if(redirectCountdownNP <= 0) {
                clearInterval(redirectTimerNP);
                window.location.href = '/';
            }
        }, 1000);

        setTimeout(function(){
            var btnOtroNP = document.getElementById('btnElegirOtroTurnoNP');
            if(btnOtroNP) {
                btnOtroNP.addEventListener('click', function(){
                    clearInterval(redirectTimerNP);
                    window.location.href = '/';
                });
            }
        }, 100);

        return false;
    }

    if (!externalRef) {
        var storedTurno = sessionStorage.getItem(STORAGE_KEY_ACTIVE_TURN);
        if (storedTurno) {
            externalRef = storedTurno;
            console.log('MP retorno sin external_reference, usando turno de sessionStorage:', externalRef);
        } else {
            console.log('MP retorno sin external_reference y sin turno en sessionStorage - ignorando');
            return false;
        }
    }

    var idTurno = externalRef;

    var currentHash = window.location.hash || '';
    var cleanUrl = window.location.origin + window.location.pathname + currentHash;
    window.history.replaceState({}, document.title, cleanUrl);

    hideAllSections();

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

    verificarEstadoTurno(idTurno)
        .then(function(data) {
            stopStatusPolling();
            if (data.estado === 'Reservado') {
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
                    
                    var nombreSuccess = data.clienteNombre || (window._pendingSenaData ? window._pendingSenaData.nombre : "Cliente");
                    var tratSuccess = data.tratamiento || (window._pendingSenaData ? window._pendingSenaData.tratamiento : "");
                    var fechaSuccess = data.fecha ? formatFechaDisplay(data.fecha) : (window._pendingSenaData ? window._pendingSenaData.fecha : "");
                    var horaSuccess = data.horaInicio ? formatHoraDisplay(data.horaInicio) : (window._pendingSenaData ? window._pendingSenaData.hora : "");
                    
                    window._bookingData = { 
                        nombre: nombreSuccess, 
                        trat: tratSuccess, 
                        fecha: fechaSuccess, 
                        hora: horaSuccess,
                        horaFin: calcularHoraFin(horaSuccess)
                    };

                    // Padding inferior consistente con pagina principal (~50px total)
                    var successHtml = '<div style="padding:28px 24px 30px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25);border-radius:16px;background:rgba(0,80,80,0.2)">'
                        + '<div style="font-size:3rem;margin-bottom:12px">✅</div>'
                        + '<h3 style="color:#FFD700;margin-bottom:6px">Turno Agendado con Exito!</h3>';

                    if (nombreSuccess && tratSuccess) {
                        successHtml += '<p style="opacity:0.9;margin-bottom:16px">' + CONFIG.mensajes.confirmacionTurno + '</p>';
                        successHtml += '<p style="color:#FFD700;font-size:0.8rem;margin-bottom:16px;opacity:0.85">⚠️ Si no recibes el email en 2 minutes, revisá la carpeta de SPAM o Correos no deseados.</p>';

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
                        successHtml += '<a href="https://wa.me/' + CONFIG.negocio.telefonoRaw + '?text=' + encodeURIComponent('Hola! Confirmé mi turno ' + (idTurno || '') + ' para ' + (tratSuccess || '') + ' el ' + (fechaSuccess || '') + ' a las ' + (horaSuccess || '') + ' hs.') + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:8px 16px;border-radius:50px;text-decoration:none;font-size:0.75rem;font-weight:600">📱 Consultar por WhatsApp</a>';
                        successHtml += '</div></div>';
                        
                        successHtml += '<p style="opacity:0.9;margin-bottom:8px;font-size:0.85rem">Guardalo en tu Google Calendar (con recordatorios):</p>';
                        successHtml += '<button id="saveCalendarBtn" class="btn-primary" style="background:white;color:#A8864F;padding:12px 24px;font-size:0.9rem;border-radius:50px;border:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:pointer;display:block;margin:0 auto 20px auto">📅 Guardar en Google Calendar</button>';
                        successHtml += '</div>';
                        
                        senaDiv2.innerHTML = successHtml;
                        // Usar padding del HTML inline (ya no sumar extra)
                        
                        setTimeout(function(){
                            var cb = document.getElementById("saveCalendarBtn");
                            if(cb) cb.addEventListener("click", openCalendar);
                        }, 100);
                    } else {
                        successHtml += '<p>Tu pago fue validado exitosamente. Estamos actualizando tu agenda.</p>'
                        + '<button onclick="location.reload()" style="display:inline-block;margin:20px auto 0;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Ver mi turno confirmado</button></div>';
                        senaDiv2.innerHTML = successHtml;
                    }
                }
            } else if (data.estado === 'Disponible' || data.estado === 'Vencido Sin Confirmar') {
                var senaDiv3 = document.getElementById('senaRequired');
                if (senaDiv3) {
                    senaDiv3.style.display = 'block';
                    if (status === 'approved') {
                        clearActiveTurnoStorage();
                        if(window._senaTimerId) clearInterval(window._senaTimerId);
                        var approvedHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                            + '<div style="font-size:3rem;margin-bottom:16px">✅</div>'
                            + '<h3 style="color:#FFD700;margin-bottom:8px">Pago Aceptado!</h3>'
                            + '<p>Tu pago fue validado por Mercado Pago. Estamos confirmando tu turno con el comprobante <strong>' + collectionId + '</strong>.</p>'
                            + '<button id="recargarBtn" style="display:inline-block;margin:20px auto 0;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Ver mi turno confirmado</button></div>';
                        senaDiv3.innerHTML = approvedHtml;
                        setTimeout(function(){
                            var btn = document.getElementById('recargarBtn');
                            if(btn) btn.addEventListener('click', function(){ location.reload(); });
                        }, 100);
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
                                showPagoHuerranoModal('Tu pago fue registrado pero nuestro sistema no pudo confirmarlo automaticamente. Te contactaremos pronto.');
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
                // El estado NO es 'Reservado' ni 'Disponible' — puede ser 'Reservado Temporal', 'Bloqueado', etc.
                // Si el turno sigue como 'Reservado Temporal', significa que el pago NO se confirmó en el servidor.
                // Mercado Pago a veces devuelve status=approved incluso cuando el usuario volvió sin pagar.
                // Por eso verificamos AMBAS cosas: el status de MP y el estado real del turno en la agenda.
                
                // Verificar si el pago realmente fue aprobado por MP Y confirmado en la agenda
                if (status === 'approved' && data.estado !== 'Reservado Temporal' && data.estado !== 'Reservado Temp.') {
                    // Pago SI fue aprobado y el turno no está en estado temporal — es un PAGO HUERFANO real
                    var whatsappMsg = encodeURIComponent('Hola! Realice un pago pero mi turno no se confirmo. Comprobante: ' + collectionId);
                    var whatsappLink = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + whatsappMsg;

                    var senaDiv4 = document.getElementById('senaRequired');
                    if (senaDiv4) {
                        senaDiv4.style.display = 'block';
                        var errorHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                            + '<div style="font-size:3rem;margin-bottom:16px">🛒</div>'
                            + '<h3 style="color:#FFD700;margin-bottom:12px">Pago Registrado con Exito</h3>'
                            + '<p>Tu dinero esta seguro en la cuenta de Mercado Pago. Nuestro equipo verificara el comprobante y te contactara para asignarte el turno mas pronto posible.</p>'
                            + '<a href="tel:' + CONFIG.negocio.telefonoRaw + '" target="_blank" style="display:inline-block;background:#003366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📞 Contactar por Telefono</a>'
                            + '<br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
                        senaDiv4.innerHTML = errorHtml;
                    }
                } else {
                    // El usuario NO aprobó el pago en MP — solo volvió a la tienda sin pagar
                    clearActiveTurnoStorage();
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    
                    releaseTempReservation();

                    var senaDivNoPago = document.getElementById('senaRequired');
                    if (senaDivNoPago) {
                        senaDivNoPago.style.display = 'block';
                        
                        var redirectCountdown = 8;
                        var countdownEl = null;
                        
                        function updateRedirectText() {
                            if(countdownEl) {
                                countdownEl.textContent = 'Redirigiendo a la página principal en ' + redirectCountdown + ' segundos...';
                            }
                        }
                        
                        var noPagoHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                            + '<div style="font-size:3rem;margin-bottom:16px">🚫</div>'
                            + '<h3 style="color:#FFD700;margin-bottom:8px">Pago Cancelado</h3>'
                            + '<p>No completaste el pago en Mercado Pago. Tu turno fue liberado porque expiro el tiempo de reserva.</p>'
                            + '<p id="redirectMsg" style="opacity:0.7;font-size:0.9rem;margin:16px 0">Pago no realizado — redirigiendo a la página principal...</p>'
                            + '<button id="btnElegirOtroTurno" style="display:inline-block;margin:8px auto 0;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button></div>';
                        senaDivNoPago.innerHTML = noPagoHtml;

                        countdownEl = document.getElementById('redirectMsg');
                        
                        var redirectTimer = setInterval(function(){
                            redirectCountdown--;
                            updateRedirectText();
                            if(redirectCountdown <= 0) {
                                clearInterval(redirectTimer);
                                window.location.href = '/';
                            }
                        }, 1000);

                        setTimeout(function(){
                            var btnOtro = document.getElementById('btnElegirOtroTurno');
                            if(btnOtro) {
                                btnOtro.addEventListener('click', function(){
                                    clearInterval(redirectTimer);
                                    window.location.href = '/';
                                });
                            }
                        }, 100);
                    }
                }
            }
        })
        .catch(function(err) {
            console.error('Error verificando turno despues de MP:', err);

            var senaDiv5 = document.getElementById('senaRequired');
            if (senaDiv5) {
                senaDiv5.style.display = 'block';
                var catchHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                    + '<div style="font-size:3rem;margin-bottom:16px">🛒</div>'
                    + '<h3 style="color:#FFD700;margin-bottom:12px">Error de conexion</h3>'
                    + '<p>No pudimos verificar tu pago en este momento. Tu dinero esta seguro en Mercado Pago.</p>'
                    + '<a href="tel:' + CONFIG.negocio.telefonoRaw + '" target="_blank" style="display:inline-block;background:#003366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📞 Contactar por Telefono</a>'
                    + '<br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
                senaDiv5.innerHTML = catchHtml;
            }
        });
}

function showPagoHuerranoModal(mensaje) {
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    senaDiv.style.display = "block";
    senaDiv.innerHTML = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center"><div style="font-size:3rem;margin-bottom:16px">🛒</div><h3 style="color:#FFD700;margin-bottom:12px">Pago Registrado con Éxito</h3><p style="opacity:0.9;max-width:450px;margin:0 auto 16px">' + mensaje + '</p><div style="background:rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin:16px 0;text-align:left"><p style="margin:0;opacity:0.8;font-size:0.9rem">Tu dinero está seguro en la cuenta de Mercado Pago. Nuestro equipo verificará el comprobante y te contactará para asignarte el turno más pronto posible.</p></div><a href="tel:' + CONFIG.negocio.telefonoRaw + '" target="_blank" style="display:inline-block;background:#003366;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;text-decoration:none;margin-top:10px">📞 Contactar por Telefono</a><br><button onclick="location.reload()" style="display:inline-block;margin:16px auto 0;background:transparent;color:#C4A16D;border:2px solid #C4A16D;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">🔄 Volver al inicio</button></div>';
}

function startSenaTimer() {
    var timerEl = document.getElementById("senaTimer");
    if(timerEl) timerEl.style.display="block";
    
    var storedExpiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY_TS);
    var totalSeconds;
    if (storedExpiry) {
        var remainingMs = parseInt(storedExpiry, 10) - Date.now();
        totalSeconds = Math.max(15, Math.ceil(remainingMs / 1000));
    } else {
        totalSeconds = (TIEMPO_EXPIRACION_RESERVA_MINUTOS || 5) * 60;
    }
    
    if(window._senaTimerId) clearInterval(window._senaTimerId);
    
    window._senaTimerId = setInterval(function() {
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
}

function releaseTempReservation() {
    if (window._senaTimerId) {
        clearInterval(window._senaTimerId);
        window._senaTimerId = null;
    }

    clearActiveTurnoStorage();
    stopStatusPolling();
    clearReservaFlowFlag();
    
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
    window.scrollTo({top: 0, behavior:'smooth'});
}

function cancelarReservaTemporal(idTurno) {
    clearReservaFlowFlag();
    
    if (!idTurno) {
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
            console.log("Cancelacion API:", data);
        })
        .catch(function(err) {
            console.warn("API cancel error (ignored):", err);
        });
    
    resetBookingForm();
}