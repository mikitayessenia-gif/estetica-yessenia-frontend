// ========== UTILITY: Parse date from any format to dd/mm/yyyy string =========
function parseSheetDate(val) {
    if (!val) return "";
    // Already a string in dd/mm/yyyy format
    if (typeof val === "string" && val.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) return val;
    // Excel serial number (e.g., 46145 = May 27, 2026)
    if (typeof val === "number" && !isNaN(val)) {
        var d = new Date((val - 25569) * 86400000);
        if (!isNaN(d.getTime())) {
            var dd = String(d.getDate()).padStart(2, "0");
            var mm = String(d.getMonth() + 1).padStart(2, "0");
            var yy = d.getFullYear();
            return dd + "/" + mm + "/" + yy;
        }
    }
    // Date object (from API JSON parsing)
    if (val instanceof Date && !isNaN(val.getTime())) {
        var dd = String(val.getDate()).padStart(2, "0");
        var mm = String(val.getMonth() + 1).padStart(2, "0");
        var yy = val.getFullYear();
        return dd + "/" + mm + "/" + yy;
    }
    // ISO string like "2026-05-27T00:00:00.000Z"
    if (typeof val === "string") {
        var d = new Date(val);
        if (!isNaN(d.getTime())) {
            var dd = String(d.getDate()).padStart(2, "0");
            var mm = String(d.getMonth() + 1).padStart(2, "0");
            var yy = d.getFullYear();
            return dd + "/" + mm + "/" + yy;
        }
    }
    return "";
}

// ========== UTILITY: Parse time from any format to HH:MM string =========
function parseSheetTime(val) {
    if (!val) return "";
    // Already a string like "9:00" or "09:00"
    if (typeof val === "string" && val.match(/^\d{1,2}:\d{2}$/)) {
        var parts = val.split(":");
        return String(parseInt(parts[0])).padStart(2, "0") + ":" + parts[1];
    }
    // ISO string like "1899-12-30T09:00:00.000Z" - extract time part
    if (typeof val === "string") {
        var match = val.match(/T(\d{2}):(\d{2})/);
        if (match) return match[1] + ":" + match[2];
        var d = new Date(val);
        if (!isNaN(d.getTime())) {
            return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
        }
    }
    // Number (Excel time serial)
    if (typeof val === "number" && !isNaN(val)) {
        var d = new Date((val - 25569) * 86400000);
        if (!isNaN(d.getTime())) {
            return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
        }
    }
    // Date object
    if (val instanceof Date && !isNaN(val.getTime())) {
        return String(val.getHours()).padStart(2, "0") + ":" + String(val.getMinutes()).padStart(2, "0");
    }
    return val.toString();
}

// ========== UTILITY: Convert dd/mm/yyyy to Date for comparison =========
function parseDisplayDate(str) {
    if (!str || typeof str !== "string") return null;
    var parts = str.split("/");
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// ========== VALIDACIONES DE SEGURIDAD (Frontend) ==========
function normalizarTextoFrontend(texto) {
    if (!texto) return "";
    return texto.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ").trim();
}

function validarNombre(nombre) {
    if (!nombre || nombre.length < 2) return "El nombre debe tener al menos 2 caracteres.";
    // Rechazar si es solo numeros
    if (/^\d+$/.test(nombre)) return "El nombre parece un numero. Ingresá tu nombre completo.";
    // Rechazar patrones sospechosos (letras idénticas repetidas: asdfasdf, zxcvzxcv)
    var patronRepetido = /([a-z])\1{3,}/i;
    if (patronRepetido.test(nombre)) return "Ingresá un nombre válido.";
    return "";
}

function validarTelefonoAR(telefono) {
    if (!telefono || telefono.length < 8) return "Ingresá un numero de telefono valido.";
    // Limpiar: quitar guiones, espacios, parentesis
    var limpio = telefono.replace(/[\s\-\(\)]/g, "");
    if (!/^\d+$/.test(limpio)) return "El telefono solo puede contener numeros.";
    // Debe tener entre 10 y 15 digitos
    if (limpio.length < 10 || limpio.length > 15) return "Verificá el numero. Debe tener codigo de area + celular sin ceros ni uns al inicio.";
    return "";
}

// ========== Utility: Format Google Sheets date/time ==========
function formatSheetDate(val) {
    if (!val) return "";
    var d;
    if (val instanceof Date) { d = val; }
    else if (typeof val === "number") { d = new Date((val - 25569) * 86400000); }
    else if (typeof val === "string") {
        var parsed = val.match(/(\d{1,4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,4})/);
        if (parsed) {
            var num1 = parseInt(parsed[1], 10);
            var num2 = parseInt(parsed[2], 10);
            var num3 = parseInt(parsed[3], 10);
            if (num1 > 12) {
                d = new Date(num3, num2 - 1, num1);
            } else if (num3 > 1000) {
                d = new Date(num3, num1 - 1, num2);
            } else {
                d = new Date(num1, num2 - 1, num3);
            }
        }
        else { d = new Date(val); }
    }
    else { return val.toString(); }
    if (isNaN(d.getTime())) return val.toString();
    var days = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    var dayName = days[d.getDay()];
    var dd = d.getDate();
    var mm = String(d.getMonth()+1).padStart(2,"0");
    var yy = d.getFullYear();
    return dd + "/" + mm + "/" + yy + " - " + dayName;
}

function formatSheetTime(val) {
    if (!val) return "";
    var d;
    if (val instanceof Date) { d = val; }
    else if (typeof val === "number") { d = new Date((val - 25569) * 86400000); }
    else if (typeof val === "string") { d = new Date(val); }
    else { return val.toString(); }
    if (isNaN(d.getTime())) return val.toString();
    var h = String(d.getHours()).padStart(2,"0");
    var m = String(d.getMinutes()).padStart(2,"0");
    return h + ":" + m;
}

function formatSlotTime(val) {
    if (!val) return "";
    var d;
    if (val instanceof Date) { d = val; }
    else if (typeof val === "number") { d = new Date((val - 25569) * 86400000); }
    else if (typeof val === "string") {
        var match = val.match(/T(\d{2}):(\d{2})/);
        if (match) return match[1] + ":" + match[2];
        d = new Date(val);
    }
    else { return val.toString(); }
    if (isNaN(d.getTime())) return "00:00";
    var h = String(d.getHours()).padStart(2,"0");
    var m = String(d.getMinutes()).padStart(2,"0");
    return h + ":" + m;
}

function formatDateForStorage(val) {
    if (!val) return "";
    var d;
    if (val instanceof Date) { d = val; }
    else if (typeof val === "number") { d = new Date((val - 25569) * 86400000); }
    else if (typeof val === "string") { d = new Date(val); }
    else { return val.toString(); }
    if (isNaN(d.getTime())) return val.toString();
    var dd = String(d.getDate()).padStart(2,"0");
    var mm = String(d.getMonth()+1).padStart(2,"0");
    var yy = d.getFullYear();
    return dd + "/" + mm + "/" + yy;
}
