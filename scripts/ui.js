// ========== DOM Elements & Initial UI Listeners ==========
var hamburger = document.getElementById("hamburger");
var navLinks = document.getElementById("navLinks");
var header = document.getElementById("header");
var announcementBar = document.getElementById("announcementBar");
var filterBtns = document.querySelectorAll(".filter-btn");

function closeAnnouncement() { 
    if (announcementBar) announcementBar.classList.add("hidden"); 
}
window.closeAnnouncement = closeAnnouncement;

if (hamburger && navLinks) { 
    hamburger.addEventListener("click", function() { 
        hamburger.classList.toggle("active"); 
        navLinks.classList.toggle("open"); 
    }); 
}

if (navLinks) {
    navLinks.querySelectorAll("a").forEach(function(link) { 
        link.addEventListener("click", function() { 
            if(hamburger) hamburger.classList.remove("active"); 
            if(navLinks) navLinks.classList.remove("open"); 
        }); 
    }); 
}

window.addEventListener("scroll", function() { 
    if (header) {
        if (window.scrollY > 50) header.classList.add("scrolled"); 
        else header.classList.remove("scrolled"); 
    }
});

if (filterBtns) {
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

// ========== Hide all sections and show only booking area ==========
function hideAllSections() {
    var hero = document.getElementById('inicio'); if(hero) hero.style.display='none';
    var servicios = document.getElementById('servicios'); if(servicios) servicios.style.display='none';
    var galeria = document.getElementById('galeria'); if(galeria) galeria.style.display='none';
    var resenas = document.getElementById('resenas'); if(resenas) resenas.style.display='none';
    var ubicacion = document.getElementById('ubicacion'); if(ubicacion) ubicacion.style.display='none';
    var reservar = document.getElementById('reservar'); if(reservar) reservar.style.display='block';
    var whatsappCta = document.querySelector('.whatsapp-cta-section'); if(whatsappCta) whatsappCta.style.display = CONFIG.comportamiento.mostrarWhatsAppCta ? '' : 'none';
    var footer = document.querySelector('.footer'); if(footer) footer.style.display='none';
    var timerId = window._senaTimerId;
    window._senaTimerId = null;
    window._silenceBeforeUnload = { _ts: Date.now() };
    _popstateSilenceTs = Date.now();
    try { window.scrollTo({top: 0, behavior:'smooth'}); } catch(e) {}
    setTimeout(function() { window._senaTimerId = timerId; window._silenceBeforeUnload = false; }, 1000);
}

// ========== Show all sections (restore after MP return handling) ==========
function showAllSections() {
    var hero = document.getElementById('inicio'); if(hero) hero.style.display='';
    var servicios = document.getElementById('servicios'); if(servicios) servicios.style.display='';
    var galeria = document.getElementById('galeria'); if(galeria) galeria.style.display='';
    var resenas = document.getElementById('resenas'); if(resenas) resenas.style.display='';
    var ubicacion = document.getElementById('ubicacion'); if(ubicacion) ubicacion.style.display='';
    var reservar = document.getElementById('reservar'); if(reservar) reservar.style.display='';
    var whatsappCta = document.querySelector('.whatsapp-cta-section'); if(whatsappCta) whatsappCta.style.display = CONFIG.comportamiento.mostrarWhatsAppCta ? '' : 'none';
    var footer = document.querySelector('.footer'); if(footer) footer.style.display='';
}

// ========== MODAL: Exit/Reload Confirmation (anti-abandon during booking) ==========
var _exitModalShown = false;
function showExitConfirmationModal() {
    // Evitar doble modal
    if (_exitModalShown) return;
    _exitModalShown = true;

    var overlay = document.createElement('div');
    overlay.id = 'exitConfirmOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease';

    var modal = document.createElement('div');
    modal.id = 'exitConfirmModal';
    modal.style.cssText = 'background:#3d2e1f;border-radius:20px;padding:32px 28px;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:slideUp 0.3s ease;border:1px solid rgba(196,161,109,0.3)';

    var modalContent = '';
    modalContent += '<div style="font-size:2.5rem;margin-bottom:16px">⚠️</div>';
    modalContent += '<h3 style="color:#FFD700;margin:0 0 8px;font-family:Playfair Display,serif;font-size:1.4rem">Espera, no te vayas!</h3>';
    modalContent += '<p style="color:rgba(255,255,255,0.8);margin:0 0 6px;font-size:0.95rem;line-height:1.5">Si salís ahora de esta página, <strong style="color:#FFD700">tu reserva se liberará</strong> y el turno quedará disponible para otra persona.</p>';
    modalContent += '<p style="color:rgba(255,255,255,0.6);margin:0 0 24px;font-size:0.85rem;line-height:1.5">No se completará tu reserva y tendrás que volver a elegir fecha y hora.</p>';

    modalContent += '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:16px">';
    modalContent += '<button id="exitStayBtn" style="flex:1;min-width:140px;padding:14px 20px;background:#C4A16D;color:white;border:none;border-radius:50px;font-size:1rem;font-weight:600;cursor:pointer">👍 Quedarme y completar pago</button>';
    modalContent += '<button id="exitLeaveBtn" style="flex:1;min-width:140px;padding:14px 20px;background:transparent;color:#ff6b6b;border:2px solid #ff6b6b;border-radius:50px;font-size:1rem;font-weight:600;cursor:pointer">Salir de todos modos</button>';
    modalContent += '</div>';
    modalContent += '<p style="color:rgba(255,255,255,0.4);margin:0;font-size:0.75rem">Tu turno queda bloqueado por tiempo limitado</p>';

    modal.innerHTML = modalContent;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close button (X) in top-right corner
    var closeBtn = document.createElement('button');
    closeBtn.id = 'exitCloseModalBtn';
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:1.5rem;cursor:pointer;line-height:1;padding:4px 8px';
    closeBtn.title = 'Cerrar';
    modal.style.position = 'relative';
    modal.appendChild(closeBtn);

    // Event listeners
    document.getElementById('exitStayBtn').addEventListener('click', function() {
        document.body.removeChild(overlay);
        _exitModalShown = false;
        var stayTimerId = window._senaTimerId;
        window._senaTimerId = null;
        window._silenceBeforeUnload = { _ts: Date.now() };
        _popstateSilenceTs = Date.now();
        try { window.scrollTo({top: document.getElementById('reservar') ? document.getElementById('reservar').offsetTop - 100 : 0, behavior:'smooth'}); } catch(e) {}
        setTimeout(function() { window._senaTimerId = stayTimerId; window._silenceBeforeUnload = false; }, 1000);
    });

    document.getElementById('exitLeaveBtn').addEventListener('click', function() {
        document.body.removeChild(overlay);
        _exitModalShown = false;
        // Si hay turno activo, liberarlo
        if (window._senaTimerId) {
            var stored = getStoredTurnoData();
            if (stored) {
                clearActiveTurnoStorage();
                releaseStoredTurno(stored.idTurno);
            }
        }
        // Si estamos en la página de reserva, resetear
        if (window.location.hash === '#reservar' || document.getElementById('reservar')) {
            var sd = document.getElementById('senaRequired');
            if (sd) { sd.style.display='none'; sd.innerHTML=''; }
        }
    });

    closeBtn.addEventListener('click', function() {
        document.body.removeChild(overlay);
        _exitModalShown = false;
    });

    // Cerrar al hacer click fuera del modal
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
            _exitModalShown = false;
        }
    });
}

// ========== Detect navigation attempts during active booking ==========
function interceptBookingNavigation() {
    var reservarSection = document.getElementById('reservar');
    if (!reservarSection) return;

    // Observar clicks en todos los links de navegación
    document.querySelectorAll('nav a, .nav-links a').forEach(function(link) {
        link.addEventListener('click', function(e) {
            // Si hay timer activo Y el link NO va a #reservar
            if (window._senaTimerId && this.getAttribute('href') !== '#reservar' && this.getAttribute('href') !== '#') {
                e.preventDefault();
                showExitConfirmationModal();
            }
        });
        
   
    });

    // También interceptar scroll hacia secciones ajenas durante booking activo
    var observer = new MutationObserver(function() {
        if (window._senaTimerId && !window._silenceBeforeUnload && document.getElementById('reservar')) {
            var sectionTop = document.getElementById('reservar').offsetTop;
            if (window.scrollY < sectionTop - 100) {
                // El usuario scrolleó arriba durante el timer - mostrar modal
                showExitConfirmationModal();
                observer.disconnect();
            }
        }
    });

    // Observar cambios en el DOM para detectar navegación
    observer.observe(document.body, { childList: true, subtree: true });
}

// ========== Scroll Animations (Intersection Observer) ==========
var observerOptions = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
        if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll(".section-header,.service-card,.insta-card,.review-card,.info-item").forEach(function(el) {
    el.classList.add("fade-in");
    observer.observe(el);
});

// ========== Smooth scroll for internal links (prevents CLS push) ==========
document.addEventListener("click", function(e) {
    var link = e.target.closest("a[href^='#']");
    if (!link) return;
    var href = link.getAttribute("href");
    if (!href || href === "#") return;
    
    var targetId = href.substring(1);
    var target = document.getElementById(targetId);
    if (!target) return;
    
    e.preventDefault();
    // Close mobile menu
    var hamburger = document.getElementById("hamburger");
    var navLinks = document.getElementById("navLinks");
    if (hamburger) hamburger.classList.remove("active");
    if (navLinks) navLinks.classList.remove("open");
    
    // Wait for layout to settle, then scroll smoothly
    requestAnimationFrame(function() {
        setTimeout(function() {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            window.location.hash = href;
        }, 50);
    });
}, true);

// ========== Smooth reveal on load ==========
document.body.style.opacity = "0"; 
document.body.style.transition = "opacity 0.5s ease";
window.addEventListener("load", function() { 
    document.body.style.opacity = "1"; 
});
