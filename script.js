/**
 * EDIFICIOS CHAMBERÍ · PLAN RESIDE
 * script.js — Fixed version
 */

'use strict';

/* ═══════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════ */
const CONFIG = {
  center: [40.4377, -3.7003],
  initialZoom: 15,
  minZoom: 14,
  maxZoom: 19,
  maxBounds: [
    [40.415, -3.730],
    [40.460, -3.670]
  ],
  chamberiBuildingsPath: 'data/chamberi_buildings.geojson',
  madridBuildingsPath: null,

  planResideFilter: (props) =>
    props.numberOfBuildingUnits === 1 &&
    props.currentUse === '1_residential',

  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',

  styles: {
    madrid: {
      weight: 0.5, color: '#d5dbe3',
      fillColor: '#edf1f5', fillOpacity: 0.5,
    },
    chamberiResidential: {
      weight: 0.9, color: '#5f84b3',
      fillColor: '#89abd3', fillOpacity: 0.78,
    },
    chamberiDefault: {
      weight: 0.9, color: '#7f97ad',
      fillColor: '#bcc9d6', fillOpacity: 0.72,
    },
    hover: {
      weight: 2, color: '#1f4f82',
      fillColor: '#4a90d9', fillOpacity: 0.92,
    },
    hoverReside: {
      weight: 2, color: '#8b0000',
      fillColor: '#ff6659', fillOpacity: 0.95,
    },
    selectedReside: {
      weight: 2.5, color: '#8b0000',
      fillColor: '#e53935', fillOpacity: 0.95,
    },
    reside: {
      weight: 1.6, color: '#b71c1c',
      fillColor: '#e53935', fillOpacity: 0.9,
    },
    resideMuted: {
      weight: 0.6, color: '#d5dde5',
      fillColor: '#edf1f4', fillOpacity: 0.45,
    },
  },
};

/* ═══════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════ */
const state = {
  planResideActive: false,
  // In normal mode: selectedLayer is null (no persistent visual selection)
  // In reside mode: selectedLayer holds the currently selected red building
  selectedLayer: null,
  selectedFeature: null,
  totalBuildings: 0,
  affectedBuildings: 0,
};

/* ═══════════════════════════════════════════════
   MAP
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

let madridLayer   = null;
let chamberiLayer = null;

/* ═══════════════════════════════════════════════
   STYLE RESOLVER
   Returns the "resting" style for a feature —
   i.e. what it should look like when not hovered.
   Never includes hover state.
   ═══════════════════════════════════════════════ */
function getRestingStyle(feature) {
  const p = feature.properties || {};

  if (state.planResideActive) {
    const isAffected = CONFIG.planResideFilter(p);
    if (isAffected) {
      // Selected affected building keeps a slightly brighter red
      if (state.selectedLayer && state.selectedLayer.feature === feature) {
        return CONFIG.styles.selectedReside;
      }
      return CONFIG.styles.reside;
    }
    return CONFIG.styles.resideMuted;
  }

  // Normal mode — no persistent selection, just base colours
  if (p.currentUse === '1_residential') return CONFIG.styles.chamberiResidential;
  return CONFIG.styles.chamberiDefault;
}

/* ═══════════════════════════════════════════════
   LABEL HELPERS
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

function labelUse(raw)       { return raw ? (USE_LABELS[raw] || raw) : '—'; }
function labelCondition(raw) {
  if (!raw) return '—';
  return { functional: 'Funcional', ruin: 'En ruinas', underConstruction: 'En construcción' }[raw] || raw;
}
function labelYear(iso) {
  if (!iso) return '—';
  const y = iso.slice(0, 4);
  return (y === '0001' || y === '1900' || y === '0000') ? '—' : y;
}
function formatArea(val, uom) {
  if (val == null) return '—';
  return `${Number(val).toLocaleString('es-ES')} ${uom || 'm²'}`;
}

/* ═══════════════════════════════════════════════
   TOAST — transient feedback message
   ═══════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--visible'), 2800);
}

/* ═══════════════════════════════════════════════
   PANEL
   ═══════════════════════════════════════════════ */
function updatePanel(feature) {
  const p = feature.properties || {};

  document.getElementById('panel-empty').style.display    = 'none';
  document.getElementById('building-detail').style.display = 'flex';

  // Reference & cadastral link
  const ref = p.reference || p.localId || p.gml_id || '—';
  document.getElementById('detail-ref').textContent = ref;

  const linkEl  = document.getElementById('detail-link');
  const infoUrl = p.informationSystem;
  if (infoUrl) {
    linkEl.href          = infoUrl;
    linkEl.style.display = 'inline-flex';
  } else {
    linkEl.style.display = 'none';
  }

  // Façade image
  const img         = document.getElementById('facade-img');
  const placeholder = document.getElementById('facade-placeholder');
  img.classList.remove('loaded');
  placeholder.style.display = 'flex';

  if (p.documentLink) {
    img.src     = p.documentLink;
    img.onload  = () => { img.classList.add('loaded'); placeholder.style.display = 'none'; };
    img.onerror = () => { img.classList.remove('loaded'); placeholder.style.display = 'flex'; };
  }

  // Properties
  document.getElementById('prop-use').textContent       = labelUse(p.currentUse);
  document.getElementById('prop-units').textContent     = p.numberOfBuildingUnits != null ? p.numberOfBuildingUnits : '—';
  document.getElementById('prop-dwellings').textContent = p.numberOfDwellings      != null ? p.numberOfDwellings      : '—';
  document.getElementById('prop-area').textContent      = formatArea(p.value, p.value_uom);
  document.getElementById('prop-floors').textContent    = p.numberOfFloorsAboveGround != null ? p.numberOfFloorsAboveGround : '—';
  document.getElementById('prop-year').textContent      = labelYear(p.beginning);
  document.getElementById('prop-condition').textContent = labelCondition(p.conditionOfConstruction);

  // Plan Reside badge
  document.getElementById('reside-badge').style.display =
    CONFIG.planResideFilter(p) ? 'flex' : 'none';
}

function clearPanel() {
  document.getElementById('panel-empty').style.display    = 'flex';
  document.getElementById('building-detail').style.display = 'none';
}

/* ═══════════════════════════════════════════════
   KPIs
   ═══════════════════════════════════════════════ */
function computeKPIs(data) {
  let total = 0, affected = 0;
  data.features.forEach(f => {
    total++;
    if (CONFIG.planResideFilter(f.properties || {})) affected++;
  });
  state.totalBuildings    = total;
  state.affectedBuildings = affected;
  const pct = total > 0 ? ((affected / total) * 100).toFixed(1) : '0';
  document.getElementById('kpi-total').textContent    = total.toLocaleString('es-ES');
  document.getElementById('kpi-affected').textContent = affected.toLocaleString('es-ES');
  document.getElementById('kpi-pct').textContent      = `${pct}%`;
}

/* ═══════════════════════════════════════════════
   LAYER EVENTS
   Key insight: hover always resets on mouseout via
   layer.setStyle(getRestingStyle(feature)) — no
   conditional logic, always clean.
   ═══════════════════════════════════════════════ */
function onEachFeature(feature, layer) {
  const p = feature.properties || {};

  // Tooltip
  const ref = p.reference || p.localId || '';
  if (ref) {
    layer.bindTooltip(ref, {
      className: 'bld-tooltip',
      sticky: true,
      offset: [10, 0],
    });
  }

  layer.on({

    mouseover() {
      // Always apply hover style, regardless of mode or selection
      const isAffected = CONFIG.planResideFilter(p);
      if (state.planResideActive) {
        // In reside mode: only affected buildings get hover highlight
        if (isAffected) {
          layer.setStyle(CONFIG.styles.hoverReside);
          layer.bringToFront();
        }
        // Non-affected: cursor changes to 'not-allowed' via CSS, no style change
      } else {
        layer.setStyle(CONFIG.styles.hover);
        layer.bringToFront();
      }
    },

    mouseout() {
      // ALWAYS reset to resting style — this is the fix for "stuck hover"
      layer.setStyle(getRestingStyle(feature));
    },

    click(e) {
      L.DomEvent.stopPropagation(e);
      const isAffected = CONFIG.planResideFilter(p);

      if (state.planResideActive) {
        if (!isAffected) {
          // Feedback for clicking non-affected building in Plan Reside mode
          showToast('En modo Plan Reside solo puedes seleccionar edificios afectados (en rojo)');
          return;
        }

        // Deselect previous reside selection
        if (state.selectedLayer && state.selectedLayer !== layer) {
          state.selectedLayer.setStyle(CONFIG.styles.reside);
        }

        state.selectedLayer   = layer;
        state.selectedFeature = feature;
        layer.setStyle(CONFIG.styles.selectedReside);
        layer.bringToFront();
        updatePanel(feature);

      } else {
        // Normal mode: open panel, NO persistent visual selection
        // The building will return to its resting style on mouseout automatically
        state.selectedLayer   = null;
        state.selectedFeature = feature;
        updatePanel(feature);
      }
    },
  });
}

/* ═══════════════════════════════════════════════
   PLAN RESIDE TOGGLE
   ═══════════════════════════════════════════════ */
function applyResideStyles() {
  if (!chamberiLayer) return;
  chamberiLayer.eachLayer(layer => {
    if (layer.feature) layer.setStyle(getRestingStyle(layer.feature));
  });
}

document.getElementById('btn-plan-reside').addEventListener('click', function () {
  state.planResideActive = !state.planResideActive;
  this.setAttribute('aria-pressed', String(state.planResideActive));

  document.body.classList.toggle('plan-reside-active', state.planResideActive);
  document.getElementById('legend-reside').style.display =
    state.planResideActive ? 'flex' : 'none';

  // Mode hint text
  document.getElementById('panel-mode-hint').style.display =
    state.planResideActive ? 'flex' : 'none';

  // Clear any selection when switching modes
  state.selectedLayer   = null;
  state.selectedFeature = null;
  clearPanel();
  applyResideStyles();
});

/* ═══════════════════════════════════════════════
   LOAD DATA
   ═══════════════════════════════════════════════ */
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  el.classList.add('hidden');
  setTimeout(() => { el.style.display = 'none'; }, 450);
}

async function init() {
  try {
    if (CONFIG.madridBuildingsPath) {
      try {
        const d = await loadJSON(CONFIG.madridBuildingsPath);
        madridLayer = L.geoJSON(d, { style: CONFIG.styles.madrid, interactive: false }).addTo(map);
      } catch (e) {
        console.warn('Madrid layer skipped:', e.message);
      }
    }

    const chamberiData = await loadJSON(CONFIG.chamberiBuildingsPath);

    chamberiLayer = L.geoJSON(chamberiData, {
      style: f => getRestingStyle(f),
      onEachFeature,
    }).addTo(map);

    const bounds = chamberiLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });

    computeKPIs(chamberiData);
    hideLoading();

  } catch (err) {
    console.error('Error loading data:', err);
    document.querySelector('.loading-text').textContent =
      'Error al cargar los datos. Revisa la consola.';
  }
}

// Click on map background → clear panel, clear selection
map.on('click', () => {
  if (state.selectedLayer) {
    state.selectedLayer.setStyle(getRestingStyle(state.selectedLayer.feature));
    state.selectedLayer = null;
  }
  state.selectedFeature = null;
  clearPanel();
});

init();
