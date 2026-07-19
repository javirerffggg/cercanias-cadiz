# 🚆 Cercanías Cádiz — PWA

Aplicación web progresiva (PWA) para ver los **trenes de Cercanías de Cádiz en tiempo real**, instalable desde el navegador.

![preview](https://img.shields.io/badge/Estado-Live-22c55e?style=flat-square) ![pwa](https://img.shields.io/badge/PWA-Instalable-dc2626?style=flat-square)

## ✨ Funcionalidades

- 🗺️ **Mapa interactivo** con todos los trenes en circulación (Leaflet + OpenStreetMap)
- 📋 **Lista ordenable** de trenes con estado en tiempo real
- 🔍 **Filtro por línea** (C1, C2, C3…) y búsqueda por label/trip
- 📌 **Estaciones de la línea C1 Cádiz–Sevilla** marcadas en el mapa
- 🔄 **Actualización automática** cada 30 segundos sin recargar
- 📲 **Instalable como app** en Android, iOS y escritorio
- ⚡ **Service Worker** — funciona offline con datos en caché
- 🌙 **Tema oscuro** nativo

## 🚀 Demo en vivo

👉 **[https://javirerffggg.github.io/cercanias-cadiz/](https://javirerffggg.github.io/cercanias-cadiz/)**

## 📡 Fuente de datos

Usa la API **GTFS Realtime** pública de Renfe:
```
https://gtfsrt.renfe.com/vehicle_positions.json
```
Accedida desde el cliente via proxy CORS `allorigins.win` (sin backend necesario).

> **Nota**: El proxy público puede tener latencia ocasional. Si lo despliegas en tu propio servidor, reemplaza `API_URL` en `app.js` con tu propio endpoint proxy.

## ⚙️ Deploy en GitHub Pages

1. Ve a **Settings → Pages** del repositorio
2. Source: **Deploy from branch → main / (root)**
3. Guarda y espera ~1 min
4. La app estará disponible en `https://javirerffggg.github.io/cercanias-cadiz/`

## 🏗️ Estructura

```
cercanias-cadiz/
├── index.html      # Shell de la app + estilos
├── app.js          # Lógica: mapa, lista, fetch GTFS-RT, PWA
├── sw.js           # Service Worker (caché + offline)
├── manifest.json   # Manifiesto PWA
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── README.md
```

## 🛠️ Desarrollo local

```bash
# Cualquier servidor estático sirve
npx serve .
# o
python3 -m http.server 8080
```

Luego abre `http://localhost:8080`.

## 🙏 Créditos

Basado en la idea de [guardovich/renfe-realtime-map](https://github.com/guardovich/renfe-realtime-map). Reimplementado como PWA estática sin backend.
