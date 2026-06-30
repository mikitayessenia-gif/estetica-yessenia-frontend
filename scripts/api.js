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
    return fetch(url)
        .then(function(r){return r.json()})
        .then(function(data) {
            return data;
        })
        .catch(function(err) {
            console.error('Error verificando turno:', err);
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

// ========== Polling: Check turno status every 10s during active timer ==========
var _statusPollInterval = null;
var _confirmadoLocalmente = false; // Flag para evitar falsos negativos despues de confirmacion
function startStatusPolling(idTurno) {
    if (_statusPollInterval) clearInterval(_statusPollInterval);
    _confirmadoLocalmente = false;
    
    _statusPollInterval = setInterval(function() {
        // Si ya confirmamos localmente, NO verificar mas - evitar flickering
        if (_confirmadoLocalmente) {
            clearInterval(_statusPollInterval);
            _statusPollInterval = null;
            return;
        }
        
        verificarEstadoTurno(idTurno).then(function(data) {
            if (data.error) return;
            
            // Si el turno ya fue confirmado (por webhook de otra persona o webhook propio)
            if (data.estado === "Reservado") {
                // Verificar si es nuestro turno comparando el ID directamente
                // NO depender del nombre porque puede haber race condition con la propagacion de datos en Sheets
                var senaDiv = document.getElementById("senaRequired");
                
                // Si coincide el ID del turno, ES nuestro - confirmar exito inmediatamente
                if (data.id && data.id.toString().trim() === idTurno.toString().trim()) {
                    clearInterval(_statusPollInterval);
                    _statusPollInterval = null;
                    _confirmadoLocalmente = true;
                    
                    stopStatusPolling();
                    clearActiveTurnoStorage();
                    if(window._senaTimerId) {
                        clearInterval(window._senaTimerId);
                        window._senaTimerId = null;
                    }
                    
                    showBookingSuccess(window._pendingSenaData ? window._pendingSenaData.nombre : (data.clienteNombre || "Cliente"), 
                                     window._pendingSenaData ? window._pendingSenaData.tratamiento : "", 
                                     window._pendingSenaData ? window._pendingSenaData.fecha : "", 
                                     window._pendingSenaData ? window._pendingSenaData.hora : "");
                    return;
                } else {
                    // Turno tomado por otra persona - alertar al usuario
                    if (window._senaTimerId) {
                        clearInterval(window._senaTimerId);
                        window._senaTimerId = null;
                    }
                    clearActiveTurnoStorage();
                    
                    var conflictoHtml = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">';
                    conflictoHtml += '<div style="font-size:3rem;margin-bottom:16px">⚠️</div>';
                    conflictoHtml += '<h3 style="color:#FFD700;margin-bottom:12px">Turno No Disponible</h3>';
                    conflictoHtml += '<p style="opacity:0.9;margin-bottom:8px">El turno <strong>' + data.id + '</strong> ya fue tomado por otra persona.</p>';
                    conflictoHtml += '<p style="opacity:0.7;font-size:0.9rem;margin-bottom:16px">Alguien más confirmó este turno mientras tanto. Lo sentimos por las molestias.</p>';
                    conflictoHtml += '<button id="otroTurnoBtn" style="display:block;margin:0 auto;background:#C4A16D;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">🔄 Elegir otro turno</button>';
                    conflictoHtml += '</div>';
                    senaDiv.innerHTML = conflictoHtml;
                    
                    setTimeout(function(){
                        var btn = document.getElementById("otroTurnoBtn");
                        if(btn) btn.addEventListener("click", function(){
                            resetBookingForm();
                            loadAvailableSlots();
                        });
                    }, 100);
                }
            }
            
            // Si el turno se liberó (Disponible o Vencido Sin Confirmar)
            if (data.estado === "Disponible" || data.estado === "Vencido Sin Confirmar") {
                clearInterval(_statusPollInterval);
                _statusPollInterval = null;
                
                var senaDiv2 = document.getElementById("senaRequired");
                if (!senaDiv2) return;
                
                // Verificar si es nuestro turno (todavía tenemos datos pending)
                if (window._pendingSenaData && window._pendingSenaData.idTurno === idTurno) {
                    // Nuestro turno se liberó porque alguien más lo tomó o expiró sin pago
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
            }
        });
    }, 5000); // Poll cada 5 segundos para respuesta mas rapida
}

function stopStatusPolling() {
    if (_statusPollInterval) {
        clearInterval(_statusPollInterval);
        _statusPollInterval = null;
    }
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
                        badge: t.badge || "", category: catSlug
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
                sel.innerHTML = '<option value="">Error al cargar tratamientos.</option>';
            }
            var apiErr = document.getElementById("apiError");
            if (apiErr) {
                apiErr.style.display = "block";
                var whatsappMsg = encodeURIComponent('Hola! Quiero reservar un turno. No pude cargar los tratamientos en la web');
                apiErr.innerHTML = '<div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:16px;padding:24px 20px;text-align:center;max-width:380px;margin:0 auto"><p style="color:#FFD700;font-size:0.95rem;font-weight:600;margin-bottom:6px">Error al cargar tratamientos</p><p style="font-size:0.8rem;color:rgba(255,255,255,0.7);margin-bottom:14px;line-height:1.4">Puede ser un problema temporal de conexi&#243;n.</p><div style="display:flex;flex-direction:column;gap:8px;align-items:center"><button onclick="loadTreatmentsFromAPI()" style="background:transparent;border:1.5px solid rgba(255,215,0,0.6);color:#FFD700;padding:10px 24px;border-radius:50px;font-weight:600;font-size:0.85rem;width:90%;cursor:pointer">&#128260; Reintentar</button><a href="https://wa.me/541123178918?text=' + whatsappMsg + '" target="_blank" style="display:inline-block;background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.4);color:#25D366;padding:10px 24px;border-radius:50px;text-decoration:none;font-weight:600;font-size:0.85rem;width:90%">&#128172; Contactar por WhatsApp</a></div></div>';
            }
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