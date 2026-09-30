// ====================================================
// LANDING DATA BUNDLE (backend v60.0)
// ====================================================
// En la carga inicial de la pagina, UNA SOLA llamada a
// obtenerLandingData devuelve TRATAMIENTOS + REELS + RESENAS +
// CONFIGURACION juntos. Todos los consumidores (api.js,
// instagram-gallery.js, featured-reviews.js y el hero widget de
// index.html) comparten la misma Promise: 1 sola ejecucion del
// backend, sin concurrencia.
//
// Si el bundle falla (error de red, o el backend aun no actualizado
// a v60), se reintentan las 4 llamadas viejas por separado, que
// siguen existiendo y funcionando en el backend.
// ====================================================

window.getLandingData = (function() {
    var _promise = null;

    // Normaliza la respuesta del bundle a un formato unico
    // { ok, tratamientos, reels, resenas, config, warnings, error }
    function normalizeBundle(data) {
        if (data && data.success) {
            return {
                ok: true,
                tratamientos: data.tratamientos || [],
                reels: data.reels || [],
                resenas: data.resenas || [],
                config: data.config || null,
                warnings: data.warnings || [],
                error: null
            };
        }
        // El backend respondio pero sin success (ej: "Accion GET no valida"
        // si el backend no esta en v59, o error de validacion de Sheets)
        throw new Error((data && data.error) ? data.error : "Respuesta inesperada del bundle");
    }

    function fetchBundle() {
        return fetch(API_URL + "?action=obtenerLandingData&token=" + encodeURIComponent(API_TOKEN), { method: 'GET', mode: 'cors' })
            .then(function(r) { return r.json(); })
            .then(normalizeBundle);
    }

    // Fallback defensivo: las 4 llamadas viejas (siguen funcionando en el backend)
    function fetchLegacy() {
        var token = encodeURIComponent(API_TOKEN);
        return Promise.all([
            fetch(API_URL + "?action=obtenerTratamientos&token=" + token, { method: 'GET', mode: 'cors' }).then(function(r) { return r.json(); }),
            fetch(API_URL + "?action=obtenerReelsPublic&token=" + token, { method: 'GET', mode: 'cors' }).then(function(r) { return r.json(); }),
            fetch(API_URL + "?action=obtenerResenasPublic&token=" + token, { method: 'GET', mode: 'cors' }).then(function(r) { return r.json(); }),
            fetch(API_URL + "?action=obtenerConfiguracion&token=" + token, { method: 'GET', mode: 'cors' }).then(function(r) { return r.json(); })
        ]).then(function(results) {
            return {
                ok: true,
                tratamientos: (results[0] && results[0].tratamientos) || [],
                reels: (results[1] && results[1].reels) || [],
                resenas: (results[2] && results[2].resenas) || [],
                config: (results[3] && results[3].config) || null,
                warnings: ["Bundle falló: se usaron las 4 llamadas viejas como respaldo"],
                error: results[0].error || results[1].error || results[2].error || results[3].error || null
            };
        });
    }

    // Memoizada: el primer consumidor dispara la llamada y los demas
    // esperan la misma Promise. Nunca hay 2 fetch en vuelo.
    return function getLandingData() {
        if (!_promise) {
            _promise = fetchBundle().catch(function(err) {
                console.warn("⚠️ [LANDING-DATA] El bundle obtenerLandingData falló (" + err.message + "), reintentando con las 4 llamadas viejas...");
                return fetchLegacy();
            });
        }
        return _promise;
    };
})();
