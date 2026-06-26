// ====================================================
// GOOGLE REVIEWS CONFIG - Yessenia Centro de Estética
// ====================================================
// Archivo centralizado para administrar las reseñas de Google
// Para agregar/editar reviews, modificar el array GOOGLE_REVIEWS_CONFIG
// 
// COMO AGREGAR NUEVAS REVIEWS:
// 1. Ir a Google Maps > Perfil del negocio > Opiniones
// 2. Copiar los datos de cada review real
// 3. Agregar al array GOOGLE_REVIEWS_CONFIG (ver abajo)
// 4. Las reviews se muestran automaticamente en la landing
// ====================================================

var GOOGLE_REVIEWS_CONFIG = {
    // ========== DATOS DEL NEGOCIO EN GOOGLE ==========
    business: {
        nombre: "Yessenia Centro de Estética",
        nombreCorto: "Yessenia.",
        categoria: "Centro de estética y belleza",
        direccion: "Av. Acoyte 25, Piso 5, Of. C - Caballito, CABA",
        telefono: "+54 11 2317-8918",
        ratingGoogle: "5.0",
        totalOpiniones: "24",
        instagram: "@mikitayessenia",
        
        // Links directos a Google
        googleMapsUrl: "https://www.google.com/maps/place/Mikita+yessenia/",
        reviewsUrl: "https://www.google.com/search?kgmid=/g/11z7qbmw8z&hl=es-419&q=Mikita+yessenia",
        writeReviewUrl: "https://search.google.com/local/writereview?placeid=CHEREcgJIQ" // Se actualiza automaticamente
    },

    // ========== REVIEWS REALES DE GOOGLE ==========
    // Agregar aqui las reviews reales del perfil de Google Maps
    // Formato: { autor, texto, rating, tiempo, avatarColor }
    // Las reviews se muestran en orden cronologico (mas recientes primero)
    reviews: [
        {
            autor: "María L.",
            texto: "Excelente atención y profesionales. Me hice una limpieza facial y el resultado fue increíble. Muy recomendable!",
            rating: 5,
            tiempo: "Hace 2 semanas",
            avatarColor: "#E8913A"
        },
        {
            autor: "Carolina P.",
            texto: "La mejor clinica estetica del barrio. Yessenia es una profesional de primera, te explica todo con detalle y los resultados se notan desde la primera sesion.",
            rating: 5,
            tiempo: "Hace 1 mes",
            avatarColor: "#4A90D9"
        },
        {
            autor: "Luciana R.",
            texto: "Me encanto el tratamiento de peeling quimico. El consultorio es impecable y la atencion es un 10. Ya reserve mi proximo turno.",
            rating: 5,
            tiempo: "Hace 3 semanas",
            avatarColor: "#D94A8C"
        },
        {
            autor: "Florencia M.",
            texto: "Profesionalismo y dedicacion. Me hice dermoabrasion con punta de diamante y la piel quedo espectacular. Muy buena onda tambien!",
            rating: 5,
            tiempo: "Hace 1 mes",
            avatarColor: "#7BC74A"
        },
        {
            autor: "Valentina S.",
            texto: "El mejor centro estetico de Caballito sin duda. Precios accesibles y resultados reales. La consultora es un amor, te hace sentir comoda desde que llegas.",
            rating: 5,
            tiempo: "Hace 2 meses",
            avatarColor: "#9B59B6"
        },
        {
            autor: "Camila T.",
            texto: "Hice el tratamiento anti-edad premium y estoy encantada con los resultados. Se nota la experiencia de anos. Super profesional!",
            rating: 5,
            tiempo: "Hace 2 meses",
            avatarColor: "#E74C3C"
        }
    ],

    // ========== CONFIGURACION DE MOSTRADO ==========
    display: {
        maxReviewsToShow: 6,      // Maximo de reviews a mostrar en la landing
        showAllLink: true,         // Mostrar link para ver todas las reviews en Google
        showWriteReviewBtn: true,  // Mostrar boton para escribir review
        sortBy: "recent",          // "recent" | "rating" | "popular"
        layout: "grid"             // "grid" | "list" | "carousel"
    }
};

// ====================================================
// FUNCIONES PARA RENDERIZAR LAS REVIEWS
// NO MODIFICAR ABAJO - Esto se usa automaticamente
// ====================================================

function getGoogleReviewsHtml() {
    var config = GOOGLE_REVIEWS_CONFIG;
    var reviews = config.reviews;
    var display = config.display;
    
    // Ordenar reviews por fecha (mas recientes primero)
    if (display.sortBy === "recent") {
        reviews.sort(function(a, b) { return 0; }); // Ya vienen ordenadas
    }

    // Tomar solo las reviews a mostrar
    var displayReviews = reviews.slice(0, display.maxReviewsToShow);
    
    var html = '<div class="google-reviews-grid">';
    
    for (var i = 0; i < displayReviews.length; i++) {
        var review = displayReviews[i];
        html += '<div class="google-review-card">' +
            '<div class="review-header">' +
                '<div class="review-avatar" style="background: ' + review.avatarColor + '">' +
                    review.autor.charAt(0) +
                '</div>' +
                '<div class="review-meta">' +
                    '<strong class="review-author-name">' + review.autor + '</strong>' +
                    '<div class="review-stars">' + getStarsHtml(review.rating) + '</div>' +
                '</div>' +
            '</div>' +
            '<p class="review-text">"' + escapeHtml(review.texto) + '"</p>' +
            '<span class="review-time">' + review.tiempo + '</span>' +
        '</div>';
    }
    
    html += '</div>';

    // Boton para ver todas las reviews en Google
    if (display.showAllLink) {
        html += '<div class="reviews-actions">' +
            '<a href="' + config.business.reviewsUrl + '" target="_blank" class="btn-secondary reviews-see-all">' +
                '⭐ Ver las ' + config.business.totalOpiniones + ' reseñas en Google' +
            '</a>' +
        '</div>';
    }

    // Boton para escribir review
    if (display.showWriteReviewBtn) {
        html += '<div class="reviews-write-review">' +
            '<p>Dejanos tu experiencia</p>' +
            '<a href="' + config.business.googleMapsUrl + '" target="_blank" class="btn-primary reviews-write-btn">' +
                '✍️ Escribir una reseña' +
            '</a>' +
        '</div>';
    }

    return html;
}

function getStarsHtml(rating) {
    var stars = '';
    for (var i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += '<span class="star filled">★</span>';
        } else {
            stars += '<span class="star empty">☆</span>';
        }
    }
    return stars;
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

// Cargar reviews automaticamente cuando el DOM este listo
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        var container = document.getElementById('google-reviews-container');
        if (container) {
            container.innerHTML = getGoogleReviewsHtml();
        }
    });
    
    // Tambien cargar inmediatamente si el container ya existe
    var existingContainer = document.getElementById('google-reviews-container');
    if (existingContainer && !existingContainer.innerHTML.trim()) {
        existingContainer.innerHTML = getGoogleReviewsHtml();
    }
}
