// ====================================================
// RESEÑAS LANDING PAGE - Google Sheets Consumer
// Carrusel automatico de reseñas destacadas desde Google Sheets
// ====================================================

(function() {
    'use strict';

    // CONFIGURACION - Usa variables globales de config-global.js (fuente unica de verdad)
    // No hardcodear credentials aqui para evitar filtraciones en repositorios publicos
    var API_BASE = typeof API_URL !== 'undefined' ? API_URL : '';
    var API_TKN  = typeof API_TOKEN !== 'undefined' ? API_TOKEN : '';

    let allReviews = [];
    let visibleReviews = [];
    let carouselInterval;
    const VISIBLE_COUNT = 3;
    const AUTO_SCROLL_MS = 5000;

    // Calcula fecha relativa dinámica (hace X horas/días/semanas)
    function getRelativeDate(dateStr) {
        if (!dateStr || dateStr === '') return '';
        
        let date;
        // Si ya viene como string "Hace X", lo devuelve directo (compatibilidad con datos legacy)
        if (dateStr.includes('Hace')) return dateStr;
        
        try {
            date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
        } catch(e) {
            return dateStr;
        }
        
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        
        if (diffHours < 1) return 'Hace menos de 1 hora';
        if (diffHours < 24) return diffHours === 1 ? 'Hace 1 hora' : 'Hace ' + diffHours + ' horas';
        if (diffDays === 1) return 'Hace 1 día';
        if (diffDays < 7) return 'Hace ' + diffDays + ' días';
        if (diffWeeks === 1) return 'Hace 1 semana';
        if (diffWeeks < 4) return 'Hace ' + diffWeeks + ' semanas';
        if (diffMonths === 1) return 'Hace 1 mes';
        return 'Hace ' + diffMonths + ' meses';
    }

    // Genera iniciales del nombre
    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + (parts.length > 1 ? parts[parts.length-1][0] : '')).toUpperCase();
    }

    // Colores vibrantes para avatares
    const AVATAR_COLORS = [
        'linear-gradient(135deg, #C4A16D, #A8864F)',
        'linear-gradient(135deg, #E8A87C, #D4845A)',
        'linear-gradient(135deg, #9B5DE5, #7B2FF7)',
        'linear-gradient(135deg, #00BBF9, #0096C7)',
        'linear-gradient(135deg, #F15BB5, #F098BD)',
        'linear-gradient(135deg, #00F5D4, #00BBB9)',
        'linear-gradient(135deg, #FEE440, #FCA311)',
        'linear-gradient(135deg, #FF6B6B, #EE5A24)',
    ];

    function getAvatarColor(index) {
        return AVATAR_COLORS[index % AVATAR_COLORS.length];
    }

    // Estrellas HTML
    function renderStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            stars += i <= rating ? '★' : '☆';
        }
        return '<span class="review-stars">' + stars + '</span>';
    }

    // Escapa HTML para seguridad
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // Renderiza una tarjeta de reseña estilo carrusel premium
    function renderReviewCard(review, index) {
        const initials = getInitials(review.nombre);
        const color = getAvatarColor(index);
        const servicioTag = review.servicio ? '<div class="review-servicio-badge">' + escapeHtml(review.servicio) + '</div>' : '';
        const respuesta = review.respuesta ? '<div class="review-owner-response"><span class="owner-avatar">Y</span><strong>Yessenia Centro de Estética:</strong> ' + escapeHtml(review.respuesta) + '</div>' : '';
        const fechaRelativa = getRelativeDate(review.fecha);
        
        return '<div class="review-carousel-card" data-index="' + index + '">' +
            '<div class="review-card-inner">' +
                '<div class="review-quote-icon">&#8220;</div>' +
                '<div class="review-card-header">' +
                    '<div class="review-avatar-wrapper">' +
                        '<div class="review-avatar" style="background: ' + color + '">' + initials + '</div>' +
                        '<div class="review-glow"></div>' +
                    '</div>' +
                    '<div class="review-author-info">' +
                        '<strong class="review-author-name">' + escapeHtml(review.nombre) + '</strong>' +
                        renderStars(review.calificacion) +
                    '</div>' +
                '</div>' +
                servicioTag +
                '<p class="review-text">' + escapeHtml(review.comentario) + '</p>' +
                respuesta +
                '<div class="review-card-footer">' +
                    '<span class="review-date">' + fechaRelativa + '</span>' +
                    '<a href="' + GOOGLE_REVIEWS_URL + '" target="_blank" rel="noopener noreferrer" class="google-review-btn" title="Ver reseña en Google">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133a7.997 7.997 0 0 1-11.035 0 7.997 7.997 0 0 1-11.035 0 7.997 7.997 0 0 1-1.787-4.133H2.64c.24 4.124 2.72 7.56 6.36 9.34v-15.28h7.84z"/></svg>' +
                        'Ver en Google' +
                    '</a>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // Renderiza el carrusel completo
    function renderCarousel(reviews) {
        const container = document.getElementById('featured-reviews-container');
        if (!container) return;

        if (!reviews || reviews.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px 0">No hay reseñas destacadas momentaneamente.</p>';
            return;
        }

        visibleReviews = reviews.slice(0, Math.min(reviews.length, VISIBLE_COUNT * 2));

        let html = '<div class="reviews-carousel-wrapper">' +
            '<div class="reviews-carousel-track" id="reviewsTrack">';
        
        // Duplicar reseñas para efecto infinito
        const displayReviews = [...visibleReviews, ...visibleReviews];
        for (let i = 0; i < displayReviews.length; i++) {
            html += renderReviewCard(displayReviews[i], i % visibleReviews.length);
        }
        
        html += '</div>' +
            '<div class="carousel-controls">' +
                '<button class="carousel-btn prev-btn" id="prevBtn" aria-label="Anterior">&#10094;</button>' +
                '<div class="carousel-dots" id="carouselDots"></div>' +
                '<button class="carousel-btn next-btn" id="nextBtn" aria-label="Siguiente">&#10095;</button>' +
            '</div>' +
        '</div>';

        container.innerHTML = html;
        initCarousel();
    }

    // Inicializa el carrusel con animaciones
    function initCarousel() {
        const track = document.getElementById('reviewsTrack');
        const dotsContainer = document.getElementById('carouselDots');
        if (!track) return;

        const cardWidth = track.querySelector('.review-carousel-card')?.offsetWidth || 360;
        const totalCards = visibleReviews.length;
        let currentIndex = 0;
        let autoScrollTimer;

        // Crear dots
        for (let i = 0; i < Math.min(totalCards, 6); i++) {
            const dot = document.createElement('span');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.addEventListener('click', () => goToSlide(i));
            dotsContainer.appendChild(dot);
        }

        function updateCarousel() {
            const offset = currentIndex * (cardWidth + 24); // cardWidth + gap
            track.style.transform = 'translateX(-' + offset + 'px)';
            
            // Actualizar dots
            const dots = dotsContainer.querySelectorAll('.carousel-dot');
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentIndex);
            });
        }

        function goToSlide(index) {
            currentIndex = index;
            updateCarousel();
            resetAutoScroll();
        }

        function nextSlide() {
            if (currentIndex < totalCards - 1) {
                currentIndex++;
            } else {
                currentIndex = 0;
            }
            updateCarousel();
        }

        // Controles manuales
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (prevBtn) prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) currentIndex--;
            else currentIndex = totalCards - 1;
            updateCarousel();
            resetAutoScroll();
        });

        if (nextBtn) nextBtn.addEventListener('click', () => {
            nextSlide();
            resetAutoScroll();
        });

        // Auto-scroll
        function resetAutoScroll() {
            clearInterval(autoScrollTimer);
            autoScrollTimer = setInterval(nextSlide, AUTO_SCROLL_MS);
        }
        
        resetAutoScroll();

        // Hover pausa el auto-scroll
        track.addEventListener('mouseenter', () => clearInterval(autoScrollTimer));
        track.addEventListener('mouseleave', () => {
            autoScrollTimer = setInterval(nextSlide, AUTO_SCROLL_MS);
        });

        // Touch/swipe support
        let touchStartX = 0;
        let touchEndX = 0;

        track.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            clearInterval(autoScrollTimer);
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) {
                if (diff > 0 && currentIndex < totalCards - 1) currentIndex++;
                else if (diff < 0 && currentIndex > 0) currentIndex--;
                updateCarousel();
            }
            autoScrollTimer = setInterval(nextSlide, AUTO_SCROLL_MS);
        }, { passive: true });

        // Inicializar posicion
        updateCarousel();
    }

    // URL del perfil de Google Reviews de Yessenia Centro de Estética
    const GOOGLE_REVIEWS_URL = 'https://www.google.com/search?hl=es-AR&gl=ar&q=Mikita+yessenia,+Av.+Acoyte+25,+C1405+Cdad.+Aut%C3%B3noma+de+Buenos+Aires&ludocid=17950590508209131840&lsig=AB86z5VN6U-ONH05UJQS4jORI19i#lrd=0x95bccb34958bf6e7:0xf91d4ef5fe4dd140,1';

    // Datos de respaldo del Sheet RESENAS (fechas en formato YYYY-MM-DD para calcular relativo)
    const FALLBACK_REVIEWS = [
        { nombre: "Verónica Gago", calificacion: 5, comentario: "Excelente profesional!! Me atiendo con Yessenia hace años y me dio muy buenos resultados. Super recomendable!!", servicio: "General", fecha: "2026-06-06", respuesta: "Muchas gracias por compartir tu experiencia. ¡Te esperamos para seguir cuidando tu piel! ✨" },
        { nombre: "Patricia Fontivero", calificacion: 5, comentario: "Excelente profesional, 100% recomendada. Pone mucha dedicación en cada tratamiento", servicio: "General", fecha: "2026-06-06", respuesta: "Gracias por tu apoyo y por elegir nuestro espacio de estética. 🌷" },
        { nombre: "Rocio del Rio", calificacion: 5, comentario: "Yessi es una gran profesional y persona. Me atiendo desde hace 10 años y me ayudó a eliminar el acné de mi espalda.", servicio: "Dermoabrasión Punta de Diamante corporal", fecha: "2026-06-12", respuesta: "" },
        { nombre: "SOFÍA", calificacion: 5, comentario: "Un centro con garantía de que te van a atender con dedicación y profesionalismo. Yesse es muy dulce y atenta a todos los detalles.", servicio: "Tratamiento Facial Personalizado", fecha: "2026-06-09", respuesta: "Muchas gracias por tu reseña! Fue un placer atenderte." },
        { nombre: "Daniela Ferreyra", calificacion: 5, comentario: "Fue una experiencia muy linda, Yessenia es un amor. Los tratamientos son especializados según lo que necesite tu piel.", servicio: "Limpieza Facial Profunda", fecha: "2026-06-09", respuesta: "💖 Gracias por confiar en nuestro trabajo. Cada piel es única." },
        { nombre: "Christer Blanco Hausler", calificacion: 5, comentario: "Excelente atención de Yesse. Me realicé una limpieza facial y un peeling, y quedé muy conforme con los resultados.", servicio: "Limpieza Facial + Peeling Químico", fecha: "2026-06-09", respuesta: "Tu opinión es muy valiosa para nosotros." },
        { nombre: "Clara Romanazzi", calificacion: 5, comentario: "Hace muchos años que me atiendo con Yessenia y no la cambio por nada. Excelente persona y la mejor profesional.", servicio: "General", fecha: "2026-06-09", respuesta: "Agradecemos tu valoración y confianza." },
        { nombre: "Natalia", calificacion: 5, comentario: "Un placer atenderse con Yesse! Vas a limpiar tu carita y te hace brillar hasta las manos!", servicio: "Limpieza Facial Profunda", fecha: "2026-06-08", respuesta: "Fue un gusto recibirte en nuestro consultorio." }
    ];

    // Carga las reseñas desde el backend
    async function loadResenas() {
        try {
            const url = API_BASE + '?action=obtenerResenasPublic&token=' + encodeURIComponent(API_TKN);
            
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });
            
            const data = await response.json();
            
            if (data.success && data.resenas && data.resenas.length > 0) {
                allReviews = data.resenas;
                renderCarousel(allReviews);
            } else {
                // Fallback: usar datos del Sheet como respaldo
                console.log('Usando reseñas de respaldo del Sheet');
                allReviews = FALLBACK_REVIEWS;
                renderCarousel(allReviews);
            }
        } catch (error) {
            console.error('Error fetching resenas, usando fallback:', error);
            // Fallback: usar datos del Sheet como respaldo
            allReviews = FALLBACK_REVIEWS;
            renderCarousel(allReviews);
        }
    }

    // Inicializa cuando el DOM esta listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadResenas);
    } else {
        loadResenas();
    }

})();
