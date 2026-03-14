const state = {
  raw: null,
  token: localStorage.getItem('tambo_session') || '',
  challenge: sessionStorage.getItem('tambo_challenge') || '',
  email: sessionStorage.getItem('tambo_email') || '',
  filters: { months: [], macroRegions: [], zones: [], areas: [], locals: [], distanceMin: null, distanceMax: null },
  sort: { key: 'orders', dir: 'desc' },
  charts: {},
  map: null,
  mapLayers: { stores: null, priority: null, demand: null }
};

const el = id => document.getElementById(id);
const money = v => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',maximumFractionDigits:0}).format(v || 0);
const number = v => new Intl.NumberFormat('es-PE',{maximumFractionDigits:0}).format(v || 0);
const pct = v => `${((v || 0) * 100).toFixed(1)}%`;
const minFmt = v => v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(1)} min`;
const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
const median = arr => { if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; };

const allowedDomains = ['getjusto.com','indriver.com','lindcorp.pe'];
function validDomain(email=''){ return allowedDomains.includes((email.split('@')[1] || '').toLowerCase()); }

async function api(path, options={}) {
  const headers = options.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Error inesperado');
  return data;
}

async function requestOtp() {
  const email = el('emailInput').value.trim().toLowerCase();
  if(!validDomain(email)) return setAuthMsg('Usa un correo permitido de Justo, inDrive o Lindcorp.', false);
  setAuthMsg('Enviando código…', true);
  const data = await api('/.netlify/functions/request-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
  state.challenge = data.challenge; state.email = email;
  sessionStorage.setItem('tambo_challenge', data.challenge); sessionStorage.setItem('tambo_email', email);
  el('otpBox').classList.remove('hidden');
  setAuthMsg('Código enviado. Revisa tu correo corporativo.', true);
}

async function verifyOtp() {
  const code = el('otpInput').value.trim();
  if(!state.challenge || !state.email) return setAuthMsg('Primero solicita el código.', false);
  const data = await api('/.netlify/functions/verify-otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: state.email, code, challenge: state.challenge }) });
  state.token = data.token;
  localStorage.setItem('tambo_session', data.token);
  await loadApp();
}

function setAuthMsg(msg, ok=true){ const m=el('authMessage'); m.textContent=msg; m.className=`auth-message ${ok?'good':'bad'}`; }

async function loadApp(){
  try {
    const payload = await api('/.netlify/functions/app-data');
    state.raw = payload;
    el('authGate').classList.add('hidden'); el('app').classList.remove('hidden');
    initFilters(); hydrateHero(); initMap(); render();
  } catch(err) {
    localStorage.removeItem('tambo_session');
    state.token='';
    el('authGate').classList.remove('hidden'); el('app').classList.add('hidden');
    setAuthMsg(err.message || 'No se pudo validar la sesión.', false);
  }
}

function hydrateHero(){
  const m=state.raw.meta;
  el('bubbleTotalLocals').textContent = number(m.networkTotalLocals);
  el('bubbleActiveLocals').textContent = number(m.networkActiveLocalsObserved);
  el('bubbleDelivery').textContent = number(m.deliveryEnabledLocals);
  el('bubblePickup').textContent = number(m.pickupEnabledLocals);
  el('simUsers').value = m.defaultUsersActive;
  el('simExposure').value = m.defaultExposurePct;
  el('simCtr').value = m.defaultCtrPct;
  el('simConversion').value = m.defaultConversionPct;
  el('simOrdersDriver').value = m.defaultOrdersPerDriverDay;
  el('simDays').value = m.defaultWorkingDays;
}

function getFilterOptions(){
  const recs = state.raw.localMonth;
  const uniq = (arr)=>[...new Set(arr.filter(Boolean))].sort((a,b)=> String(a).localeCompare(String(b)));
  return {
    months: uniq(recs.map(d=>d.month)),
    macroRegions: uniq(recs.map(d=>d.macroRegion)),
    zones: uniq(recs.map(d=>d.zone)),
    areas: uniq(recs.map(d=>d.area)),
    locals: uniq(recs.map(d=> d.localName))
  };
}

function makeMultiFilter({key,title,items}){
  const selected = state.filters[key] || [];
  const tag = selected.length ? `${selected.length} elegidas` : 'Todas';
  return `<details class="filter-card"><summary>${title}<span>${tag}</span></summary><div class="filter-options">
    <label><input type="checkbox" data-filter="${key}" value="__all__" ${selected.length===0?'checked':''}> Todas</label>
    ${items.map(item=>`<label><input type="checkbox" data-filter="${key}" value="${escapeHtml(item)}" ${selected.includes(item)?'checked':''}> ${escapeHtml(item)}</label>`).join('')}
  </div></details>`;
}

function initFilters(){
  const opt = getFilterOptions();
  el('filtersGrid').innerHTML = [
    makeMultiFilter({key:'months',title:'Mes-año',items:opt.months}),
    makeMultiFilter({key:'macroRegions',title:'Lima / Provincia',items:opt.macroRegions}),
    makeMultiFilter({key:'zones',title:'Zona',items:opt.zones}),
    makeMultiFilter({key:'areas',title:'Área',items:opt.areas}),
    makeMultiFilter({key:'locals',title:'Local',items:opt.locals})
  ].join('');

  document.querySelectorAll('[data-filter]').forEach(input=>input.addEventListener('change', onFilterChange));
  el('distanceMin').addEventListener('input', ()=>{ state.filters.distanceMin = numOrNull(el('distanceMin').value); render(); });
  el('distanceMax').addEventListener('input', ()=>{ state.filters.distanceMax = numOrNull(el('distanceMax').value); render(); });
  el('resetFiltersBtn').addEventListener('click', ()=>{ state.filters = { months:[], macroRegions:[], zones:[], areas:[], locals:[], distanceMin:null, distanceMax:null }; el('distanceMin').value=''; el('distanceMax').value=''; initFilters(); render(); });
  ['simUsers','simExposure','simCtr','simConversion','simDeliveryMix','simOrdersDriver','simDays','simTarget'].forEach(id=>el(id).addEventListener('input', renderSimulator));
}

function onFilterChange(e){
  const key = e.target.dataset.filter; const value = e.target.value;
  if(value === '__all__'){ state.filters[key] = []; initFilters(); render(); return; }
  const set = new Set(state.filters[key] || []);
  e.target.checked ? set.add(value) : set.delete(value);
  state.filters[key] = [...set];
  const allBox = [...document.querySelectorAll(`[data-filter="${key}"]`)].find(x=>x.value==='__all__');
  if(allBox) allBox.checked = state.filters[key].length===0;
  render();
}

function numOrNull(v){ const n=Number(v); return Number.isFinite(n)&&String(v)!=='' ? n : null; }
function matchesFilter(record, arr, key){ return !arr.length || arr.includes(record[key]); }
function filteredRecords(){
  const f=state.filters;
  return state.raw.localMonth.filter(r =>
    matchesFilter(r, f.months, 'month') &&
    matchesFilter(r, f.macroRegions, 'macroRegion') &&
    matchesFilter(r, f.zones, 'zone') &&
    matchesFilter(r, f.areas, 'area') &&
    matchesFilter(r, f.locals, 'localName') &&
    (f.distanceMin==null || (r.avgDistance || 0) >= f.distanceMin) &&
    (f.distanceMax==null || (r.avgDistance || 0) <= f.distanceMax)
  );
}
function filteredPoints(){
  const ids = new Set(filteredRecords().map(d=>d.localId));
  const f=state.filters;
  return state.raw.localPoints.filter(r => ids.has(r.localId) &&
    matchesFilter(r, f.macroRegions, 'macroRegion') &&
    matchesFilter(r, f.zones, 'zone') && matchesFilter(r, f.areas, 'area') && matchesFilter(r, f.locals, 'localName') &&
    (f.distanceMin==null || (r.avgDistance || 0) >= f.distanceMin) && (f.distanceMax==null || (r.avgDistance || 0) <= f.distanceMax));
}
function summarize(records){
  const uniqueLocal = new Set(records.map(r=>r.localId));
  const orders = records.reduce((a,b)=>a+(b.orders||0),0);
  const gmv = records.reduce((a,b)=>a+(b.gmv||0),0);
  const deliveryOrders = records.reduce((a,b)=>a+(b.deliveryOrders||0),0);
  const pickupOrders = records.reduce((a,b)=>a+(b.pickupOrders||0),0);
  const projectOrders = records.reduce((a,b)=>a+(b.projectOrders||0),0);
  const completeRate = orders ? records.reduce((a,b)=>a+((b.completeRate||0)*(b.orders||0)),0)/orders : 0;
  const projectCompleteRate = projectOrders ? records.reduce((a,b)=>a+((b.projectCompleteRate||0)*(b.projectOrders||0)),0)/projectOrders : 0;
  return {
    orders, gmv, avgTicket: orders? gmv/orders : 0, completeRate, projectOrders, deliveryOrders, pickupOrders,
    projectCompleteRate,
    cycleP50: median(records.map(r=>r.cycleP50).filter(Boolean)),
    acceptP50: median(records.map(r=>r.acceptP50).filter(Boolean)),
    toStoreP50: median(records.map(r=>r.toStoreP50).filter(Boolean)),
    waitP50: median(records.map(r=>r.waitP50).filter(Boolean)),
    lastMileP50: median(records.map(r=>r.lastMileP50).filter(Boolean)),
    avgDistance: avg(records.map(r=>r.avgDistance).filter(v=>v>0)),
    activeDrivers: records.reduce((sum,r)=>sum + (r.activeDrivers||0),0) / Math.max(new Set(records.map(r=>r.month)).size,1),
    activeLocals: uniqueLocal.size,
    activeLocalsDeliveryEnabled: new Set(records.filter(r=>r.deliveryEnabled).map(r=>r.localId)).size,
    activeLocalsAnyEnabled: new Set(records.filter(r=>r.deliveryEnabled || r.pickupEnabled).map(r=>r.localId)).size,
    months: new Set(records.map(r=>r.month)).size
  }
}

function render(){
  const rows = filteredRecords();
  const points = filteredPoints();
  const sum = summarize(rows);
  renderHighlights(sum, rows, points);
  renderKPIs(sum);
  renderNarratives(sum, rows);
  renderMix(sum);
  renderCharts(rows, sum);
  renderMap(points);
  renderTable(points);
  renderSimulator();
}

function renderHighlights(sum, rows, points){
  const topArea = topN(groupSum(rows, 'area', 'projectOrders'), 1)[0];
  const topZone = topN(groupSum(rows, 'zone', 'projectOrders'), 1)[0];
  const worstCycle = topN(points.filter(p=>p.projectOrders>0).map(p=>({name:p.localName,value:p.cycleP50||0})), 1, false)[0];
  const deliveryShare = sum.orders ? sum.deliveryOrders / sum.orders : 0;
  const html = [
    { t:'Red activa observada', d:`${number(sum.activeLocals)} locales con movimiento en el alcance actual. ${number(sum.activeLocalsDeliveryEnabled)} con delivery habilitado.`},
    { t:'Mix del negocio', d:`Delivery representa ${pct(deliveryShare)} del total y retiro ${pct(sum.pickupOrders/Math.max(sum.orders,1))}.`},
    { t:'Demanda dominante', d: topArea ? `${topArea.name} lidera el módulo proyecto con ${number(topArea.value)} órdenes delivery.` : 'Sin suficiente data delivery en el filtro.'},
    { t:'Zona foco', d: topZone ? `${topZone.name} concentra el mayor volumen del proyecto.` : 'Sin datos de zona.'},
    { t:'Riesgo operativo', d: worstCycle ? `${worstCycle.name} muestra el ciclo típico más largo dentro del recorte.` : 'Sin riesgo operativo visible.'},
    { t:'Objetivo de activación', d:`La meta de 7,500 órdenes exige balancear visibilidad, conversión y suficiente oferta de drivers activos.` }
  ].map(x=>`<div class="highlight-item"><strong>${x.t}</strong><span>${x.d}</span></div>`).join('');
  el('highlightsList').innerHTML = html;
}

function renderMix(sum){
  const deliveryShare = sum.orders ? (sum.deliveryOrders/sum.orders)*100 : 0;
  const pickupShare = sum.orders ? (sum.pickupOrders/sum.orders)*100 : 0;
  el('mixBlock').innerHTML = `
    <div class="mix-row"><span>Órdenes delivery</span><strong>${number(sum.deliveryOrders)}</strong></div>
    <div class="bar"><div class="bar-fill" style="width:${deliveryShare}%;background:var(--indrive)"></div></div>
    <div class="mix-row"><span>Órdenes retiro</span><strong>${number(sum.pickupOrders)}</strong></div>
    <div class="bar"><div class="bar-fill" style="width:${pickupShare}%;background:var(--tambo)"></div></div>
    <div class="mix-row"><span>GMV</span><strong>${money(sum.gmv)}</strong></div>
    <div class="mix-row"><span>Ticket promedio</span><strong>${money(sum.avgTicket)}</strong></div>`;
}

function renderKPIs(sum){
  const cards = [
    ['Orders', number(sum.orders), `${number(sum.months)} meses en el recorte actual`],
    ['GMV', money(sum.gmv), 'E-commerce total Tambo en el filtro'],
    ['Ticket promedio', money(sum.avgTicket), 'Promedio del negocio total'],
    ['% pedidos completados', pct(sum.completeRate), 'Sobre total de órdenes'],
    ['Ciclo de vida típico', minFmt(sum.cycleP50), 'P50 del módulo delivery proyecto'],
    ['Distancia promedio', `${number(Math.round(sum.avgDistance))} m`, 'Distancia delivery promedio'],
    ['Locales activos con delivery', number(sum.activeLocalsDeliveryEnabled), 'Locales activos con delivery habilitado'],
    ['Locales activos totales', number(sum.activeLocalsAnyEnabled), 'Locales con delivery y/o retiro habilitado'],
    ['Drivers activos mes', number(Math.round(sum.activeDrivers)), 'Promedio mensual del módulo delivery'],
    ['Promedio mensual orders', number(Math.round(sum.orders / Math.max(sum.months,1))), 'Promedio mensual del recorte']
  ];
  el('kpiGrid').innerHTML = cards.map(([l,v,s])=>`<div class="kpi-card"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('');
}

function renderNarratives(sum, rows){
  const priorities = topN(state.raw.areaPriority.filter(a=>matchAreaPriority(a)),5);
  const topPriority = priorities[0];
  el('opportunityNarrative').innerHTML = `<p>Tambo cuenta con una red de <b>${number(state.raw.meta.networkTotalLocals)}</b> locales en el maestro y <b>${number(state.raw.meta.networkActiveLocalsObserved)}</b> locales observados con actividad e-commerce. Dentro del filtro actual, el negocio muestra <b>${number(sum.orders)}</b> órdenes y un GMV de <b>${money(sum.gmv)}</b>.</p><ul><li>Mix actual: ${pct(sum.deliveryOrders/Math.max(sum.orders,1))} delivery y ${pct(sum.pickupOrders/Math.max(sum.orders,1))} retiro.</li><li>Ticket promedio de ${money(sum.avgTicket)} con base suficiente para modelar activación.</li><li>El proyecto puede apalancarse en la red existente y escalar visibilidad de forma progresiva.</li></ul>`;
  el('coverageNarrative').innerHTML = `<p>En el alcance filtrado aparecen <b>${number(sum.activeLocalsAnyEnabled)}</b> locales activos con delivery y/o retiro, de los cuales <b>${number(sum.activeLocalsDeliveryEnabled)}</b> tienen delivery habilitado. Eso permite construir una estrategia mixta: capturar demanda con delivery donde el SLA responde y usar retiro donde la cobertura es más fina.</p><ul><li>Delivery observado históricamente: ${number(sum.projectOrders)} órdenes del módulo proyecto.</li><li>Distancia típica de operación: ${number(Math.round(sum.avgDistance))} m.</li><li>La cobertura real debe priorizar áreas con volumen, SLA saludable y suficiente oferta de drivers.</li></ul>`;
  el('riskNarrative').innerHTML = `<p>El principal riesgo no es solo generar tráfico, sino sostener la experiencia. El módulo delivery filtrado está en <b>${pct(sum.projectCompleteRate)}</b> de completitud y un ciclo típico de <b>${minFmt(sum.cycleP50)}</b>.</p><ul><li>Aceptación P50: <b>${minFmt(sum.acceptP50)}</b>.</li><li>Llegada del driver a tienda P50: <b>${minFmt(sum.toStoreP50)}</b>.</li><li>Espera en tienda P50: <b>${minFmt(sum.waitP50)}</b>.</li><li>Última milla P50: <b>${minFmt(sum.lastMileP50)}</b>.</li></ul>`;
  el('activationNarrative').innerHTML = `<p>${topPriority ? `La primera ola debería enfocarse en <b>${topPriority.area}</b> (${topPriority.zone}) por volumen, cobertura y mejor capacidad de respuesta.` : 'No hay suficiente data para una recomendación fina en el filtro actual.'}</p><ul>${priorities.map(p=>`<li><b>${p.area}</b> · score ${p.priorityScore.toFixed(0)} · ${number(p.orders)} órdenes históricas · ${pct(p.completedRate)} completadas.</li>`).join('')}</ul>`;
}

function groupSum(rows, key, metric){ const map={}; rows.forEach(r=>{const k=r[key]||'Sin dato'; map[k]=(map[k]||0)+(r[metric]||0);}); return Object.entries(map).map(([name,value])=>({name,value})); }
function topN(arr,n=5,desc=true){ return [...arr].sort((a,b)=>desc?(b.value??b.priorityScore)-(a.value??a.priorityScore):(a.value??a.priorityScore)-(b.value??b.priorityScore)).slice(0,n); }
function matchAreaPriority(a){
  const f=state.filters;
  return (!f.zones.length || f.zones.includes(a.zone)) && (!f.areas.length || f.areas.includes(a.area));
}

function renderCharts(rows,sum){
  const monthAgg = {};
  rows.forEach(r=>{
    monthAgg[r.month] ||= {orders:0,gmv:0,projectOrders:0,drivers:0};
    monthAgg[r.month].orders += r.orders||0; monthAgg[r.month].gmv += r.gmv||0; monthAgg[r.month].projectOrders += r.projectOrders||0; monthAgg[r.month].drivers += r.activeDrivers||0;
  });
  const months = Object.keys(monthAgg).sort();
  drawChart('monthlyChart', 'bar', {
    labels: months,
    datasets:[
      {label:'Orders', data: months.map(m=>monthAgg[m].orders), backgroundColor:'rgba(11,87,208,.75)', borderRadius:8},
      {label:'Project delivery', data: months.map(m=>monthAgg[m].projectOrders), backgroundColor:'rgba(150,193,31,.75)', borderRadius:8}
    ]}, {responsive:true, maintainAspectRatio:false, scales:{y:{beginAtZero:true}}, plugins:{legend:{position:'top'}}});

  drawChart('cycleChart','bar',{labels:['Aceptación','Llegada tienda','Espera tienda','Última milla','Ciclo total'],datasets:[{label:'P50',data:[sum.acceptP50,sum.toStoreP50,sum.waitP50,sum.lastMileP50,sum.cycleP50],backgroundColor:['#0b57d0','#96c11f','#f59e0b','#ef4444','#0f1728'],borderRadius:10}]},{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}});

  const priorities = state.raw.areaPriority.filter(a=>matchAreaPriority(a)).sort((a,b)=>b.priorityScore-a.priorityScore).slice(0,10);
  drawChart('priorityChart','bar',{labels:priorities.map(d=>d.area),datasets:[{label:'Priority score',data:priorities.map(d=>d.priorityScore),backgroundColor:'rgba(208,24,24,.8)',borderRadius:10}]},{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}});
  drawChart('driversChart','line',{labels:months,datasets:[{label:'Drivers activos',data:months.map(m=>monthAgg[m].drivers),borderColor:'#96c11f',backgroundColor:'rgba(150,193,31,.15)',fill:true,tension:.35}]},{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}}});
}

function drawChart(id, type, data, options){
  if(state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(el(id), { type, data, options });
}

function initMap(){
  state.map = L.map('map', { zoomControl:true }).setView([-12.05,-77.04], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(state.map);
  state.mapLayers.stores = L.layerGroup().addTo(state.map);
  state.mapLayers.priority = L.layerGroup().addTo(state.map);
  state.mapLayers.demand = L.layerGroup().addTo(state.map);
  ['toggleStores','togglePriority','toggleDemand'].forEach(id=> el(id).addEventListener('change', ()=>renderMap(filteredPoints())));
}
function slaColor(cycle){ if(!cycle) return '#94a3b8'; if(cycle<=32) return '#10b981'; if(cycle<=38) return '#f59e0b'; return '#ef4444'; }
function renderMap(points){
  if(!state.map) return;
  Object.values(state.mapLayers).forEach(layer=>layer.clearLayers());
  const showStores = el('toggleStores').checked, showPriority=el('togglePriority').checked, showDemand=el('toggleDemand').checked;
  if(showStores){
    points.filter(p=>p.lat&&p.lng).forEach(p=>{
      L.circleMarker([p.lat,p.lng],{radius:Math.max(5,Math.min(14,Math.sqrt(p.orders||1)/2)),color:'#fff',weight:1.5,fillColor:slaColor(p.cycleP50),fillOpacity:.92})
        .bindPopup(`<b>${p.localName}</b><br>${p.area}<br>Orders: ${number(p.orders)}<br>GMV: ${money(p.gmv)}<br>Ciclo P50: ${minFmt(p.cycleP50)}`)
        .addTo(state.mapLayers.stores);
    });
  }
  if(showPriority){
    state.raw.areaPriority.filter(a=>matchAreaPriority(a)).slice(0,20).forEach(a=>{
      L.circle([a.lat,a.lng],{radius:Math.max(600, a.orders*6),color:'#d01818',weight:2,fillColor:'#d01818',fillOpacity:.08})
        .bindPopup(`<b>${a.area}</b><br>${a.zone}<br>Priority score: ${a.priorityScore.toFixed(0)}<br>Orders: ${number(a.orders)}`)
        .addTo(state.mapLayers.priority)
    });
  }
  if(showDemand){
    state.raw.demandPoints.slice(0,70).forEach(d=>{
      L.circleMarker([d.lat,d.lng],{radius:Math.max(4,Math.min(18,Math.sqrt(d.orders)/2.2)),color:'transparent',fillColor:'#0b57d0',fillOpacity:.18})
        .bindPopup(`<b>${d.place}</b><br>Demanda potencial: ${number(d.orders)} órdenes históricas`) 
        .addTo(state.mapLayers.demand);
    });
  }
}

function renderSimulator(){
  const users = Number(el('simUsers').value || 0);
  const exposure = Number(el('simExposure').value || 0) / 100;
  const ctr = Number(el('simCtr').value || 0) / 100;
  const conv = Number(el('simConversion').value || 0) / 100;
  const deliveryMix = Number(el('simDeliveryMix').value || 0) / 100;
  const opd = Number(el('simOrdersDriver').value || 0);
  const days = Number(el('simDays').value || 0);
  const target = Number(el('simTarget').value || 7500);
  const projectedOrders = users * exposure * ctr * conv;
  const deliveryOrders = projectedOrders * deliveryMix;
  const pickupOrders = projectedOrders * (1-deliveryMix);
  const driversNeeded = opd && days ? Math.ceil(deliveryOrders / (opd * days)) : 0;
  const gap = target - projectedOrders;
  const exposureNeeded = users && ctr && conv ? (target / (users * ctr * conv)) : 0;
  el('simulatorOutput').innerHTML = `
    <b>Proyección:</b> ${number(projectedOrders)} órdenes / mes.<br>
    <b>Mix estimado:</b> ${number(deliveryOrders)} delivery y ${number(pickupOrders)} retiro.<br>
    <b>Drivers activos requeridos:</b> ${number(driversNeeded)}.<br>
    <b>Condición para llegar a ${number(target)} órdenes:</b> con ${number(users)} usuarios activos, el producto de exposición × CTR × conversión debe cerrar la brecha. A este nivel de CTR (${(ctr*100).toFixed(1)}%) y conversión (${(conv*100).toFixed(1)}%), necesitarías exponer Tambo al menos a <b>${(exposureNeeded*100).toFixed(1)}%</b> de la base.`;
  const baseDrivers = Math.max(driversNeeded,1);
  el('staffingCards').innerHTML = [30,50,100].map(p=>{
    const ord = users * (p/100) * ctr * conv; const del = ord*deliveryMix; const drv = opd&&days ? Math.ceil(del/(opd*days)) : 0;
    return `<div class="staff-card"><div class="label">Escenario ${p}% visibilidad</div><div class="value">${number(ord)}</div><div class="sub">órdenes / mes<br>${number(drv)} drivers activos estimados</div></div>`;
  }).join('');
}

function renderTable(points){
  const columns = [
    ['localName','Local'],['macroRegion','Lima/Provincia'],['zone','Zona'],['area','Área'],['orders','Orders'],['gmv','GMV'],['avgTicket','Ticket prom.'],['deliveryOrders','Delivery'],['pickupOrders','Retiro'],['projectOrders','Project orders'],['cycleP50','Ciclo P50'],['avgDistance','Distancia prom.'],['activeDrivers','Drivers activos']
  ];
  const thead = `<tr>${columns.map(([k,l])=>`<th data-sort="${k}">${l}</th>`).join('')}</tr>`;
  const rows = [...points].sort((a,b)=> sortValue(a,b,state.sort.key,state.sort.dir)).slice(0,200);
  el('localTable').querySelector('thead').innerHTML = thead;
  el('localTable').querySelector('tbody').innerHTML = rows.map(r=>`<tr>
    <td>${escapeHtml(r.localName||'')}</td><td>${escapeHtml(r.macroRegion||'')}</td><td>${escapeHtml(r.zone||'')}</td><td>${escapeHtml(r.area||'')}</td>
    <td>${number(r.orders)}</td><td>${money(r.gmv)}</td><td>${money(r.avgTicket)}</td><td>${number(r.deliveryOrders)}</td><td>${number(r.pickupOrders)}</td><td>${number(r.projectOrders)}</td><td>${minFmt(r.cycleP50)}</td><td>${number(Math.round(r.avgDistance||0))} m</td><td>${number(r.activeDrivers)}</td></tr>`).join('');
  document.querySelectorAll('#localTable thead th').forEach(th=>th.onclick=()=>{ const key=th.dataset.sort; state.sort = { key, dir: state.sort.key===key && state.sort.dir==='desc' ? 'asc' : 'desc' }; renderTable(filteredPoints()); });
}
function sortValue(a,b,key,dir){ const va=a[key] ?? '', vb=b[key] ?? ''; return (typeof va === 'string' ? va.localeCompare(vb) : va-vb) * (dir==='desc'?-1:1); }
function escapeHtml(s=''){ return String(s).replace(/[&<>"]+/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c] || c)); }

document.addEventListener('DOMContentLoaded', ()=>{
  el('sendCodeBtn').addEventListener('click', ()=>requestOtp().catch(e=>setAuthMsg(e.message,false)));
  el('verifyCodeBtn').addEventListener('click', ()=>verifyOtp().catch(e=>setAuthMsg(e.message,false)));
  state.token ? loadApp() : setAuthMsg('Ingresa con tu correo corporativo para desbloquear la web.', true);
});
