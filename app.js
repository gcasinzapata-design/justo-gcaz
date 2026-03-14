const AUTH_USER = 'TamboID';
const AUTH_PASS = 'indrive.foodxjusto';

const state = {
  raw: null,
  isAuthenticated: localStorage.getItem('tambo_session') === 'ok',
  filters: {
    months: [],
    macroRegions: [],
    zones: [],
    areas: [],
    locals: [],
    deliveryTypes: [],
    distanceMin: null,
    distanceMax: null,
  },
  sort: { key: 'orders', dir: 'desc' },
  charts: {},
  map: null,
  mapLayers: {},
};

const $ = (id) => document.getElementById(id);
const number = (v, digits = 0) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: digits }).format(v || 0);
const money = (v) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(v || 0);
const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;
const km = (v) => v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(2)} km`;
const minutes = (v) => v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(1)} min`;
const escapeHtml = (str) => String(str ?? '').replace(/[&<>"]/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m]));
const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined && v !== ''))];
const average = (arr) => arr.length ? arr.reduce((a,b) => a + b, 0) / arr.length : 0;
const sum = (arr) => arr.reduce((a,b) => a + (Number(b) || 0), 0);
const median = (arr) => {
  const clean = arr.filter((v) => Number.isFinite(v)).sort((a,b) => a-b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
};
const numOrNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v))) ? null : Number(v);

function weightedAverage(items, valueKey, weightKey) {
  const rows = items.filter((r) => Number.isFinite(r[valueKey]) && (r[weightKey] || 0) > 0);
  const totalWeight = sum(rows.map((r) => r[weightKey]));
  if (!totalWeight) return null;
  return rows.reduce((acc, r) => acc + r[valueKey] * r[weightKey], 0) / totalWeight;
}

function statusByCycle(v) {
  if (!Number.isFinite(v)) return { label: 'Sin SLA', className: 'sla-na', color: '#98a2b3' };
  if (v <= 35) return { label: 'Saludable', className: 'sla-good', color: '#14b86a' };
  if (v <= 45) return { label: 'En observación', className: 'sla-warn', color: '#f5a524' };
  return { label: 'Crítico', className: 'sla-bad', color: '#ef4444' };
}

async function loadData() {
  const res = await fetch('data/app-data.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudo cargar la data del proyecto.');
  const raw = await res.text();
  const cleaned = raw
    .replace(/\bNaN\b/g, 'null')
    .replace(/\bInfinity\b/g, 'null')
    .replace(/\b-Infinity\b/g, 'null');
  return JSON.parse(cleaned);
}

function setAuthMessage(message, ok = true) {
  const node = $('authMessage');
  node.textContent = message;
  node.className = `auth-message ${ok ? 'good' : 'bad'}`;
}

async function login() {
  const user = $('usernameInput').value.trim();
  const pass = $('passwordInput').value;
  if (user !== AUTH_USER || pass !== AUTH_PASS) return setAuthMessage('Usuario o clave inválidos.', false);
  localStorage.setItem('tambo_session', 'ok');
  state.isAuthenticated = true;
  await boot();
}

function logout() {
  localStorage.removeItem('tambo_session');
  state.isAuthenticated = false;
  $('app').classList.add('hidden');
  $('authGate').classList.remove('hidden');
}

async function boot() {
  try {
    state.raw = await loadData();
    hydrateHero();
    initFilters();
    initControls();
    initMap();
    $('authGate').classList.add('hidden');
    $('app').classList.remove('hidden');
    render();
  } catch (err) {
    console.error(err);
    logout();
    setAuthMessage(err.message || 'No se pudo abrir la aplicación.', false);
  }
}

function hydrateHero() {
  const m = state.raw.meta || {};
  $('bubbleNetworkTotal').textContent = number(m.networkTotalLocals);
  $('bubbleNetworkActive').textContent = number(m.networkActiveLocalsObserved || m.networkActiveLocals2025);
  $('bubbleDelivery').textContent = number(m.deliveryEnabledLocals);
  $('bubblePickup').textContent = number(m.pickupEnabledLocals);
  $('simUsers').value = m.defaultUsersActive || 2500000;
  $('simExposure').value = m.defaultExposurePct || 30;
  $('simCtr').value = m.defaultCtrPct || 5;
  $('simConversion').value = m.defaultConversionPct || 5;
  $('simDeliveryMix').value = 70;
  $('simOrdersDriver').value = m.defaultOrdersPerDriverDay || 8;
  $('simDays').value = m.defaultWorkingDays || 30;
}

function initControls() {
  if (!window.__tamboControlsBound) {
    $('loginBtn').addEventListener('click', login);
    $('logoutBtn').addEventListener('click', logout);
    $('passwordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    $('usernameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
    $('distanceMin').addEventListener('input', () => { state.filters.distanceMin = numOrNull($('distanceMin').value); render(); });
    $('distanceMax').addEventListener('input', () => { state.filters.distanceMax = numOrNull($('distanceMax').value); render(); });
    $('resetFiltersBtn').addEventListener('click', resetFilters);
    ['simUsers','simExposure','simCtr','simConversion','simDeliveryMix','simOrdersDriver','simDays','simTarget'].forEach((id) => $(id).addEventListener('input', renderSimulator));
    ['toggleStores','toggleDemand','togglePriority','toggleNoCoverage'].forEach((id) => $(id).addEventListener('change', updateMapLayerVisibility));
    window.__tamboControlsBound = true;
  }
}

function resetFilters() {
  state.filters = { months: [], macroRegions: [], zones: [], areas: [], locals: [], deliveryTypes: [], distanceMin: null, distanceMax: null };
  $('distanceMin').value = '';
  $('distanceMax').value = '';
  initFilters();
  render();
}

function getFilterOptions() {
  const source = state.raw.localMonth || [];
  return {
    months: uniq(source.map((d) => d.month)).sort(),
    macroRegions: uniq(source.map((d) => d.macroRegion)).sort(),
    zones: uniq(source.map((d) => d.zone)).sort(),
    areas: uniq(source.map((d) => d.area)).sort(),
    locals: uniq(source.map((d) => d.localName)).sort((a,b) => a.localeCompare(b)),
    deliveryTypes: ['Delivery', 'Retiro'],
  };
}

function makeMultiFilter(key, title, items) {
  const selected = state.filters[key] || [];
  const meta = selected.length ? `${selected.length} seleccionadas` : 'Todas';
  return `
    <details class="multi-select" open>
      <summary>
        <span class="meta"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span>
        <span>▾</span>
      </summary>
      <div class="multi-options">
        <label><input type="checkbox" data-filter="${key}" value="__all__" ${selected.length === 0 ? 'checked' : ''}> Todas</label>
        ${items.map((item) => `<label><input type="checkbox" data-filter="${key}" value="${escapeHtml(item)}" ${selected.includes(item) ? 'checked' : ''}> ${escapeHtml(item)}</label>`).join('')}
      </div>
    </details>`;
}

function initFilters() {
  const o = getFilterOptions();
  $('filtersGrid').innerHTML = [
    makeMultiFilter('months', 'Mes-año', o.months),
    makeMultiFilter('macroRegions', 'Lima / Provincia', o.macroRegions),
    makeMultiFilter('deliveryTypes', 'Tipo de entrega', o.deliveryTypes),
    makeMultiFilter('zones', 'Zona', o.zones),
    makeMultiFilter('areas', 'Área', o.areas),
    makeMultiFilter('locals', 'Local', o.locals),
  ].join('');
  document.querySelectorAll('[data-filter]').forEach((node) => node.addEventListener('change', onFilterChange));
}

function onFilterChange(e) {
  const { filter: key } = e.target.dataset;
  const { value } = e.target;
  if (value === '__all__') {
    state.filters[key] = [];
    initFilters();
    render();
    return;
  }
  const set = new Set(state.filters[key] || []);
  if (e.target.checked) set.add(value); else set.delete(value);
  state.filters[key] = [...set];
  render();
}

function matchesMulti(record, values, key) {
  return !values.length || values.includes(record[key]);
}

function adjustedRow(row) {
  const selected = state.filters.deliveryTypes;
  const all = !selected.length || selected.length === 2;
  const delivery = selected.includes('Delivery');
  const pickup = selected.includes('Retiro');
  const deliveryOrders = Number(row.deliveryOrders) || 0;
  const pickupOrders = Number(row.pickupOrders) || 0;
  const avgTicket = Number(row.avgTicket) || ((Number(row.orders) || 0) ? (Number(row.gmv) || 0) / (Number(row.orders) || 1) : 0);

  if (all) {
    return {
      ...row,
      typeSelection: 'all',
      ordersAdj: Number(row.orders) || 0,
      gmvAdj: Number(row.gmv) || 0,
      projectOrdersAdj: Number(row.projectOrders) || 0,
      activeDriversAdj: Number(row.activeDrivers) || 0,
      hasDeliveryAdj: deliveryOrders > 0,
      hasPickupAdj: pickupOrders > 0,
      coverageAdj: row.coverageType,
      avgDistanceKmAdj: Number(row.avgDistance || 0) / 1000,
    };
  }

  if (delivery && !pickup) {
    return {
      ...row,
      typeSelection: 'delivery',
      ordersAdj: deliveryOrders,
      gmvAdj: deliveryOrders * avgTicket,
      projectOrdersAdj: Number(row.projectOrders) || 0,
      activeDriversAdj: Number(row.activeDrivers) || 0,
      hasDeliveryAdj: deliveryOrders > 0,
      hasPickupAdj: false,
      coverageAdj: 'Solo Delivery',
      avgDistanceKmAdj: Number(row.avgDistance || 0) / 1000,
    };
  }

  return {
    ...row,
    typeSelection: 'pickup',
    ordersAdj: pickupOrders,
    gmvAdj: pickupOrders * avgTicket,
    projectOrdersAdj: 0,
    activeDriversAdj: 0,
    hasDeliveryAdj: false,
    hasPickupAdj: pickupOrders > 0,
    coverageAdj: 'Solo Retiro',
    cycleP50: null,
    acceptP50: null,
    toStoreP50: null,
    waitP50: null,
    lastMileP50: null,
    avgDistanceKmAdj: 0,
  };
}

function filteredRows() {
  const f = state.filters;
  return (state.raw.localMonth || [])
    .filter((row) => matchesMulti(row, f.months, 'month')
      && matchesMulti(row, f.macroRegions, 'macroRegion')
      && matchesMulti(row, f.zones, 'zone')
      && matchesMulti(row, f.areas, 'area')
      && matchesMulti(row, f.locals, 'localName'))
    .map(adjustedRow)
    .filter((row) => row.ordersAdj > 0)
    .filter((row) => (f.distanceMin == null || row.avgDistanceKmAdj >= f.distanceMin)
      && (f.distanceMax == null || row.avgDistanceKmAdj <= f.distanceMax));
}

function aggregatePoints(rows) {
  const byLocal = new Map();
  rows.forEach((row) => {
    const point = (state.raw.localPoints || []).find((p) => p.localId === row.localId) || {};
    const key = row.localId;
    if (!byLocal.has(key)) {
      byLocal.set(key, {
        localId: row.localId,
        localName: row.localName,
        macroRegion: row.macroRegion,
        zone: row.zone,
        area: row.area,
        city: row.city,
        coverageType: row.coverageAdj,
        deliveryEnabled: row.hasDeliveryAdj,
        pickupEnabled: row.hasPickupAdj,
        lat: point.lat,
        lng: point.lng,
        orders: 0,
        gmv: 0,
        projectOrders: 0,
        drivers: 0,
        distances: [],
        cycles: [],
        accepts: [],
        toStore: [],
        waits: [],
        lastMiles: [],
      });
    }
    const bucket = byLocal.get(key);
    bucket.orders += row.ordersAdj;
    bucket.gmv += row.gmvAdj;
    bucket.projectOrders += row.projectOrdersAdj;
    bucket.drivers += row.activeDriversAdj;
    if (Number.isFinite(row.avgDistanceKmAdj) && row.avgDistanceKmAdj > 0) bucket.distances.push(row.avgDistanceKmAdj);
    ['cycleP50','acceptP50','toStoreP50','waitP50','lastMileP50'].forEach((field, idx) => {
      const map = ['cycles', 'accepts', 'toStore', 'waits', 'lastMiles'][idx];
      if (Number.isFinite(row[field])) bucket[map].push(row[field]);
    });
  });
  return [...byLocal.values()].map((p) => ({
    ...p,
    avgTicket: p.orders ? p.gmv / p.orders : 0,
    avgDistanceKm: average(p.distances),
    cycleP50: median(p.cycles),
    acceptP50: median(p.accepts),
    toStoreP50: median(p.toStore),
    waitP50: median(p.waits),
    lastMileP50: median(p.lastMiles),
    sla: statusByCycle(median(p.cycles)),
  }));
}

function summarize(rows, points) {
  const orders = sum(rows.map((r) => r.ordersAdj));
  const gmv = sum(rows.map((r) => r.gmvAdj));
  const deliveryOrders = sum(rows.map((r) => r.typeSelection === 'pickup' ? 0 : (Number(r.deliveryOrders) || 0)));
  const pickupOrders = sum(rows.map((r) => r.typeSelection === 'delivery' ? 0 : (Number(r.pickupOrders) || 0)));
  const projectOrders = sum(rows.map((r) => r.projectOrdersAdj));
  const completeRate = weightedAverage(rows.map((r) => ({ completeRate: Number(r.completeRate) || 0, weight: r.ordersAdj })), 'completeRate', 'weight') || 0;
  const projectCompleteRate = weightedAverage(rows.map((r) => ({ completeRate: Number(r.projectCompleteRate) || Number(r.completeRate) || 0, weight: r.projectOrdersAdj })), 'completeRate', 'weight') || 0;
  const monthMap = new Map();
  rows.forEach((r) => {
    const current = monthMap.get(r.month) || { orders: 0, gmv: 0, drivers: 0 };
    current.orders += r.ordersAdj;
    current.gmv += r.gmvAdj;
    current.drivers += r.activeDriversAdj;
    monthMap.set(r.month, current);
  });
  const monthly = [...monthMap.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  const uniqueMonths = monthly.length || 1;

  return {
    orders,
    gmv,
    avgTicket: orders ? gmv / orders : 0,
    completeRate,
    projectOrders,
    projectCompleteRate,
    deliveryOrders,
    pickupOrders,
    cycleP50: median(points.map((p) => p.cycleP50)),
    acceptP50: median(points.map((p) => p.acceptP50)),
    toStoreP50: median(points.map((p) => p.toStoreP50)),
    waitP50: median(points.map((p) => p.waitP50)),
    lastMileP50: median(points.map((p) => p.lastMileP50)),
    avgDistanceKm: weightedAverage(points.map((p) => ({ distance: p.avgDistanceKm, weight: p.orders })), 'distance', 'weight') || 0,
    activeDrivers: uniqueMonths ? sum(monthly.map((m) => m[1].drivers)) / uniqueMonths : 0,
    activeLocals: points.length,
    activeLocalsDelivery: points.filter((p) => p.deliveryEnabled).length,
    activeLocalsPickup: points.filter((p) => p.pickupEnabled).length,
    avgOrdersMonth: uniqueMonths ? orders / uniqueMonths : 0,
    avgGmvMonth: uniqueMonths ? gmv / uniqueMonths : 0,
    months: uniqueMonths,
    monthly,
  };
}

function grouped(rows, key) {
  const map = new Map();
  rows.forEach((r) => {
    const k = r[key] || 'Sin dato';
    const item = map.get(k) || { name: k, orders: 0, gmv: 0, projectOrders: 0, drivers: 0, locals: new Set(), cycle: [] };
    item.orders += r.ordersAdj;
    item.gmv += r.gmvAdj;
    item.projectOrders += r.projectOrdersAdj;
    item.drivers += r.activeDriversAdj;
    item.locals.add(r.localId);
    if (Number.isFinite(r.cycleP50)) item.cycle.push(r.cycleP50);
    map.set(k, item);
  });
  return [...map.values()].map((v) => ({ ...v, locals: v.locals.size, cycleP50: median(v.cycle) }));
}

function render() {
  const rows = filteredRows();
  const points = aggregatePoints(rows);
  const summary = summarize(rows, points);
  renderKpis(summary);
  renderHighlights(summary, rows, points);
  renderNarratives(summary, rows, points);
  renderCharts(summary, rows, points);
  renderMap(points, rows);
  renderTable(points);
  renderSimulator(rows, summary);
}

function renderKpis(summary) {
  const cards = [
    { label: 'Orders', value: number(summary.orders), sub: `${number(summary.avgOrdersMonth)} promedio mensual` },
    { label: 'GMV', value: money(summary.gmv), sub: `${money(summary.avgGmvMonth)} promedio mensual` },
    { label: 'Ticket promedio', value: money(summary.avgTicket), sub: `${pct(summary.deliveryOrders / Math.max(summary.orders, 1))} mix delivery` },
    { label: '% completados', value: pct(summary.completeRate), sub: `${pct(summary.projectCompleteRate)} completados en el módulo proyecto` },
    { label: 'Ciclo típico', value: minutes(summary.cycleP50), sub: 'P50 directo del ciclo total delivery' },
    { label: 'Distancia promedio', value: km(summary.avgDistanceKm), sub: 'Se recalcula con el filtro de distancia' },
    { label: 'Locales activos delivery', value: number(summary.activeLocalsDelivery), sub: `${number(summary.activeLocals)} locales activos totales` },
    { label: 'Drivers activos', value: number(summary.activeDrivers), sub: 'Promedio mensual observado' },
  ];
  $('kpiGrid').innerHTML = cards.map((card) => `
    <article class="kpi-card">
      <div class="label">${escapeHtml(card.label)}</div>
      <div class="value">${card.value}</div>
      <div class="sub">${escapeHtml(card.sub)}</div>
    </article>`).join('');
}

function renderHighlights(summary, rows, points) {
  const topZone = grouped(rows, 'zone').sort((a,b) => b.projectOrders - a.projectOrders)[0];
  const topArea = grouped(rows, 'area').sort((a,b) => b.orders - a.orders)[0];
  const topLocal = [...points].sort((a,b) => b.orders - a.orders)[0];
  const worstLocal = [...points].filter((p) => Number.isFinite(p.cycleP50)).sort((a,b) => b.cycleP50 - a.cycleP50)[0];
  const mixText = `${pct(summary.deliveryOrders / Math.max(summary.orders, 1))} delivery / ${pct(summary.pickupOrders / Math.max(summary.orders, 1))} retiro`;
  const highlights = [
    { title: 'Escala del filtro actual', text: `${number(summary.orders)} órdenes y ${money(summary.gmv)} de GMV, con ${number(summary.activeLocals)} locales activos en ${number(summary.months)} meses observados.` },
    { title: 'Mix de atención', text: `El negocio filtrado corre con un mix ${mixText}; cambia inmediatamente con el filtro de tipo de entrega.` },
    { title: 'Dónde está la mayor oportunidad', text: topZone ? `${topZone.name} lidera el módulo proyecto con ${number(topZone.projectOrders)} órdenes delivery y ${number(topZone.locals)} locales activos.` : 'No hay suficiente base delivery para estimar oportunidad.' },
    { title: 'Principal polo de volumen', text: topArea ? `${topArea.name} concentra ${number(topArea.orders)} órdenes, por lo que debería seguirse muy de cerca al abrir visibilidad.` : 'Sin datos suficientes.' },
    { title: 'Local ancla', text: topLocal ? `${topLocal.localName} es el local de mayor volumen con ${number(topLocal.orders)} órdenes y ticket de ${money(topLocal.avgTicket)}.` : 'Sin locales activos con el filtro actual.' },
    { title: 'Foco de riesgo', text: worstLocal ? `${worstLocal.localName} tiene el ciclo P50 más exigente en ${minutes(worstLocal.cycleP50)}.` : 'No hay datos de SLA para el filtro actual.' },
  ];
  $('highlightsGrid').innerHTML = highlights.map((h) => `<div class="highlight"><strong>${escapeHtml(h.title)}</strong><span>${escapeHtml(h.text)}</span></div>`).join('');
}

function renderNarratives(summary, rows, points) {
  const zones = grouped(rows, 'zone').sort((a,b) => (b.projectOrders + b.orders) - (a.projectOrders + a.orders));
  const riskPoints = [...points].filter((p) => p.deliveryEnabled && Number.isFinite(p.cycleP50)).sort((a,b) => b.cycleP50 - a.cycleP50).slice(0, 3);
  const bestPoints = [...points].filter((p) => p.deliveryEnabled && Number.isFinite(p.cycleP50)).sort((a,b) => a.cycleP50 - b.cycleP50).slice(0, 3);
  const topPriority = zones.slice(0, 3).map((z) => `${z.name}: ${number(z.projectOrders || z.orders)} órdenes y ${number(z.locals)} locales`).join('; ');

  $('overviewNarrative').innerHTML = `
    <p>La red total considerada es de <strong>${number(state.raw.meta.networkTotalLocals)}</strong> locales Tambo, mientras que el alcance actual muestra <strong>${number(summary.activeLocals)}</strong> locales con movimiento y <strong>${number(summary.activeLocalsDelivery)}</strong> con delivery activo dentro del filtro.</p>
    <p>El negocio corre a un ticket típico de <strong>${money(summary.avgTicket)}</strong>, con <strong>${pct(summary.completeRate)}</strong> de pedidos completados y un ciclo delivery típico de <strong>${minutes(summary.cycleP50)}</strong>.</p>
    <p>El mix filtrado se reparte en <strong>${pct(summary.deliveryOrders / Math.max(summary.orders, 1))}</strong> delivery y <strong>${pct(summary.pickupOrders / Math.max(summary.orders, 1))}</strong> retiro, lo que permite ver el proyecto como parte del e-commerce completo y no solo como operación de última milla.</p>`;

  $('opportunityNarrative').innerHTML = `
    <p>La oportunidad observada hoy combina el histórico e-commerce total con la capa delivery del proyecto. En el filtro actual hay <strong>${number(summary.projectOrders)}</strong> órdenes del módulo proyecto observadas frente a <strong>${number(summary.orders)}</strong> órdenes e-commerce totales.</p>
    <p>Las zonas más relevantes para abrir visibilidad son: <strong>${escapeHtml(topPriority || 'sin suficiente señal')}</strong>.</p>`;

  $('activationNarrative').innerHTML = `
    <p>Prioriza activación donde coinciden tres señales: volumen base alto, cantidad de locales activos y SLA manejable.</p>
    <ul>${zones.slice(0, 4).map((z, i) => `<li><strong>${i + 1}. ${escapeHtml(z.name)}</strong>: ${number(z.orders)} órdenes, ${number(z.locals)} locales y ${minutes(z.cycleP50)} de ciclo delivery típico.</li>`).join('')}</ul>`;

  $('riskNarrative').innerHTML = `
    <p>Antes de abrir más tráfico, protege los puntos con señales de saturación o tiempos altos.</p>
    <ul>${riskPoints.map((p) => `<li><strong>${escapeHtml(p.localName)}</strong>: ${minutes(p.cycleP50)} de ciclo y ${number(p.orders)} órdenes.</li>`).join('') || '<li>Sin riesgo operativo visible con el filtro actual.</li>'}</ul>
    <p>Los locales con mejor readiness hoy son ${bestPoints.map((p) => `<strong>${escapeHtml(p.localName)}</strong>`).join(', ') || 'los que mantengan ciclo por debajo de 35 min y volumen consistente'}.</p>`;

  $('coverageNarrative').innerHTML = `
    <p><span class="legend-dot" style="background:#14b86a"></span><strong>Verde</strong>: locales con SLA saludable.</p>
    <p><span class="legend-dot" style="background:#f5a524"></span><strong>Ámbar</strong>: locales en observación.</p>
    <p><span class="legend-dot" style="background:#ef4444"></span><strong>Rojo</strong>: locales críticos o sin delivery cuando se busca escalar última milla.</p>
    <p><span class="legend-dot" style="background:rgba(22,93,255,.45)"></span><strong>Azul</strong>: puntos de demanda potencial observada.</p>`;
}

function destroyChart(key) {
  if (state.charts[key]) state.charts[key].destroy();
}

function createChart(key, canvasId, config) {
  destroyChart(key);
  state.charts[key] = new Chart($(canvasId), config);
}

function renderCharts(summary, rows, points) {
  const monthly = summary.monthly;
  createChart('monthly', 'monthlyChart', {
    type: 'bar',
    data: {
      labels: monthly.map(([m]) => m),
      datasets: [
        { type: 'bar', label: 'Orders', data: monthly.map(([,v]) => v.orders), backgroundColor: 'rgba(22,93,255,.75)', borderRadius: 8, yAxisID: 'y' },
        { type: 'line', label: 'GMV', data: monthly.map(([,v]) => v.gmv), borderColor: '#d61f26', backgroundColor: '#d61f26', tension: .3, yAxisID: 'y1' },
      ],
    },
    options: baseChartOptions({ dualAxis: true }),
  });

  createChart('mix', 'mixChart', {
    type: 'doughnut',
    data: {
      labels: ['Delivery', 'Retiro'],
      datasets: [{ data: [summary.deliveryOrders, summary.pickupOrders], backgroundColor: ['rgba(22,93,255,.82)', 'rgba(152,193,29,.8)'], borderWidth: 0 }],
    },
    options: doughnutOptions(),
  });

  const coverageCounts = [
    points.filter((p) => p.deliveryEnabled && p.pickupEnabled).length,
    points.filter((p) => p.deliveryEnabled && !p.pickupEnabled).length,
    points.filter((p) => !p.deliveryEnabled && p.pickupEnabled).length,
  ];
  createChart('coverage', 'coverageChart', {
    type: 'bar',
    data: {
      labels: ['Delivery + Retiro', 'Solo Delivery', 'Solo Retiro'],
      datasets: [{ label: 'Locales', data: coverageCounts, backgroundColor: ['rgba(22,93,255,.82)', 'rgba(214,31,38,.82)', 'rgba(152,193,29,.82)'], borderRadius: 8 }],
    },
    options: baseChartOptions(),
  });

  const topAreas = grouped(rows, 'area').sort((a,b) => (b.projectOrders || b.orders) - (a.projectOrders || a.orders)).slice(0, 8);
  createChart('priority', 'priorityChart', {
    type: 'bar',
    data: {
      labels: topAreas.map((a) => trim(a.name, 20)),
      datasets: [{ label: 'Órdenes proyecto / proxy', data: topAreas.map((a) => a.projectOrders || a.orders), backgroundColor: 'rgba(22,93,255,.78)', borderRadius: 8 }],
    },
    options: baseChartOptions({ indexAxis: 'y' }),
  });

  createChart('cycle', 'cycleChart', {
    type: 'bar',
    data: {
      labels: ['Activación', 'Llegada tienda', 'Espera tienda', 'Última milla', 'Ciclo total'],
      datasets: [{ label: 'P50 (min)', data: [summary.acceptP50, summary.toStoreP50, summary.waitP50, summary.lastMileP50, summary.cycleP50], backgroundColor: ['rgba(22,93,255,.75)','rgba(22,93,255,.58)','rgba(152,193,29,.78)','rgba(214,31,38,.72)','rgba(16,28,54,.82)'], borderRadius: 8 }],
    },
    options: baseChartOptions(),
  });

  createChart('drivers', 'driversChart', {
    type: 'line',
    data: {
      labels: monthly.map(([m]) => m),
      datasets: [{ label: 'Drivers activos', data: monthly.map(([,v]) => v.drivers), borderColor: '#98c11d', backgroundColor: 'rgba(152,193,29,.2)', tension: .35, fill: true }],
    },
    options: baseChartOptions(),
  });

  const rank = [...points].sort((a,b) => b.orders - a.orders).slice(0, 10);
  createChart('localRank', 'localRankChart', {
    type: 'bar',
    data: {
      labels: rank.map((r) => trim(r.localName, 24)),
      datasets: [
        { label: 'Orders', data: rank.map((r) => r.orders), backgroundColor: 'rgba(22,93,255,.78)', borderRadius: 8 },
        { label: 'Ciclo P50', data: rank.map((r) => r.cycleP50 || 0), backgroundColor: 'rgba(214,31,38,.72)', borderRadius: 8 },
      ],
    },
    options: baseChartOptions(),
  });
}

function baseChartOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { mode: 'index', intersect: false } },
    interaction: { mode: 'index', intersect: false },
    scales: extra.dualAxis ? {
      y: { beginAtZero: true, grid: { color: 'rgba(15,23,40,.06)' } },
      y1: { beginAtZero: true, position: 'right', grid: { display: false } },
      x: { grid: { display: false } },
    } : {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: 'rgba(15,23,40,.06)' } },
    },
    ...extra,
  };
}

function doughnutOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } } },
  };
}

function trim(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function initMap() {
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  const mapNode = $('map');
  mapNode.innerHTML = '';
  state.map = L.map('map', { zoomControl: true }).setView([-12.05, -77.04], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);
  state.mapLayers = {
    stores: L.layerGroup().addTo(state.map),
    noCoverage: L.layerGroup().addTo(state.map),
    demand: L.layerGroup().addTo(state.map),
    priority: L.layerGroup().addTo(state.map),
  };
}

function clearMapLayers() {
  Object.values(state.mapLayers).forEach((layer) => layer && layer.clearLayers());
}

function renderMap(points, rows) {
  if (!state.map) return;
  clearMapLayers();
  const bounds = [];

  points.forEach((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    bounds.push([p.lat, p.lng]);
    const color = p.deliveryEnabled ? p.sla.color : '#ef4444';
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: Math.max(6, Math.min(18, 6 + Math.sqrt(p.orders || 0) / 4)),
      color,
      weight: p.deliveryEnabled ? 1.5 : 2.5,
      fillColor: color,
      fillOpacity: p.deliveryEnabled ? .58 : .08,
      dashArray: p.deliveryEnabled ? null : '5 5',
    }).bindPopup(`
      <strong>${escapeHtml(p.localName)}</strong><br>
      ${escapeHtml(p.area || '')} · ${escapeHtml(p.zone || '')}<br>
      Orders: <strong>${number(p.orders)}</strong><br>
      GMV: <strong>${money(p.gmv)}</strong><br>
      Ticket: <strong>${money(p.avgTicket)}</strong><br>
      SLA: <strong>${escapeHtml(p.sla.label)}</strong> ${p.cycleP50 ? `· ${minutes(p.cycleP50)}` : ''}
    `);
    (p.deliveryEnabled ? state.mapLayers.stores : state.mapLayers.noCoverage).addLayer(marker);
  });

  const areaScores = buildPriorityAreas(rows).slice(0, 12);
  areaScores.forEach((a) => {
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) return;
    bounds.push([a.lat, a.lng]);
    const circle = L.circle([a.lat, a.lng], {
      radius: 900 + (a.score * 18),
      color: '#165dff',
      weight: 1,
      fillColor: '#165dff',
      fillOpacity: .08,
    }).bindPopup(`<strong>${escapeHtml(a.area)}</strong><br>Score prioridad: <strong>${number(a.score, 1)}</strong><br>Órdenes: <strong>${number(a.orders)}</strong><br>Proyecto: <strong>${number(a.projectOrders)}</strong>`);
    state.mapLayers.priority.addLayer(circle);
  });

  const demand = buildDemandPoints(rows);
  demand.forEach((d) => {
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return;
    bounds.push([d.lat, d.lng]);
    const marker = L.circle([d.lat, d.lng], {
      radius: 500 + d.orders * 10,
      color: 'rgba(22,93,255,.18)',
      fillColor: '#165dff',
      fillOpacity: .08,
      weight: 0,
    }).bindPopup(`<strong>${escapeHtml(d.place)}</strong><br>Orders proxy: <strong>${number(d.orders)}</strong>`);
    state.mapLayers.demand.addLayer(marker);
  });

  updateMapLayerVisibility();
  if (bounds.length) state.map.fitBounds(bounds, { padding: [26, 26] });
  setTimeout(() => state.map.invalidateSize(), 100);
}

function buildPriorityAreas(rows) {
  const groupedArea = grouped(rows, 'area');
  const lookup = new Map((state.raw.areaPriority || []).map((a) => [a.area, a]));
  return groupedArea.map((g) => {
    const hint = lookup.get(g.name) || {};
    const cyclePenalty = Number.isFinite(g.cycleP50) ? Math.max(0, 50 - g.cycleP50) : 10;
    return {
      area: g.name,
      zone: g.zone,
      orders: g.orders,
      projectOrders: g.projectOrders,
      score: (g.projectOrders * 1.4) + (g.orders * 0.25) + (g.locals * 18) + cyclePenalty,
      lat: hint.lat,
      lng: hint.lng,
    };
  }).sort((a,b) => b.score - a.score);
}

function buildDemandPoints(rows) {
  const selectedMacro = state.filters.macroRegions;
  const points = (state.raw.demandPoints || []).filter((d) => !selectedMacro.length || selectedMacro.includes(d.place === 'Lima' ? 'Lima' : 'Provincia'));
  const totalOrders = sum(rows.map((r) => r.ordersAdj));
  const base = sum((state.raw.demandPoints || []).map((d) => d.orders)) || 1;
  return points.map((p) => ({ ...p, orders: (p.orders / base) * totalOrders * 0.45 })).filter((p) => p.orders > 0);
}

function updateMapLayerVisibility() {
  if (!state.mapLayers.stores) return;
  const toggles = {
    stores: $('toggleStores').checked,
    demand: $('toggleDemand').checked,
    priority: $('togglePriority').checked,
    noCoverage: $('toggleNoCoverage').checked,
  };
  Object.entries(toggles).forEach(([key, visible]) => {
    const layer = state.mapLayers[key];
    if (!layer) return;
    if (visible && !state.map.hasLayer(layer)) state.map.addLayer(layer);
    if (!visible && state.map.hasLayer(layer)) state.map.removeLayer(layer);
  });
}

function renderTable(points) {
  const columns = [
    ['localName', 'Local'],
    ['area', 'Área'],
    ['zone', 'Zona'],
    ['coverageType', 'Cobertura'],
    ['orders', 'Orders'],
    ['gmv', 'GMV'],
    ['avgTicket', 'Ticket'],
    ['avgDistanceKm', 'Distancia'],
    ['cycleP50', 'Ciclo P50'],
    ['drivers', 'Drivers'],
    ['sla', 'SLA'],
  ];
  $('localTable').querySelector('thead').innerHTML = `<tr>${columns.map(([key, label]) => `<th data-sort="${key}">${label}</th>`).join('')}</tr>`;
  const sorted = [...points].sort((a,b) => compareRows(a,b,state.sort.key,state.sort.dir));
  $('localTable').querySelector('tbody').innerHTML = sorted.map((p) => `
    <tr>
      <td>${escapeHtml(p.localName)}</td>
      <td>${escapeHtml(p.area || '—')}</td>
      <td>${escapeHtml(p.zone || '—')}</td>
      <td>${escapeHtml(p.coverageType || '—')}</td>
      <td>${number(p.orders)}</td>
      <td>${money(p.gmv)}</td>
      <td>${money(p.avgTicket)}</td>
      <td>${km(p.avgDistanceKm)}</td>
      <td>${minutes(p.cycleP50)}</td>
      <td>${number(p.drivers)}</td>
      <td><span class="sla-pill ${p.sla.className}">${escapeHtml(p.sla.label)}</span></td>
    </tr>`).join('');
  $('localTable').querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort.key = key; state.sort.dir = 'desc'; }
      renderTable(points);
    });
  });
}

function compareRows(a,b,key,dir) {
  const av = key === 'sla' ? a.sla.label : a[key];
  const bv = key === 'sla' ? b.sla.label : b[key];
  const factor = dir === 'asc' ? 1 : -1;
  if (typeof av === 'string') return av.localeCompare(String(bv)) * factor;
  return ((Number(av) || 0) - (Number(bv) || 0)) * factor;
}

function renderSimulator(rows, summary) {
  const users = Number($('simUsers').value) || 0;
  const exposurePct = (Number($('simExposure').value) || 0) / 100;
  const ctrPct = (Number($('simCtr').value) || 0) / 100;
  const conversionPct = (Number($('simConversion').value) || 0) / 100;
  const deliveryMixPct = (Number($('simDeliveryMix').value) || 0) / 100;
  const ordersDriver = Number($('simOrdersDriver').value) || 1;
  const days = Number($('simDays').value) || 30;
  const target = Number($('simTarget').value) || 7500;

  const projectedOrders = users * exposurePct * ctrPct * conversionPct;
  const projectedDelivery = projectedOrders * deliveryMixPct;
  const projectedPickup = projectedOrders - projectedDelivery;
  const requiredDrivers = projectedDelivery / Math.max(ordersDriver * days, 1);
  const requiredExposureForTarget = target / Math.max(users * ctrPct * conversionPct, 1);
  const requiredUsersAtCurrentExposure = target / Math.max(exposurePct * ctrPct * conversionPct, 1);
  const targetDrivers = (target * deliveryMixPct) / Math.max(ordersDriver * days, 1);

  $('simulatorOutput').innerHTML = `
    Con la configuración actual, el proyecto movería aproximadamente <strong>${number(projectedOrders)}</strong> órdenes al mes, de las cuales <strong>${number(projectedDelivery)}</strong> serían delivery y <strong>${number(projectedPickup)}</strong> retiro.<br><br>
    Para ese escenario necesitarías alrededor de <strong>${number(requiredDrivers, 1)}</strong> drivers activos promedio.<br><br>
    Para llegar a la meta de <strong>${number(target)}</strong> órdenes mensuales, manteniendo igual CTR y conversión, tendrías que exponer Tambo a <strong>${(requiredExposureForTarget * 100).toFixed(1)}%</strong> de la base activa o trabajar sobre una audiencia equivalente de <strong>${number(requiredUsersAtCurrentExposure)}</strong> usuarios expuestos al mismo rendimiento.`;

  const scenarios = [30, 50, 100].map((x) => {
    const orders = users * (x / 100) * ctrPct * conversionPct;
    const delivery = orders * deliveryMixPct;
    return { exposure: x, orders, drivers: delivery / Math.max(ordersDriver * days, 1) };
  });
  $('staffingCards').innerHTML = scenarios.map((s) => `
    <div class="staff-card">
      <span>${s.exposure}% de exposición</span>
      <strong>${number(s.orders)}</strong>
      <small>${number(s.drivers, 1)} drivers activos promedio requeridos para absorber el mix delivery configurado.</small>
    </div>`).join('');
}

window.addEventListener('DOMContentLoaded', async () => {
  initControls();
  if (state.isAuthenticated) await boot();
});
