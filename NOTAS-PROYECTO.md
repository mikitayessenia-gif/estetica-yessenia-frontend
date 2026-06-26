# Estructura del Proyecto - Estética Yessenia

## 🚀 DEPLOYMENT ACTUAL (GitHub Pages)

**Fuente:** Raíz del repositorio (`main` branch)
**URL:** https://esteticamikitayessenia.ar/
**Custom Domain:** `CNAME` → `esteticamikitayessenia.ar`

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

### Carpetas que SÍ van a GitHub (frontend desplegado):
| Carpeta | Uso | Contenido |
|---------|-----|-----------|
| `/` (raíz) | **APP PRINCIPAL** - Lo que se despliega en GitHub Pages | `index.html`, `styles.css`, `scripts/`, `images/` |

### Carpetas/archivos locales que NO van a GitHub:
| Qué | Dónde | Por qué no va a GitHub | En `.gitignore`? |
|-----|-------|----------------------|------------------|
| `user-app/` | Local solo | **COPIA LOCAL ANTIGUA** de la app frontend. Contiene versiones desactualizadas de los archivos del root. Se creó como referencia pero ya no se usa para deploy. | ✅ Sí (línea 50) |
| `codigo.gs` | Raíz | Backend Google Apps Script - contiene tokens API, URLs secretas, credenciales | ✅ Sí (líneas 42-44) |
| `admin-app/` | Raíz | Panel administrativo - contiene lógica y credenciales sensibles | ✅ Sí (línea 47) |
| `usuarios de mercado pago de prueba/` | Raíz | Datos de test de Mercado Pago (emails, contraseñas) | ✅ Sí (línea 53) |
| `esquema de tablas google sheets/` | Raíz | Esquema de tablas Google Sheets con datos sensibles | ✅ Sí (línea 56) |
| `README.md`, `DOC-SISTEMA-RESERVAS.md` | Raíz | Documentación interna del proyecto | ✅ Sí (líneas 59) |

---

## 🔄 user-app/ vs raíz - ¿Cuál es cuál?

### user-app/ (NO usar para cambios)
- **Qué es:** Copia local creada como respaldo de la app frontend
- **Estado:** DESACTUALIZADA respecto al root
- **Ejemplo:** `user-app/scripts/mp-handler.js` = 57.8KB | `scripts/mp-handler.js` (root) = 59.3KB
- **Para qué sirve:** Solo como referencia si necesitas una versión sin archivos sensibles
- **NO se usa para deployment**

### Raíz / (USAR PARA TODOS LOS CAMBIOS)
- **Qué es:** La aplicación real que se despliega en GitHub Pages
- **Estado:** Siempre actualizada con los últimos cambios
- **Todos los cambios van AQUÍ:** `scripts/booking.js`, `scripts/mp-handler.js`, etc.

### Cómo verificar si user-app está desactualizada:
```bash
# Comparar tamaños de archivos entre root y user-app
Get-ChildItem scripts -Filter *.js | Select-Object Name,Length
Get-ChildItem user-app\scripts -Filter *.js | Select-Object Name,Length
```

Si los tamaños son diferentes, el root tiene la versión más reciente.

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

### Sobre la sincronización con GitHub Pages:
- GitHub Pages sirve automáticamente desde el branch `main`
- El dominio `esteticamikitayessenia.ar` apunta al repositorio `mikitayessenia-gif/estetica-yessenia-frontend`
- Los cambios tardan ~2-5 minutos en propagarse
- Si no se actualiza, forzar recarga con `Shift+F5` (caché del navegador)

### Sobre user-app/:
- Es una copia local desactualizada de la app frontend
- Se creó como respaldo sin archivos sensibles
- **NO se usa para deployment** - todos los cambios van en la raíz
- Si necesitas ver la versión limpia sin archivos sensibles, usar `user-app/` como referencia

### Sobre el backend:
- El backend (`codigo.gs`) corre en Google Apps Script (no en este repositorio)
- Se edita directamente en la consola de Google Apps Script o localmente
- NUNCA se sube a GitHub por seguridad
- La comunicación frontend↔backend es vía CORS (fetch a la URL del script)

### Sobre el admin panel:
- El panel administrativo (`admin-app/`) contiene lógica y credenciales sensibles
- No se despliega en GitHub Pages ni se sube al repositorio
- Se accede de forma local o mediante hosting privado
