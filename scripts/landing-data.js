// ====================================================
// LANDING DATA BUNDLE (backend v61.0 + estrategia de retry)
// ====================================================
// En la carga inicial de la pagina, UNA SOLA llamada a
// obtenerLandingData devuelve TRATAMIENTOS + REELS + RESENAS +
// CONFIGURACION juntos. Todos los consumidores (api.js,
// instagram-gallery.js, featured-reviews.js y el hero widget de
// index.html) comparten la misma Promise: 1 sola ejecucion del
// backend, sin concurrencia.
//
// El backend cachea el bundle por 24 h (CacheService): la primera
// carga de la ventana lee las hojas (~5 s) y las siguientes
// responden sin reler (~2,5 s). El formato de respuesta es
// identico con o sin cache; el frontend no cachea ni invalida nada.
//
// ESTRATEGIA DE CARGA (pensada en la experiencia del usuario:
// que no espere la vida entera ni se vaya de la pagina):
//   1) Intento 1: fetch del bundle con un timeout prudente de 8 s.
//      Con cache caliente la respuesta llega en ~2,5 s, asi que si
//      no llega en 8 s casi siempre es que el relay de Google
//      (script.googleusercontent.com/macros/echo) solto la respuesta
//      aunque el backend haya completado (verificado en el log de
//      ejecuciones: el backend tarda 1,4 s pero el navegador no
//      recibe nada).
//   2) Si el intento 1 no llega a tiempo: esperar 2 s y VOLVER A
//      PEDIR EL BUNDLE. Como el backend lo sirve desde la cache de
//      24 h, re-pedir es barato y rapido (~2,5 s): no hace falta
//      esperar 15 s ni disparar 4 llamadas de golpe.
//   3) Solo si AMBOS intentos fallan, se reintentan las 4 llamadas
//      viejas por separado (fallback defensivo; siguen existiendo y
//      funcionando en el backend).
//
// Nota: si el backend RESPONDE pero con un error logico (backend
// viejo sin el endpoint, error de validacion de Sheets), re-pedir el
// bundle no sirve de nada: se va directo al fallback de las 4
// llamadas viejas.
// ====================================================

// Timeout prudente por intento del bundle (con cache la respuesta
// llega en ~2,5-5 s; si no llega en 8 s, el relay la solto)
var LANDING_DATA_TIMEOUT_MS = 8000;
// Pausa entre el intento 1 y el intento 2 (re-pedido desde la cache)
var LANDING_DATA_RETRY_DELAY_MS = 2000;

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
                // Se preserva data.error: el backend puede responder success:true
                // con un error de validacion de Sheets que api.js debe detectar
                error: data.error || null
            };
        }
        // El backend respondio pero sin success (ej: "Accion GET no valida"
        // si el backend no esta en v59, o error de validacion de Sheets)
        throw new Error((data && data.error) ? data.error : "Respuesta inesperada del bundle");
    }

    // Distingue errores de TRANSPORTE (timeout nuestro, el relay de Google
    // solto la respuesta, fallo de red) de errores LOGICOS (el backend
    // respondio pero con un error: backend viejo, validacion de Sheets).
    // Solo los de transporte valen la pena reintentar re-pidiendo el bundle
    // desde la cache; los logicos el re-try no cambia el resultado.
    function esErrorDeTransporte(err) {
        if (!err) return false;
        var name = err.name || '';
        if (name === 'AbortError') return true;    // timeout de LANDING_DATA_TIMEOUT_MS
        if (name === 'TypeError') return true;     // Failed to fetch (red caida)
        if (name === 'SyntaxError') return true;   // el relay devolvio HTML (404) en vez de JSON
        return false;
    }

    function fetchBundle() {
        // Timeout prudente (LANDING_DATA_TIMEOUT_MS): si la peticion no
        // responde a tiempo, se aborta y se re-pide el bundle desde la
        // cache (o, si ambos intentos fallan, las 4 llamadas viejas).
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function() { controller.abort(); }, LANDING_DATA_TIMEOUT_MS) : null;
        var limpiarTimer = function() { if (timeoutId) clearTimeout(timeoutId); };

        return fetch(API_URL + "?action=obtenerLandingData&token=" + encodeURIComponent(API_TOKEN), {
            method: 'GET',
            mode: 'cors',
            signal: controller ? controller.signal : undefined
        })
            .then(function(r) { return r.json(); })
            .then(normalizeBundle)
            .then(function(v) { limpiarTimer(); return v; }, function(e) { limpiarTimer(); throw e; });
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

    // Memoizada: el primer consumidor dispara la carga y los demas
    // esperan la misma Promise. Nunca hay 2 fetch en vuelo.
    //
    // Flujo: intento 1 (8 s) → si no llega, pausa de 2 s → intento 2
    // (re-pedido desde la cache de 24 h) → si tampoco, las 4 llamadas
    // viejas como ultimo recurso.
    return function getLandingData() {
        if (!_promise) {
            _promise = fetchBundle().catch(function(err) {
                if (!esErrorDeTransporte(err)) {
                    // El backend respondio con un error logico: re-pedir el
                    // bundle no sirve, ir directo a las 4 llamadas viejas.
                    console.warn("⚠️ [LANDING-DATA] El bundle obtenerLandingData falló (" + err.message + "), usando las 4 llamadas viejas...");
                    return fetchLegacy();
                }
                console.warn("⚠️ [LANDING-DATA] Intento 1 del bundle no llegó a tiempo (" + err.message + "), re-pidiendo desde la cache en 2 s...");
                return new Promise(function(resolve) { setTimeout(resolve, LANDING_DATA_RETRY_DELAY_MS); })
                    .then(function() { return fetchBundle(); })
                    .catch(function(err2) {
                        console.warn("⚠️ [LANDING-DATA] Intento 2 del bundle también falló (" + err2.message + "), usando las 4 llamadas viejas...");
                        return fetchLegacy();
                    });
            });
        }
        return _promise;
    };
})();
