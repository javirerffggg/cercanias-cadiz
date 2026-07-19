# 🚆 Cercanías Cádiz — PWA

Aplicación web progresiva (PWA) instalable para ver los **horarios de Cercanías de Cádiz** (línea C1 y otras) con mapa de la red.

![preview](https://img.shields.io/badge/Estado-Live-22c55e?style=flat-square) ![pwa](https://img.shields.io/badge/PWA-Instalable-dc2626?style=flat-square) ![gtfs](https://img.shields.io/badge/Datos-GTFS%20Renfe-0284c7?style=flat-square)

## ✨ Funcionalidades

- 🗓️ **Horarios reales** entre cualquier par de estaciones de Cercanías Cádiz
- 🔍 Selector de **origen, destino y fecha**
- ⏰ Muestra hora de salida, llegada y duración del trayecto
- 🗺️ **Mapa** con las estaciones de la línea C1 (Cádiz → Sevilla)
- 📲 **Instalable como app** en Android, iOS y escritorio (PWA)
- ⚡ **Service Worker** para caché offline
- 🌙 Tema oscuro nativo

## 🚀 Demo en vivo

👉 **[https://javirerffggg.github.io/cercanias-cadiz/](https://javirerffggg.github.io/cercanias-cadiz/)**

## 📡 Fuente de datos

Utiliza el **GTFS estático de Cercanías** publicado por Renfe/Fomento, tal y como lo hace el proyecto [gerardcl/renfe-cli](https://github.com/gerardcl/renfe-cli):

```
https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip
```

El ZIP se descarga y parsea directamente en el navegador con [JSZip](https://stuk.github.io/jszip/). Contiene:

| Archivo | Contenido |
|---|---|
| `stops.txt` | Estaciones y coordenadas |
| `trips.txt` | Expediciones |
| `stop_times.txt` | Horarios por parada |
| `calendar.txt` | Servicios activos por día de semana |
| `calendar_dates.txt` | Excepciones (festivos, etc.) |
| `routes.txt` | Líneas (C1, C2…) |

> El acceso se hace via proxy CORS `allorigins.win` al ser una PWA estática sin backend.

## ⚙️ Deploy en GitHub Pages

1. Ve a **Settings → Pages** del repositorio
2. Source: **GitHub Actions**
3. El workflow `.github/workflows/pages.yml` lo despliega automáticamente en cada push a `main`
4. URL: `https://javirerffggg.github.io/cercanias-cadiz/`

## 🏗️ Estructura

```
cercanias-cadiz/
├── index.html              # Shell + estilos + formulario de búsqueda
├── app.js                  # Lógica GTFS: descarga, parseo, horarios, mapa
├── sw.js                   # Service Worker
├── manifest.json           # Manifiesto PWA
├── icons/
│   └── icon-192.png
└── .github/workflows/
    └── pages.yml
```

## 🛠️ Desarrollo local

```bash
npx serve .
# o
python3 -m http.server 8080
```

## 🙏 Créditos

- Inspirado en [guardovich/renfe-realtime-map](https://github.com/guardovich/renfe-realtime-map)
- API/datos: método de [gerardcl/renfe-cli](https://github.com/gerardcl/renfe-cli)
- Mapas: [Leaflet](https://leafletjs.com) + [OpenStreetMap](https://openstreetmap.org)
