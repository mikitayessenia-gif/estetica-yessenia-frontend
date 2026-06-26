# Estructura del Proyecto - Estética Yessenia

## 🚀 DEPLOYMENT ACTUAL (GitHub Pages)

**Fuente:** Raíz del repositorio (`main` branch) — **NO se puede usar otra carpeta**
**URL:** https://esteticamikitayessenia.ar/
**Custom Domain:** `CNAME` → `esteticamikitayessenia.ar`

### ⚠️ LIMITACIÓN DE GITHUB PAGES:
GitHub Pages solo permite desplegar desde `/ (root)` o `/docs`. **NO permite seleccionar carpetas arbitrarias como `/user-app/`**. Por eso la app vive en la raíz.

### Archivos que se despliegan:
```
/                          ← GitHub Pages sirve desde aquí (branch main)
├── index.html             ← Página principal con formulario de reservas
├── styles.css             ← Estilos CSS globales
├── scripts/               ← Todos los JS del frontend
│   ├── api.js             ← Comunicación con Google Apps Script backend
│   ├── booking.js         ← Flujo de reservas (éxito, calendar, etc.)
│   ├── mp-handler.js      ← Handler de Mercado Pago (retorno, seña)
│   ├── config-global.js   ← Variables globales (API_URL, API_TOKEN)
│   ├── config.js          ← Configuración de tratamientos, precios, horarios
│   ├── featured-reviews.js← Carrusel de reseñas destacadas
│   ├── google-reviews-config.js ← Config del widget Google Reviews
│   ├── google-reviews.js  ← Widget de reviews de Google
│   ├── instagram-gallery.js← Galería Instagram embed
│   ├── main.js            ← Lógica principal (menu, header, etc.)
│   ├── ui.js              ← Componentes UI dinámicos
│   └── utils.js           ← Funciones utilitarias
├── images/
│   └── principal.jpg      ← Imagen hero principal
├── .gitignore             ← Archivos excluidos del repositorio
└── CNAME                  ← Dominio personalizado
```

---

## 📁 Estructura completa del proyecto local

### Raíz - Archivos que van a GitHub (frontend + config):
| Qué | Para qué |
|-----|----------|
| `index.html`, `styles.css` | Frontend principal (se despliega) |
| `scripts/` | JavaScript del frontend (se despliega) |
| `images/` | Imágenes estáticas (se despliega) |
| `.gitignore`, `CNAME` | Configuración de git y dominio |

### Raíz - Archivos que NO van a GitHub:
| Qué | Dónde | Por qué no va a GitHub | En `.gitignore`? |
|-----|-------|----------------------|------------------|
| `codigo.gs` | Raíz | Backend Google Apps Script - tokens API, URLs secretas, credenciales | ✅ Sí (líneas 40-42) |
| `admin-app/` | Raíz | Panel administrativo - contiene lógica y credenciales sensibles | ✅ Sí (línea 45) |
| `user-app/` | Raíz | **Copia local de referencia** — misma app que en la raíz, pero ignorada por git. Útil para tener una versión limpia sin archivos sensibles mezclados. | ✅ Sí (línea 48) |
| `usuarios de mercado pago de prueba/` | Raíz | Datos de test de Mercado Pago (emails, contraseñas) | ✅ Sí (línea 51) |
| `esquema de tablas google sheets/` | Raíz | Esquema de tablas Google Sheets con datos sensibles | ✅ Sí (línea 54) |

---

## 🔄 user-app/ — ¿Qué es y para qué sirve?

**user-app/** es una **copia local idéntica a la raíz** que se mantiene como referencia. Contiene exactamente los mismos archivos frontend (`index.html`, `styles.css`, `scripts/`, `images/`) pero está ignorada por git.

### ¿Para qué sirve?
- Tener una copia limpia de solo el frontend (sin `.gs`, sin admin, sin datos sensibles mezclados)
- Referencia rápida sin tener que buscar en medio de archivos de configuración
- Backup local del frontend desplegable

### ¿Se usa para deployment?
**NO.** La app se despliega desde la raíz (`/`). user-app/ es solo referencia local.

---

## 🔒 Archivos SENSIBLES (NUNCA subir a GitHub)

Estos archivos contienen credenciales y NUNCA deben estar en el repositorio:

| Archivo | Qué contiene | Riesgo si se sube |
|---------|-------------|-------------------|
| `codigo.gs` | Tokens de Mercado Pago, API keys, URLs secretas de Google Sheets | Exposición total del backend |
| `admin-app/` | Credenciales de admin panel | Acceso no autorizado al panel |
| `usuarios de mercado pago de prueba/` | Emails y contraseñas de cuentas test MP | Compromiso de cuentas de testing |
| `esquema de tablas google sheets/` | Estructura de BD con datos sensibles | Exposición de datos de clientes |

**Si estos archivos aparecen en un commit, ELIMINARLOS DEL HISTORIAL inmediatamente.**

---

## 🔄 Flujo de trabajo correcto

### Pasos para hacer cambios:
1. **Editar archivos en la raíz** → Modificar `scripts/booking.js`, `index.html`, etc. (NUNCA en `user-app/`)
2. **Verificar que no hay archivos sensibles** → Asegurar que no se incluyeron `.gs`, `admin-app/`, etc.
3. **Commit limpio** → Solo frontend: `git add index.html styles.css scripts/`
4. **Push a GitHub** → `git push origin main`
5. **Esperar deploy** → GitHub Pages despliega en ~2-5 minutos
6. **Forzar recarga** → En el navegador: `Shift+F5` (GitHub Pages puede hacer caché)

### Comandos de git para ver estado:
```bash
git status                          # Ver archivos modificados
git diff --stat                     # Ver qué archivos cambiaron
git log --oneline -3                # Ver últimos 3 commits
git remote -v                       # Ver URL del repositorio remoto
```

---

## 🆘 Si el deploy falla (X roja)

1. Verificar que NO hay archivos `.gs` ni `admin-app/` en el commit:
   ```bash
   git log --oneline -3 --stat
   ```
2. Si hay archivos sensibles, hacer force push de un commit limpio:
   ```bash
   git reset --soft <commit-ultimo-verde>
   git add index.html styles.css scripts/
   git commit -m "fix: limpiar deploy"
   git push --force origin main
   ```

---

## 📝 Notas importantes

### Sobre GitHub Pages:
- **Solo puede servir desde `/ (root)` o `/docs`** — no se pueden usar otras carpetas
- El branch de despliegue es `main`
- Los cambios tardan ~2-5 minutos en propagarse
- Si no se actualiza, forzar recarga con `Shift+F5` (caché del navegador)

### Sobre user-app/:
- Es una copia local idéntica a la raíz (`index.html`, `styles.css`, `scripts/`, `images/`)
- Está ignorada por git (`.gitignore` línea 48)
- **NO se usa para deployment** — la app se despliega desde la raíz
- Sirve como referencia limpia del frontend

### Sobre el backend:
- El backend (`codigo.gs`) corre en Google Apps Script (no en este repositorio)
- Se edita directamente en la consola de Google Apps Script o localmente
- NUNCA se sube a GitHub por seguridad
- La comunicación frontend↔backend es vía CORS (fetch a la URL del script)

### Sobre el admin panel:
- El panel administrativo (`admin-app/`) contiene lógica y credenciales sensibles
- No se despliega en GitHub Pages ni se sube al repositorio
- Se accede de forma local o mediante hosting privado
