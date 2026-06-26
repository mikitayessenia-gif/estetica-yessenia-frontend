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
function buildGoogleCalendarUrl(nombre, tratamiento, fecha, horaInicio, horaFin, ubicacion) {
    var fechaISO = formatDateForGoogleCalendar(fecha);
    var inicioISO = formatTimeForGoogleCalendar(horaInicio);
    var finISO = formatTimeForGoogleCalendar(horaFin);
    
    var startDate = fechaISO.replace(/-/g, "") + "T" + inicioISO;
    var endDateParts = fechaISO.split("-");
    // Sumar 1 dia para el fin (asumiendo turnos de maximo un dia)
    var dateObj = new Date(endDateParts[0], parseInt(endDateParts[1]) - 1, parseInt(endDateParts[2]));
    dateObj.setDate(dateObj.getDate() + 1);
    var endISO = formatDateForGoogleCalendar(
        String(dateObj.getDate()).padStart(2,"0") + "/" + 
        String(dateObj.getMonth() + 1).padStart(2,"0") + "/" + 
        dateObj.getFullYear()
    ).replace(/-/g, "");
    
    // Obtener hora fin real si se pasa como parametro
    if (horaFin) {
        var finParts = horaFin.split(":");
        endISO = formatDateForGoogleCalendar(fecha).replace(/-/g, "") + "T" + formatTimeForGoogleCalendar(horaFin);
    }
    
    var titulo = encodeURIComponent(nombre + " - " + tratamiento);
    var detalles = encodeURIComponent(CONFIG.calendar.nombreEventoDefault);
    var ubicacionEncoded = encodeURIComponent(ubicacion || CONFIG.calendar.ubicacionDefault);
    
    // Recordatorios: 24 horas antes y 2 horas antes (popup)
    // Formato del nuevo URL de Google Calendar: cada recordatorio separado por punto y coma
    var reminders = "1440,popup;120,popup";
    
    // Usar el nuevo URL que SI soporta reminders en la URL
    return "https://calendar.google.com/calendar/u/0/event?action=TEMPLATE&text=" + titulo 
        + "&details=" + detalles 
        + "&location=" + ubicacionEncoded
        + "&dates=" + startDate + "/" + endISO
        + "&ctext=" + titulo
        + "&recurrence="
        + "&reminders=" + reminders
        + "&sf=true&output=adaptive";
}
