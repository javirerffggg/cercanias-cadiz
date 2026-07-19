/* ============================================================
   Cercanías Cádiz – app.js
   Datos: GTFS estático de Renfe Cercanías vía allorigins proxy
   Fuente de la API: https://github.com/gerardcl/renfe-cli
   ZIP: https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip
   ============================================================ */

'use strict';

// --------------- CONFIG ---------------
const GTFS_ZIP_URL = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';
const PROXY        = 'https://api.allorigins.win/raw?url=';
const CADIZ_NAMES  = ['cadiz', 'cádiz', 'san fernando', 'puerto real', 'el puerto', 'puerto santa', 'jerez'];
const CADIZ_CENTER = [36.527, -6.288];
const CADIZ_ZOOM   = 10;

// Estaciones C1 Cádiz–Sevilla con coordenadas para el mapa
const STATIONS_GEO = [
  { name: 'Cádiz',                    lat: 36.5297, lon: -6.2948 },
  { name: 'San Fernando-Bahia Sur',   lat: 36.4678, lon: -6.1984 },
  { name: 'Puerto Real',              lat: 36.5226, lon: -6.1817 },
  { name: 'El Puerto de Santa María', lat: 36.5946, lon: -6.2325 },
  { name: 'Jerez de la Frontera',     lat: 36.6878, lon: -6.1363 },
  { name: 'Lebrija',                  lat: 36.9181, lon: -6.0745 },
  { name: 'Las Cabezas de San Juan',  lat: 36.9762, lon: -5.9382 },
  { name: 'Utrera',                   lat: 37.1864, lon: -5.7768 },
  { name: 'Dos Hermanas',             lat: 37.2908, lon: -5.9196 },
  { name: 'Sevilla-Santa Justa',      lat: 37.3917, lon: -5.9763 },
];

// --------------- STATE ---------------
let gtfsData     = null;   // { stops, trips, stopTimes, calendar, calendarDates, routes }
let allSchedules = [];     // schedules para el par origen→destino seleccionado
let filteredSchedules = [];
let currentView  = 'horarios';
let map, routeLine;
const stationMarkers = [];

// --------------- DOM ---------------
const trainCountEl    = document.getElementById('trainCount');
const lastUpdateEl    = document.getElementById('lastUpdate');
const refreshBtn      = document.getElementById('refreshBtn');
const originEl        = document.getElementById('originSelect');
const destEl          = document.getElementById('destSelect');
const dateEl          = document.getElementById('dateInput');
const searchBtn       = document.getElementById('searchBtn');
const trainListEl     = document.getElementById('trainList');
const emptyStateEl    = document.getElementById('emptyState');
const errorMsgEl      = document.getElementById('errorMsg');
const offlineBanner   = document.getElementById('offlineBanner');
const installPrompt   = document.getElementById('installPrompt');
const installBtn      = document.getElementById('installBtn');
const dismissInstall  = document.getElementById('dismissInstall');
let deferredPrompt    = null;

// --------------- MAP ---------------
function initMap() {
  map = L.map('map', { zoomControl: true }).setView(CADIZ_CENTER, CADIZ_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
  }).addTo(map);

  // Línea de ruta entre estaciones
  const latlngs = STATIONS_GEO.map(s => [s.lat, s.lon]);
  routeLine = L.polyline(latlngs, { color: '#dc2626', weight: 3, opacity: 0.6, dashArray: '6 4' }).addTo(map);

  const stationIcon = L.divIcon({
    html: `<div style="width:12px;height:12px;background:#38bdf8;border:2px solid white;
           border-radius:50%;box-shadow:0 0 6px rgba(56,189,248,0.6)"></div>`,
    iconSize: [12, 12], iconAnchor: [6, 6], className: ''
  });

  STATIONS_GEO.forEach(s => {
    const mk = L.marker([s.lat, s.lon], { icon: stationIcon })
      .bindPopup(`<b style="color:#0f172a;font-family:system-ui">${s.name}</b><br>
                  <small style="color:#475569">Línea C1 Cercanías</small>`);
    mk.addTo(map);
    stationMarkers.push({ name: s.name, marker: mk, lat: s.lat, lon: s.lon });
  });
}

// --------------- GTFS LOADER ---------------
async function loadGTFS() {
  setLoading(true);
  showError('');
  trainCountEl.textContent = 'Cargando...';

  try {
    // JSZip v3 desde CDN (cargado en index.html)
    const proxyUrl = PROXY + encodeURIComponent(GTFS_ZIP_URL);
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    const zip = await JSZip.loadAsync(arrayBuffer);
    gtfsData = await parseGTFS(zip);

    populateStationSelects();
    const now = new Date();
    lastUpdateEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    trainCountEl.textContent = Object.keys(gtfsData.stops).length + ' paradas';

    // Buscar horarios con los valores actuales
    searchSchedules();

  } catch (err) {
    console.error('Error cargando GTFS:', err);
    showError('Error al descargar datos. Comprueba tu conexión.');
    trainCountEl.textContent = 'Error';
  } finally {
    setLoading(false);
  }
}

// --------------- GTFS PARSER ---------------
async function parseGTFS(zip) {
  const readCSV = async (filename) => {
    const file = zip.file(filename);
    if (!file) return [];
    const text = await file.async('string');
    return parseCSV(text);
  };

  const [stopsRaw, tripsRaw, stopTimesRaw, calendarRaw, calendarDatesRaw, routesRaw] = await Promise.all([
    readCSV('stops.txt'),
    readCSV('trips.txt'),
    readCSV('stop_times.txt'),
    readCSV('calendar.txt'),
    readCSV('calendar_dates.txt'),
    readCSV('routes.txt'),
  ]);

  // Indexar stops
  const stops = {};
  stopsRaw.forEach(r => { stops[r.stop_id] = r; });

  // Indexar routes
  const routes = {};
  routesRaw.forEach(r => { routes[r.route_id] = r; });

  // Indexar trips
  const trips = {};
  tripsRaw.forEach(r => { trips[r.trip_id] = r; });

  // Indexar stop_times por trip_id
  const stopTimes = {};
  stopTimesRaw.forEach(r => {
    if (!stopTimes[r.trip_id]) stopTimes[r.trip_id] = [];
    stopTimes[r.trip_id].push(r);
  });
  // Ordenar cada trip por stop_sequence
  Object.values(stopTimes).forEach(arr =>
    arr.sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence))
  );

  // Indexar calendar
  const calendar = {};
  calendarRaw.forEach(r => { calendar[r.service_id] = r; });

  // Indexar calendar_dates
  const calendarDates = {};
  calendarDatesRaw.forEach(r => {
    if (!calendarDates[r.service_id]) calendarDates[r.service_id] = [];
    calendarDates[r.service_id].push(r);
  });

  return { stops, trips, stopTimes, calendar, calendarDates, routes };
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
  return lines.slice(1).map(line => {
    const values = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || '').trim(); });
    return obj;
  });
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += line[i]; }
  }
  result.push(current);
  return result;
}

// --------------- POPULATE SELECTS ---------------
function populateStationSelects() {
  if (!gtfsData) return;
  const { stops } = gtfsData;

  // Filtrar solo estaciones de la zona Cádiz/Sevilla
  const cadizStops = Object.values(stops).filter(s => {
    const name = (s.stop_name || '').toLowerCase();
    return CADIZ_NAMES.some(kw => name.includes(kw)) ||
           (s.stop_lat && parseFloat(s.stop_lat) >= 36.4 && parseFloat(s.stop_lat) <= 37.5 &&
            parseFloat(s.stop_lon) >= -6.6 && parseFloat(s.stop_lon) <= -5.5);
  });

  // Agrupar por nombre (puede haber varios andenes por estación)
  const stationMap = {};
  cadizStops.forEach(s => {
    const name = (s.stop_name || s.stop_id).trim();
    if (!stationMap[name]) stationMap[name] = s.stop_id;
  });

  const sorted = Object.entries(stationMap).sort((a, b) => a[0].localeCompare(b[0]));

  [originEl, destEl].forEach((sel, idx) => {
    sel.innerHTML = '';
    sorted.forEach(([name, id]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });

  // Defaults: Cádiz -> Sevilla
  const cadizOpt = sorted.find(([n]) => n.toLowerCase().includes('cádiz') || n.toLowerCase().includes('cadiz'));
  const sevillaOpt = sorted.find(([n]) => n.toLowerCase().includes('sevilla') || n.toLowerCase().includes('santa justa'));
  if (cadizOpt)   originEl.value = cadizOpt[1];
  if (sevillaOpt) destEl.value   = sevillaOpt[1];
}

// --------------- SCHEDULE SEARCH ---------------
function searchSchedules() {
  if (!gtfsData) return;
  const { trips, stopTimes, calendar, calendarDates, routes } = gtfsData;

  const originId = originEl.value;
  const destId   = destEl.value;
  const dateStr  = dateEl.value; // YYYY-MM-DD
  if (!originId || !destId || !dateStr) return;

  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const weekday  = weekdays[date.getDay()];

  const results = [];

  for (const [tripId, trip] of Object.entries(trips)) {
    if (!isServiceActive(trip.service_id, dateStr, weekday, calendar, calendarDates)) continue;

    const stopsInTrip = stopTimes[tripId];
    if (!stopsInTrip) continue;

    const originStop = stopsInTrip.find(st => st.stop_id === originId);
    const destStop   = stopsInTrip.find(st => st.stop_id === destId);

    if (!originStop || !destStop) continue;
    if (parseInt(originStop.stop_sequence) >= parseInt(destStop.stop_sequence)) continue;

    const dep = parseGTFSTime(originStop.departure_time);
    const arr = parseGTFSTime(destStop.arrival_time);
    if (!dep || !arr) continue;

    const route = routes[trip.route_id] || {};
    const trainType = route.route_short_name || route.route_long_name || trip.route_id || 'C1';

    const durationMin = Math.round((arr.totalSeconds - dep.totalSeconds) / 60);

    results.push({
      tripId,
      trainType,
      departure: dep.display,
      arrival:   arr.display,
      durationMin: durationMin >= 0 ? durationMin : durationMin + 1440,
      departureSeconds: dep.totalSeconds,
    });
  }

  results.sort((a, b) => a.departureSeconds - b.departureSeconds);
  allSchedules = results;
  filteredSchedules = results;
  renderScheduleList(results);
  trainCountEl.textContent = results.length + ' trenes';
}

function isServiceActive(serviceId, dateStr, weekday, calendar, calendarDates) {
  // Excepciones calendar_dates
  const overrides = calendarDates[serviceId] || [];
  for (const ov of overrides) {
    if (ov.date === dateStr.replace(/-/g, '')) {
      return ov.exception_type === '1'; // 1=added, 2=removed
    }
  }
  // calendar.txt
  const cal = calendar[serviceId];
  if (!cal) return false;
  const startD = cal.start_date;
  const endD   = cal.end_date;
  const d      = dateStr.replace(/-/g, '');
  if (d < startD || d > endD) return false;
  return cal[weekday] === '1';
}

function parseGTFSTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 3) return null;
  const [h, m, s] = parts;
  const totalSeconds = h * 3600 + m * 60 + s;
  const displayH = h % 24;
  const display  = `${String(displayH).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  return { totalSeconds, display };
}

// --------------- RENDER LIST ---------------
function renderScheduleList(schedules) {
  trainListEl.innerHTML = '';

  if (schedules.length === 0) {
    emptyStateEl.style.display = 'flex';
    return;
  }
  emptyStateEl.style.display = 'none';

  const originName = originEl.options[originEl.selectedIndex]?.text || '';
  const destName   = destEl.options[destEl.selectedIndex]?.text   || '';

  for (const s of schedules) {
    const durationH = Math.floor(s.durationMin / 60);
    const durationM = s.durationMin % 60;
    const durationStr = durationH > 0
      ? `${durationH}h ${durationM}min`
      : `${durationM} min`;

    const card = document.createElement('div');
    card.className = 'train-card';
    card.innerHTML = `
      <div class="line-badge">${esc(s.trainType)}</div>
      <div class="info">
        <div class="label">
          <span class="dep">${esc(s.departure)}</span>
          <span class="arrow">→</span>
          <span class="arr">${esc(s.arrival)}</span>
        </div>
        <div class="sub">${esc(originName)} → ${esc(destName)}</div>
      </div>
      <div class="duration">${durationStr}</div>
    `;
    trainListEl.appendChild(card);
  }
}

// --------------- VIEW SWITCH ---------------
function switchView(view) {
  currentView = view;
  document.getElementById('horariosView').classList.toggle('active', view === 'horarios');
  document.getElementById('mapView').classList.toggle('active', view === 'map');
  document.getElementById('navHorarios').classList.toggle('active', view === 'horarios');
  document.getElementById('navMap').classList.toggle('active', view === 'map');
  if (view === 'map') setTimeout(() => map.invalidateSize(), 100);
}

// --------------- UI HELPERS ---------------
function setLoading(on) {
  refreshBtn.classList.toggle('loading', on);
  refreshBtn.disabled = on;
}

function showError(msg) {
  errorMsgEl.textContent = msg;
  errorMsgEl.classList.toggle('show', !!msg);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[c]));
}

// --------------- OFFLINE ---------------
window.addEventListener('online',  () => { offlineBanner.classList.remove('show'); });
window.addEventListener('offline', () => offlineBanner.classList.add('show'));
if (!navigator.onLine) offlineBanner.classList.add('show');

// --------------- SERVICE WORKER ---------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
}

// --------------- PWA INSTALL ---------------
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

// --------------- EVENTS ---------------
refreshBtn.addEventListener('click', loadGTFS);
searchBtn.addEventListener('click', searchSchedules);
originEl.addEventListener('change', searchSchedules);
destEl.addEventListener('change', searchSchedules);
dateEl.addEventListener('change', searchSchedules);

// --------------- INIT ---------------
// Poner fecha de hoy por defecto
const today = new Date();
const yyyy  = today.getFullYear();
const mm    = String(today.getMonth() + 1).padStart(2, '0');
const dd    = String(today.getDate()).padStart(2, '0');
dateEl.value = `${yyyy}-${mm}-${dd}`;

initMap();
loadGTFS();
