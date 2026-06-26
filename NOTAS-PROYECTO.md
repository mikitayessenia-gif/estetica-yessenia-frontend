# Estructura del Proyecto - Estética Yessenia

## 🚀 DEPLOYMENT ACTUAL (GitHub Pages)

**Fuente:** Raíz del repositorio (`main` branch)
**URL:** https://esteticamikitayessenia.ar/

### Archivos que se despliegan:
```
/                          ← GitHub Pages sirve desde aquí
├── index.html
├── styles.css
└── scripts/
    ├── booking.js         ← Cambios del frontend van AQUÍ
    ├── mp-handler.js      ← Cambios del frontend van AQUÍ
    ├── config.js
    └── ... (otros scripts)
```

### ⚠️ IMPORTANTE:
- **TODO** cambio en el frontend se hace en los archivos de la **RAÍZ** (`/scripts/booking.js`, etc.)
- GitHub Pages sirve automáticamente desde la raíz del branch `main`
- No usar `user-app/` para deployment actual

---

## 📁 Estructura de carpetas

| Carpeta | Uso | Estado Git |
|---------|-----|------------|
| `/` (raíz) | **APP PRINCIPAL** - Lo que se despliega en GitHub Pages | ✅ Trackeado |
| `/user-app/` | Copia local de respaldo (sin archivos sensibles) | ❌ Ignorado (.gitignore) |
| `/admin-app/` | Panel administrativo (contiene credenciales) | ❌ Ignorado (.gitignore) |
| `codigo.gs` | Backend Google Apps Script (contiene tokens/API keys) | ❌ Ignorado (.gitignore) |

---

## 🔒 Archivos SENSIBLES (NUNCA subir a GitHub)

Estos archivos contienen credenciales y NO deben estar en el repositorio:

- `codigo.gs` - Tokens de Mercado Pago, API keys
- `admin-app/` - Credenciales de admin panel
- `usuarios de mercado pago de prueba/` - Datos de test de MP

**Si estos archivos aparecen en un commit, ELIMINARLOS DEL HISTORIAL inmediatamente.**

---

## 🔄 Flujo de trabajo correcto

1. **Hacer cambios** → Modificar archivos en la raíz (`scripts/booking.js`, etc.)
2. **Commit limpio** → Solo archivos del frontend (sin .gs, sin admin-app/)
3. **Push a GitHub** → Se despliega automáticamente en ~2 minutos
4. **Verificar** → Check verde en GitHub Actions = deploy exitoso

---

## 🆘 Si el deploy falla (X roja)

1. Verificar que NO hay archivos `.gs` ni `admin-app/` en el commit
2. Ejecutar: `git log --oneline -3` para ver los últimos commits
3. Si hay archivos sensibles, hacer force push de un commit limpio:
   ```bash
   git reset --soft <commit-ultimo-verde>
   git add index.html scripts/booking.js scripts/mp-handler.js
   git commit -m "fix: descripcion del cambio"
   git push --force
   ```

---

## 📝 Notas importantes

- `user-app/` es una copia local de respaldo creada por el desarrollador
- No está siendo usada para deployment actual
- Si se necesita sincronizar, copiar archivos del root a user-app manualmente
- El backend (`codigo.gs`) se edita en la consola de Google Apps Script o localmente, pero NUNCA se sube a GitHub
