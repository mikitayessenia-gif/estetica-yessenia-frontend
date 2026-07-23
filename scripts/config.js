// ========== CONFIGURACION LOCAL (se sobrescribe desde API) ==========
// Estos valores se actualizan dinamicamente desde Google Sheets
// al cargar la pagina. No modificar aqui - cambiar en config-global.js

var MAX_MESES_RESERVA = 3; // Se sobrescribe desde config-global.js
var TIEMPO_EXPIRACION_RESERVA_MINUTOS = 5; // Se sobrescribe desde config-global.js, luego desde API
var CONFIG_LOADED = false; // Track if config has been loaded from API

// ========== STORAGE KEYS FOR TEMP RESERVATIONS ==========
var STORAGE_KEY_ACTIVE_TURN = "yessenia_active_turno";
var STORAGE_KEY_EXPIRY_TS = "yessenia_expiry_timestamp";

// Nota: API_URL, API_TOKEN y MP_PUBLIC_KEY se definen en config-global.js (fuente unica de verdad)
// NO duplicar aqui para evitar confusiones al hacer deploy

// Array global de tratamientos cargados desde la API
var ALL_TREATMENTS = [];

// Mapeo de duracion de tratamientos (en bloques de 2 horas)
var TREATMENT_DURATION = {
    "Limpieza Facial Profunda": 1,
    "Peeling Quimico": 1,
    "Dermoabrasion con Punta de Diamante": 1,
    "Hidratacion Express": 1,
    "Masaje Relajante Corporal": 1,
    "Tratamiento Anti-edad Premium": 1
};

// Helper: formatear fecha DD/MM/YYYY a ISO para Google Calendar
function formatDateForGoogleCalendar(dateStr) {
    if (!dateStr) return "";
    var parts = dateStr.split("/");
    if (parts.length !== 3) return dateStr;
    var day = parts[0].padStart(2, "0");
    var month = parts[1].padStart(2, "0");
    var year = parts[2];
    return year + "-" + month + "-" + day;
}

// Helper: convertir hora HH:MM a formato ISO para Google Calendar (HHMMSS)
function formatTimeForGoogleCalendar(timeStr) {
    if (!timeStr) return "";
    var parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;
    var hours = parts[0].padStart(2, "0");
    var mins = parts[1].padStart(2, "0");
    return hours + mins + "00";
}

// Helper: construir URL de Google Calendar con fecha/hora correctas y recordatorios
function buildGoogleCalendarUrl(tratamiento, fecha, horaInicio, horaFin, ubicacion, nombreCliente, idTurno) {
    var fechaISO = formatDateForGoogleCalendar(fecha);
    var inicioISO = formatTimeForGoogleCalendar(horaInicio);
    
    // Calcular hora fin correctamente si no se pasa como parametro
    var finISO;
    if (horaFin) {
        finISO = formatDateForGoogleCalendar(fecha).replace(/-/g, "") + "T" + formatTimeForGoogleCalendar(horaFin);
    } else {
        // fallback: 2 horas despues de horaInicio
        var parts = horaInicio.split(":");
        var endHour = (parseInt(parts[0]) || 0) + 2;
        finISO = formatDateForGoogleCalendar(fecha).replace(/-/g, "") + "T" + String(endHour).padStart(2,"0") + "0000";
    }
    
    var startDate = fechaISO.replace(/-/g, "") + "T" + inicioISO;
    
    // Titulo: "Tratamiento - Estetica Yessenia." (sin nombre del cliente)
    var titulo = encodeURIComponent(tratamiento + " - " + CONFIG.negocio.nombreCorto);
    
    // Detalles completos con toda la info relevante para el cliente
    var detalles = "Estética Mikita Yessenia.\n\n";
    if (nombreCliente) {
        detalles += "Cliente: " + nombreCliente + "\n\n";
    }
    detalles += "Tratamiento: " + tratamiento + "\n";
    detalles += "Fecha: " + fecha + "\n";
    detalles += "Horario: " + horaInicio + " hs";
    if (horaFin) {
        detalles += " hasta las " + horaFin + " hs";
    }
    if (idTurno) {
        detalles += "\nTurno: " + idTurno;
    }
    detalles += "\n\n" + (ubicacion || CONFIG.calendar.ubicacionDefault);
    detalles += "\n\n📱 WhatsApp: https://wa.me/" + CONFIG.negocio.telefonoRaw;
    
    var detallesEncoded = encodeURIComponent(detalles);
    var ubicacionEncoded = encodeURIComponent(ubicacion || CONFIG.calendar.ubicacionDefault);
    
    // Recordatorios: 24 horas antes y 2 horas antes (popup)
    var reminders = "1440,popup;120,popup";
    
    return "https://calendar.google.com/calendar/u/0/event?action=TEMPLATE&text=" + titulo 
        + "&details=" + detallesEncoded 
        + "&location=" + ubicacionEncoded
        + "&dates=" + startDate + "/" + finISO
        + "&ctext=" + titulo
        + "&recurrence="
        + "&reminders=" + reminders
        + "&sf=true&output=adaptive";
}
