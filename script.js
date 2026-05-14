'use strict';

const CONFIG = {
  center: [40.4377, -3.7003],
  initialZoom: 15,
  minZoom: 14,
  maxZoom: 19,
  maxBounds: [[40.415, -3.730], [40.460, -3.670]],

  chamberiBuildingsPath: 'data/chamberi_buildings.geojson',
  madridBuildingsPath: null,

  planResideFilter: (props) =>
    Number(props.numberOfBuildingUnits) === 1 && props.currentUse === '1_residential',

  tileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; CARTO &copy; OpenStreetMap',

  styles: {
    madrid: { weight: 0.5, color: '#d5dbe3', fillColor: '#edf1f5', fillOpacity: 0.5 },

    chamberiResidential: { weight: 0.7, color: '#6f8fb5', fillColor: '#a7bdd8', fillOpacity: 0.65 },
    chamberiDefault: { weight: 0.6, color: '#9caabb', fillColor: '#d5dde6', fillOpacity: 0.58 },

    hover: { weight: 2, color: '#111827', fillColor: '#4a90d9', fillOpacity: 0.95 },

    reside: { weight: 1.6, color: '#b71c1c', fillColor: '#e53935', fillOpacity: 0.9 },
    hoverReside: { weight: 2.3, color: '#7f0000', fillColor: '#ff6659', fillOpacity: 0.98 },
    selectedReside: { weight: 2.6, color: '#7f0000', fillColor: '#e53935', fillOpacity: 1 },
    resideMuted: { weight: 0.45, color: '#d6dce3', fillColor: '#edf1f4', fillOpacity: 0.42 },

    selectedNormal: { weight: 2.4, color: '#111827', fillColor: '#4a90d9', fillOpacity: 0.95 },

    affected0: { weight: 0.22, color: '#D0D0D0', fillColor: '#EFEFEF', fillOpacity: 0.42 },
    affected1: { weight: 0.75, color: '#2B2B2B', fillColor: '#F6E58D', fillOpacity: 0.82 },
    affected2: { weight: 0.85, color: '#2B2B2B', fillColor: '#FFBE76', fillOpacity: 0.9 },
    affected3: { weight: 1.0, color: '#2B2B2B', fillColor: '#F0932B', fillOpacity: 0.95 },
    affected4: { weight: 1.15, color: '#2B2B2B', fillColor: '#EB4D4B', fillOpacity: 0.97 },
    affected5: { weight: 1.35, color: '#111111', fillColor: '#B71540', fillOpacity: 1 },
    affected6: { weight: 1.45, color: '#111111', fillColor: '#1E272E', fillOpacity: 1 },

    selectedAffected: { weight: 3.2, color: '#000000', fillOpacity: 1 }
  }
};

const state = {
  planResideActive: false,
  affectedModeActive: false,
  selectedLayer: null,
  selectedFeature: null,
  hoveredLayer: null,
  totalBuildings: 0,
  planResideBuildings: 0,
  expulsionBuildings: 0
};

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

function valueOrDash(value) {
  return value === undefined || value === null || value === '' ? '—' : value;
}

function labelUse(raw) {
  return raw ? (USE_LABELS[raw] || raw) : '—';
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

function getConstructionYear(props = {}) {
  const keys = [
    'beginning',
    'constructionYear',
    'yearOfConstruction',
    'builtYear',
    'fechaConstruccion',
    'anyoConstruccion',
    'anioConstruccion'
  ];

  for (const key of keys) {
    const value = props[key];
    if (value === undefined || value === null || value === '') continue;

    if (typeof value === 'number' && value > 0) return String(Math.trunc(value));

    const match = String(value).match(/\b(18|19|20)\d{2}\b/);
    if (match) return match[0];
  }

  return '—';
}

function getHeaderMeta(props = {}) {
  const parts = [];
  const year = getConstructionYear(props);
  const area = formatAreaShort(props.value, props.value_uom);

  if (year && year !== '—') parts.push(`Año ${year}`);
  if (area) parts.push(area);
  if (props.currentUse) parts.push(labelUse(props.currentUse));

  return parts.length ? parts.join(' · ') : 'Información catastral disponible';
}

function getReference(props = {}) {
  return props.reference || props.localId || props.gml_id || '—';
}

function getAddress(props = {}) {
  return props.direccion_original || props.direccion_busqueda || props.DIRECCIÓN || props.direccion || props.address || '—';
}

function isPlanResideAffected(featureOrProps) {
  const props = featureOrProps && featureOrProps.properties ? featureOrProps.properties : featureOrProps;
  return CONFIG.planResideFilter(props || {});
}

function isExpulsionAffected(featureOrProps) {
  const props = featureOrProps && featureOrProps.properties ? featureOrProps.properties : featureOrProps;
  return Number(props?.intensidad || 0) > 0;
}

function getAffectedStyle(props = {}) {
  const i = Number(props.intensidad || 0);

  if (i === 1) return CONFIG.styles.affected1;
  if (i === 2) return CONFIG.styles.affected2;
  if (i === 3) return CONFIG.styles.affected3;
  if (i === 4) return CONFIG.styles.affected4;
  if (i === 5) return CONFIG.styles.affected5;
  if (i >= 6) return CONFIG.styles.affected6;

  return CONFIG.styles.affected0;
}

function getSelectedAffectedStyle(props = {}) {
  return {
    ...getAffectedStyle(props),
    weight: CONFIG.styles.selectedAffected.weight,
    color: CONFIG.styles.selectedAffected.color,
    fillOpacity: CONFIG.styles.selectedAffected.fillOpacity
  };
}

function getRestingStyle(feature) {
  const props = feature.properties || {};
  const isSelected = state.selectedLayer && state.selectedLayer.feature === feature;

  if (isSelected) {
    if (state.affectedModeActive) return getSelectedAffectedStyle(props);
    if (state.planResideActive) return CONFIG.styles.selectedReside;
    return CONFIG.styles.selectedNormal;
  }

  if (state.affectedModeActive) {
    return getAffectedStyle(props);
  }

  if (state.planResideActive) {
    return isPlanResideAffected(props) ? CONFIG.styles.reside : CONFIG.styles.resideMuted;
  }

  return props.currentUse === '1_residential'
    ? CONFIG.styles.chamberiResidential
    : CONFIG.styles.chamberiDefault;
}

function applyRestingStyle(layer) {
  if (!layer || !layer.feature) return;
  layer.setStyle(getRestingStyle(layer.feature));
}

function refreshAllStyles() {
  if (!chamberiLayer) return;

  chamberiLayer.eachLayer((layer) => {
    applyRestingStyle(layer);

    const props = layer.feature.properties || {};
    const blocked = state.planResideActive && !isPlanResideAffected(props);

    if (layer._path) {
      layer._path.style.cursor = blocked ? 'not-allowed' : 'pointer';
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
  }, 2600);
}

function updateInstructionText() {
  const mapText = document.getElementById('map-instructions-text');
  const emptySub = document.getElementById('empty-sub');

  if (state.affectedModeActive) {
    mapText.textContent = 'Haz clic en un edificio para ver su estado de transformación';
    emptySub.textContent = 'Haz clic en un edificio para ver su estado de transformación';
  } else if (state.planResideActive) {
    mapText.textContent = 'Haz clic en un edificio afectado por Plan Reside';
    emptySub.textContent = 'Haz clic en un edificio afectado por Plan Reside';
  } else {
    mapText.textContent = 'Haz clic en un edificio para ver sus detalles';
    emptySub.textContent = 'Haz clic sobre cualquier edificio en el mapa para ver su información';
  }
}

function updateKPIs() {
  const usingAffectedMode = state.affectedModeActive;

  const affectedValue = usingAffectedMode
    ? state.expulsionBuildings
    : state.planResideBuildings;

  const pct = state.totalBuildings > 0
    ? ((affectedValue / state.totalBuildings) * 100).toFixed(1)
    : '0.0';

  const label = usingAffectedMode
    ? 'Edificios afectados'
    : 'Afectados Plan Reside';

  document.getElementById('kpi-total').textContent = state.totalBuildings.toLocaleString('es-ES');
  document.getElementById('kpi-affected').textContent = affectedValue.toLocaleString('es-ES');
 
  document.getElementById('kpi-affected-label').textContent = label;

  const totalM = document.getElementById('kpi-total-mobile');
  const affectedM = document.getElementById('kpi-affected-mobile');
  const labelM = document.getElementById('kpi-affected-label-mobile');

  if (totalM) totalM.textContent = state.totalBuildings.toLocaleString('es-ES');
  if (affectedM) affectedM.textContent = affectedValue.toLocaleString('es-ES');
  if (labelM) labelM.textContent = label;
}

function computeKPIs(data) {
  let total = 0;
  let planReside = 0;
  let expulsion = 0;

  data.features.forEach((feature) => {
    total += 1;
    if (isPlanResideAffected(feature)) planReside += 1;
    if (isExpulsionAffected(feature)) expulsion += 1;
  });

  state.totalBuildings = total;
  state.planResideBuildings = planReside;
  state.expulsionBuildings = expulsion;

  updateKPIs();
}

function updatePanel(feature) {
  const props = feature.properties || {};
  const reference = getReference(props);
  const infoUrl = props.informationSystem || props.url || null;

  document.getElementById('panel-empty').style.display = 'none';
  document.getElementById('building-detail').style.display = 'flex';

  let subtitle = 'Ficha del edificio';
  if (state.planResideActive && isPlanResideAffected(props)) subtitle = 'Ficha del edificio · Plan Reside';
  if (state.affectedModeActive) subtitle = 'Ficha del edificio · Edificios afectados';

  document.getElementById('detail-ref').textContent = getAddress(props) !== '—' ? getAddress(props) : reference;
  document.getElementById('detail-subtitle').textContent = subtitle;
  document.getElementById('detail-meta').textContent = getHeaderMeta(props);

  document.getElementById('prop-address').textContent = getAddress(props);
  document.getElementById('prop-reference').textContent = reference;
  document.getElementById('prop-use').textContent = labelUse(props.currentUse);
  document.getElementById('prop-year').textContent = getConstructionYear(props);
  document.getElementById('prop-dwellings').textContent = valueOrDash(props.numberOfDwellings);
  document.getElementById('prop-area').textContent = formatArea(props.value, props.value_uom);
  document.getElementById('prop-process').textContent = valueOrDash(props.estado_proceso);
  document.getElementById('prop-transformation').textContent = valueOrDash(props.tipo_transformacion);
  document.getElementById('prop-notes').textContent = valueOrDash(props.NOTAS);
  document.getElementById('prop-owners').textContent = valueOrDash(props.PROPIETARIOS);

  const linkEl = document.getElementById('detail-link');
  linkEl.style.display = infoUrl ? 'inline-flex' : 'none';
  if (infoUrl) linkEl.href = infoUrl;

  const img = document.getElementById('facade-img');
  const placeholder = document.getElementById('facade-placeholder');

  img.classList.remove('loaded');
  placeholder.style.display = 'flex';

  if (props.documentLink) {
    img.onload = () => {
      img.classList.add('loaded');
      placeholder.style.display = 'none';
    };
    img.onerror = () => {
      placeholder.style.display = 'flex';
    };
    img.src = props.documentLink;
  } else {
    img.src = '';
  }

  const badge = document.getElementById('reside-badge');

  if (state.affectedModeActive && isExpulsionAffected(props)) {
    badge.style.display = 'flex';
    badge.innerHTML = `<span class="reside-badge-dot"></span>${props.categoria_indice || 'Edificio afectado'}`;
  } else if (isPlanResideAffected(props)) {
    badge.style.display = 'flex';
    badge.innerHTML = `<span class="reside-badge-dot"></span>Afectado por Plan Reside`;
  } else {
    badge.style.display = 'none';
  }

  if (window.innerWidth <= 700) {
    const affectedInfo = state.affectedModeActive && isExpulsionAffected(props)
      ? `<div class="mobile-badge">${props.categoria_indice || 'Edificio afectado'}</div>`
      : '';

    mobileDetailContent.innerHTML = `
      <div class="mobile-detail-card">
        <div class="detail-ref">${getAddress(props) !== '—' ? getAddress(props) : reference}</div>
        <div class="detail-subtitle">${subtitle}</div>
        <div class="detail-meta">${getHeaderMeta(props)}</div>
        ${affectedInfo}
        <div class="mobile-props">
          <div><strong>Estado:</strong> ${valueOrDash(props.estado_proceso)}</div>
          <div><strong>Tipo:</strong> ${valueOrDash(props.tipo_transformacion)}</div>
          <div><strong>Notas:</strong> ${valueOrDash(props.NOTAS)}</div>
        </div>
      </div>
    `;

    mobileBottomSheet.classList.add('open');
    mobileBottomSheet.style.display = 'block';
  }
}

function clearPanel() {
  document.getElementById('panel-empty').style.display = 'flex';
  document.getElementById('building-detail').style.display = 'none';
}

function clearSelection({ clearPanelToo = true } = {}) {
  if (state.selectedLayer) {
    applyRestingStyle(state.selectedLayer);
  }

  state.selectedLayer = null;
  state.selectedFeature = null;

  if (clearPanelToo) clearPanel();

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

  map.flyToBounds(bounds, {
    padding: [50, 50],
    maxZoom: Math.min(17, map.getBoundsZoom(bounds)),
    duration: 0.45
  });
}

function clearHoveredLayer() {
  if (!state.hoveredLayer) return;

  const hovered = state.hoveredLayer;
  state.hoveredLayer = null;
  applyRestingStyle(hovered);
}
function selectLayer(layer) {
  if (chamberiLayer) {
    chamberiLayer.eachLayer((l) => {
      if (l !== layer) {
        l.setStyle(getRestingStyle(l.feature));
      }
    });
  }

  state.selectedLayer = layer;
  state.selectedFeature = layer.feature;

  const props = layer.feature.properties || {};

  if (state.affectedModeActive) {
    layer.setStyle({
      ...getAffectedStyle(props),
      weight: 3,
      color: '#000000',
      fillOpacity: 1
    });
  } else if (state.planResideActive) {
    layer.setStyle(CONFIG.styles.selectedReside);
  } else {
    layer.setStyle(CONFIG.styles.selectedNormal);
  }

  layer.bringToFront();
  updatePanel(layer.feature);
}


function onEachFeature(feature, layer) {
  const props = feature.properties || {};

  layer.on({
    mouseover() {
      if (layer._path) {
        if (state.planResideActive && !isPlanResideAffected(props)) {
          layer._path.style.cursor = 'not-allowed';
        } else {
          layer._path.style.cursor = 'pointer';
        }
      }
    },

    mouseout() {
      applyRestingStyle(layer);
    },

    click(e) {
      L.DomEvent.stopPropagation(e);

      if (state.planResideActive && !isPlanResideAffected(props)) {
        showToast('En modo Plan Reside solo puedes seleccionar edificios afectados');
        return;
      }

      zoomToBuilding(layer);
      selectLayer(layer);
    }
  });

  layer.on('add', () => {
    if (!layer._path) return;

    if (state.planResideActive && !isPlanResideAffected(props)) {
      layer._path.style.cursor = 'not-allowed';
    } else {
      layer._path.style.cursor = 'pointer';
    }
  });
}

function updateModeUI() {
  document.body.classList.toggle('plan-reside-active', state.planResideActive);
  document.body.classList.toggle('affected-mode-active', state.affectedModeActive);
  const mobilePlan = document.getElementById('mobile-plan-reside-legend');
  const btnPlan = document.getElementById('btn-plan-reside');
  const btnAfectados = document.getElementById('btn-afectados');

  if (btnPlan) btnPlan.setAttribute('aria-pressed', String(state.planResideActive));
  if (btnAfectados) btnAfectados.setAttribute('aria-pressed', String(state.affectedModeActive));

  const legendDefault = document.getElementById('legend-default');
  const legendPlan = document.getElementById('legend-plan-reside');
  const legendAfectados = document.getElementById('legend-afectados');

  const mobileDefault = document.getElementById('mobile-default-legend');
  const mobileAffected = document.getElementById('mobile-affected-legend');

  if (state.affectedModeActive) {
	  if (mobileDefault) mobileDefault.style.display = 'none';
	  if (mobileAffected) mobileAffected.style.display = 'flex';
	  if (mobilePlan) mobilePlan.style.display = 'none';
	} else if (state.planResideActive) {
	  if (mobileDefault) mobileDefault.style.display = 'none';
	  if (mobileAffected) mobileAffected.style.display = 'none';
	  if (mobilePlan) mobilePlan.style.display = 'flex';
	} else {
	  if (mobileDefault) mobileDefault.style.display = 'flex';
	  if (mobileAffected) mobileAffected.style.display = 'none';
	  if (mobilePlan) mobilePlan.style.display = 'none';
	}

  document.getElementById('panel-mode-hint').style.display =
    state.planResideActive ? 'flex' : 'none';

  updateInstructionText();
  updateKPIs();
}

document.getElementById('btn-plan-reside').addEventListener('click', function () {
  state.planResideActive = !state.planResideActive;

  if (state.planResideActive) state.affectedModeActive = false;

  state.hoveredLayer = null;
  clearSelection({ clearPanelToo: true });
  updateModeUI();
  refreshAllStyles();
});

document.getElementById('btn-afectados').addEventListener('click', function () {
  state.affectedModeActive = !state.affectedModeActive;

  if (state.affectedModeActive) state.planResideActive = false;

  state.hoveredLayer = null;
  clearSelection({ clearPanelToo: true });
  updateModeUI();
  refreshAllStyles();
});

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);
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

closeBottomSheetBtn.addEventListener('click', () => {
  mobileBottomSheet.classList.remove('open');

  setTimeout(() => {
    mobileBottomSheet.style.display = 'none';
  }, 350);

  clearSelection({ clearPanelToo: false });
});

map.on('click', () => {
  clearHoveredLayer();

  if (window.innerWidth <= 700 && mobileBottomSheet.classList.contains('open')) {
    mobileBottomSheet.classList.remove('open');

    setTimeout(() => {
      mobileBottomSheet.style.display = 'none';
    }, 350);
  }

  clearSelection({ clearPanelToo: true });
  refreshAllStyles();
});

init();