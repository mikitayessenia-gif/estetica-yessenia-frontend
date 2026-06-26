# Estructura del Proyecto - Estetica Yessenia

## DESPLIEGUE ACTUAL (GitHub Pages)

**Fuente:** Raiz del repositorio (main branch)
**URL:** https://esteticamikitayessenia.ar/
**Custom Domain:** CNAME -> esteticamikitayessenia.ar

### Archivos que se despliegan (desde raiz):
`
/                          <- GitHub Pages sirve desde aqui (branch main)
├── index.html             <- Pagina principal con formulario de reservas
├── styles.css             <- Estilos CSS globales
├── scripts/               <- Todos los JS del frontend
│   ├── api.js             <- Comunicacion con Google Apps Script backend
│   ├── booking.js         <- Flujo de reservas (exito, calendar, etc.)
│   ├── mp-handler.js      <- Handler de Mercado Pago (retorno, sena)
│   ├── config-global.js   <- Variables globales (API_URL, API_TOKEN)
│   ├── config.js          <- Configuracion de tratamientos, precios, horarios
│   ├── featured-reviews.js<- Carrusel de reseñas destacadas
│   ├── google-reviews-config.js <- Config del widget Google Reviews
│   ├── google-reviews.js  <- Widget de reviews de Google
│   ├── instagram-gallery.js<- Galeria Instagram embed
│   ├── main.js            <- Logica principal (menu, header, etc.)
│   ├── ui.js              <- Componentes UI dinamicos
│   └── utils.js           <- Funciones utilitarias
├── images/
│   └── principal.jpg      <- Imagen hero principal
├── .gitignore             <- Archivos excluidos del repositorio
└── CNAME                  <- Dominio personalizado
`

---

## ESTRUCTURA LOCAL COMPLETA

### Raiz - Lo que se sube a GitHub (frontend):
| Archivo/Carpeta | Uso |
|-----------------|-----|
| index.html | Pagina principal con formulario de reservas |
| styles.css | Estilos CSS globales |
| scripts/ | JavaScript del frontend (12 archivos) |
| images/ | Imagen hero principal |
| .gitignore | Reglas de git (que ignorar) |
| CNAME | Dominio personalizado |

### Raiz - Lo que NO se sube a GitHub:
| Archivo/Carpeta | Uso | En .gitignore? |
|-----------------|-----|------------------|
| _local/ | Carpeta con TODO lo local (backend, admin, docs) | Si (linea 6) |

### Dentro de _local/:
| Archivo/Carpeta | Uso |
|-----------------|-----|
| codigo.gs | Backend Google Apps Script - tokens API, URLs secretas, credenciales |
| dmin-app/ | Panel administrativo - contiene logica y credenciales sensibles |
| README.md | Documentacion general del proyecto |
| NOTAS-PROYECTO.md | Esta documentacion de estructura del proyecto |
| DOC-SISTEMA-RESERVAS.md | Documentacion interna del sistema de reservas |
| "usuarios de mercado pago de prueba"/ | Datos de test de Mercado Pago (emails, passwords) |
| "esquema de tablas google sheets"/ | Esquema de tablas Google Sheets con datos sensibles |

---

## FLUJO DE TRABAJO CORRECTO

### Pasos para hacer cambios:
1. **Editar archivos en la raiz** -> Modificar scripts/booking.js, index.html, etc.
2. **Verificar que no hay archivos sensibles** -> Asegurar que no se incluyeron .gs, dmin-app/, etc.
3. **Commit limpio** -> Solo frontend: git add index.html styles.css scripts/
4. **Push a GitHub** -> git push origin main
5. **Esperar deploy** -> GitHub Pages despliega en ~2-5 minutos
6. **Forzar recarga** -> En el navegador: Shift+F5 (GitHub Pages puede hacer cache)

### Comandos de git para ver estado:
`ash
git status                          # Ver archivos modificados
git diff --stat                     # Ver que archivos cambiaron
git log --oneline -3                # Ver ultimos 3 commits
git remote -v                       # Ver URL del repositorio remoto
`

---

## SI EL DEPLOY FALLA (X roja)

1. Verificar que NO hay archivos .gs ni dmin-app/ en el commit:
   `ash
   git log --oneline -3 --stat
   `
2. Si hay archivos sensibles, hacer force push de un commit limpio:
   `ash
   git reset --soft <commit-ultimo-verde>
   git add index.html styles.css scripts/
   git commit -m "fix: limpiar deploy"
   git push --force origin main
   `

---

## NOTAS IMPORTANTES

### Sobre GitHub Pages:
- Solo puede servir desde / (root) o /docs/ - no se pueden usar otras carpetas
- El branch de despliegue es main
- Los cambios tardan ~2-5 minutos en propagarse
- Si no se actualiza, forzar recarga con Shift+F5 (cache del navegador)

### Sobre archivos locales:
- La carpeta _local/ contiene todo lo que NO va a GitHub
- Incluye backend (codigo.gs), admin panel, configs sensibles, docs internos
- Esta carpeta se ignora por .gitignore linea 6
- Nunca mover archivos de _local/ a la raiz y hacer commit

### Sobre el backend:
- El backend (codigo.gs) corre en Google Apps Script (no en este repositorio)
- Se edita directamente en la consola de Google Apps Script o localmente
- NUNCA se sube a GitHub por seguridad
- La comunicacion frontend<->backend es via CORS (fetch a la URL del script)

### Sobre el admin panel:
- El panel administrativo (dmin-app/) contiene logica y credenciales sensibles
- No se despliega en GitHub Pages ni se sube al repositorio
- Se accede de forma local o mediante hosting privado

