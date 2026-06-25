// ========== INSTAGRAM GALLERY RENDERER ==========
// Carga los reels de Instagram via oEmbed iframes en la seccion Galeria

function renderInstagramGallery() {
    var grid = document.getElementById("instagramGrid");
    if (!grid || !CONFIG.reels || CONFIG.reels.length === 0) return;

    var html = "";
    for (var i = 0; i < CONFIG.reels.length; i++) {
        var reel = CONFIG.reels[i];
        html += '<div class="insta-reel-card" data-reel-index="' + i + '">';
        html += '  <blockquote class="instagram-media" data-instgrm-permalink="' + reel.url + '" data-instgrm-version="14" style="background:#FFF;border:0;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,.1);margin:0;padding:0;width:100%"></blockquote>';
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
