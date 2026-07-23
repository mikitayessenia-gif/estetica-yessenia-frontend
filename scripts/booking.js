// ========== Estado global de carga de turnos ==========
var slotsLoaded = false;
var _selectedTreatmentData = null;

// ========== API: Carga y Render de Turnos Libres ==========
function generateSlotsFromStructure(slots, duracionFilas) {
    var byDate = {};
    
    // Obtener combinaciones únicas (dia, horaInicio)
    var slotMap = {};
    slots.forEach(function(s) {
        var key = s.dia + "|" + s.horaInicio;
        if (!slotMap[key]) slotMap[key] = [];
        slotMap[key].push(s);
    });
    
    // Obtener días únicos y su patrón de horarios
    var dayHours = {};
    Object.keys(slotMap).forEach(function(key) {
        var parts = key.split("|");
        var dia = parts[0];
        if (!dayHours[dia]) dayHours[dia] = new Set();
        dayHours[dia].add(parts[1]);
    });
    
    var diasPresentes = Object.keys(dayHours);
    
    // Generar fechas para los siguientes MAX_MESES_RESERVA meses
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var limiteMeses = new Date(hoy.getFullYear(), hoy.getMonth() + MAX_MESES_RESERVA, hoy.getDate());
    limiteMeses.setHours(23, 59, 59, 999);
    
    var allDayDates = [];
    
    for (var d = new Date(hoy); d <= limiteMeses; d.setDate(d.getDate() + 1)) {
        var diaName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()];
        var isMatch = diasPresentes.some(function(dp) {
            return diaName.toLowerCase().indexOf(dp.toLowerCase().substring(0, 4)) !== -1 ||
                   dp.toLowerCase().indexOf(diaName.toLowerCase().substring(0, 4)) !== -1;
        });
        
        if (isMatch) {
            allDayDates.push({
                date: new Date(d),
                dia: diaName,
                hours: dayHours[diasPresentes.find(function(dp) {
                    return diaName.toLowerCase().indexOf(dp.toLowerCase().substring(0, 4)) !== -1 ||
                           dp.toLowerCase().indexOf(diaName.toLowerCase().substring(0, 4)) !== -1;
                })] ? Array.from(dayHours[diasPresentes.find(function(dp) {
                    return diaName.toLowerCase().indexOf(dp.toLowerCase().substring(0, 4)) !== -1 ||
                           dp.toLowerCase().indexOf(diaName.toLowerCase().substring(0, 4)) !== -1;
                })]).sort() : []
            });
        }
    }
    
    var sortedSlots = slots.slice().sort(function(a, b) {
        var numA = parseInt(a.id.replace(/[^0-9]/g, ''));
        var numB = parseInt(b.id.replace(/[^0-9]/g, ''));
        return numA - numB;
    });
    
    var slotIndex = 0;
    allDayDates.forEach(function(dayInfo) {
        var dateStr = String(dayInfo.date.getDate()).padStart(2, '0') + '/' + 
                      String(dayInfo.date.getMonth() + 1).padStart(2, '0') + '/' + 
                      dayInfo.date.getFullYear();
        
        var daySlots = [];
        dayInfo.hours.forEach(function(horaRaw) {
            for (var i = slotIndex; i < sortedSlots.length; i++) {
                var slotHora = sortedSlots[i].horaInicio;
                var matchMatch = slotHora.match(/T(\d{2}):(\d{2})/);
                if (matchMatch) {
                    var slotTimeStr = matchMatch[1] + ':' + matchMatch[2];
                    var rawMatch = horaRaw.match(/T(\d{2}):(\d{2})/);
                    var rawTimeStr = rawMatch ? rawMatch[1] + ':' + rawMatch[2] : horaRaw;
                    
                    if (slotTimeStr === rawTimeStr) {
                        daySlots.push(sortedSlots[i]);
                        slotIndex++;
                        break;
                    }
                }
            }
        });
        
        if (daySlots.length === 0) {
            for (var j = slotIndex; j < sortedSlots.length; j++) {
                var m = sortedSlots[j].horaInicio.match(/T(\d{2}):(\d{2})/);
                if (m) {
                    var st = m[1] + ':' + m[2];
                    if (dayInfo.hours && dayInfo.hours.some(function(h) {
                        var hm = h.match(/T(\d{2}):(\d{2})/);
                        return hm && (hm[1]+':'+hm[2]) === st;
                    })) {
                        daySlots.push(sortedSlots[j]);
                        slotIndex++;
                    }
                }
            }
        }
        
        if (daySlots.length > 0) {
            daySlots.forEach(function(s) {
                s._horaInicioParsed = parseSheetTime(s.horaInicio);
                s._horaFinParsed = parseSheetTime(s.horaFin);
                s._normalizedFecha = dateStr;
                if (!byDate[dateStr]) byDate[dateStr] = [];
                byDate[dateStr].push(s);
            });
        }
    });
    
    if (Object.keys(byDate).length === 0) {
        var slotsPerDay = Math.ceil(slots.length / allDayDates.length);
        var currentDayIdx = 0;
        var countForCurrentDay = 0;
        
        sortedSlots.forEach(function(s) {
            if (countForCurrentDay >= slotsPerDay && currentDayIdx < allDayDates.length - 1) {
                currentDayIdx++;
                countForCurrentDay = 0;
            }
            
            var dayInfo = allDayDates[currentDayIdx];
            var dateStr = String(dayInfo.date.getDate()).padStart(2, '0') + '/' + 
                          String(dayInfo.date.getMonth() + 1).padStart(2, '0') + '/' + 
                          dayInfo.date.getFullYear();
            
            s._horaInicioParsed = parseSheetTime(s.horaInicio);
            s._horaFinParsed = parseSheetTime(s.horaFin);
            s._normalizedFecha = dateStr;
            if (!byDate[dateStr]) byDate[dateStr] = [];
            byDate[dateStr].push(s);
            countForCurrentDay++;
        });
    }
    
    return { byDate: byDate };
}

function loadAvailableSlots(clearHint) {
    var treatmentSelect = document.getElementById("treatmentSelect");
    var slotsContainer = document.getElementById("slotsContainer");
    var slotsGrid = document.getElementById("slotsGrid");
    var apiLoader = document.getElementById("apiLoader");
    var apiError = document.getElementById("apiError");
    
    // Guardar datos inmediatamente para evitar race conditions
    var selectedTreatment = treatmentSelect ? (treatmentSelect.value || "").trim() : "";
    if (!selectedTreatment) { 
        if (slotsContainer) slotsContainer.style.display="none"; 
        return; 
    }

    var selectedTreatmentObj = ALL_TREATMENTS.find(function(t){return t.nombre === selectedTreatment});
    // Fallback: buscar por nombre sin acentos ni espacios extra
    if (!selectedTreatmentObj) {
        var normalizedSelected = selectedTreatment.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        selectedTreatmentObj = ALL_TREATMENTS.find(function(t){
            var normalizedName = (t.nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            return normalizedName === normalizedSelected;
        });
    }
    
    var duracionFilas = selectedTreatmentObj ? selectedTreatmentObj.duracionFilas : 1;
    var duracionTexto = selectedTreatmentObj ? selectedTreatmentObj.duracionTexto : "2 horas";
    _selectedTreatmentData = { nombre: selectedTreatment, duracionFilas: duracionFilas, duracionTexto: duracionTexto };
    
    // Clear error message when user selects a treatment (so it's not permanent/annoying)
    if(clearHint && apiError){
        apiError.innerHTML = "";
        apiError.style.display = "none";
        apiError.style.background = "rgba(255,68,68,0.2)";
    }
    
    if (slotsGrid) slotsGrid.innerHTML="";
    if (slotsContainer) slotsContainer.style.display="block";
    if (apiError) apiError.style.display="none";
    if (apiLoader) apiLoader.style.display="block";

    // Mostrar/ocultar notice de duracion
    var noticeDiv = document.getElementById("durationNotice");
    if (noticeDiv) {
        if (duracionFilas > 1) {
            noticeDiv.style.display = "block";
            noticeDiv.innerHTML = "📝 Este tratamiento dura <strong>" + duracionTexto + "</strong> seguidas. Solo se muestran horarios que tengan ese tiempo libre sin saltar entre días.";
        } else {
            noticeDiv.style.display = "none";
        }
    }

    var apiUrl = API_URL + "?action=obtenerTurnos&duracionFilas=" + duracionFilas + "&token=" + encodeURIComponent(API_TOKEN);
    
    fetch(apiUrl)
        .then(function(r){ 
            return r.json(); 
        })
        .catch(function(err) {
            console.error("[loadAvailableSlots] Fetch/parse error:", err);
            if (apiError) {
                apiError.innerHTML = '<div style="background:rgba(255,68,68,0.2);border:1px solid rgba(255,68,68,0.4);border-radius:8px;padding:12px;color:#ff6b6b;font-size:0.85rem;text-align:center">Error al cargar turnos: ' + err.message + '</div>';
                apiError.style.display = "block";
            }
            if (apiLoader) apiLoader.style.display="none";
            return null;
        })
        .then(function(data) {
            if (!data) return;
            if (apiLoader) apiLoader.style.display="none";
            // Habilitar botones de vista en cuanto la API responda exitosamente
            slotsLoaded = true;
            var allBtnEnable = document.getElementById("viewAllBtn");
            var calBtnEnable = document.getElementById("viewCalendarBtn");
            if (allBtnEnable) {
                allBtnEnable.style.opacity = "1";
                allBtnEnable.style.cursor = "pointer";
                allBtnEnable.style.pointerEvents = "auto";
            }
            if (calBtnEnable) {
                calBtnEnable.style.opacity = "1";
                calBtnEnable.style.cursor = "pointer";
                calBtnEnable.style.pointerEvents = "auto";
            }
          if (data.error) { showError("Error al cargar turnos: "+data.error); return; }
            console.log("[loadAvailableSlots] API response:", JSON.stringify(data).substring(0, 500));
            var slots = data.turnos || [];
            var duracionFilasNow = _selectedTreatmentData ? _selectedTreatmentData.duracionFilas : 1;
            var duracionTextoNow = _selectedTreatmentData ? _selectedTreatmentData.duracionTexto : "2 horas";
            console.log("[loadAvailableSlots] Slots recibidos:", slots.length, "para duracionFilas:", duracionFilasNow);
            if (!slots.length) { 
                var noSlotsMsg = duracionFilasNow > 1 
                    ? "No hay horarios con espacio suficiente de <strong>" + duracionTextoNow + "</strong> seguidas en el mismo día. Llamanos para consultar."
                    : "No hay turnos disponibles. Llamanos.";
                slotsGrid.innerHTML = "<div class='no-slots'>" + noSlotsMsg + "</div>"; 
                return; 
            }

            slots.forEach(function(s){
                s._horaInicioParsed = parseSheetTime(s.horaInicio);
                s._horaFinParsed = parseSheetTime(s.horaFin);
            });

            var byDate={};
            var slotsWithEmptyFecha = [];
            slots.forEach(function(s){
                var fechaKey = parseSheetDate(s.fecha);
                if (fechaKey) {
                    s._normalizedFecha = fechaKey;
                    if (!byDate[fechaKey]) byDate[fechaKey]=[];
                    byDate[fechaKey].push(s);
                } else if (s.id && s.dia && s._horaInicioParsed) {
                    slotsWithEmptyFecha.push(s);
                }
            });

            var dateKeys = Object.keys(byDate);

            if (!dateKeys.length && slotsWithEmptyFecha.length > 0) {
                console.warn("API devolvió fechas vacías. Generando fechas basadas en estructura del sheet...");
                var generatedDates = generateSlotsFromStructure(slotsWithEmptyFecha, duracionFilas);
                byDate = generatedDates.byDate;
                dateKeys = Object.keys(byDate);
            }

            if (!dateKeys.length) {
                slotsGrid.innerHTML = "<div class='no-slots'>No se encontraron turnos con fechas válidas. Llamanos para consultar.</div>";
                return;
            }

            var ahoraActual = new Date();
            var hoy = new Date();
            hoy.setHours(0, 0, 0, 0);
            var limiteMeses = new Date(hoy.getFullYear(), hoy.getMonth() + MAX_MESES_RESERVA, hoy.getDate());
            limiteMeses.setHours(23, 59, 59, 999);
            
            var horaActualStr = String(ahoraActual.getHours()).padStart(2, "0") + ":" + String(ahoraActual.getMinutes()).padStart(2, "0");
            
            var fechasFiltradas = {};
            dateKeys.forEach(function(fechaStr) {
                var fechaObj = parseDisplayDate(fechaStr);
                if (fechaObj && fechaObj >= hoy && fechaObj <= limiteMeses) {
                    var esHoy = fechaStr === (hoy.getDate().toString().padStart(2,"0") + "/" + (hoy.getMonth()+1).toString().padStart(2,"0") + "/" + hoy.getFullYear());
                    if (esHoy) {
                        var slotsDelDia = byDate[fechaStr].filter(function(s) {
                            var horaSlot = s._horaInicioParsed || "";
                            return horaSlot >= horaActualStr;
                        });
                        if (slotsDelDia.length > 0) {
                            fechasFiltradas[fechaStr] = slotsDelDia;
                        }
                    } else {
                        fechasFiltradas[fechaStr] = byDate[fechaStr];
                    }
                }
            });

            var sortedDates = Object.keys(fechasFiltradas).sort(function(a, b) {
                var partsA = a.split("/");
                var partsB = b.split("/");
                var dateA = partsA[2] + "-" + partsA[1] + "-" + partsA[0];
                var dateB = partsB[2] + "-" + partsB[1] + "-" + partsB[0];
                return dateA < dateB ? -1 : (dateA > dateB ? 1 : 0);
            });

            if (!sortedDates.length) {
                slotsGrid.innerHTML = "<div class='no-slots'>No hay turnos disponibles dentro del rango de <strong>" + MAX_MESES_RESERVA + " mes" + (MAX_MESES_RESERVA > 1 ? "es" : "") + "</strong>. Llamanos para consultar disponibilidad.</div>";
                return;
            }

            sortedDates.forEach(function(date) {
                fechasFiltradas[date].sort(function(a, b) {
                    var timeA = a._horaInicioParsed || "";
                    var timeB = b._horaInicioParsed || "";
                    return timeA < timeB ? -1 : (timeA > timeB ? 1 : 0);
                });
            });

            var html="";
            sortedDates.forEach(function(date){
                if (!date) return;
                var diaName = fechasFiltradas[date] && fechasFiltradas[date][0] ? (fechasFiltradas[date][0].dia || "") : "";
                
                // Convertir fecha "30/06" a formato completo "30/06/2026 - Martes"
                var partesFecha = date.split('/');
                var fechaCompleta = partesFecha[0] + '/' + partesFecha[1] + '/';
                
                // Buscar el año en los slots de este día
                var anioSlot = fechasFiltradas[date][0];
                if (anioSlot && anioSlot._normalizedFecha) {
                    var partesNorm = anioSlot._normalizedFecha.split('/');
                    fechaCompleta += partesNorm[2]; // año
                }
                fechaCompleta += " - " + diaName;
                
                var cantidadTurnos = fechasFiltradas[date].length;
                
                html+='<div class="date-accordion-header" data-date="'+date+'" style="padding:10px 14px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);margin-bottom:2px;transition:all 0.3s">';
                html+='<span style="color:white;font-size:0.78rem;font-weight:600">'+fechaCompleta+'</span>';
                html+='<span style="color:rgba(255,215,0,0.7);font-size:0.72rem">'+cantidadTurnos+' turnos <span class="accordion-arrow" style="display:inline-block;transition:transform 0.3s;margin-left:4px">▼</span></span>';
                html+='</div>';
                html+='<div class="date-accordion-content" data-date="'+date+'" style="display:none;padding-top:4px">';
                
                fechasFiltradas[date].forEach(function(slot){
                    var horaInicioDisplay = slot._horaInicioParsed || "";
                    var horaFinDisplay = slot._horaFinParsed || "";
                    html+='<button type="button" class="slot-btn" data-id="'+slot.id+'" data-fecha="'+date+'" data-hora="'+horaInicioDisplay+'">'+horaInicioDisplay+" - "+horaFinDisplay+'</button>';
                });
                
                html+='</div>';
            });
           slotsGrid.innerHTML=html;

            // Guardar datos globalmente para filtrado por calendario
            window._allSlotsData = [];
            Object.keys(fechasFiltradas).forEach(function(date) {
                fechasFiltradas[date].forEach(function(slot) {
                    window._allSlotsData.push(slot);
                });
            });
            slotsLoaded = true;



            // Clear error area on success
            var apiErrArea = document.getElementById("apiError");
            if(apiErrArea){
                apiErrArea.innerHTML = "";
                apiErrArea.style.display = "none";
            }

            slotsGrid.querySelectorAll(".slot-btn").forEach(function(btn){
                btn.addEventListener("click",function(){
                    slotsGrid.querySelectorAll(".slot-btn").forEach(function(b){b.classList.remove("selected")});
                    btn.classList.add("selected");
                    document.getElementById("selectedSlotId").value=btn.dataset.id;
                    document.getElementById("selectedFecha").value=btn.dataset.fecha;
                    document.getElementById("selectedHorario").value=btn.dataset.hora;
                });
            });

            // Accordion: click en fecha para expandir/colapsar turnos
            slotsGrid.querySelectorAll(".date-accordion-header").forEach(function(header){
                header.addEventListener("click",function(){
                    var dateKey = this.dataset.date;
                    var content = slotsGrid.querySelector('.date-accordion-content[data-date="'+dateKey+'"]');
                    var arrow = this.querySelector('.accordion-arrow');
                    
                    // Cerrar todos los demás
                    slotsGrid.querySelectorAll(".date-accordion-header").forEach(function(h){
                        if (h !== header) {
                            var otherDate = h.dataset.date;
                            var otherContent = slotsGrid.querySelector('.date-accordion-content[data-date="'+otherDate+'"]');
                            var otherArrow = h.querySelector('.accordion-arrow');
                            if (otherContent) otherContent.style.display = "none";
                            if (otherArrow) otherArrow.style.transform = "";
                            h.style.background = "rgba(255,255,255,0.08)";
                        }
                    });
                    
                    // Toggle actual
                    if (content) {
                        var isOpen = content.style.display === "block";
                        content.style.display = isOpen ? "none" : "block";
                        if (arrow) arrow.style.transform = isOpen ? "" : "rotate(180deg)";
                        this.style.background = !isOpen ? "rgba(196,161,109,0.25)" : "rgba(255,255,255,0.08)";
                    }
                });
            });

            // Abrir el primer día por defecto
            var firstHeader = slotsGrid.querySelector(".date-accordion-header");
            if (firstHeader) {
                firstHeader.click();
            }
        })
      .catch(function(){
            if(apiLoader)apiLoader.style.display="none";
            
            // Failed to load - show error again so user can retry
            showError();
        });
}

function showError(msg) { 
    var e = document.getElementById("apiError"); 
    if(e){ 
        e.style.display="block"; 
        
        // Verificar si es error de conexión REAL (no error del backend)
        var isConnError = !msg || msg.indexOf("conectar") !== -1 || msg.indexOf("Sin conexi") !== -1;
        
        // NO es error de conexión si el mensaje contiene palabras de negocio (backend respondió bien)
        if (!isConnError && msg) {
            var businessKeywords = ["disponible", "reservado", "tomado", "ocupado", "no encontrado", "inexistente", "proceso"];
            for (var i = 0; i < businessKeywords.length; i++) {
                if (msg.toLowerCase().indexOf(businessKeywords[i]) !== -1) {
                    isConnError = false;
                    break;
                }
            }
        }
        
        if(isConnError){
            e.style.background = "rgba(128,128,128,0.3)";
            e.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.75rem;margin:0 0 4px;text-align:center">&#9888; Problemas al conectarse con la agenda de turnos, volvé a intentar seleccionar tratamientos</p>'
                + '<p style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin:0;text-align:center">o escribinos por WhatsApp si seguís teniendo problemas</p>';
            // Reset treatment select to "Paso 1" so user knows what to do next
            var sel = document.getElementById("treatmentSelect");
            if(sel && sel.value) sel.selectedIndex = 0;
        } else {
            e.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:0.75rem;margin:0;text-align:center">&#9888; ' + (msg || "Ocurri&#243; un problema.") + '</p>';
        }
    }
}

function hideApiError() {
    var e = document.getElementById("apiError");
    if(e){
        e.innerHTML = "";
        e.style.display = "none";
        e.style.background = "rgba(255,68,68,0.2)";
    }
}

function highlightTreatmentSelect(highlight) {
    var select = document.getElementById("treatmentSelect");
    if(!select) return;
    if(highlight){
        select.style.border = "2px solid #C4A16D";
        select.style.boxShadow = "0 0 0 3px rgba(196,161,109,0.25)";
        select.style.transition = "all 0.3s ease";
    } else {
        select.style.border = "";
        select.style.boxShadow = "";
    }
}

// Override loadAvailableSlots to handle retry state
var originalLoadAvailableSlots = loadAvailableSlots;
loadAvailableSlots = function(clearHint) {
    // clearHint=true means called from onchange (user selected treatment)
    // clearHint=false means called from handleRetrySlots (retry after error)
    return originalLoadAvailableSlots(clearHint);
};

// ========== API: Submit Booking (reservar action) ==========
var bookingForm = document.getElementById("bookingForm");
if (bookingForm) {
    bookingForm.addEventListener("submit", function(e) {
        e.preventDefault();
        
        if (window._reservaFlowActive) {
            alert("Ya tenés un pago en curso. Completá el pago abierto o esperá a que expire tu turno temporal.");
            return;
        }
        
        var nombre = document.getElementById("clienteNombre").value.trim();
        var email = document.getElementById("clienteEmail").value.trim();
        var telefono = document.getElementById("clienteTelefono").value.trim();
        var notasCliente = document.getElementById("cliente-notas-comentario") ? document.getElementById("cliente-notas-comentario").value.trim() : "";
        
        var errNombre = validarNombre(nombre);
        if (errNombre) { alert(errNombre); return; }
        
        var errTel = validarTelefonoAR(telefono);
        if (errTel) { alert(errTel); return; }
        
        var tratamiento = document.getElementById("treatmentSelect") ? document.getElementById("treatmentSelect").value : "";
        var idTurno = document.getElementById("selectedSlotId") ? document.getElementById("selectedSlotId").value : "";
        var fecha = document.getElementById("selectedFecha").value;
        var horario = document.getElementById("selectedHorario").value;
        
        if (!idTurno) { alert("Por favor selecciona un dia y hora disponible."); return; }
        
        var treatmentName = tratamiento.split(" - ")[0];
        var selectedTreatmentObj = ALL_TREATMENTS.find(function(t){return t.nombre === treatmentName});
        
        // Si es solo WhatsApp, redirigir en vez de reservar
        if (selectedTreatmentObj && selectedTreatmentObj.esSoloWhatsApp) {
            var msjWs = encodeURIComponent((selectedTreatmentObj.msjWs || "Hola, queria consultar por la disponibilidad de turnos para: " + treatmentName).replace(/\n/g, ' '));
            window.open('https://wa.me/' + CONFIG.negocio.telefonoRaw + '?text=' + msjWs, '_blank');
            return;
        }
        
        var duracionFilas = selectedTreatmentObj ? (selectedTreatmentObj.duracionFilas || 1) : 1;
        var submitBtn = document.getElementById("submitBtn");
        if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = "Procesando reserva..."; }

        fetch(API_URL, {
            method: "POST", 
            body: JSON.stringify({
                token: API_TOKEN, 
                action: "reservar", 
                idTurno: idTurno, 
                nombre: nombre, 
                email: email.toLowerCase(), 
                telefono: telefono, 
                tratamiento: treatmentName, 
                duracionFilas: duracionFilas, 
                precioTotal: selectedTreatmentObj ? selectedTreatmentObj.precio : 0, 
                notasCliente: notasCliente
            })
        })
        .then(function(r){return r.json()})
        .then(function(data) {
            if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = "Confirmar Turno"; }
            if (data.status === "CONFIRMADO") {
                showBookingSuccess(nombre, treatmentName, fecha, horario, data.horaFin || "", idTurno);
            }
            else if (data.success && data.idTurno) {
                handleRequiresSena(data.idTurno, treatmentName, nombre, fecha, horario, data.montoSena, data.initPoint, data.preferenceId || "", email);
            }
            else if (data.success === false) {
                if (data.maxReservas && data.reservasActivasCount >= data.maxReservas) {
                    mostrarErrorLimiteReservas(data.error, data.tiempoRestanteMs, data.tiempoRestanteDisplay);
                } else if (data.idTurnoBloqueado) {
                    mostrarErrorReservaBloqueada(data.error, data.idTurnoBloqueado);
                } else if (data.errorTipo === "yaOcupado") {
                    mostrarErrorTurnoYaTomado(data.mensajeAmigable || data.error, data.estadoTurno);
                } else {
                    showError(data.error || "Error al confirmar. Intenta de nuevo.");
                }
            }
            else { showError("Error inesperado al conectar con la agenda. Volvé a intentar seleccionar tratamientos."); }
        })
        .catch(function() {
            if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = "Confirmar Turno"; }
            showError("No se pudo conectar con la agenda. Volvé a intentar o escribinos por WhatsApp.");
        });
    });
}

// ========== Error de reserva bloqueada (anti-acaparadores) con opcion de cancelar ==========
function mostrarErrorReservaBloqueada(mensaje, idTurnoBloqueado) {
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    senaDiv.style.display = "block";
    
    var apiErr = document.getElementById("apiError");
    if (apiErr) apiErr.style.display = "none";
    
    var form = document.getElementById("bookingForm");
    if (form) form.style.display = "none";
    
    var html = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">';
    html += '<div style="font-size:3rem;margin-bottom:16px">⛔</div>';
    html += '<h3 style="color:#FFD700;margin-bottom:12px">Reserva en Proceso</h3>';
    html += '<p style="opacity:0.9;margin-bottom:8px">' + mensaje + '</p>';
    html += '<p style="opacity:0.7;font-size:0.85rem;margin-bottom:4px">Turno bloqueado: <strong>' + idTurnoBloqueado + '</strong></p>';
    html += '<p style="opacity:0.6;font-size:0.8rem;margin-bottom:16px">⚠️ Este turno no estará disponible hasta que expire el tiempo de espera, pero los demás turnos SÍ están disponibles abajo 👇</p>';
    html += '<div style="background:rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin:16px 0;text-align:left">';
    html += '<p style="margin:0;font-size:0.85rem;opacity:0.8">Tu dinero no corre riesgo: si ya pagaste la seña de ese turno, nuestro equipo lo verificará y te contactará para confirmarlo.</p>';
    html += '</div>';
    html += '<button id="cancelarReservaAnteriorBtn" style="display:block;margin:0 auto;background:#ff6b6b;color:white;padding:14px 28px;font-size:1rem;border-radius:50px;border:none;cursor:pointer">❌ Cancelar esa reserva y elegir otro turno</button>';
    html += '<p style="opacity:0.5;font-size:0.75rem;margin-top:12px">Esto liberará el turno bloqueado inmediatamente</p>';
    senaDiv.innerHTML = html;
    
    setTimeout(function(){
        var btn = document.getElementById("cancelarReservaAnteriorBtn");
        if(btn) {
            btn.addEventListener("click", function(){
                btn.textContent = "⏳ Liberando reserva...";
                btn.disabled = true;
                
                fetch(API_URL, {method:"POST", body:JSON.stringify({token:API_TOKEN, action:"cancelarReservaTemporal", idTurno:idTurnoBloqueado})})
                    .then(function(r){return r.json()})
                    .then(function(data) {
                        clearActiveTurnoStorage();
                        if(window._senaTimerId) clearInterval(window._senaTimerId);
                        clearReservaFlowFlag();
                        
                        var sd = document.getElementById("senaRequired");
                        if(sd){ sd.style.display="none"; sd.innerHTML=""; }
                        
                        showError("✅ Reserva cancelada. El turno elegido NO estará disponible hasta que expire el tiempo de espera (aprox. 5 min), pero los demás turnos sí están disponibles para reservar ahora.");
                        mostrarTurnosDisponiblesDespuesDeCancelar();
                    })
                    .catch(function(err) {
                        console.warn("Error liberando reserva:", err);
                        var sd = document.getElementById("senaRequired");
                        if(sd){ sd.style.display="none"; sd.innerHTML=""; }
                        var f = document.getElementById("bookingForm");
                        if(f) f.style.display="block";
                        showError("✅ Reserva cancelada localmente. Si hubo un pago previo, te contactaremos.");
                    });
            });
        }
    }, 100);
}

// ========== Error: turno ya tomado por otra persona ==========
function mostrarErrorTurnoYaTomado(mensaje, estadoTurno) {
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    
    // Ocultar la barra de error genérica
    var apiErr = document.getElementById("apiError");
    if(apiErr){
        apiErr.style.display = "none";
        apiErr.innerHTML = "";
    }
    
    var form = document.getElementById("bookingForm");
    var slotsContainer = document.getElementById("slotsContainer");
    var treatmentSelect = document.getElementById("treatmentSelect");
    var selectedTreatment = treatmentSelect ? treatmentSelect.value : "";
    
    // Mostrar el aviso de turno tomado con estilo pro (simplificado)
    var html = '<div style="background:rgba(255,107,107,0.12);border:2px solid rgba(255,107,107,0.35);border-radius:16px;padding:28px 24px;margin-bottom:20px;text-align:center">';
    html += '<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:rgba(255,107,107,0.2);margin-bottom:16px">';
    html += '<span style="font-size:1.8rem">🕐</span></div>';
    html += '<h3 style="color:#FFD700;margin:0 0 10px;font-size:1.3rem">Turno ya reservado</h3>';
    html += '<p style="opacity:0.9;margin-bottom:6px">' + (mensaje || "Este turno acaba de ser tomado por otra persona.") + '</p>';
    html += '</div>';
    
    // Insertar el aviso DESPUES del tratamiento seleccionado y ANTES de los turnos
    var warningEl = document.createElement("div");
    warningEl.id = "turnoYaTomadoWarning";
    warningEl.innerHTML = html;
    
    if(slotsContainer && slotsContainer.parentNode){
        slotsContainer.parentNode.insertBefore(warningEl, slotsContainer);
    } else if(senaDiv && senaDiv.parentNode){
        senaDiv.parentNode.insertBefore(warningEl, senaDiv);
    }
    
    // Mostrar contenedor de slots y recargar turnos
    if(slotsContainer){
        slotsContainer.style.display = "block";
        
        if (selectedTreatment) {
            // Mostrar spinner en el grid de turnos
            var slotsGrid = document.getElementById("slotsGrid");
            if (slotsGrid) {
                slotsGrid.innerHTML = '<div style="text-align:center;padding:40px 20px;opacity:0.8">'
                    + '<div class="spinner" style="margin:0 auto 16px"></div>'
                    + '<p style="font-size:0.9rem">Cargando horarios disponibles...</p></div>';
            }
            
            // Ocultar formulario de datos personales mientras carga
            if(form) form.style.display = "none";
        }
        
        // Cargar turnos disponibles manteniendo tratamiento seleccionado
        setTimeout(function() {
            loadAvailableSlots(true);
            
            // Después de cargar, mostrar el formulario completo
            setTimeout(function() {
                if(form) form.style.display = "block";
                
                // Scroll suave hacia el aviso (primer elemento visible)
                setTimeout(function() {
                    if(warningEl){
                        var rect = warningEl.getBoundingClientRect();
                        if(rect.top < 80 || rect.top > window.innerHeight){
                            window.scrollTo({ 
                                top: warningEl.offsetTop - 80, 
                                behavior: "smooth" 
                            });
                        }
                    }
                }, 200);
            }, 400);
        }, 300);
    } else {
        // Scroll suave hacia el aviso
        setTimeout(function() {
            if(warningEl){
                window.scrollTo({ 
                    top: warningEl.offsetTop - 80, 
                    behavior: "smooth" 
                });
            }
        }, 200);
    }
}

// ========== Error de límite de reservas (máx 2 simultáneas) con countdown ==========
function mostrarErrorLimiteReservas(mensaje, tiempoRestanteMs, tiempoRestanteDisplay) {
    var senaDiv = document.getElementById("senaRequired");
    if (!senaDiv) return;
    senaDiv.style.display = "block";
    
    var apiErr = document.getElementById("apiError");
    if (apiErr) apiErr.style.display = "none";
    
    var form = document.getElementById("bookingForm");
    if (form) form.style.display = "none";
    
    var html = '<div style="background:rgba(0,0,0,0.15);border-radius:16px;padding:32px 24px;max-width:550px;margin:0 auto;text-align:center">';
    html += '<div style="font-size:3rem;margin-bottom:16px">🕐</div>';
    html += '<h3 style="color:#FFD700;margin-bottom:12px">Límite de Reservas Alcanzado</h3>';
    html += '<p style="opacity:0.9;margin-bottom:8px">' + mensaje + '</p>';
    html += '<div style="background:rgba(255,215,0,0.15);border-radius:12px;padding:16px;margin:16px 0">';
    html += '<p style="margin:0;font-size:1.8rem;font-weight:700;color:#FFD700" id="limiteReservaCountdown">' + tiempoRestanteDisplay + '</p>';
    html += '<p style="margin:4px 0 0;font-size:0.85rem;opacity:0.8">Tiempo restante para que se libere una reserva</p>';
    html += '</div>';
    senaDiv.innerHTML = html;
    
    // Countdown en tiempo real
    var countdownInterval = setInterval(function() {
        if (!tiempoRestanteMs || tiempoRestanteMs <= 0) {
            clearInterval(countdownInterval);
            location.reload();
            return;
        }
        tiempoRestanteMs -= 1000;
        var m = Math.floor(tiempoRestanteMs / 60000);
        var s = Math.floor((tiempoRestanteMs % 60000) / 1000);
        var td = m + ":" + ((s < 10 ? "0" : "") + s);
        var el = document.getElementById("limiteReservaCountdown");
        if (el) el.textContent = td;
        
        if (tiempoRestanteMs <= 0) {
            clearInterval(countdownInterval);
            location.reload();
        }
    }, 1000);
    
    // Mantener visible los turnos disponibles
    setTimeout(function() {
        var slotsContainer = document.getElementById("slotsContainer");
        if (slotsContainer) slotsContainer.style.display = "block";
        
        var reservarSection = document.getElementById("reservar");
        if(reservarSection){
            var timerId = window._senaTimerId;
            window._senaTimerId = null;
            window._silenceBeforeUnload = { _ts: Date.now() };
            _popstateSilenceTs = Date.now();
            try { window.scrollTo({ top: reservarSection.offsetTop - 100, behavior: "smooth" }); } catch(e) {}
            setTimeout(function() { window._senaTimerId = timerId; window._silenceBeforeUnload = false; }, 1000);
        }
    }, 200);
}

// ========== Mostrar turnos disponibles después de cancelar reserva bloqueada ==========
function mostrarTurnosDisponiblesDespuesDeCancelar() {
    var slotsContainer = document.getElementById("slotsContainer");
    if (slotsContainer) slotsContainer.style.display = "block";
    
    loadAvailableSlots();
    
    setTimeout(function() {
        var reservarSection = document.getElementById("reservar");
        if(reservarSection){
            var timerId3 = window._senaTimerId;
            window._senaTimerId = null;
            window._silenceBeforeUnload = { _ts: Date.now() };
            _popstateSilenceTs = Date.now();
            try { window.scrollTo({ top: reservarSection.offsetTop - 100, behavior: "smooth" }); } catch(e) {}
            setTimeout(function() { window._senaTimerId = timerId3; window._silenceBeforeUnload = false; }, 1000);
        }
    }, 300);
}

function resetBookingForm() {
    // Detener polling activopara evitar polling infinito
    if (typeof stopStatusPolling === 'function') stopStatusPolling();
    // Resetear contador de reintentos de sin conexión
    if (typeof resetSinConnRetryCount === 'function') resetSinConnRetryCount();
    
    var senaDiv = document.getElementById("senaRequired");
    if (senaDiv) { senaDiv.style.display = "none"; senaDiv.innerHTML = ""; }
    var timerEl = document.getElementById("senaTimer");
    if (timerEl) { timerEl.style.display = "none"; timerEl.textContent = ""; }
    showAllSections();
    var form = document.getElementById("bookingForm");
    if (form) form.style.display = "block";
    var slotsContainer = document.getElementById("slotsContainer");
    if (slotsContainer) slotsContainer.style.display = "block";
    
    // Mostrar de nuevo header y subtitulo al resetear (dejar politica intacta)
    var reservarSection = document.getElementById("reservar");
    if(reservarSection){
        var ctaContent = reservarSection.querySelector(".cta-content");
        if(ctaContent){
            var h2 = ctaContent.querySelector("h2"); if(h2) h2.style.display="";
            var firstP = ctaContent.querySelectorAll("p")[0]; if(firstP) firstP.style.display="";
        }
    }
    
    clearReservaFlowFlag();
    try {
        if (reservarSection) {
            var timerId2 = window._senaTimerId;
            window._senaTimerId = null;
            window._silenceBeforeUnload = { _ts: Date.now() };
            _popstateSilenceTs = Date.now();
            try { window.scrollTo({ top: reservarSection.offsetTop - 100, behavior: "smooth" }); } catch(e) {}
            setTimeout(function() { window._senaTimerId = timerId2; window._silenceBeforeUnload = false; }, 1000);
        }
    } catch(e) {}
}

// ========== Show Success ==========
function showBookingSuccess(nombre, tratamiento, fecha, hora, horaFin, idTurno) {
    // BUGFIX #5: Detener polling PRIMERO — antes de cualquier otra operación
    // Esto evita que el polling muestre no-exito después de mostrar éxito
    if (typeof stopStatusPolling === 'function') stopStatusPolling();
    
    _successShown = true; // BUGFIX #5: marca que éxito ya fue mostrado, evita no-exito posterior
    
    // DESACTIVAR detección de conexión una vez que se muestra el resultado final
    if (typeof _connectionDetectionActive !== 'undefined') {
        _connectionDetectionActive = false;
    }
    if (typeof _connectionCooldownUntil !== 'undefined') {
        _connectionCooldownUntil = Date.now() + 15000;
    }
    
    console.log("✅ [SUCCESS] === MOSTRANDO ÉXITO ===");
    console.log("   - nombre: " + nombre + ", tratamiento: " + tratamiento);
    console.log("   - fecha: " + fecha + ", hora: " + hora);
    console.log("   - _successShown = true (bloqueando no-exito)");
    
    if(window._senaTimerId) clearInterval(window._senaTimerId);
    var timerEl = document.getElementById("senaTimer"); if(timerEl){ timerEl.style.display="none"; timerEl.textContent=""; }
    var timerBig = document.getElementById("senaTimerBig"); if(timerBig) timerBig.textContent="0:00";
    var form = document.getElementById("bookingForm"); if(form) form.style.display="none";
    var senaDiv = document.getElementById("senaRequired"); if(senaDiv) senaDiv.style.display="none";
    var apiError = document.getElementById("apiError"); if(apiError) apiError.style.display="none";
    
    // Ocultar header del formulario cuando ya se confirmo (dejar politica intacta)
    var reservarSection = document.getElementById("reservar");
    if(reservarSection){
        var ctaContent = reservarSection.querySelector(".cta-content");
        if(ctaContent){
            // Ocultar h2 y subtitulo (primer p) para eliminar espacios gigantes
            var h2 = ctaContent.querySelector("h2"); if(h2) h2.style.display="none";
            var firstP = ctaContent.querySelectorAll("p")[0]; if(firstP) firstP.style.display="none";
            // Reducir padding del contenedor para eliminar espacios vacios
            ctaContent.style.paddingTop = "20px";
            ctaContent.style.paddingBottom = "20px";
            
            // Reducir margen del parrafo de politica (CSS tiene margin-bottom: 40px en .cta-content p)
            var allPs = Array.from(ctaContent.querySelectorAll("p"));
            var policyP = allPs.find(function(p){ return p.textContent.indexOf("Política de reservas") !== -1; });
            if(policyP) policyP.style.marginBottom = "5px";
        }
        // Reducir padding de la seccion completa para eliminar espacio gigante arriba
        reservarSection.style.paddingTop = "10px";
        reservarSection.style.paddingBottom = "30px";
        
// Reducir margen del texto de politica (esta FUERA del form, hay que buscarlo directo)
        var policyText2 = document.getElementById("policyText");
        if(policyText2){
            policyText2.style.marginTop = "8px";
            policyText2.style.marginBottom = "4px";
        }
    }
    
    clearActiveTurnoStorage();
    
    // Formatear fecha/hora si vienen en formato ISO
    try {
        if (fecha && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
            var fd = new Date(fecha);
            fecha = String(fd.getDate()).padStart(2,'0') + '/' + String(fd.getMonth()+1).padStart(2,'0') + '/' + fd.getFullYear();
        }
        if (hora && hora.indexOf(':') === -1) {
            var hd = new Date(hora);
            if (!isNaN(hd.getTime())) {
                hora = String(hd.getHours()).padStart(2,'0') + ':' + String(hd.getMinutes()).padStart(2,'0');
            }
        } else if (hora && hora.indexOf(':') > 0) {
            var hm = hora.match(/(\d{1,2}):(\d{2})/);
            if (hm) hora = String(parseInt(hm[1])).padStart(2,'0') + ':' + hm[2];
        }
    } catch(e) {}
    showAllSections();
    clearReservaFlowFlag();
    var successDiv = document.getElementById("bookingSuccess");
    if(successDiv){
        successDiv.style.display="block";
        
        // Guardar datos temporalmente para Calendar (con hora fin real de la API)
        var horaFinFormateada = horaFin ? formatHoraDesdeSheets(horaFin) : "";
        window._bookingData = { 
            nombre: nombre, 
            trat: tratamiento, 
            fecha: fecha, 
            hora: hora,
            horaFin: horaFinFormateada || calcularHoraFin(hora),
            idTurno: idTurno || ""
        };
        
        var successHTML = '<div style="padding:28px 24px 30px 24px;max-width:550px;margin:0 auto;text-align:center;border:1px solid rgba(255,255,255,0.25);border-radius:16px;background:rgba(0,80,80,0.2)">';
        successHTML += '<div style="font-size:3rem;margin-bottom:12px">✅</div>';
        successHTML += '<h3 style="font-size:1.6rem;margin-bottom:6px;color:#FFD700">Turno Agendado con Exito!</h3>';
        successHTML += '<p style="opacity:0.9;margin-bottom:16px">' + CONFIG.mensajes.confirmacionTurno + '</p>';
        successHTML += '<p style="color:#FFD700;font-size:0.8rem;margin-bottom:16px;opacity:0.85">⚠️ Si no recibes el email en 2 minutos, revisá la carpeta de SPAM o Correos no deseados.</p>';
        
        // Datos del turno para captura de pantalla
        successHTML += '<div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.35);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">';
        successHTML += '<h4 style="color:rgba(255,255,255,0.85);margin:0 0 12px;font-size:0.95rem;text-align:center">📋 Tus Datos de Reserva</h4>';
        
        // Buscar ID del turno en los campos ocultos del formulario
        var turnoIdFromDOM = document.getElementById("selectedSlotId") ? document.getElementById("selectedSlotId").value : "";
        
        successHTML += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
        successHTML += '<span style="opacity:0.7;font-size:0.85rem">Cliente:</span>';
        successHTML += '<strong style="color:#fff;font-size:0.9rem">' + (nombre || "") + '</strong>';
        successHTML += '</div>';
        
        if (turnoIdFromDOM) {
            successHTML += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
            successHTML += '<span style="opacity:0.7;font-size:0.85rem">Turno:</span>';
            successHTML += '<strong style="color:#FFD700;font-size:0.9rem">' + turnoIdFromDOM + '</strong>';
            successHTML += '</div>';
        }
        
        successHTML += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
        successHTML += '<span style="opacity:0.7;font-size:0.85rem">Tratamiento:</span>';
        successHTML += '<strong style="color:#fff;font-size:0.9rem">' + (tratamiento || "") + '</strong>';
        successHTML += '</div>';
        
        successHTML += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.2)">';
        successHTML += '<span style="opacity:0.7;font-size:0.85rem">Fecha:</span>';
        successHTML += '<strong style="color:#fff;font-size:0.9rem">' + (fecha || "") + '</strong>';
        successHTML += '</div>';
        
        successHTML += '<div style="display:flex;justify-content:space-between;padding:8px 0">';
        successHTML += '<span style="opacity:0.7;font-size:0.85rem">Horario:</span>';
        successHTML += '<strong style="color:#fff;font-size:0.9rem">' + (hora || "") + ' hs</strong>';
        successHTML += '</div>';
        
        successHTML += '</div>'; // cierra card datos
        
        // Nota para captura
        successHTML += '<p style="opacity:0.6;font-size:0.7rem;margin:0 0 10px;line-height:1.4">⚠️ Te recomendamos hacer captura de pantalla como comprobante de tu reserva.</p>';
        
        // Direccion con link a Maps y WhatsApp
        successHTML += '<div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.35);border-radius:14px;padding:16px;margin-bottom:16px">';
        successHTML += '<p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:0.8rem">📍 Direccion del consultorio</p>';
        successHTML += '<p style="margin:0 0 8px;color:rgba(255,255,255,0.9);font-size:0.8rem;line-height:1.4">' + CONFIG.negocio.direccion + '</p>';
        successHTML += '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">';
        successHTML += '<a href="' + CONFIG.negocio.googleMapsUrl + '" target="_blank" style="display:inline-block;background:#4285F4;color:white;padding:8px 16px;border-radius:50px;text-decoration:none;font-size:0.75rem;font-weight:600">🗺️ Ver en Google Maps</a>';
        successHTML += '<a href="https://wa.me/' + CONFIG.negocio.telefonoRaw + '?text=' + encodeURIComponent('Hola! Confirmé mi turno ' + (idTurno || '') + ' para ' + (tratamiento || '') + ' el ' + (fecha || '') + ' a las ' + (hora || '') + ' hs. Necesito hacer una consulta.') + '" target="_blank" style="display:inline-block;background:#25D366;color:white;padding:8px 16px;border-radius:50px;text-decoration:none;font-size:0.75rem;font-weight:600">📱 Consultar por WhatsApp</a>';
        successHTML += '</div></div>';
        
        // Google Calendar button
        successHTML += '<p style="opacity:0.9;margin-bottom:8px;font-size:0.85rem">Guardalo en tu Google Calendar (con recordatorios):</p>';
        successHTML += '<button id="saveCalendarBtn" class="btn-primary" style="background:white;color:#A8864F;padding:12px 24px;font-size:0.9rem;border-radius:50px;border:none;box-shadow:0 2px 8px rgba(0,0,0,0.2);cursor:pointer;display:block;margin:0 auto 30px auto">📅 Guardar en Google Calendar</button>';
        successHTML += '</div>'; // cierra card principal
        
        successDiv.innerHTML = successHTML;
        
        setTimeout(function(){
            var cb = document.getElementById("saveCalendarBtn");
            if(cb) cb.addEventListener("click", openCalendar);
        }, 100);
    }
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

// ========== Google Calendar ==========
function openCalendar() {
    var bd = window._bookingData || window._pendingSenaData; 
    if(!bd) return;
    
    // Usar la funcion estandarizada de config.js para construir la URL
    var url = buildGoogleCalendarUrl(
        bd.trat || bd.tratamiento, 
        bd.fecha, 
        bd.hora, 
        bd.horaFin || "",
        CONFIG.calendar.ubicacionDefault,
        bd.nombre,
        bd.idTurno || ""
    );
    window.open(url, "_blank");
}

// ========== Parse treatment long description (JSON format) ==========
function parseTratamientoLargo(texto) {
    if (!texto) return { intro: "", sections: [] };

    // Try to parse as JSON first
    try {
        var data = typeof texto === 'string' ? JSON.parse(texto) : texto;
        var sections = [];
        var iconMap = {
            'check': '\u2713',
            'arrow': '\u25B6',
            'dot': '\u2022'
        };

        if (data.sections && Array.isArray(data.sections)) {
            for (var i = 0; i < data.sections.length; i++) {
                var sec = data.sections[i];
                // Handle both old format (items as strings) and new format (items with iconType)
                var items = [];
                if (sec.items && sec.items.length > 0) {
                    for (var j = 0; j < sec.items.length; j++) {
                        var rawItem = sec.items[j];
                        var itemText = '';
                        var itemIcon = iconMap[sec.iconType] || '\u2713'; // fallback to section icon

                        if (typeof rawItem === 'string') {
                            itemText = rawItem.trim();
                        } else if (rawItem.text) {
                            itemText = rawItem.text.trim();
                            if (rawItem.iconType && iconMap[rawItem.iconType]) {
                                itemIcon = iconMap[rawItem.iconType];
                            }
                        }

                        if (itemText) {
                            items.push({text: itemText, icon: itemIcon});
                        }
                    }
                }

                if (items.length > 0 || sec.title) {
                    sections.push({
                        title: sec.title || '',
                        icon: iconMap[sec.iconType] || '\u2713',
                        items: items
                    });
                }
            }
        }

        return { intro: data.intro || '', sections: sections };
    } catch (e) {
        // Fallback: if it's not valid JSON, treat as plain text
        console.warn('descripcionLarga is not valid JSON, treating as plain text:', e);
        return { intro: texto.replace(/\n/g, ' '), sections: [] };
    }
}

// ========== Render treatments dynamic HTML ==========
function renderServicesFromData() {
    var grid = document.getElementById("servicesGrid");
    if (!grid) return;
    var html = "";
    ALL_TREATMENTS.forEach(function(t) {
        var imgSrc = t.imagen ? t.imagen : "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&h=400&fit=crop";
        if (imgSrc.includes('drive.google.com/file/d/')) {
            var match = imgSrc.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match && match[1]) imgSrc = "https://drive.google.com/uc?id=" + match[1];
        }
        
        var shortDesc = t.descripcionCorta || "";
        if (!shortDesc && t.descripcionLarga) {
            // Try to extract from JSON intro field
            try {
                var parsedLg = typeof t.descripcionLarga === 'string' ? JSON.parse(t.descripcionLarga) : t.descripcionLarga;
                if (parsedLg.intro) shortDesc = parsedLg.intro.trim();
            } catch(e) {
                // Fallback: plain text truncation
                shortDesc = t.descripcionLarga.substring(0, 120).replace(/\n/g, ' ') + "...";
            }
        }
        
        var cardStyle = t.colorBorde ? "border-left: 4px solid " + t.colorBorde : "";
        html += "<div class='service-card' data-treatment-id='" + (t.id || '') + "' data-category='" + t.category + "' style='" + cardStyle + "'>";
        html += "<div class='service-card-image-wrapper'>";
        html += "<img src='" + imgSrc + "' alt='" + t.nombre + "' class='service-card-image'>";
        if (t.badge) html += "<span class='service-badge'>" + t.badge + "</span>";
        html += "</div>";
        html += "<div class='service-card-body'>";
        html += "<h3>" + t.nombre + "</h3>";
        if (shortDesc) {
            html += "<p class='service-short-desc'>" + shortDesc + "</p>";
        }
        html += "<div style='display:flex;gap:10px;align-items:center;margin-top:8px;'>";
        html += "<button class='btn-ver-mas' data-treatment-index='" + ALL_TREATMENTS.indexOf(t) + "'>Ver mas</button>";
        html += "</div>";
        html += "<div class='service-meta'>";
        html += "<div><div class='service-price'>" + t.precioDisplay + " <small>ARS</small></div>";
        if (t.duracionTexto) {
            html += "<div class='service-duration'>\u23F0 " + t.duracionTexto + "</div>";
        }
        html += "</div>";
        var wsPhone = CONFIG.negocio.telefonoRaw || "541123178918";
        if (!t.reservaManual) {
            var wsMsg = encodeURIComponent(t.msjWs || "Hola! Quiero reservar este turno. Me podrias indicar los horarios disponibles? Gracias.");
            html += "<a href='https://wa.me/" + wsPhone + "?text=" + wsMsg + "' target='_blank' class='btn-book-ws'>Reserva disponible solo por WhatsApp</a>";
        } else {
            html += "<a href='#reservar' class='btn-book-sm' data-treatment-id='" + (t.id || '') + "' data-treatment-name='" + (t.nombre || '').replace(/'/g, "\\'") + "' onclick=\"window.selectTreatmentAndScroll(this.getAttribute('data-treatment-name'));return false;\">Reservar Ya</a>";
        }
        html += "</div></div></div>";
    });
    grid.innerHTML = html;
    
    // Attach click handlers for "Ver mas" buttons
    document.querySelectorAll('.btn-ver-mas').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt(this.getAttribute('data-treatment-index'));
            openTreatmentModal(idx);
        });
    });
}

// ========== Treatment Detail Modal ==========
function openTreatmentModal(treatmentIndex) {
    var t = ALL_TREATMENTS[treatmentIndex];
    if (!t) return;
    
    var parsed = parseTratamientoLargo(t.descripcionLarga || "");
    
    // Build modal content
    var overlay = document.createElement('div');
    overlay.className = 'treatment-modal-overlay';
    overlay.setAttribute('data-treatment-index', treatmentIndex);
    
    var imgSrc = t.imagen ? t.imagen : "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&h=400&fit=crop";
    
    var modalHTML = "<div class='treatment-modal'>";
    modalHTML += "<div class='modal-header'><button class='modal-close' aria-label='Cerrar'>&#10005;</button><div class='modal-image-wrapper'><img src='" + imgSrc + "' alt='" + t.nombre + "' class='modal-image'></div></div>";
    modalHTML += "<div class='modal-body'>";
    
    // Header with name, price, duration
    modalHTML += "<h2>" + t.nombre + "</h2>";
    modalHTML += "<div class='modal-header-meta'><span class='modal-price'>" + t.precioDisplay + " <small>ARS</small></span><span class='modal-duration'>\u23F0 " + (t.duracionTexto || '2 horas') + "</span></div>";
    
    // Category badge
    if (t.category) {
        modalHTML += "<span class='modal-category-badge'>" + t.category + "</span>";
    }
    
    // Intro text
    if (parsed.intro && parsed.intro.length > 0) {
        modalHTML += "<div class='modal-section modal-intro'><p>" + parsed.intro.replace(/\n/g, '<br>') + "</p></div>";
    }
    
    // Sections with items
    for (var i = 0; i < parsed.sections.length; i++) {
        var sec = parsed.sections[i];
        if (sec.items && sec.items.length > 0) {
            modalHTML += "<div class='modal-section'>";
            if (sec.title) {
                modalHTML += "<h4><span class='section-icon'>" + sec.icon + "</span> " + sec.title + "</h4>";
            }
            modalHTML += "<ul class='modal-list'>";
            for (var j = 0; j < sec.items.length; j++) {
                var itemText = typeof sec.items[j] === 'string' ? sec.items[j].trim() : (sec.items[j].text || '').trim();
                var itemIcon = typeof sec.items[j] === 'object' && sec.items[j].icon ? sec.items[j].icon : '';
                if (itemIcon) {
                    modalHTML += "<li style='padding-left:0'><span class='modal-item-icon'>" + itemIcon + "</span> " + itemText.replace(/\n/g, ' ') + "</li>";
                } else {
                    modalHTML += "<li>" + itemText.replace(/\n/g, ' ') + "</li>";
                }
            }
            modalHTML += "</ul>";
            modalHTML += "</div>";
        }
    }
    
    // CTA button
    var wsPhone = CONFIG.negocio.telefonoRaw || "541123178918";
    if (!t.reservaManual) {
        var wsMsgModal = encodeURIComponent(t.msjWs || "Hola! Quiero reservar este turno. Me podrias indicar los horarios disponibles? Gracias.");
        modalHTML += "<div class='modal-cta'><a href='https://wa.me/" + wsPhone + "?text=" + wsMsgModal + "' target='_blank' class='btn-book-lg btn-book-ws'>Reserva disponible solo por WhatsApp</a></div>";
    } else {
        modalHTML += "<div class='modal-cta'><a href='#reservar' class='btn-book-lg' data-treatment-name='" + (t.nombre || '').replace(/'/g, "\\'") + "' onclick=\"window.selectTreatmentAndScroll(this.getAttribute('data-treatment-name'));return false;\">Reservar Este Tratamiento</a></div>";
    }
    
    modalHTML += "</div></div>";
    overlay.innerHTML = modalHTML;
    
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    
    // Close handlers
    var closeBtn = overlay.querySelector('.modal-close');
    closeBtn.addEventListener('click', function() { closeModal(); });
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });
}

function closeModal() {
    var existing = document.querySelector('.treatment-modal-overlay');
    if (existing) {
        existing.style.opacity = '0';
        setTimeout(function() {
            existing.remove();
            document.body.style.overflow = '';
        }, 300);
    }
}

function populateTreatmentSelect() {
    var select = document.getElementById("treatmentSelect");
    if (!select) return;
    var currentVal = select.value;
    select.innerHTML = '';
    if (ALL_TREATMENTS.length === 0) {
        var defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.textContent = "No hay tratamientos disponibles";
        select.appendChild(defaultOpt);
        return;
    }
    var defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.textContent = "Paso 1: Elegí un tratamiento";
    select.appendChild(defaultOpt);
    ALL_TREATMENTS.filter(function(t) { return !t.esSoloWhatsApp; }).forEach(function(t) {
        var duracionLabel = t.duracionFilas > 1 ? " (4h)" : " (2h)";
        var opt = document.createElement('option');
        opt.value = t.nombre;
        opt.textContent = t.nombre + " - " + t.precioDisplay + duracionLabel;
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}

// ========== Pre-select treatment and scroll to booking form ==========
function selectTreatmentAndScroll(treatmentName) {
    // Close the treatment modal first so user lands directly on booking interface
    closeModal();

    var select = document.getElementById("treatmentSelect");
    if (!select) return;

    // Normalize function: trim whitespace and normalize accents
    function norm(str) {
        return (str || '').toString().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    var found = false;
    var tNorm = norm(treatmentName);

    // Try to match by comparing normalized values
    for (var i = 0; i < select.options.length; i++) {
        if (norm(select.options[i].value) === tNorm) {
            select.value = select.options[i].value;
            found = true;
            break;
        }
    }

    // Fallback: partial match - check if normalized names contain each other
    if (!found) {
        for (var j = 0; j < select.options.length; j++) {
            var optNorm = norm(select.options[j].value);
            if (optNorm && optNorm.length > 5 && (tNorm.indexOf(optNorm) !== -1 || optNorm.indexOf(tNorm) !== -1)) {
                select.value = select.options[j].value;
                found = true;
                break;
            }
        }
    }

    // Dispatch change event AND directly call loadAvailableSlots for mobile reliability
    // Some mobile browsers don't reliably trigger inline onchange from dispatched events
    if (found && select.value) {
        var changeEvent = new Event('change', { bubbles: true });
        select.dispatchEvent(changeEvent);

        // Direct call ensures slots load even if the inline onchange handler
        // doesn't fire on mobile (known issue with iOS Safari and Android Chrome)
        setTimeout(function() {
            loadAvailableSlots(true);
        }, 100);
    }

    // Scroll to the reservation section after modal closes and treatment is selected
    setTimeout(function() {
        var reservarSection = document.getElementById("reservar");
        if (reservarSection) {
            reservarSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 350);
}

// ========== MINI CALENDARIO - Vista por día específico ==========
var currentCalendarDate = new Date();
var calendarSelectedDate = null;

function setViewMode(mode) {
    if (!slotsLoaded || !window._allSlotsData || window._allSlotsData.length === 0) {
        return;
    }
    var allBtn = document.getElementById("viewAllBtn");
    var calBtn = document.getElementById("viewCalendarBtn");
    var miniCal = document.getElementById("miniCalendar");
    var slotsGrid = document.getElementById("slotsGrid");
    
    if (mode === 'all') {
        allBtn.style.background = "rgba(196,161,109,0.3)";
        allBtn.style.borderColor = "rgba(196,161,109,0.5)";
        allBtn.style.color = "white";
        calBtn.style.background = "rgba(255,255,255,0.08)";
        calBtn.style.borderColor = "rgba(255,255,255,0.2)";
        calBtn.style.color = "rgba(255,255,255,0.6)";
        miniCal.style.display = "none";
        if(slotsGrid) slotsGrid.style.display = "grid";
        loadAvailableSlots(true);
    } else {
        allBtn.style.background = "rgba(255,255,255,0.08)";
        allBtn.style.borderColor = "rgba(255,255,255,0.2)";
        allBtn.style.color = "rgba(255,255,255,0.6)";
        calBtn.style.background = "rgba(196,161,109,0.3)";
        calBtn.style.borderColor = "rgba(196,161,109,0.5)";
        calBtn.style.color = "white";
        miniCal.style.display = "block";
        if(slotsGrid) slotsGrid.style.display = "none";
        currentCalendarDate = new Date();
        calendarSelectedDate = null;
        renderMiniCalendar();
    }
}

function changeCalendarMonth(dir) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + dir);
    calendarSelectedDate = null;
    renderMiniCalendar();
}

function renderMiniCalendar() {
    var year = currentCalendarDate.getFullYear();
    var month = currentCalendarDate.getMonth();
    
    var mesNombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    var diaNombres = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];
    
    document.getElementById("calendarMonthYear").textContent = mesNombres[month] + " " + year;
    
    // Construir mapa de días con turnos disponibles (misma lógica que filterSlotsByDate)
    var allSlots = window._allSlotsData || [];
    var diasConTurnos = {};
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var ahoraActual = new Date();
    var horaActualStr = String(ahoraActual.getHours()).padStart(2, "0") + ":" + String(ahoraActual.getMinutes()).padStart(2, "0");
    
    allSlots.forEach(function(t) {
        if (t._normalizedFecha) {
            var partes = t._normalizedFecha.split('/');
            if (partes.length === 3) {
                var fechaSlot = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
                if (fechaSlot.getFullYear() === year && fechaSlot.getMonth() === month) {
                    var dia = fechaSlot.getDate();
                    // Verificar que no sea pasado y que hoy no tenga horarios ya pasados
                    var esPasada = fechaSlot < hoy;
                    var tieneTurnosDisponibles = false;
                    
                    if (!esPasada) {
                        if (fechaSlot.getTime() === hoy.getTime()) {
                            // Hoy: solo contar slots con hora >= ahora
                            var slotHora = t._horaInicioParsed || "";
                            if (slotHora >= horaActualStr) {
                                tieneTurnosDisponibles = true;
                            }
                        } else {
                            tieneTurnosDisponibles = true;
                        }
                    }
                    
                    if (tieneTurnosDisponibles) {
                        if (!diasConTurnos[dia]) diasConTurnos[dia] = [];
                        diasConTurnos[dia].push(t);
                    }
                }
            }
        }
    });
    
    // Días de la semana (header)
    var daysHtml = diaNombres.map(function(d) {
        return '<div style="color:rgba(255,255,255,0.4);font-size:0.7rem;padding:4px 0">' + d + '</div>';
    }).join('');
    
    // Días del mes
    var primerDia = new Date(year, month, 1).getDay();
    var diasEnMes = new Date(year, month + 1, 0).getDate();
    
    for (var i = 0; i < primerDia; i++) {
        daysHtml += '<div></div>';
    }
    
    for (var d = 1; d <= diasEnMes; d++) {
        var fecha = new Date(year, month, d);
        var esHoy = fecha.getTime() === hoy.getTime();
        var esPasada = fecha < hoy;
        var tieneTurnos = !!diasConTurnos[d];
        var isSelected = calendarSelectedDate && calendarSelectedDate.getDate() === d && calendarSelectedDate.getMonth() === month && calendarSelectedDate.getFullYear() === year;
        
        var cursorStyle = 'not-allowed';
        var opacityStyle = '';
        
        if (esPasada || !tieneTurnos) {
            cursorStyle = 'not-allowed';
            opacityStyle = 'opacity:0.4;';
        } else {
            cursorStyle = 'pointer';
        }
        
        var classes = 'style="padding:6px 4px;border-radius:8px;font-size:0.75rem;cursor:' + cursorStyle + ';' + opacityStyle;
        if (isSelected) {
            classes += 'background:rgba(196,161,109,0.4);border:1px solid rgba(196,161,109,0.6);color:white;';
        } else if (esHoy && tieneTurnos) {
            classes += 'border:1px solid rgba(255,215,0,0.6);color:#FFD700;font-weight:600;';
        } else if (tieneTurnos) {
            classes += 'border:1px solid transparent;color:white;';
        }
        classes += '"';
        
        classes += ' data-cal-day="' + d + '" data-cal-month="' + month + '" data-cal-year="' + year + '"';
        
        daysHtml += '<div ' + classes + '>' + d + '</div>';
    }
    
    var calDaysEl = document.getElementById("calendarDays");
    calDaysEl.innerHTML = daysHtml;
    
    calDaysEl.onclick = function(e) {
        var target = e.target.closest('[data-cal-day]');
        if (!target || target.style.cursor === 'not-allowed') return;
        var day = parseInt(target.dataset.calDay);
        var m = parseInt(target.dataset.calMonth);
        var y = parseInt(target.dataset.calYear);
        if (day && !isNaN(y)) {
            selectCalendarDate(y, m, day);
        }
    };
    
}

function selectCalendarDate(year, month, day) {
    calendarSelectedDate = new Date(year, month, day);
    renderMiniCalendar();
    filterSlotsByDate(calendarSelectedDate);
}

function renderCalendarDatesList() {
    var year = currentCalendarDate.getFullYear();
    var month = currentCalendarDate.getMonth();
    var diasEnMes = new Date(year, month + 1, 0).getDate();
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    // Usar los datos locales de _allSlotsData en vez de hacer otra llamada a la API
    var allSlots = window._allSlotsData || [];
    var diasConTurnos = {};
    
    var ahoraActual = new Date();
    var horaActualStr = String(ahoraActual.getHours()).padStart(2, "0") + ":" + String(ahoraActual.getMinutes()).padStart(2, "0");
    
    allSlots.forEach(function(t) {
        if (t._normalizedFecha) {
            var partes = t._normalizedFecha.split('/');
            if (partes.length === 3) {
                var fechaSlot = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
                if (fechaSlot.getFullYear() === year && fechaSlot.getMonth() === month) {
                    var dia = fechaSlot.getDate();
                    var esPasada = fechaSlot < hoy;
                    var tieneTurnosDisponibles = false;
                    
                    if (!esPasada) {
                        if (fechaSlot.getTime() === hoy.getTime()) {
                            var slotHora = t._horaInicioParsed || "";
                            if (slotHora >= horaActualStr) {
                                tieneTurnosDisponibles = true;
                            }
                        } else {
                            tieneTurnosDisponibles = true;
                        }
                    }
                    
                    if (tieneTurnosDisponibles) {
                        if (!diasConTurnos[dia]) diasConTurnos[dia] = [];
                        diasConTurnos[dia].push(t);
                    }
                }
            }
        }
    });
    
    // Generar lista de días con turnos
    var listHtml = '';
    for (var d = 1; d <= diasEnMes; d++) {
        if (!diasConTurnos[d]) continue;
        
        var fecha = new Date(year, month, d);
        var esPasada = fecha < hoy;
        var isSelected = calendarSelectedDate && calendarSelectedDate.getDate() === d && calendarSelectedDate.getMonth() === month && calendarSelectedDate.getFullYear() === year;
        
        var displayFecha = d + '/' + (month + 1);
        var cantidadTurnos = diasConTurnos[d].length;
        
        if (!esPasada) {
            listHtml += '<div data-list-day="' + d + '" data-list-month="' + month + '" data-list-year="' + year + '" style="padding:8px 10px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;' 
                + (isSelected ? 'background:rgba(196,161,109,0.25);border:1px solid rgba(196,161,109,0.4);' : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);') 
                + '"><span style="color:white;font-size:0.8rem">' + displayFecha + '</span>'
                + '<span style="color:rgba(255,215,0,0.7);font-size:0.7rem">' + cantidadTurnos + ' turnos</span></div>';
        }
    }
    
    if (!listHtml) {
        listHtml = '<div style="text-align:center;padding:16px;color:rgba(255,255,255,0.4);font-size:0.8rem">No hay turnos disponibles este mes</div>';
    }
    
    var calDatesEl = document.getElementById("calendarDates");
    calDatesEl.innerHTML = listHtml;
    
    calDatesEl.onclick = function(e) {
        var target = e.target.closest('[data-list-day]');
        if (!target) return;
        var day = parseInt(target.dataset.listDay);
        var m = parseInt(target.dataset.listMonth);
        var y = parseInt(target.dataset.listYear);
        if (day && !isNaN(y)) {
            selectCalendarDate(y, m, day);
        }
    };
}

function filterSlotsByDate(fechaSeleccionada) {
    var slotsGrid = document.getElementById("slotsGrid");
    if (!slotsGrid) return;
    
    if (!window._allSlotsData || window._allSlotsData.length === 0) {
        slotsGrid.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.5);font-size:0.85rem">Seleccioná un tratamiento primero para ver los turnos</div>';
        return;
    }
    
    var fechaStr = String(fechaSeleccionada.getDate()).padStart(2, '0') + '/' + String(fechaSeleccionada.getMonth() + 1).padStart(2, '0');
    var diaSemana = fechaSeleccionada.toLocaleDateString('es-AR', { weekday: 'long' });
    diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
    
    // Filtrar por fecha seleccionada
    var slotsDelDia = window._allSlotsData.filter(function(s) {
        var normalizedFecha = s._normalizedFecha || '';
        return normalizedFecha && normalizedFecha.indexOf(fechaStr + '/') === 0;
    });
    
    // Si es hoy, filtrar horarios pasados (misma lógica que "Ver todos")
    if (slotsDelDia.length > 0) {
        var hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        var fechaSelDate = new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), fechaSeleccionada.getDate());
        
        if (fechaSelDate.getTime() === hoy.getTime()) {
            var horaActualStr = String(hoy.getHours()).padStart(2, "0") + ":" + String(hoy.getMinutes()).padStart(2, "0");
            slotsDelDia = slotsDelDia.filter(function(s) {
                return s._horaInicioParsed >= horaActualStr;
            });
        }
    }
    
    if (slotsDelDia.length === 0) {
        slotsGrid.innerHTML = '<div style="text-align:center;padding:30px;color:rgba(255,255,255,0.5);font-size:0.85rem">No hay turnos disponibles para esta fecha</div>';
        slotsGrid.style.display = "grid";
        return;
    }
    
    slotsGrid.style.display = "grid";
    
    slotsDelDia.sort(function(a, b) {
        var timeA = a._horaInicioParsed || "";
        var timeB = b._horaInicioParsed || "";
        return timeA < timeB ? -1 : (timeA > timeB ? 1 : 0);
    });
    
    var html = '<div class="slot-date-label" style="display:flex;align-items:center;justify-content:space-between">' + String(fechaSeleccionada.getDate()).padStart(2, '0') + '/' + String(fechaSeleccionada.getMonth() + 1).padStart(2, '0') + ' - ' + diaSemana + ' <span style="color:rgba(255,215,0,0.7);font-size:0.7rem;font-weight:400">' + slotsDelDia.length + ' turnos</span></div>';
    
    slotsDelDia.forEach(function(slot) {
        var horaInicioDisplay = slot._horaInicioParsed || "";
        var horaFinDisplay = slot._horaFinParsed || "";
        html += '<button type="button" class="slot-btn" data-id="' + slot.id + '" data-fecha="' + slot.fecha + '" data-hora="' + horaInicioDisplay + '">' + horaInicioDisplay + " - " + horaFinDisplay + '</button>';
    });
    
    slotsGrid.innerHTML = html;
    
    // Scroll suave hacia los turnos
    setTimeout(function() {
        slotsGrid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 200);
    
    // Agregar event listeners
    slotsGrid.querySelectorAll(".slot-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
            slotsGrid.querySelectorAll(".slot-btn").forEach(function(b) { b.classList.remove("selected"); });
            btn.classList.add("selected");
            document.getElementById("selectedSlotId").value = btn.dataset.id;
            document.getElementById("selectedFecha").value = btn.dataset.fecha;
            document.getElementById("selectedHorario").value = btn.dataset.hora;
        });
    });
}

// Expose globally
window.selectTreatmentAndScroll = selectTreatmentAndScroll;
