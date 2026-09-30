// ========== INSTAGRAM GALLERY RENDERER ==========
// Carga los reels de Instagram desde Google Sheets con fallback a CONFIG.reels
// v26: Lazy loading — cada embed de Instagram (~600KB + requests) solo se
// carga cuando el usuario se acerca a la tarjeta (IntersectionObserver).
// Antes: los 9 embeds (5.7MB) se descargaban todos al abrir la página.

var __igEmbedLoading = false;
var __igEmbedWaiters = [];
var __igEmbedScheduled = false;

function __igEnsureEmbedScript() {
    if (typeof ig !== "undefined" && typeof ig.embeds === "function") return;
    if (__igEmbedLoading) return;
    __igEmbedLoading = true;
    var script = document.createElement("script");
    script.src = "https://www.instagram.com/embed.js";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = function() {
        __igEmbedLoading = false;
        var waiters = __igEmbedWaiters.splice(0);
        for (var i = 0; i < waiters.length; i++) waiters[i]();
    };
    script.onerror = function() {
        // Si embed.js no carga, las tarjetas conservan su placeholder
        // (con link a Instagram) y la página no se rompe.
        __igEmbedLoading = false;
        var waiters = __igEmbedWaiters.splice(0);
        for (var i = 0; i < waiters.length; i++) waiters[i]();
    };
    document.body.appendChild(script);
}

function __igScheduleEmbeds() {
    if (__igEmbedScheduled) return;
    __igEmbedScheduled = true;
    setTimeout(function() {
        __igEmbedScheduled = false;
        if (typeof ig !== "undefined" && typeof ig.embeds === "function") {
            ig.embeds();
        }
    }, 0);
}

function __igActivateCard(card) {
    var wrapper = card.querySelector(".reel-wrapper");
    if (!wrapper || wrapper.getAttribute("data-activated") === "1") return;
    wrapper.setAttribute("data-activated", "1");

    var url = wrapper.getAttribute("data-embed-url");
    var placeholder = wrapper.querySelector(".reel-placeholder");
    if (placeholder) placeholder.remove();
    if (!url) return; // Sin URL de embed: se queda el placeholder con link

    var bq = document.createElement("blockquote");
    bq.className = "instagram-media";
    bq.setAttribute("data-instgrm-permalink", url);
    bq.setAttribute("data-instgrm-version", "14");
    bq.style.cssText = "background:#FFF;border:0;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.1);margin:0;padding:0;width:100%";
    wrapper.insertBefore(bq, wrapper.firstChild);

    __igEnsureEmbedScript();
    if (typeof ig !== "undefined" && typeof ig.embeds === "function") {
        __igScheduleEmbeds();
    } else {
        __igEmbedWaiters.push(__igScheduleEmbeds);
    }
}

function renderInstagramGallery() {
    var grid = document.getElementById("instagramGrid");
    if (!grid) return;

    // Carga inicial: usa el bundle compartido (1 sola llamada al backend para
    // tratamientos + reels + resenas). Ver scripts/landing-data.js
    getLandingData()
        .then(function(data) {
            if (data.ok && data.reels && data.reels.length > 0) {
                renderReelsGrid(grid, data.reels);
            } else {
                // Fallback: usar CONFIG.reels del array en config-global.js
                if (CONFIG.reels && CONFIG.reels.length > 0) {
                    renderReelsGrid(grid, CONFIG.reels);
                }
            }
        })
        .catch(function(err) {
            console.warn('Error cargando reels desde Sheets, usando fallback:', err);
            // Error al cargar desde Sheets → fallback a CONFIG.reels
            if (CONFIG.reels && CONFIG.reels.length > 0) {
                renderReelsGrid(grid, CONFIG.reels);
            }
        });
}

function renderReelsGrid(grid, reels) {
    var html = "";
    for (var i = 0; i < reels.length; i++) {
        var reel = reels[i];
        var captionText = reel.caption || '';
        var emojiDisplay = reel.emoji || '📹';
        var linkUrl = reel.url || "https://www.instagram.com/mikitayessenia";

        html += '<div class="insta-reel-card" data-reel-index="' + i + '">';
        html += '  <div class="reel-wrapper" data-embed-url="' + (reel.url || '') + '">';
        // Placeholder visible hasta que la tarjeta se acerca al viewport
        html += '    <div class="reel-placeholder">';
        html += '      <span class="ph-emoji">' + emojiDisplay + '</span>';
        if (captionText) {
            html += '      <span class="ph-text">' + captionText + '</span>';
        }
        html += '      <a class="ph-link" href="' + linkUrl + '" target="_blank" rel="noopener">Ver en Instagram</a>';
        html += '    </div>';
        html += '    <div class="reel-caption-overlay">';
        html += '      <span class="reel-emoji">' + emojiDisplay + '</span>';
        if (captionText) {
            html += '      <span class="reel-caption-text">' + captionText + '</span>';
        }
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
    }
    grid.innerHTML = html;

    // Lazy loading: cada tarjeta activa su embed cuando el usuario se acerca.
    // Sin IntersectionObserver (navegadores muy viejos) → comportamiento
    // anterior: activar todo de inmediato.
    var cards = grid.querySelectorAll(".insta-reel-card");
    if (!("IntersectionObserver" in window)) {
        for (var j = 0; j < cards.length; j++) __igActivateCard(cards[j]);
        return;
    }
    var observer = new IntersectionObserver(function(entries) {
        for (var k = 0; k < entries.length; k++) {
            if (entries[k].isIntersecting) {
                __igActivateCard(entries[k].target);
                observer.unobserve(entries[k].target);
            }
        }
    }, { rootMargin: "600px 0px" });
    for (var n = 0; n < cards.length; n++) observer.observe(cards[n]);
}
