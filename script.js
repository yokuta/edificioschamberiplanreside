'use strict';

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
    Number(props.numberOfBuildingUnits) === 1 &&
    props.currentUse === '1_residential',

  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  tileAttribution:
    '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',

  styles: {
    madrid: {
      weight: 0.5,
      color: '#d5dbe3',
      fillColor: '#edf1f5',
      fillOpacity: 0.5
    },

    chamberiResidential: {
      weight: 0.9,
      color: '#5f84b3',
      fillColor: '#89abd3',
      fillOpacity: 0.78
    },

    chamberiDefault: {
      weight: 0.9,
      color: '#7f97ad',
      fillColor: '#bcc9d6',
      fillOpacity: 0.72
    },

    hover: {
      weight: 2,
      color: '#1f4f82',
      fillColor: '#4a90d9',
      fillOpacity: 0.92
    },

    reside: {
      weight: 1.6,
      color: '#b71c1c',
      fillColor: '#e53935',
      fillOpacity: 0.9
    },

    hoverReside: {
      weight: 2.1,
      color: '#8b0000',
      fillColor: '#ff6659',
      fillOpacity: 0.95
    },

    selectedReside: {
      weight: 2.5,
      color: '#8b0000',
      fillColor: '#e53935',
      fillOpacity: 0.98
    },

    resideMuted: {
      weight: 0.6,
      color: '#d5dde5',
      fillColor: '#edf1f4',
      fillOpacity: 0.45
    }
  }
};

const state = {
  planResideActive: false,
  selectedLayer: null,
  selectedFeature: null,
  hoveredLayer: null,
  totalBuildings: 0,
  affectedBuildings: 0
};

// Add these lines after the existing state object
const mobileBottomSheet = document.getElementById('mobile-bottom-sheet');
const mobileDetailContent = document.getElementById('mobile-detail-content');
const closeBottomSheetBtn = document.getElementById('close-bottom-sheet');

const map = L.map('map', {
  center: CONFIG.center,
  zoom: CONFIG.initialZoom,
  minZoom: CONFIG.minZoom,
  maxZoom: CONFIG.maxZoom,
  maxBounds: CONFIG.maxBounds,
  maxBoundsViscosity: 0.85,
  zoomControl: true
});

L.tileLayer(CONFIG.tileUrl, {
  attribution: CONFIG.tileAttribution,
  subdomains: 'abcd',
  maxZoom: 19
}).addTo(map);

let madridLayer = null;
let chamberiLayer = null;

const USE_LABELS = {
  '1_residential': 'Residencial',
  '2_agriculture': 'Agrícola',
  '3_industrial': 'Industrial',
  '4_commercial': 'Comercial',
  '5_publicServices': 'Servicios públicos',
  '6_recreational': 'Recreativo',
  '7_otherUse': 'Otro uso'
};

function labelUse(raw) {
  return raw ? (USE_LABELS[raw] || raw) : '—';
}

function labelCondition(raw) {
  if (!raw) return '—';

  const mapCondition = {
    functional: 'Funcional',
    ruin: 'En ruinas',
    underConstruction: 'En construcción'
  };

  return mapCondition[raw] || raw;
}

function valueOrDash(value) {
  return value === undefined || value === null || value === '' ? '—' : value;
}

function formatArea(val, uom) {
  if (val === undefined || val === null || val === '') return '—';
  const num = Number(val);
  if (Number.isNaN(num)) return `${val} ${uom || 'm²'}`.trim();
  return `${num.toLocaleString('es-ES')} ${uom || 'm²'}`;
}

function formatAreaShort(val, uom) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (Number.isNaN(num)) return `${val} ${uom || 'm²'}`.trim();
  return `${num.toLocaleString('es-ES')} ${uom || 'm²'}`;
}

function getHeaderMeta(props = {}) {
  const parts = [];

  const year = getConstructionYear(props);
  const area = formatAreaShort(props.value, props.value_uom);

  if (year && year !== '—') parts.push(`Año ${year}`);
  if (area) parts.push(area);

  return parts.length ? parts.join(' · ') : 'Información catastral disponible';
}



function getConstructionYear(props = {}) {
  const candidateKeys = [
    'beginning',
    'constructionYear',
    'yearOfConstruction',
    'builtYear',
    'fechaConstruccion',
    'anyoConstruccion',
    'anioConstruccion'
  ];

  for (const key of candidateKeys) {
    const value = props[key];
    if (value === undefined || value === null || value === '') continue;

    if (typeof value === 'number' && value > 0) {
      return String(Math.trunc(value));
    }

    const str = String(value).trim();
    const match = str.match(/\b(18|19|20)\d{2}\b/);
    if (match) return match[0];
  }

  return '—';
}

function getReference(props = {}) {
  return props.reference || props.localId || props.gml_id || '—';
}

function isAffected(featureOrProps) {
  const props = featureOrProps && featureOrProps.properties ? featureOrProps.properties : featureOrProps;
  return CONFIG.planResideFilter(props || {});
}

function getRestingStyle(feature) {
  const props = feature.properties || {};

  if (state.planResideActive) {
    if (isAffected(props)) {
      if (state.selectedLayer && state.selectedLayer.feature === feature) {
        return CONFIG.styles.selectedReside;
      }
      return CONFIG.styles.reside;
    }
    return CONFIG.styles.resideMuted;
  }

  if (props.currentUse === '1_residential') {
    return CONFIG.styles.chamberiResidential;
  }

  return CONFIG.styles.chamberiDefault;
}

function applyRestingStyle(layer) {
  if (!layer || !layer.feature) return;
  layer.setStyle(getRestingStyle(layer.feature));
}

function refreshAllStyles() {
  if (!chamberiLayer) return;

  chamberiLayer.eachLayer((layer) => {
    applyRestingStyle(layer);

    const affected = isAffected(layer.feature);
    if (state.planResideActive && !affected) {
      if (layer._path) layer._path.style.cursor = 'not-allowed';
    } else {
      if (layer._path) layer._path.style.cursor = 'pointer';
    }
  });
}

let toastTimer = null;

function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('toast--visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('toast--visible');
  }, 2800);
}

function updateInstructionText() {
  const mapText = document.getElementById('map-instructions-text');
  const emptySub = document.getElementById('empty-sub');

  if (state.planResideActive) {
    mapText.textContent = 'Haz clic en un edificio para ver sus detalles';
    emptySub.textContent = 'Haz clic en un edificio para ver sus detalles';
  } else {
    mapText.textContent = 'Haz clic en un edificio para ver sus detalles';
    emptySub.textContent = 'Haz clic sobre cualquier edificio en el mapa para ver su información';
  }
}
function updatePanel(feature) {
  const props = feature.properties || {};
  const reference = getReference(props);
  const infoUrl = props.informationSystem || props.url || null;

  // === DESKTOP (full panel - unchanged) ===
  document.getElementById('panel-empty').style.display = 'none';
  document.getElementById('building-detail').style.display = 'flex';

  document.getElementById('detail-ref').textContent = reference;
  document.getElementById('detail-subtitle').textContent = state.planResideActive && isAffected(props)
    ? 'Ficha del edificio · Plan Reside'
    : 'Ficha del edificio';
  document.getElementById('detail-meta').textContent = getHeaderMeta(props);

  document.getElementById('prop-reference').textContent = reference;
  document.getElementById('prop-use').textContent = labelUse(props.currentUse);
  document.getElementById('prop-year').textContent = getConstructionYear(props);
  document.getElementById('prop-units').textContent = valueOrDash(props.numberOfBuildingUnits);
  document.getElementById('prop-dwellings').textContent = valueOrDash(props.numberOfDwellings);
  document.getElementById('prop-area').textContent = formatArea(props.value, props.value_uom);
  document.getElementById('prop-floors').textContent = valueOrDash(props.numberOfFloorsAboveGround);
  document.getElementById('prop-condition').textContent = labelCondition(props.conditionOfConstruction);

  const linkEl = document.getElementById('detail-link');
  linkEl.style.display = infoUrl ? 'inline-flex' : 'none';
  if (infoUrl) linkEl.href = infoUrl;

  // Image + props + badge stay only for desktop
  const img = document.getElementById('facade-img');
  const placeholder = document.getElementById('facade-placeholder');
  img.classList.remove('loaded');
  placeholder.style.display = 'flex';
  if (props.documentLink) {
    img.onload = () => { img.classList.add('loaded'); placeholder.style.display = 'none'; };
    img.onerror = () => { placeholder.style.display = 'flex'; };
    img.src = props.documentLink;
  }
  document.getElementById('reside-badge').style.display = isAffected(props) ? 'flex' : 'none';

  // === MOBILE BOTTOM SHEET (SUPER COMPACT - only what you asked for) ===
  if (window.innerWidth <= 700) {
    const mobileHTML = `
      <div class="detail-header" style="border-bottom:none; padding:20px 20px 10px;">
        <div class="detail-header-main">
          <div class="detail-ref" style="font-size:15px;">${reference}</div>
          <div class="detail-subtitle" style="margin-top:2px;">Ficha del edificio</div>
          <div class="detail-meta" style="margin-top:4px; font-size:13px;">${getHeaderMeta(props)}</div>
        </div>
        ${infoUrl ? `
          <a class="detail-link" href="${infoUrl}" target="_blank" rel="noopener"
             style="margin-top:12px; align-self:flex-start;">
            Ver en Catastro ↗
          </a>
        ` : ''}
      </div>
    `;
    mobileDetailContent.innerHTML = mobileHTML;
    mobileBottomSheet.classList.add('open');
    mobileBottomSheet.style.display = 'block';
  }
}


function clearPanel() {
  document.getElementById('panel-empty').style.display = 'flex';
  document.getElementById('building-detail').style.display = 'none';
}

function computeKPIs(data) {
  let total = 0;
  let affected = 0;

  data.features.forEach((feature) => {
    total += 1;
    if (isAffected(feature)) affected += 1;
  });

  state.totalBuildings = total;
  state.affectedBuildings = affected;

  const pct = total > 0 ? ((affected / total) * 100).toFixed(1) : '0';

  document.getElementById('kpi-total').textContent = total.toLocaleString('es-ES');
  document.getElementById('kpi-affected').textContent = affected.toLocaleString('es-ES');
  document.getElementById('kpi-pct').textContent = `${pct}%`;
}

function clearSelection({ clearPanelToo = true } = {}) {
  if (state.selectedLayer) {
    applyRestingStyle(state.selectedLayer);
  }

  state.selectedLayer = null;
  state.selectedFeature = null;

  if (clearPanelToo) {
    document.getElementById('panel-empty').style.display = 'flex';
    document.getElementById('building-detail').style.display = 'none';
  }

  // Close mobile sheet
  if (window.innerWidth <= 700) {
    mobileBottomSheet.classList.remove('open');
    setTimeout(() => {
      mobileBottomSheet.style.display = 'none';
    }, 300);
  }
}

function zoomToBuilding(layer) {
  if (!layer) return;

  const bounds = layer.getBounds();
  if (!bounds.isValid()) return;

  const targetZoom = Math.min(17, map.getBoundsZoom(bounds));
  map.flyToBounds(bounds, {
    padding: [50, 50],
    maxZoom: targetZoom,
    duration: 0.5
  });
}

function clearHoveredLayer() {
  if (!state.hoveredLayer) return;

  const hovered = state.hoveredLayer;
  state.hoveredLayer = null;
  applyRestingStyle(hovered);
}

function selectAffectedLayerInResideMode(layer) {
  if (state.selectedLayer && state.selectedLayer !== layer) {
    applyRestingStyle(state.selectedLayer);
  }

  state.selectedLayer = layer;
  state.selectedFeature = layer.feature;
  layer.setStyle(CONFIG.styles.selectedReside);
  layer.bringToFront();
  updatePanel(layer.feature);
}

function openInNormalMode(layer) {
  state.selectedLayer = null;
  state.selectedFeature = layer.feature;
  updatePanel(layer.feature);

  if (state.hoveredLayer !== layer) {
    applyRestingStyle(layer);
  }
}

function onEachFeature(feature, layer) {
  const props = feature.properties || {};

  layer.on({
    mouseover() {
	  state.hoveredLayer = layer;

	  if (state.planResideActive) {
		if (isAffected(props)) {
		  layer.setStyle(
			state.selectedLayer === layer
			  ? CONFIG.styles.selectedReside
			  : CONFIG.styles.hoverReside
		  );
		  layer.bringToFront();
		} else {
		  if (layer._path) layer._path.style.cursor = 'not-allowed';
		}
	  } else {
		layer.setStyle(CONFIG.styles.hover);
	  }
	},

    mouseout() {
      if (state.hoveredLayer === layer) {
        state.hoveredLayer = null;
      }
      applyRestingStyle(layer);
    },

    click(e) {
	  L.DomEvent.stopPropagation(e);

	  if (state.planResideActive) {
		if (!isAffected(props)) {
		  showToast('En modo Plan Reside solo puedes seleccionar edificios afectados (en rojo)');
		  return;
		}

		zoomToBuilding(layer);
		selectAffectedLayerInResideMode(layer);
		return;
	  }

	  zoomToBuilding(layer);
	  openInNormalMode(layer);
	}
  });

  layer.on('add', () => {
    if (layer._path) {
      if (state.planResideActive && !isAffected(props)) {
        layer._path.style.cursor = 'not-allowed';
      } else {
        layer._path.style.cursor = 'pointer';
      }
    }
  });
}

function updateModeUI() {
  document.body.classList.toggle('plan-reside-active', state.planResideActive);
  document.getElementById('btn-plan-reside').setAttribute('aria-pressed', String(state.planResideActive));

  const legendReside = document.getElementById('legend-reside');
  const legendHover = document.getElementById('legend-hover');
  const legendResidential = document.getElementById('legend-residential');
  const legendOther = document.getElementById('legend-other');

  if (state.planResideActive) {
    if (legendResidential) legendResidential.style.display = 'none';
    if (legendOther) legendOther.style.display = 'none';
    if (legendHover) legendHover.style.display = 'none';
    if (legendReside) legendReside.style.display = 'flex';
  } else {
    if (legendResidential) legendResidential.style.display = 'flex';
    if (legendOther) legendOther.style.display = 'flex';
    if (legendHover) legendHover.style.display = 'none';
    if (legendReside) legendReside.style.display = 'none';
  }

  document.getElementById('panel-mode-hint').style.display = state.planResideActive ? 'flex' : 'none';
  updateInstructionText();
}

document.getElementById('btn-plan-reside').addEventListener('click', function () {
  state.planResideActive = !state.planResideActive;

  state.hoveredLayer = null;
  clearSelection({ clearPanelToo: true });
  updateModeUI();
  refreshAllStyles();
});

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${url}`);
  }
  return response.json();
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  el.classList.add('hidden');
  setTimeout(() => {
    el.style.display = 'none';
  }, 450);
}

async function init() {
  try {
    if (CONFIG.madridBuildingsPath) {
      try {
        const madridData = await loadJSON(CONFIG.madridBuildingsPath);
        madridLayer = L.geoJSON(madridData, {
          style: CONFIG.styles.madrid,
          interactive: false
        }).addTo(map);
      } catch (error) {
        console.warn('Madrid layer skipped:', error.message);
      }
    }

    const chamberiData = await loadJSON(CONFIG.chamberiBuildingsPath);

    chamberiLayer = L.geoJSON(chamberiData, {
      style: (feature) => getRestingStyle(feature),
      onEachFeature
    }).addTo(map);

    const bounds = chamberiLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    computeKPIs(chamberiData);
    updateModeUI();
    refreshAllStyles();
    hideLoading();
  } catch (error) {
    console.error('Error loading data:', error);
    document.querySelector('.loading-text').textContent =
      'Error al cargar los datos. Revisa la consola.';
  }
}

// Close mobile bottom sheet
closeBottomSheetBtn.addEventListener('click', () => {
  mobileBottomSheet.classList.remove('open');
  setTimeout(() => { mobileBottomSheet.style.display = 'none'; }, 350);
  clearSelection({ clearPanelToo: false });
});

map.on('click', () => {
  clearHoveredLayer();
  if (window.innerWidth <= 700 && mobileBottomSheet.classList.contains('open')) {
    mobileBottomSheet.classList.remove('open');
    setTimeout(() => { mobileBottomSheet.style.display = 'none'; }, 350);
  }
  clearSelection({ clearPanelToo: true });
  refreshAllStyles();
});

// Update clearSelection to also close mobile sheet
const originalClearSelection = clearSelection;
clearSelection = function (options = {}) {
  originalClearSelection(options);
  if (window.innerWidth <= 700) {
    mobileBottomSheet.classList.remove('open');
    setTimeout(() => { mobileBottomSheet.style.display = 'none'; }, 300);
  }
};

init();