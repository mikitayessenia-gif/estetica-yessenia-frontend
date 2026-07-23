// ========== PAGE EVENTS ORCHESTRATOR ==========

// Flag global para controlar el flujo de verificacion de pre-reserva
// Se activa cuando el usuario esta en medio de un proceso de reserva activo
window._reservaFlowActive = false;
window._reservaCheckCompleted = false;

// 1. Initial page boot loader
document.addEventListener("DOMContentLoaded", function() {
    // Detectar ?reset= y forzar recarga sin cache
    var params = new URLSearchParams(window.location.search);
    if (params.get('reset')) {
        console.log("🔄 [MAIN] Reset detectado — recargando sin cache");
        window.location.replace(window.location.pathname);
        return;
    }
    // Ocultar elementos de WhatsApp si no están habilitados
    if (!CONFIG.comportamiento.mostrarWhatsAppCta) {
        var waBtn = document.getElementById('whatsappBtn');
        if (waBtn) waBtn.classList.add('hidden');
        var waCta = document.querySelector('.whatsapp-cta-section');
        if (waCta) waCta.style.display = 'none';
    }
    
    // Primero verificar si venimos de Mercado Pago (redirección post-pago)
    if (!handleMercadoPagoReturn()) {
        // Si no es un retorno MP, verificar turno temporal en sessionStorage
        restoreSenaTimerFromStorage();
    }
    window._storageRestoreCalled = true;
   loadConfigFromAPI();
    loadTreatmentsFromAPI();
    renderInstagramGallery();
    loadGoogleReviews();
    
    // Activar interceptor de navegación durante reservas activas
    interceptBookingNavigation();
});

// 2. Browser active tab visibility change tracker
document.addEventListener("visibilitychange", function() {
    if (document.visibilityState === "visible") {
        var stored = getStoredTurnoData();
        if (stored) {
            var remainingMs = stored.expiryTime - Date.now();
            verificarEstadoTurno(stored.idTurno).then(function(apiData) {
                if (apiData.error) {
                    if (remainingMs <= 0) {
                        console.log("Turno expirado mientras usuario estaba en otra pestaña, liberando...");
                        clearActiveTurnoStorage();
                        releaseStoredTurno(stored.idTurno);
                        resetBookingForm();
                    } else {
                        console.log("Usuario volvió a la pestaña, turno sigue activo:", Math.ceil(remainingMs/1000), "segundos restantes");
                        var tb = document.getElementById("senaTimerBig");
                        if (tb) {
                            var m = Math.floor(remainingMs / 60000);
                            var s = Math.floor((remainingMs % 60000) / 1000);
                            tb.textContent = m + ":" + ((s < 10 ? "0" : "") + s);
                        }
                    }
                } else if (apiData.estado === 'Reservado') {
                    // Verificar si es nuestro turno comparando el ID directamente, NO el nombre
                    // Esto evita race conditions con la propagacion de datos en Sheets
                    if (apiData.id && apiData.id.toString().trim() === stored.idTurno.toString().trim()) {
                        stopStatusPolling();
                        clearActiveTurnoStorage();
                        if(window._senaTimerId) clearInterval(window._senaTimerId);
                        window._senaTimerId = null;
                        
                        var popupHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">';
                        popupHtml += '<div style="font-size:3rem;margin-bottom:16px">✅</div>';
                        popupHtml += '<h3 style="color:#FFD700;margin-bottom:8px">Turno Reservado con Éxito!</h3>';
                        popupHtml += '<p>Tu turno fue confirmado automáticamente. Estamos actualizando tu agenda.</p>';
                        popupHtml += '<button onclick="location.reload()" style="display:inline-block;margin:20px auto 0;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Ver mi turno confirmado</button>';
                        popupHtml += '</div>';
                        
                        var senaDiv = document.getElementById("senaRequired");
                        if (senaDiv) { senaDiv.innerHTML = popupHtml; }
                    } else {
                        stopStatusPolling();
                        clearActiveTurnoStorage();
                        if(window._senaTimerId) clearInterval(window._senaTimerId);
                        window._senaTimerId = null;
                        
                        var conflictHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">';
                        conflictHtml += '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>';
                        conflictHtml += '<h3 style="color:#FFD700;margin-bottom:12px">Turno No Disponible</h3>';
                        conflictHtml += '<p>El turno <strong>' + stored.idTurno + '</strong> ya fue tomado por otra persona.</p>';
                        conflictHtml += '<button id="otroTurnoBtn3" style="display:block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button>';
                        conflictHtml += '</div>';
                        
                        var senaDiv2 = document.getElementById("senaRequired");
                        if (senaDiv2) { senaDiv2.innerHTML = conflictHtml; }
                        
                        setTimeout(function(){
                            var btn = document.getElementById("otroTurnoBtn3");
                            if(btn) btn.addEventListener("click", function(){
                                resetBookingForm();
                                loadAvailableSlots();
                            });
                        }, 100);
                    }
                } else if (apiData.estado === 'Disponible' || apiData.estado === 'Vencido Sin Confirmar') {
                    clearActiveTurnoStorage();
                    releaseStoredTurno(stored.idTurno);
                    resetBookingForm();
                } else {
                    console.log("Usuario volvió a la pestaña, turno sigue activo en API");
                    var tb2 = document.getElementById("senaTimerBig");
                    if (tb2) {
                        var m2 = Math.floor(remainingMs / 60000);
                        var s2 = Math.floor((remainingMs % 60000) / 1000);
                        tb2.textContent = m2 + ":" + ((s2 < 10 ? "0" : "") + s2);
                    }
                }
            });
        }
    }
});

// 3. Prevent sudden window closings during active seña reservation
window.addEventListener("beforeunload", function(e) {
    if (window._senaTimerId && !window._silenceBeforeUnload) {
        e.preventDefault();
        e.returnValue = "Tenés una reserva temporal activa. Si sales ahora, el turno se liberará y no se completará tu reserva. ¿Seguro que querés salir?";
        return e.returnValue;
    }
});

// Flag para silenciar beforeunload durante acciones intencionales (scroll hacia pago)
window._silenceBeforeUnload = false;
_popstateSilenceTs = Date.now();
setInterval(function() {
    if (window._silenceBeforeUnload) {
        var elapsed = Date.now() - (window._silenceBeforeUnload._ts || 0);
        if (elapsed > 5000) {
            window._silenceBeforeUnload = false;
        }
    }
}, 500);

// 4. Browser history navigation attempts interceptor (X button, swipe back)
var _popstateSilenceTs = 0;
window.addEventListener('popstate', function(e) {
    if (window._senaTimerId && !_silenceBeforeUnload && (Date.now() - _popstateSilenceTs > 3000)) {
        showExitConfirmationModal();
        history.pushState(null, '', window.location.href);
    }
});

// 5. Active session persistence restore checker on reload
window.addEventListener("load", function() {
    if (window._storageRestoreCalled) return;
    var stored = getStoredTurnoData();
    if (stored) {
        var remainingMs = stored.expiryTime - Date.now();
        if (remainingMs > 0) {
            console.log("Restaurando turno temporal activo:", stored.idTurno, "con", Math.ceil(remainingMs/1000), "segundos restantes");
            restoreSenaTimerFromStorage();
        } else {
            // Timer expirado localmente pero webhook pudo haber confirmado - verificar API antes de liberar
            console.log("Timer expirado en recarga, verificando si webhook confirmó:", stored.idTurno);
            verificarEstadoTurno(stored.idTurno)
                .then(function(apiData) {
                    // Verificar si webhook ya confirmó el pago
                    if (apiData.estado === 'Reservado' && apiData.id && apiData.id.toString().trim() === stored.idTurno.toString().trim()) {
                        console.log("Webhook confirmó al recargar - mostrando éxito");
                        clearActiveTurnoStorage();
                        stopStatusPolling();
                        if(window._senaTimerId) clearInterval(window._senaTimerId);
                        window._senaTimerId = null;
                        
                       var nombreSuccess = window._pendingSenaData ? window._pendingSenaData.nombre : "Cliente";
                        var tratSuccess = window._pendingSenaData ? window._pendingSenaData.tratamiento : "";
                        var fechaSuccess = window._pendingSenaData ? window._pendingSenaData.fecha : "";
                        var horaSuccess = window._pendingSenaData ? window._pendingSenaData.hora : "";
                        
                        showBookingSuccess(nombreSuccess, tratSuccess, fechaSuccess, horaSuccess, "", stored.idTurno || "");
                    } else {
                        console.log("Turno no confirmado, liberando...");
                        clearActiveTurnoStorage();
                        releaseStoredTurno(stored.idTurno);
                    }
                })
                .catch(function(err) {
                    console.error("Error verificando estado al recargar:", err);
                    clearActiveTurnoStorage();
                    releaseStoredTurno(stored.idTurno);
                });
        }
    }
});

// 5b. Verificar pre-reserva por contacto SOLO al cargar la pagina con datos pre-existentes
//     NO verificar mientras el usuario escribe - eso solo confunde
window.addEventListener("load", function() {
    // Si ya hay algo en sessionStorage, no hacer nada mas (ya se manejo arriba)
    var stored = getStoredTurnoData();
    if (stored) return;
    
    // Verificar si el formulario tiene email o telefono llenos al cargar la pagina
    var emailInput = document.getElementById("clienteEmail");
    var telInput = document.getElementById("clienteTelefono");
    
    var emailVal = emailInput ? emailInput.value.trim().toLowerCase() : "";
    var telVal = telInput ? telInput.value.trim() : "";
    
    if (emailVal || telVal) {
        console.log("Formulario tiene datos al cargar, verificando pre-reserva en backend...");
        verificarPreReservaPorContacto(emailVal, telVal);
    }
});

// ========== FUNCIONES DE VERIFICACION DE PRE-RESERVA ==========

/**
 * Verifica si existe una reserva temporal activa en el backend para este email/telefono.
 * Solo se llama al cargar la pagina con datos pre-existentes o despues de confirmar turno.
 */
function verificarPreReservaPorContacto(email, telefono) {
    // Si ya hay flujo de reserva activo (el usuario acaba de dar click en Confirmar), no interferir
    if (window._reservaFlowActive) {
        console.log("Flujo de reserva activo, saltando verificacion por contacto");
        return;
    }
    
    // Si ya se verificó antes y no habia reserva, no repetir
    if (window._reservaCheckCompleted) {
        return;
    }
    
    showPreReservationLoader();
    
    var emailVal = email ? email.toLowerCase() : "";
    var telVal = telefono || "";
    
    verificarReservaActivaPorContacto(emailVal, telVal)
        .then(function(data) {
            if (data.tieneReserva && data.idTurno) {
                console.log("Pre-reserva activa detectada en backend:", data.idTurno);
                
                // Calcular tiempo restante desde fechaRegistro
                var now = new Date().getTime();
                var fechaReg = new Date(data.fechaRegistro).getTime();
                var remainingMs = now - fechaReg;
                var totalMs = TIEMPO_EXPIRACION_RESERVA_MINUTOS * 60 * 1000;
                var timeLeft = totalMs - remainingMs;
                
                if (timeLeft > 0) {
                    // Guardar en sessionStorage para que el resto del flujo funcione
                    try {
                        sessionStorage.setItem(STORAGE_KEY_ACTIVE_TURN, data.idTurno);
                        sessionStorage.setItem(STORAGE_KEY_EXPIRY_TS, String(Date.now() + timeLeft));
                    } catch(e) {}
                    
                    window._pendingSenaData = {
                        idTurno: data.idTurno,
                        tratamiento: data.tratamiento || "",
                        nombre: data.nombre || "Cliente",
                        fecha: data.fecha || "",
                        hora: data.horaInicio || "",
                        montoSena: data.montoSena || 0
                    };
                    
                    // Restaurar timer de seña (el loader se oculta dentro de restoreSenaTimerFromStorage)
                    hidePreReservationLoader();
                    window._reservaCheckCompleted = true;
                    restoreSenaTimerFromStorage();
                } else {
                    console.log("Pre-reserva expirada en backend, liberando...");
                    releaseStoredTurno(data.idTurno);
                    clearActiveTurnoStorage();
                    hidePreReservationLoader();
                    window._reservaCheckCompleted = true;
                }
            } else {
                // No hay pre-reserva activa - marcar como verificado para no volver a preguntar
                console.log("No se encontro pre-reserva activa en backend");
                hidePreReservationLoader();
                window._reservaCheckCompleted = true;
            }
        })
        .catch(function(err) {
            console.warn("Error verificando pre-reserva por contacto:", err);
            hidePreReservationLoader();
            window._reservaCheckCompleted = true;
        });
}

/**
 * Señala que el usuario acaba de confirmar turno.
 * Se llama desde mp-handler.js cuando handleRequiresSena() se ejecuta exitosamente.
 */
function markReservaFlowActive() {
    window._reservaFlowActive = true;
    window._reservaCheckCompleted = true;
    
    // Deshabilitar todos los botones de slot visualmente
    document.querySelectorAll('.slot-btn').forEach(function(btn) {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'not-allowed';
    });
    
    // Deshabilitar el formulario de booking para evitar re-submits
    var form = document.getElementById('bookingForm');
    if (form) {
        form.querySelectorAll('input, select, textarea').forEach(function(el) {
            el.disabled = true;
        });
    }
}

/**
 * Limpia el flag de flujo activo despues de completar la reserva (exito o cancelacion).
 */
function clearReservaFlowFlag() {
    window._reservaFlowActive = false;
    
    // Re-habilitar botones de slot
    document.querySelectorAll('.slot-btn').forEach(function(btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
        btn.style.cursor = '';
    });
    
    // Re-habilitar formulario
    var form = document.getElementById('bookingForm');
    if (form) {
        form.querySelectorAll('input, select, textarea').forEach(function(el) {
            el.disabled = false;
        });
    }
}
