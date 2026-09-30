// ====================================================
// LANDING DATA (backend v62.0 + archivo estatico + fallback legacy)
// ====================================================
// En la carga inicial de la pagina, los datos (TRATAMIENTOS + REELS +
// RESENAS + CONFIG) se cargan en DOS capas:
//
//   CAPA 1 (primaria): el bundle publicado como archivo ESTATICO en el
//   repo (data/landing-data.json), mantenido por un proyecto Apps Script
//   AISLADO con trigger cada ~6 h que solo publica si los datos pasan
//   todas las validaciones (si algo falla, el archivo anterior sigue ahi).
//   Se sirve desde el CDN con el mismo origen que el sitio: sin relay de
//   Google, sin cuota de Apps Script, llega en ~100 ms. El 30/09 se
//   comprobo que el relay de Google (script.googleusercontent.com/macros/
//   echo) suelta respuestas al navegador de forma intermitente (15
//   ejecuciones completadas en el backend en 1,2-2,3 s; 60% nunca llego
//   al navegador), asi que el archivo estatico es el camino confiable.
//
//   CAPA 2 (red de seguridad): si el archivo estatico no existe, esta
//   muy viejo (>36 h) o no se puede leer, se cae DIRECTO a las 4 llamadas
//   legacy (obtenerTratamientos, obtenerReelsPublic, obtenerResenasPublic,
//   obtenerConfiguracion). Desde el backend v62.0 el bundle
//   obtenerLandingData NO EXISTE (se elimino: el publisher usa esas
//   mismas 4 legacy), asi que no hay paso intermedio. CADA llamada
//   legacy tiene su propio timeout de 10 s y se usa Promise.allSettled:
//   si el relay suelta alguna, esa seccion usa su respaldo estatico y la
//   pagina NUNCA queda en loading eterno (caso real del 30/09 11:10).
//
//   SHAPES v62 (verificado con el agente de backend):
//     obtenerTratamientos  -> { tratamientos: [...] }  (SIN campo success)
//     obtenerConfiguracion -> { config: {...} }        (SIN campo success)
//     obtenerReelsPublic   -> { success: true, reels: [...] }
//     obtenerResenasPublic -> { success: true, resenas: [...] }
//   Por eso el fallback valida por PRESENCIA del campo de datos, no por
//   success.
//
// Todos los consumidores (api.js, instagram-gallery.js,
// featured-reviews.js y el hero widget de index.html) comparten la
// misma Promise: nunca hay 2 cargas en vuelo.
// ====================================================

// --- Capa 1: archivo estatico (CDN, mismo origen) ---
var STATIC_BUNDLE_PATH = 'data/landing-data.json';
// El CDN responde en ~100 ms; 5 s es una red de seguridad generosa
var STATIC_BUNDLE_TIMEOUT_MS = 5000;
// El publisher corre cada ~6 h: un archivo de hasta 36 h (6 fallos
// seguidos del publisher) sigue siendo confiable. Mas viejo que eso =
// pipeline roto -> se cae a las 4 llamadas legacy.
var STATIC_BUNDLE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

// --- Capa 2: 4 llamadas legacy (red de seguridad) ---
// Timeout de cada una de las 4 llamadas: sin esto, una llamada que el
// relay suelta cuelga la pagina para siempre
var LEGACY_CALL_TIMEOUT_MS = 10000;

window.getLandingData = (function() {
    var _promise = null;

    // Normaliza la respuesta del bundle (JSON estatico) a un formato
    // unico { ok, tratamientos, reels, resenas, config, warnings, error }
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
        // El archivo respondio pero sin success (archivo antiguo/corrupto)
        throw new Error((data && data.error) ? data.error : "Respuesta inesperada del JSON estatico");
    }

    // CAPA 1: el bundle publicado como archivo estatico en el repo
    // (data/landing-data.json). Mismo origen que el sitio: sin CORS, sin
    // relay de Google, sin cuota de Apps Script. El contenido lo mantiene
    // el proyecto aislado (trigger cada ~6 h); el frontend solo lo lee y
    // verifica que no este podrido (generatedAt > 36 h = pipeline roto).
    function fetchStaticBundle() {
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function() { controller.abort(); }, STATIC_BUNDLE_TIMEOUT_MS) : null;
        var limpiarTimer = function() { if (timeoutId) clearTimeout(timeoutId); };
        return fetch(STATIC_BUNDLE_PATH, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            signal: controller ? controller.signal : undefined
        })
            .then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(data) {
                limpiarTimer();
                var v = normalizeBundle(data);
                // generatedAt lo agrega el publisher. Si falta (archivo
                // antiguo) se acepta igual: el archivo solo existe porque
                // paso validacion al publicarse.
                if (data && data.generatedAt) {
                    var age = Date.now() - new Date(data.generatedAt).getTime();
                    if (!isNaN(age) && age > STATIC_BUNDLE_MAX_AGE_MS) {
                        throw new Error('archivo estatico con ' + Math.floor(age / 3600000) + ' h de antigüedad (max 36)');
                    }
                }
                return v;
            }, function(e) { limpiarTimer(); throw e; });
    }

    // CAPA 2: las 4 llamadas legacy (backend v62: son la unica fuente de
    // datos de la web app; el bundle fue eliminado).
    //
    // SHAPES v62: obtenerTratamientos y obtenerConfiguracion NO devuelven
    // el campo success (se valida por presencia de tratamientos/config);
    // obtenerReelsPublic y obtenerResenasPublic SÍ devuelven success:true.
    //
    // IMPORTANTE: cada llamada lleva su propio timeout (LEGACY_CALL_TIMEOUT_MS)
    // y se usa Promise.allSettled. Sin esto, si el relay de Google suelta UNA
    // sola de las 4 respuestas, ese fetch cuelga para siempre y la Promise
    // compartida nunca se resuelve: la pagina queda en loading eterno (caso
    // real observado el 30/09 11:10: de las 4 legacy solo 2 llegaron al
    // backend y la seccion de tratamientos NUNCA cargo). Con timeout +
    // allSettled la pagina SIEMPRE se resuelve: lo que llego se pinta con
    // datos reales y lo que no, usa el respaldo estatico de cada consumidor
    // (CONFIG.reels, FALLBACK_REVIEWS, etc).
    function fetchConTimeout(url) {
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function() { controller.abort(); }, LEGACY_CALL_TIMEOUT_MS) : null;
        var limpiar = function() { if (timeoutId) clearTimeout(timeoutId); };
        return fetch(url, { method: 'GET', mode: 'cors', signal: controller ? controller.signal : undefined })
            .then(function(r) { return r.json(); })
            .then(function(v) { limpiar(); return v; }, function(e) { limpiar(); throw e; });
    }

    function fetchLegacy() {
        var token = encodeURIComponent(API_TOKEN);
        var nombres = ['tratamientos', 'reels', 'resenas', 'config'];
        var campos = ['tratamientos', 'reels', 'resenas', 'config'];
        return Promise.allSettled([
            fetchConTimeout(API_URL + "?action=obtenerTratamientos&token=" + token),
            fetchConTimeout(API_URL + "?action=obtenerReelsPublic&token=" + token),
            fetchConTimeout(API_URL + "?action=obtenerResenasPublic&token=" + token),
            fetchConTimeout(API_URL + "?action=obtenerConfiguracion&token=" + token)
        ]).then(function(results) {
            var data = [null, null, null, null];
            var warnings = ["JSON estatico no disponible: se usaron las 4 llamadas legacy como respaldo"];
            var error = null;
            results.forEach(function(r, i) {
                if (r.status === 'fulfilled' && r.value) {
                    data[i] = r.value;
                    // Validacion de shape v62: el campo de datos debe estar
                    // presente (2 de las 4 no devuelven success, por eso no
                    // se valida por ese campo). Si falta, la seccion queda
                    // vacia y el consumidor usa su respaldo estatico.
                    if (r.value[campos[i]] === undefined) {
                        var detalle = r.value.error ? ' (backend: ' + r.value.error + ')' : '';
                        warnings.push('llamada legacy ' + nombres[i] + ' llego sin el campo "' + campos[i] + '"' + detalle);
                        if (!error) error = 'llamada legacy ' + nombres[i] + ' llego sin datos';
                    }
                } else {
                    var reason = (r.reason && r.reason.message) ? r.reason.message : 'sin respuesta a tiempo';
                    warnings.push('llamada legacy ' + nombres[i] + ' no llego: ' + reason);
                    if (!error) error = reason;
                }
            });
            return {
                ok: true,
                tratamientos: (data[0] && data[0].tratamientos) || [],
                reels: (data[1] && data[1].reels) || [],
                resenas: (data[2] && data[2].resenas) || [],
                config: (data[3] && data[3].config) || null,
                warnings: warnings,
                error: error
            };
        });
    }

    // Memoizada: el primer consumidor dispara la carga y los demas
    // esperan la misma Promise. Nunca hay 2 cargas en vuelo.
    //
    // Flujo: archivo estatico (CDN, ~100 ms) → si no sirve, directo a
    // las 4 llamadas legacy como red de seguridad (backend v62: el bundle
    // ya no existe).
    return function getLandingData() {
        if (!_promise) {
            _promise = fetchStaticBundle().catch(function(errStatic) {
                console.warn("⚠️ [LANDING-DATA] JSON estatico no disponible (" + errStatic.message + "), usando las 4 llamadas legacy...");
                return fetchLegacy();
            });
        }
        return _promise;
    };
})();
