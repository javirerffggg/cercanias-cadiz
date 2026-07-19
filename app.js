/* =====================================================
   Cercanías Cádiz – app.js
   Datos: GTFS-RT Renfe via allorigins proxy (CORS)
   ===================================================== */

'use strict';

// --- Config ---
const CADIZ_CENTER = [36.527, -6.288];
const CADIZ_ZOOM   = 10;
// Estaciones de la línea C1 Cádiz (lat/lon)
const STATIONS = [
  { name: 'Cádiz',            lat: 36.5297, lon: -6.2948, id: 'CADIZ' },
  { name: 'San Fernando',     lat: 36.4678, lon: -6.1984, id: 'SFDO'  },
  { name: 'Puerto Real',      lat: 36.5226, lon: -6.1817, id: 'PRREAL'},
  { name: 'El Puerto de Santa María', lat: 36.5946, lon: -6.2325, id: 'EPSM' },
  { name: 'Jerez de la Frontera', lat: 36.6878, lon: -6.1363, id: 'JEREZ'},
  { name: 'Las Palmas (Jerez)', lat: 36.6972, lon: -6.1127, id: 'JRZLP'},
  { name: 'Lebrija',          lat: 36.9181, lon: -6.0745, id: 'LEBR' },
  { name: 'Las Cabezas',      lat: 36.9762, lon: -5.9382, id: 'LCAB' },
  { name: 'Utrera',           lat: 37.1864, lon: -5.7768, id: 'UTRE' },
  { name: 'Los Rosales',      lat: 37.2461, lon: -5.7512, id: 'LROS' },
  { name: 'Dos Hermanas',     lat: 37.2908, lon: -5.9196, id: 'DOSHER'},
  { name: 'Sevilla-Santa Justa', lat: 37.3917, lon: -5.9763, id: 'SVSJ' },
];

// Proxy público para CORS
const PROXY = 'https://api.allorigins.win/raw?url=';
const GTFS_URL = 'https://gtfsrt.renfe.com/vehicle_positions.json';
const API_URL  = PROXY + encodeURIComponent(GTFS_URL);

// Estado global
let lastData      = [];
let currentView   = 'map';
let map, cluster;
const markerMap   = new Map(); // entity_id -> L.circleMarker
let deferredPrompt = null;

// --- DOM refs ---
const trainCountEl   = document.getElementById('trainCount');
const lastUpdateEl   = document.getElementById('lastUpdate');
const refreshBtn     = document.getElementById('refreshBtn');
const lineFilterEl   = document.getElementById('lineFilter');
const mapSearchEl    = document.getElementById('mapSearch');
const listSearchEl   = document.getElementById('listSearchInput');
const listLineEl     = document.getElementById('listLineFilter');
const trainListEl    = document.getElementById('trainList');
const emptyStateEl   = document.getElementById('emptyState');
const errorMsgEl     = document.getElementById('errorMsg');
const offlineBanner  = document.getElementById('offlineBanner');
const installPrompt  = document.getElementById('installPrompt');
const installBtn     = document.getElementById('installBtn');
const dismissInstall = document.getElementById('dismissInstall');

// =====================
// MAP INIT
// =====================
function initMap() {
  map = L.map('map', { zoomControl: true }).setView(CADIZ_CENTER, CADIZ_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
  }).addTo(map);

  cluster = L.markerClusterGroup({ disableClusteringAtZoom: 13 });
  cluster.addTo(map);

  // Poner marcadores de estaciones
  const stationIcon = L.divIcon({
    html: '<div style="width:10px;height:10px;background:#38bdf8;border:2px solid white;border-radius:50%"></div>',
    iconSize: [10, 10], iconAnchor: [5, 5], className: ''
  });
  STATIONS.forEach(s => {
    L.marker([s.lat, s.lon], { icon: stationIcon })
      .bindPopup(`<b style="color:#0f172a">${s.name}</b><br><small style="color:#475569">Estación C1</small>`)
      .addTo(map);
  });
}

// =====================
// DATA FETCH
// =====================
async function fetchVehicles() {
  setLoading(true);
  showError('');

  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const feed = await res.json();
    const vehicles = parseVehicles(feed);
    lastData = vehicles;
    updateLineSelectors(vehicles);
    renderMap(vehicles);
    renderList(vehicles);
    const now = new Date();
    lastUpdateEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    trainCountEl.textContent = vehicles.length + ' trenes';
  } catch (err) {
    console.error(err);
    showError('Error al obtener datos. Reintentando en 30s.');
    if (lastData.length === 0) {
      trainCountEl.textContent = 'Sin datos';
    }
  } finally {
    setLoading(false);
  }
}

function parseVehicles(feed) {
  const out = [];
  for (const e of (feed.entity || [])) {
    const v    = e.vehicle || {};
    const pos  = v.position || {};
    const veh  = v.vehicle  || {};
    const trip = v.trip     || {};

    const lat = parseFloat(pos.latitude);
    const lon = parseFloat(pos.longitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;

    const label  = veh.label || veh.id || e.id || 'Tren';
    const tripId = trip.tripId  || '';
    const stopId = v.stopId     || '';
    const status = v.currentStatus || '';
    let line = '';
    if (typeof label === 'string' && label.includes('-')) {
      line = label.split('-')[0].toUpperCase();
    }

    out.push({ entity_id: e.id || tripId || label, label, tripId, stopId, status, lat, lon, line });
  }
  return out;
}

// =====================
// FILTERS
// =====================
function getMapFilters() {
  return {
    line: lineFilterEl.value.trim(),
    q:    mapSearchEl.value.trim().toLowerCase()
  };
}
function getListFilters() {
  return {
    line: listLineEl.value.trim(),
    q:    listSearchEl.value.trim().toLowerCase()
  };
}

function applyFilters(data, { line, q }) {
  return data.filter(v => {
    const okLine = !line || v.line === line;
    const okQ    = !q   || (v.label+''+v.tripId).toLowerCase().includes(q);
    return okLine && okQ;
  });
}

function updateLineSelectors(data) {
  const lines = [...new Set(data.map(v => v.line).filter(Boolean))].sort();
  [lineFilterEl, listLineEl].forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = sel === lineFilterEl
      ? '<option value="">Todas las líneas</option>'
      : '<option value="">Todas</option>';
    lines.forEach(l => {
      const o = document.createElement('option');
      o.value = l; o.textContent = l;
      sel.appendChild(o);
    });
    if (lines.includes(cur)) sel.value = cur;
  });
}

// =====================
// MAP RENDER
// =====================
function lineColor(line) {
  const colors = { C1:'#16a34a', C2:'#d97706', C3:'#7c3aed', C4:'#0284c7',
                   C5:'#db2777', C6:'#059669', C7:'#b45309', C8:'#0e7490',
                   C9:'#7c2d12', C10:'#166534' };
  return colors[line] || '#dc2626';
}

function renderMap(data) {
  const filtered = applyFilters(data, getMapFilters());
  const seen = new Set();

  for (const v of filtered) {
    const key = v.entity_id;
    seen.add(key);
    const color = lineColor(v.line);

    if (markerMap.has(key)) {
      const mk = markerMap.get(key);
      mk.setLatLng([v.lat, v.lon]);
      mk.setStyle({ color, fillColor: color });
      mk.setPopupContent(buildPopup(v));
    } else {
      const mk = L.circleMarker([v.lat, v.lon], {
        radius: 7, color, fillColor: color,
        fillOpacity: 0.9, weight: 2
      });
      mk.bindPopup(buildPopup(v), { maxWidth: 320 });
      markerMap.set(key, mk);
      cluster.addLayer(mk);
    }
  }

  for (const [key, mk] of markerMap.entries()) {
    if (!seen.has(key)) {
      cluster.removeLayer(mk);
      markerMap.delete(key);
    }
  }
}

function buildPopup(v) {
  const statusText = {
    IN_TRANSIT_TO: 'En tránsito',
    STOPPED_AT:    'Parado en estación',
    INCOMING_AT:   'Llegando'
  }[v.status] || v.status || '—';

  return `
    <div style="font-family:system-ui,sans-serif;min-width:220px">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px">${esc(v.label)}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:8px">
        ${v.line ? `● Línea <b>${esc(v.line)}</b> &nbsp;&middot;&nbsp;` : ''}${statusText}
      </div>
      <table style="font-size:12px;border-collapse:collapse;width:100%">
        <tr><td style="color:#64748b;padding:2px 6px 2px 0">Trip</td><td>${esc(v.tripId||'—')}</td></tr>
        <tr><td style="color:#64748b;padding:2px 6px 2px 0">Stop</td><td>${esc(v.stopId||'—')}</td></tr>
        <tr><td style="color:#64748b;padding:2px 6px 2px 0">Lat/Lon</td><td>${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}</td></tr>
      </table>
    </div>
  `;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[c]));
}

// =====================
// LIST RENDER
// =====================
function renderList(data) {
  const filtered = applyFilters(data, getListFilters());
  trainListEl.innerHTML = '';

  if (filtered.length === 0) {
    emptyStateEl.style.display = 'flex';
    return;
  }
  emptyStateEl.style.display = 'none';

  const sorted = [...filtered].sort((a, b) => (a.line || '').localeCompare(b.line || '') || (a.label||'').localeCompare(b.label||''));

  for (const v of sorted) {
    const card = document.createElement('div');
    card.className = 'train-card';

    const statusClass = v.status === 'IN_TRANSIT_TO' ? 'moving' : v.status === 'STOPPED_AT' ? 'stopped' : '';
    const statusText = { IN_TRANSIT_TO: 'En tránsito', STOPPED_AT: 'Parado', INCOMING_AT: 'Llegando' }[v.status] || 'Activo';
    const lineClass = v.line ? v.line.toLowerCase() : '';

    card.innerHTML = `
      <div class="line-badge ${lineClass}">${esc(v.line || '—')}</div>
      <div class="info">
        <div class="label">${esc(v.label)}</div>
        <div class="sub">${statusText} · ${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}</div>
      </div>
      <div class="status-dot ${statusClass}"></div>
    `;

    card.addEventListener('click', () => {
      switchView('map');
      map.setView([v.lat, v.lon], 14);
      const mk = markerMap.get(v.entity_id);
      if (mk) { cluster.zoomToShowLayer(mk, () => mk.openPopup()); }
    });

    trainListEl.appendChild(card);
  }
}

// =====================
// VIEW SWITCH
// =====================
function switchView(view) {
  currentView = view;
  document.getElementById('mapView').classList.toggle('active', view === 'map');
  document.getElementById('listView').classList.toggle('active', view === 'list');
  document.getElementById('navMap').classList.toggle('active', view === 'map');
  document.getElementById('navList').classList.toggle('active', view === 'list');
  if (view === 'map') setTimeout(() => map.invalidateSize(), 100);
}

// =====================
// UI HELPERS
// =====================
function setLoading(on) {
  refreshBtn.classList.toggle('loading', on);
  refreshBtn.disabled = on;
}

function showError(msg) {
  errorMsgEl.textContent = msg;
  errorMsgEl.classList.toggle('show', !!msg);
}

// =====================
// OFFLINE
// =====================
window.addEventListener('online',  () => { offlineBanner.classList.remove('show'); fetchVehicles(); });
window.addEventListener('offline', () => offlineBanner.classList.add('show'));
if (!navigator.onLine) offlineBanner.classList.add('show');

// =====================
// SERVICE WORKER
// =====================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW error:', err));
}

// =====================
// PWA INSTALL
// =====================
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installPrompt.classList.add('show');
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') installPrompt.classList.remove('show');
  deferredPrompt = null;
});
dismissInstall.addEventListener('click', () => installPrompt.classList.remove('show'));

// =====================
// EVENTS
// =====================
refreshBtn.addEventListener('click', fetchVehicles);
lineFilterEl.addEventListener('change', () => renderMap(lastData));
mapSearchEl.addEventListener('input',   () => renderMap(lastData));
listLineEl.addEventListener('change',   () => renderList(lastData));
listSearchEl.addEventListener('input',  () => renderList(lastData));

// =====================
// INIT
// =====================
initMap();
fetchVehicles();
setInterval(fetchVehicles, 30000);
