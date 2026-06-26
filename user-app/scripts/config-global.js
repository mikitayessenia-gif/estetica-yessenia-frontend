// ====================================================
// CONFIGURACION GLOBAL CENTRALIZADA - Yessenia Estetica
// ====================================================
// Este archivo contiene TODOS los valores configurables
// del negocio. Para personalizar para otro cliente,
// cambiar solo estos valores.
// ====================================================

var CONFIG = {
    // ========== DATOS DEL NEGOCIO ==========
    negocio: {
        nombre: "Yessenia Centro de Estetica",
        nombreCorto: "Estética Yessenia.",
        direccion: "Av. Acoyte 25",
        direccionShort: "Av. Acoyte 25, Piso 5, Of. C - Caballito",
        telefono: "+54 11 2317-8918",
        telefonoRaw: "541123178918",
        email: "mikitayessenia@gmail.com",
        instagram: "@mikitayessenia",
        instagramUrl: "https://www.instagram.com/mikitayessenia",
        facebookUrl: "https://facebook.com/luminaestetica",
        tiktokUrl: "https://tiktok.com/@lumina.estetica",
        googleMapsUrl: "https://www.google.com/maps/search/Av.+Acoyte+25,+Piso+5,+Of.+C+-+Caballito,+CABA"
    },

    // ========== GOOGLE CALENDAR ==========
    calendar: {
        zonaHoraria: "America/Argentina/Buenos Aires",
        nombreEventoDefault: "Turno en Yessenia Centro de Estetica",
        recordatorioMinutos: 30,
        ubicacionDefault: "Av. Acoyte 25, Piso 5, Of. C - Caballito, CABA"
    },

    // ========== MERCADO PAGO ==========
    mercadoPago: {
        backUrls: {
            success: "", // DEJAR VACIO = usa la misma URL actual
            failure: "",
            pending: ""
        },
        autoReturn: "approved"
    },

   // ========== MENSAJES ==========
    mensajes: {
        confirmacionTurno: "Te enviamos la confirmacion por email.",
        turnoNoDisponible: "El turno ya fue tomado por otra persona.",
        tiempoAgotado: "Tu tiempo para pagar expiró y el turno ya no está disponible.",
        pagoAceptado: "Tu pago fue validado exitosamente.",
        webhookRetraso: "El webhook de Mercado Pago puede tardar unos segundos. Reintentando...",
        mensajeWhatsAppTurno: "Hola! Vi la web y me gustaria reservar turnos."
    },

    // ========== INSTAGRAM REELS (Galeria) ==========
    reels: [
          {
            id: "reel1",
            url: "https://www.instagram.com/reel/DYo8waxATgQ/?igsh=d3Nhc2d0YzRncG90/",
            embedUrl: "https://www.instagram.com/p/DYo8waxATgQ/embed/",
            caption: "Tratamiento en acción",
            emoji: "🎬"
        },
        {
            id: "reel2",
            url: "https://www.instagram.com/reel/DYWvAQkA1Rj/",
            embedUrl: "https://www.instagram.com/p/DYWvAQkA1Rj/embed/",
            caption: "Limpieza profesional",
            emoji: "💧"
        },
        {
            id: "reel3",
            url: "https://www.instagram.com/reel/DYRxxgvg-hh/",
            embedUrl: "https://www.instagram.com/p/DYRxxgvg-hh/embed/",
            caption: "Resultados reales",
            emoji: "💉"
        },
        {
            id: "reel4",
            url: "https://www.instagram.com/reel/DYiNe0_JJuP/",
            embedUrl: "https://www.instagram.com/p/DYiNe0_JJuP/embed/",
            caption: "Nuestro espacio",
            emoji: "🏠"
        }
    ],

    // ========== CATEGORIAS DE TRATAMIENTOS ==========
    // Estas categorias se usan para los botones de filtro en la seccion de servicios
    // Se muestran SOLO las categorias que tienen tratamientos asignados
    categorias: {
        "Facial": "Facial",
        "Corporal": "Corporal"
    },

    // ========== SOCIAL PROOF - RESEÑAS GOOGLE ==========
    // Estos textos se usan en la seccion de reseñas (index.html)
    // Tu tia puede editarlos facilmente sin tocar HTML ni JS
    socialProof: {
        clientasSatisfechas: "4.500",       // Cantidad de clientas satisfechas - cambia este numero y se actualiza abajo en la pagina
        fechaInicioNegocio: "1996-01-01",   // Fecha de inicio del negocio (YYYY-MM-DD) - los años se calculan automaticamente
        textoConfianza: "La confianza de m\u00e1s de {clientas} clientas nos respalda. M\u00e1s de {anios} a\u00f1os de experiencia.",
        textoSubtitulo: "Las mejores experiencias de nuestras clientas"
    },

    // ========== COMPORTAMIENTO ==========
    comportamiento: {
        maxMesesReserva: 3,
        tiempoExpiracionReservaMinutos: 5,
        mostrarWhatsAppCta: true, // true = muestra botones de WhatsApp, false = los oculta (activar cuando tenga API de WhatsApp Business)
        mostrarFacebook: true,
        mostrarTikTok: true
    }
};

// ====================================================
// VARIABLES GLOBALES COMPATIBLES CON CODIGO EXISTENTE
// ====================================================
// Estas variables mantienen compatibilidad con el codigo
// existente que espera estas variables en el scope global

var MAX_MESES_RESERVA = CONFIG.comportamiento.maxMesesReserva;
var TIEMPO_EXPIRACION_RESERVA_MINUTOS = CONFIG.comportamiento.tiempoExpiracionReservaMinutos;
var CONFIG_LOADED = false;
var STORAGE_KEY_ACTIVE_TURN = "yessenia_active_turno";
var STORAGE_KEY_EXPIRY_TS = "yessenia_expiry_timestamp";

// API Configuration (se mantiene separado porque se carga dinamicamente)
// ====================================================
// MERCADO PAGO - PUBLIC KEY (para Wallet Brick / SDK V2)
// Reemplazar con la clave real de produccion desde:
// https://www.mercadopago.com/developers/panel/credentials
// ====================================================
var MP_PUBLIC_KEY = "APP_USR-37689cf8-7f33-45a5-8687-a7cdd6c708ea"; // <-- Cambiar por la de produccion (ver README)

var API_URL = "https://script.google.com/macros/s/AKfycbxI5aDSlO3c6YOTkhRIDW_jlPdicP3CcOhUUkFjUPzwYJpYGfGkVyKageynWMmdlmAUig/exec";
var API_TOKEN = "MiCosmeticaSecretaToken2026_XYZ";
var WHATSAPP_NUMBER = CONFIG.negocio.telefonoRaw;

// Array global de tratamientos cargados desde la API
var ALL_TREATMENTS = [];
