// ========== STORAGE HELPERS: Persist active turno across page reloads ==========
function saveActiveTurno(idTurno, minutosExpiracion) {
    try {
        var expiryTime = Date.now() + (minutosExpiracion * 60 * 1000);
        sessionStorage.setItem(STORAGE_KEY_ACTIVE_TURN, idTurno);
        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(expiryTime));
    } catch(e) {}
}

function clearActiveTurnoStorage() {
    try {
        sessionStorage.removeItem(STORAGE_KEY_ACTIVE_TURN);
        sessionStorage.removeItem(STORAGE_KEY_EXPIRY_TS);
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

function restoreSenaTimerFromStorage() {
    var data = getStoredTurnoData();
    if (!data) return false;
    
    var now = Date.now();
    var remainingMs = data.expiryTime - now;
    
    if (remainingMs <= 0) {
        clearActiveTurnoStorage();
        releaseStoredTurno(data.idTurno);
        return false;
    }
    
    // Not expired locally - verify with API that the turno is still temp-reserved
    verificarEstadoTurno(data.idTurno)
        .then(function(apiData) {
            // Si ya esta "Reservado", el webhook se ejecuto - confirmar exito directo
            if (apiData.estado === 'Reservado') {
                if (apiData.id && apiData.id.toString().trim() === data.idTurno.toString().trim()) {
                    console.log("Turno ya confirmado al restaurar desde storage, liberando...");
                    clearActiveTurnoStorage();
                    stopStatusPolling();
                    if(window._senaTimerId) clearInterval(window._senaTimerId);
                    window._senaTimerId = null;
                    showBookingSuccess(window._pendingSenaData ? window._pendingSenaData.nombre : "Cliente", 
                                     window._pendingSenaData ? window._pendingSenaData.tratamiento : "",
                                     window._pendingSenaData ? window._pendingSenaData.fecha : "",
                                     window._pendingSenaData ? window._pendingSenaData.hora : "");
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
            // Turno sigue activo en API - restore timer UI
            var senaDiv2 = document.getElementById("senaRequired");
            if (!senaDiv2) return;
            startSenaTimerFromRemaining(data.idTurno, remainingMs);
        })
        .catch(function(err) {
            console.warn("No se pudo verificar turno en API al restaurar, confiando en localStorage:", err);
            var senaDiv3 = document.getElementById("senaRequired");
            if (!senaDiv3) return;
            startSenaTimerFromRemaining(data.idTurno, remainingMs);
        });
    
    return true;
}

function startSenaTimerFromRemaining(idTurno, remainingMs) {
    // Use exact remaining time - no extra buffer to keep frontend/backend in sync
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
    html += '<button id="cancelarReservaBtnRestored" style="display:block;margin:20px auto 0;background:transparent;color:#ff6b6b;border:2px solid #ff6b6b;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">Cancelar y elegir otro turno</button>';
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
    
    // Use the ACTUAL config value from backend (loaded via loadConfigFromAPI), not a hardcoded default.
    // This ensures frontend timer matches backend expiration exactly.
    var totalMin = TIEMPO_EXPIRACION_RESERVA_MINUTOS || 5;
    var expiryTime = Date.now() + (totalMin * 60 * 1000);
    
    try {
        sessionStorage.setItem(STORAGE_KEY_ACTIVE_TURN, idTurno);
        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(expiryTime));
    } catch(e) {}
    
    senaDiv.style.display="block";
    var montoDisplay = " $" + Number(montoSena).toLocaleString("es-AR") + " ARS";
    
    // Update the expiry time in sessionStorage to match actual config value
    try {
        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(expiryTime));
    } catch(e) {}
    
  var html = '';
    html += '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto">';
    html += '<div style="font-size:3rem;margin-bottom:16px">⏳</div>';
    html += '<h3 style="font-size:1.5rem;margin-bottom:8px;color:#FFD700">¡Tu Turno está Pre-Reservado!</h3>';
    html += '<p style="opacity:0.8;margin-bottom:4px">Guardamos tu lugar por <strong>'+totalMin+' minutos</strong> para que pagues la seña y lo confirmes.</p>';
    html += '<p style="opacity:0.6;font-size:0.85rem;margin-bottom:12px">Turno <strong>'+idTurno+'</strong></p>';
    html += '<div style="background:rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin:16px 0">';
    html += '<div style="font-size:0.85rem;opacity:0.7;text-transform:uppercase;letter-spacing:1px">Tratamiento</div>';
    html += '<div style="font-size:1.1rem;font-weight:600;margin-top:4px">'+tratamiento+'</div>';
    html += '<div style="display:flex;justify-content:space-between;margin-top:8px"><span style="opacity:0.7">Fecha</span><span>'+fecha+' - '+hora+'</span></div>';
    html += '</div>';
    html += '<div style="text-align:center;margin:20px 0;padding:16px;background:rgba(196,161,109,0.2);border-radius:12px;border:1px solid rgba(196,161,109,0.3)">';
    html += '<div style="font-size:0.85rem;opacity:0.7;text-transform:uppercase;letter-spacing:1px">Seña a pagar</div>';
    html += '<div style="font-size:2rem;font-weight:700;color:#C4A16D;margin-top:4px">'+montoDisplay+'</div>';
    html += '</div>';
    
    // Contenedor del Wallet Brick (Mercado Pago Modal)
    html += '<div id="walletPaymentButton" style="text-align:center;margin-bottom:10px"></div>';
    html += '<p style="text-align:center;opacity:0.75;font-size:0.85rem;margin-bottom:6px">Pago 100% seguro</p>';
    html += '<p style="text-align:center;opacity:0.6;font-size:0.8rem;margin-bottom:12px">Aceptamos débito y crédito. No necesitás tener cuenta de Mercado Pago.</p>';
    
    html += '<div id="senaTimerBig" style="text-align:center;font-size:2.5rem;font-weight:700;color:#FFD700;margin:16px 0">';
    html += totalMin + ':00</div>';
    html += '<p style="text-align:center;opacity:0.6;font-size:0.85rem;margin-bottom:20px">Tiempo restante para completar el pago</p>';

    // Cargar SDK de MercadoPago.js V2 dinamicamente (si no esta ya cargado)
    if (!window.MercadoPago) {
        var mpScript = document.createElement('script');
        mpScript.src = "https://sdk.mercadopago.com/js/v2";
        mpScript.onload = function() { initWalletBrick(mpLink); };
        document.head.appendChild(mpScript);
    } else {
        initWalletBrick(mpLink);
    }

    function initWalletBrick(mpInitPoint) {
        // Inicializar SDK con PUBLIC_KEY (cambiar por la clave real de produccion)
        var mpPublicKey = "TU_PUBLIC_KEY";
        if (typeof MP_PUBLIC_KEY !== 'undefined' && MP_PUBLIC_KEY) {
            mpPublicKey = MP_PUBLIC_KEY;
        }

        var mp = new MercadoPago(mpPublicKey, { locale: 'es-AR' });

        // Renderizar Wallet Brick en el contenedor dedicado
        mp.bricks().create("wallet", "walletPaymentButton", {
            initialization: {
                preferenceId: preferenceId || '',
                redirectMode: 'modal'
            },
            customization: {
                texts: { valueProp: 'smart_option', action: 'pay' }
            },
            render: function (bricksBuilder) {
                bricksBuilder('wallet', 'walletPaymentButton');
            }
        }).catch(function(err) {
            console.warn("Wallet Brick falló, usando fallback init_point:", err);
            // Fallback: boton con init_point directo al navegador
            var wpb = document.getElementById('walletPaymentButton');
            if (wpb && mpInitPoint) {
                wpb.innerHTML = '<a href="'+mpInitPoint+'" target="_blank" style="display:inline-block;background:#003366;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;text-decoration:none;font-weight:600">💳 Pagar Seña con Tarjeta o Mercado Pago</a>';
                wpb.style.cssText = 'text-align:center;margin-bottom:10px;';
            }
        });
    }

    if (!mpLink) {
        html += '<button id="simularPagoBtn" style="display:block;margin:0 auto;background:#FF8C00;color:white;padding:18px 32px;font-size:1.15rem;border-radius:50px;border:none;cursor:pointer">⚠️ Simular Confirmación de Pago (Modo Testeo)</button>';
        html += '<p style="text-align:center;opacity:0.6;font-size:0.8rem;margin-top:10px">Links de pago no configurados. Este botón simula el pago para testear.</p>';
        setTimeout(function(){var b=document.getElementById("simularPagoBtn");if(b)b.addEventListener("click",function(){handlePaymentConfirmation(idTurno, tratamiento);});},100);
    }
    
    html += '<button id="cancelarReservaBtn" style="display:block;margin:20px auto 0;background:transparent;color:#ff6b6b;border:2px solid #ff6b6b;padding:14px 28px;font-size:1rem;border-radius:50px;cursor:pointer">Cancelar y elegir otro turno</button>';
    setTimeout(function(){var b=document.getElementById("cancelarReservaBtn");if(b)b.addEventListener("click",function(){cancelarReservaTemporal(idTurno);});},100);

    html += '</div>';
    senaDiv.innerHTML = html;
    
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

    if (!collectionId || !status) return false;

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

    var senaDiv = document.getElementById('senaRequired');
    if (!senaDiv) {
        senaDiv = document.createElement('div');
        senaDiv.id = 'senaRequired';
        senaDiv.style.cssText = 'display:block;';
    } else {
        senaDiv.style.display = 'block';
    }
    var mainContent = document.querySelector('.cta-content');
    if (mainContent) {
        var loadHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
            + '<div style="font-size:3rem;margin-bottom:16px">✅</div>'
            + '<h3 style="color:#FFD700;margin-bottom:8px">Confirmando tu pago...</h3>'
            + '<p>Validando comprobante <strong>' + collectionId + '</strong> con Mercado Pago</p>'
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
                    var successHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">'
                        + '<div style="font-size:3rem;margin-bottom:16px">✅</div>'
                        + '<h3 style="color:#FFD700;margin-bottom:8px">Turno Procesado!</h3>'
                        + '<p>Tu pago fue validado exitosamente. Estamos actualizando tu agenda.</p>'
                        + '<button onclick="location.reload()" style="display:inline-block;margin:20px auto 0;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Ver mi turno confirmado</button></div>';
                    senaDiv2.innerHTML = successHtml;
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
    
    // Get the actual expiry time from sessionStorage (set when turno was reserved)
    var storedExpiry = sessionStorage.getItem(STORAGE_KEY_EXPIRY_TS);
    var totalSeconds;
    if (storedExpiry) {
        var remainingMs = parseInt(storedExpiry, 10) - Date.now();
        // Use exact remaining time - no buffer to keep frontend/backend in sync
        totalSeconds = Math.max(15, Math.ceil(remainingMs / 1000));
    } else {
        // Fallback: use config value (no extra buffer needed)
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

    // Show "Tiempo Agotado" message directly instead of resetting form
    clearActiveTurnoStorage();
    stopStatusPolling();
    
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
