// ========== GOOGLE REVIEWS LOADER ==========
// Carga las reseñas de Google desde google-reviews-config.js
// Las reviews se renderizan automaticamente en el container #google-reviews-container

function loadGoogleReviews() {
    var container = document.getElementById("google-reviews-container");
    if (!container) return;
    
    // Usar el nuevo sistema de config centralizado
    if (typeof GOOGLE_REVIEWS_CONFIG !== 'undefined') {
        container.innerHTML = getGoogleReviewsHtml();
        return;
    }
    
    // Fallback: mostrar link a Google Reviews
    renderFallbackReviews(container);
}

function renderFallbackReviews(container) {
    container.innerHTML = '<div style="text-align: center; padding: 48px 20px;">' +
        '<div style="font-size: 3rem; margin-bottom: 16px;">⭐</div>' +
        '<h3 style="margin-bottom: 12px; font-size: 1.4rem;">Nuestras clientas nos recomiendan</h3>' +
        '<p style="color: var(--gray); margin-bottom: 8px;">Calificacion: <strong>5.0/5</strong> en Google Reviews</p>' +
        '<p style="color: var(--gray); margin-bottom: 24px;">Mas de 2.500 clientas satisfechas nos eligen</p>' +
        '<a href="https://www.google.com/search?kgmid=/g/11z7qbmw8z&hl=es-419&q=Mikita+yessenia" target="_blank" class="btn-secondary">' +
        '⭐ Ver reseñas reales en Google</a>' +
        '</div>';
}

// Cargar cuando el DOM este listo
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadGoogleReviews);
    } else {
        loadGoogleReviews();
    }
}
