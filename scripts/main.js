// ========== PAGE EVENTS ORCHESTRATOR ==========

// 1. Initial page boot loader
document.addEventListener("DOMContentLoaded", function() {
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
    if (window._senaTimerId) {
        e.preventDefault();
        e.returnValue = "Tenés una reserva temporal activa. Si sales ahora, el turno se liberará y no se completará tu reserva. ¿Seguro que querés salir?";
        return e.returnValue;
    }
});

// 4. Browser history navigation attempts interceptor (X button, swipe back)
window.addEventListener('popstate', function(e) {
    if (window._senaTimerId) {
        showExitConfirmationModal();
        history.pushState(null, '', window.location.href);
    }
});

// 5. Active session persistence restore checker on reload
window.addEventListener("load", function() {
    var stored = getStoredTurnoData();
    if (stored) {
        var remainingMs = stored.expiryTime - Date.now();
        if (remainingMs > 0) {
            console.log("Restaurando turno temporal activo:", stored.idTurno, "con", Math.ceil(remainingMs/1000), "segundos restantes");
            restoreSenaTimerFromStorage();
        } else {
            console.log("Turno temporal expirado en recarga:", stored.idTurno);
            clearActiveTurnoStorage();
            releaseStoredTurno(stored.idTurno);
        }
    }
});
