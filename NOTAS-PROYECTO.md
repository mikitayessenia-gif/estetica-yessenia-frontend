# Estructura del Proyecto - Estética Yessenia

## 🚀 DEPLOYMENT ACTUAL (GitHub Pages)

**Fuente:** Carpeta `user-app/` del branch `main`
**URL:** https://esteticamikitayessenia.ar/
**Custom Domain:** `CNAME` → `esteticamikitayessenia.ar`

### ⚙️ CONFIGURACIÓN REQUERIDA EN GITHUB:
1. Ir a **Settings → Pages** del repositorio
2. **Source:** Deploy from a branch
3. **Branch:** main
4. **Folder:** `/user-app/`

### Archivos que se despliegan (desde user-app/):
```
/user-app/                     ← GitHub Pages sirve desde aquí (branch main + folder /user-app/)
├── index.html                 ← Página principal con formulario de reservas
├── styles.css                 ← Estilos CSS globales
├── scripts/                   ← Todos los JS del frontend
│   ├── api.js                 ← Comunicación con Google Apps Script backend
│   ├── booking.js             ← Flujo de reservas (éxito, calendar, etc.)
│   ├── mp-handler.js          ← Handler de Mercado Pago (retorno, seña)
│   ├── config-global.js       ← Variables globales (API_URL, API_TOKEN)
│   ├── config.js              ← Configuración de tratamientos, precios, horarios
│   ├── featured-reviews.js    ← Carrusel de reseñas destacadas
│   ├── google-reviews-config.js ← Config del widget Google Reviews
│   ├── google-reviews.js      ← Widget de reviews de Google
│   ├── instagram-gallery.js   ← Galería Instagram embed
│   ├── main.js                ← Lógica principal (menu, header, etc.)
│   ├── ui.js                  ← Componentes UI dinámicos
│   └── utils.js               ← Funciones utilitarias
├── images/
│   └── principal.jpg          ← Imagen hero principal
```

---

## 📁 Estructura completa del proyecto local

### Raíz del proyecto - Archivos de configuración y documentación:
| Archivo | Uso | ¿Va a GitHub? |
|---------|-----|--------------|
| `.gitignore` | Configuración de git (qué ignorar) | ✅ Sí |
| `CNAME` | Dominio personalizado | ✅ Sí |
| `README.md` | Documentación del proyecto | ✅ Sí |
| `NOTAS-PROYECTO.md` | Esta documentación | ✅ Sí |
| `DOC-SISTEMA-RESERVAS.md` | Documentación interna del sistema de reservas | ✅ Sí |

### Carpeta de la aplicación (SE DESPLIEGA):
| Carpeta | Uso | Contenido |
|---------|-----|-----------|
| `/user-app/` | **APP PRINCIPAL** - Lo que se despliega en GitHub Pages | `index.html`, `styles.css`, `scripts/`, `images/` |

### Carpetas/archivos locales que NO van a GitHub:
| Qué | Dónde | Por qué no va a GitHub | En `.gitignore`? |
|-----|-------|----------------------|------------------|
| `codigo.gs` | Raíz | Backend Google Apps Script - contiene tokens API, URLs secretas, credenciales | ✅ Sí (líneas 40-42) |
| `admin-app/` | Raíz | Panel administrativo - contiene lógica y credenciales sensibles | ✅ Sí (línea 45) |
| `usuarios de mercado pago de prueba/` | Raíz | Datos de test de Mercado Pago (emails, contraseñas) | ✅ Sí (línea 48) |
| `esquema de tablas google sheets/` | Raíz | Esquema de tablas Google Sheets con datos sensibles | ✅ Sí (línea 51) |

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
1. **Editar archivos en `user-app/`** → Modificar `user-app/scripts/booking.js`, `user-app/index.html`, etc.
2. **Verificar que no hay archivos sensibles** → Asegurar que no se incluyeron `.gs`, `admin-app/`, etc.
3. **Commit limpio** → Solo frontend: `git add user-app/`
4. **Push a GitHub** → `git push origin main`
5. **Esperar deploy** → GitHub Pages despliega en ~2-5 minutos (después de configurar `/user-app/` en Settings > Pages)
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
   git add user-app/
   git commit -m "fix: limpiar deploy"
   git push --force origin main
   ```

3. Verificar configuración de GitHub Pages:
   - Settings → Pages → Source: Deploy from a branch
   - Branch: **main**
   - Folder: **/user-app/**

---

## 📝 Notas importantes

### Sobre la sincronización con GitHub Pages:
- GitHub Pages sirve desde el branch `main` + folder `/user-app/`
- El dominio `esteticamikitayessenia.ar` apunta al repositorio `mikitayessenia-gif/estetica-yessenia-frontend`
- Los cambios tardan ~2-5 minutos en propagarse
- Si no se actualiza, forzar recarga con `Shift+F5` (caché del navegador)

### Sobre la estructura de carpetas:
- **user-app/** → Contiene toda la aplicación frontend desplegable
- **Raíz** → Solo documentos de referencia (.gitignore, CNAME, README.md, etc.)
- **admin-app/** → Panel administrativo separado (no se sube a GitHub)
- **codigo.gs** → Backend Google Apps Script (no se sube a GitHub)

### Sobre el backend:
- El backend (`codigo.gs`) corre en Google Apps Script (no en este repositorio)
- Se edita directamente en la consola de Google Apps Script o localmente
- NUNCA se sube a GitHub por seguridad
- La comunicación frontend↔backend es vía CORS (fetch a la URL del script)

### Sobre el admin panel:
- El panel administrativo (`admin-app/`) contiene lógica y credenciales sensibles
- No se despliega en GitHub Pages ni se sube al repositorio
- Se accede de forma local o mediante hosting privado
