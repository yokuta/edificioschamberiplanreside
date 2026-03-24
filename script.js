/**
 * EDIFICIOS CHAMBERÍ · PLAN RESIDE
 * script.js — Main application logic
 *
 * Dependencies: Leaflet 1.9.x (loaded via CDN in HTML)
 *
 * GeoJSON files expected:
 *   data/chamberi_buildings.geojson   ← Chamberí buildings (main dataset)
 *   data/madrid_buildings.geojson     ← Full Madrid buildings (background layer, optional)
 *
 * Both files must be in WGS84 (EPSG:4326).
 * If your data is in EPSG:25830, run the Python reprojection script first.
 */

'use strict';

/* ═══════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════ */
const CONFIG = {
  // Chamberí approximate centre
  center: [40.4377, -3.7003],
  initialZoom: 15,
  minZoom: 14,
  maxZoom: 19,

  // Bounding box to constrain panning [SW, NE]
  maxBounds: [
    [40.415, -3.730],
    [40.460, -3.670]
  ],

  // GeoJSON paths (relative to index.html)
  chamberiBuildingsPath: 'data/chamberi_buildings.geojson',
  madridBuildingsPath:   null,   // set to null to skip

  // Plan Reside filter criteria
  planResideFilter: (props) =>
    props.numberOfBuildingUnits === 1 &&
    props.currentUse === '1_residential',

  
  // Tile layer — light gray Carto basemap with labels
  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',

  // Style helpers
  styles: {
	  // Base Madrid layer
	  madrid: {
		weight: 0.5,
		color: '#d5dbe3',
		fillColor: '#edf1f5',
		fillOpacity: 0.5,
	  },

	  // Residential buildings
	  chamberiResidential: {
		weight: 0.9,
		color: '#5f84b3',
		fillColor: '#89abd3',
		fillOpacity: 0.78,
	  },

	  // Other uses
	  chamberiDefault: {
		weight: 0.9,
		color: '#7f97ad',
		fillColor: '#bcc9d6',
		fillOpacity: 0.72,
	  },

	  // Hover
	  hover: {
		weight: 1.8,
		color: '#1f4f82',
		fillColor: '#6fa8dc',
		fillOpacity: 0.9,
	  },

	  // Selected
	  selected: {
		weight: 2,
		color: '#c2185b',
		fillColor: '#f3a6c1',
		fillOpacity: 0.88,
	  },

	  // Plan Reside affected
	  reside: {
		weight: 1.6,
		color: '#b71c1c',
		fillColor: '#e53935',
		fillOpacity: 0.9,
	  },

	  // Plan Reside muted
	  resideMuted: {
		weight: 0.6,
		color: '#d5dde5',
		fillColor: '#edf1f4',
		fillOpacity: 0.45,
	  },
	},
};

/* ═══════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════ */
const state = {
  planResideActive: false,
  selectedFeature: null,
  chamberiBuildingsData: null,
  totalBuildings: 0,
  affectedBuildings: 0,
};



/* ═══════════════════════════════════════════════
   MAP INITIALISATION
   ═══════════════════════════════════════════════ */
const map = L.map('map', {
  center: CONFIG.center,
  zoom: CONFIG.initialZoom,
  minZoom: CONFIG.minZoom,
  maxZoom: CONFIG.maxZoom,
  maxBounds: CONFIG.maxBounds,
  maxBoundsViscosity: 0.85,
  zoomControl: true,
});

L.tileLayer(CONFIG.tileUrl, {
  attribution: CONFIG.tileAttribution,
  subdomains: 'abcd',
  maxZoom: 19,
}).addTo(map);

/* ═══════════════════════════════════════════════
   LAYER REFERENCES
   ═══════════════════════════════════════════════ */
let madridLayer    = null;
let chamberiLayer  = null;

/* ═══════════════════════════════════════════════
   UTILITY — get style for a feature
   ═══════════════════════════════════════════════ */
function getFeatureStyle(feature, isSelected = false) {
  const p = feature.properties || {};

  if (isSelected) return CONFIG.styles.selected;

  if (state.planResideActive) {
    if (CONFIG.planResideFilter(p)) return CONFIG.styles.reside;
    return CONFIG.styles.resideMuted;
  }

  if (p.currentUse === '1_residential') return CONFIG.styles.chamberiResidential;
  return CONFIG.styles.chamberiDefault;
}

/* ═══════════════════════════════════════════════
   UTILITY — Label helpers
   ═══════════════════════════════════════════════ */
const USE_LABELS = {
  '1_residential':    'Residencial',
  '2_agriculture':    'Agrícola',
  '3_industrial':     'Industrial',
  '4_commercial':     'Comercial',
  '5_publicServices': 'Servicios Públicos',
  '6_recreational':   'Recreativo',
  '7_otherUse':       'Otro uso',
};

function labelUse(raw) {
  if (!raw) return '—';
  return USE_LABELS[raw] || raw;
}

function labelYear(isoDate) {
  if (!isoDate) return '—';
  const y = isoDate.slice(0, 4);
  return y === '0001' || y === '1900' ? '—' : y;
}

function labelCondition(raw) {
  if (!raw) return '—';
  const map = {
    functional:    'Funcional',
    ruin:          'En ruinas',
    underConstruction: 'En construcción',
  };
  return map[raw] || raw;
}

function formatArea(val, uom) {
  if (val == null) return '—';
  const unit = uom || 'm²';
  return `${Number(val).toLocaleString('es-ES')} ${unit}`;
}

/* ═══════════════════════════════════════════════
   PANEL — update with feature data
   ═══════════════════════════════════════════════ */
function updatePanel(feature) {
  const p = feature.properties || {};

  // Show detail, hide empty state
  document.getElementById('panel-empty').style.display  = 'none';
  document.getElementById('building-detail').style.display = 'flex';

  // Reference & link
  const ref = p.reference || p.localId || p.gml_id || '—';
  document.getElementById('detail-ref').textContent = ref;

  const infoUrl = p.informationSystem || '#';
  const linkEl = document.getElementById('detail-link');
  linkEl.href = infoUrl !== '#' ? infoUrl : '#';
  linkEl.style.display = infoUrl !== '#' ? 'inline-flex' : 'none';

  // Façade image
  const facadeImg = document.getElementById('facade-img');
  const facadePlaceholder = document.getElementById('facade-placeholder');

  facadeImg.classList.remove('loaded');
  facadePlaceholder.style.display = 'flex';

  if (p.documentLink) {
    facadeImg.src = p.documentLink;
    facadeImg.onload = () => {
      facadeImg.classList.add('loaded');
      facadePlaceholder.style.display = 'none';
    };
    facadeImg.onerror = () => {
      facadeImg.classList.remove('loaded');
      facadePlaceholder.style.display = 'flex';
    };
  }

  // Properties
  document.getElementById('prop-use').textContent       = labelUse(p.currentUse);
  document.getElementById('prop-units').textContent     = p.numberOfBuildingUnits != null ? p.numberOfBuildingUnits : '—';
  document.getElementById('prop-dwellings').textContent = p.numberOfDwellings != null ? p.numberOfDwellings : '—';
  document.getElementById('prop-area').textContent      = formatArea(p.value, p.value_uom);
  document.getElementById('prop-floors').textContent    = p.numberOfFloorsAboveGround != null ? p.numberOfFloorsAboveGround : '—';
  document.getElementById('prop-year').textContent      = labelYear(p.beginning);
  document.getElementById('prop-condition').textContent = labelCondition(p.conditionOfConstruction);

  // Plan Reside badge
  const badge = document.getElementById('reside-badge');
  badge.style.display = CONFIG.planResideFilter(p) ? 'flex' : 'none';
}

function clearPanel() {
  document.getElementById('panel-empty').style.display = 'flex';
  document.getElementById('building-detail').style.display = 'none';

  state.selectedFeature = null;
  state.selectedLayer = null;
}

/* ═══════════════════════════════════════════════
   KPI — compute & render
   ═══════════════════════════════════════════════ */
function computeKPIs(geojsonData) {
  let total = 0, affected = 0;

  geojsonData.features.forEach(f => {
    const p = f.properties || {};
    total++;
    if (CONFIG.planResideFilter(p)) affected++;
  });

  state.totalBuildings = total;
  state.affectedBuildings = affected;

  const pct = total > 0 ? ((affected / total) * 100).toFixed(1) : '0';

  document.getElementById('kpi-total').textContent = total.toLocaleString('es-ES');
  document.getElementById('kpi-affected').textContent = affected.toLocaleString('es-ES');
  document.getElementById('kpi-pct').textContent = `${pct}%`;
}

/* ═══════════════════════════════════════════════
   LAYER EVENT HANDLERS
   ═══════════════════════════════════════════════ */
function onEachFeature(feature, layer) {
  layer.on({
    mouseover: (e) => {
      const target = e.target;
      target.setStyle(CONFIG.styles.hover);
      target.bringToFront();
    },

    mouseout: (e) => {
      const target = e.target;
      target.setStyle(getFeatureStyle(feature));
    },

    click: (e) => {
      L.DomEvent.stopPropagation(e);
      updatePanel(feature);
    }
  });
}

/* ═══════════════════════════════════════════════
   PLAN RESIDE — toggle & restyle
   ═══════════════════════════════════════════════ */
function applyResideStyles() {
  if (!chamberiLayer) return;

  chamberiLayer.eachLayer(layer => {
    const f = layer.feature;
    if (!f) return;
    layer.setStyle(getFeatureStyle(f));
  });
}

document.getElementById('btn-plan-reside').addEventListener('click', function () {
  state.planResideActive = !state.planResideActive;
  this.setAttribute('aria-pressed', String(state.planResideActive));

  // Toggle body class for KPI highlight
  document.body.classList.toggle('plan-reside-active', state.planResideActive);

  // Show/hide legend row
  document.getElementById('legend-reside').style.display =
    state.planResideActive ? 'flex' : 'none';

  applyResideStyles();
});

/* ═══════════════════════════════════════════════
   LOAD DATA
   ═══════════════════════════════════════════════ */
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return res.json();
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.add('hidden');
  setTimeout(() => { overlay.style.display = 'none'; }, 450);
}

async function init() {
  try {
    // --- Optional: Madrid background layer ---
    if (CONFIG.madridBuildingsPath) {
      try {
        const madridData = await loadJSON(CONFIG.madridBuildingsPath);
        madridLayer = L.geoJSON(madridData, {
          style: CONFIG.styles.madrid,
          interactive: false,
        }).addTo(map);
      } catch (err) {
        console.warn('Madrid background layer not loaded (optional):', err.message);
      }
    }

    // --- Main: Chamberí layer ---
    const chamberiData = await loadJSON(CONFIG.chamberiBuildingsPath);
    state.chamberiBuildingsData = chamberiData;

    chamberiLayer = L.geoJSON(chamberiData, {
      style: f => getFeatureStyle(f),
      onEachFeature,
    }).addTo(map);

    // Fit map to Chamberí bounds
    const bounds = chamberiLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    // KPIs
    computeKPIs(chamberiData);

    hideLoading();

  } catch (err) {
    console.error('Error loading data:', err);
    document.querySelector('.loading-text').textContent =
      'Error al cargar los datos. Revisa la consola.';
  }
}

// Click on map background clears selection
map.on('click', () => {
  clearPanel();
});


init();
