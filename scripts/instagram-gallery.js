// ========== INSTAGRAM GALLERY RENDERER ==========
// Carga los reels de Instagram desde Google Sheets con fallback a CONFIG.reels

function renderInstagramGallery() {
    var grid = document.getElementById("instagramGrid");
    if (!grid) return;

    // Intentar cargar desde Google Sheets primero
    var sheetUrl = (typeof API_URL !== 'undefined' ? API_URL : '') + '?action=obtenerReelsPublic&token=' + encodeURIComponent(typeof API_TOKEN !== 'undefined' ? API_TOKEN : '');

    fetch(sheetUrl, { method: 'GET', mode: 'cors' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.reels && data.reels.length > 0) {
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
        
        html += '<div class="insta-reel-card" data-reel-index="' + i + '">';
        html += '  <div class="reel-wrapper">';
        html += '    <blockquote class="instagram-media" data-instgrm-permalink="' + reel.url + '" data-instgrm-version="14" style="background:#FFF;border:0;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.1);margin:0;padding:0;width:100%"></blockquote>';
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

    // Cargar el script de embed de Instagram de forma asincronica
    if (typeof ig === "undefined" || typeof ig.shared === "undefined") {
        var script = document.createElement("script");
        script.src = "https://www.instagram.com/embed.js";
        script.crossOrigin = "anonymous";
        script.async = true;
        script.onload = function() {
            if (typeof ig !== "undefined" && typeof ig.embeds === "function") {
                ig.embeds();
            }
        };
        document.body.appendChild(script);
    } else {
        if (typeof ig.embeds === "function") {
            ig.embeds();
        }
    }
}
