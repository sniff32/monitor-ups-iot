(function () {
  'use strict';

  const config = window.MONITOR_CONFIG || {};
  const client = config.url && config.key ? window.supabase.createClient(config.url, config.key) : null;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '—').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);

  const elements = {
    login: $('#login'), pending: $('#pending-access'), dashboard: $('#dashboard'), logout: $('#logout'),
    loginForm: $('#login-form'), loginMessage: $('#login-message'), loginButton: $('#login-button'),
    password: $('#password'), passwordToggle: $('#toggle-password'),
    projectSelect: $('#project-select'), adminNav: $('#admin-nav'),
    deviceRows: $('#device-rows'), deviceTableHead: $('#device-table-head'),
    historyRows: $('#history-rows'), historyTableHead: $('#history-table-head'),
    deviceSelect: $('#device-select'), rangeSelect: $('#range-select'), chartsGrid: $('#charts-grid'),
    deviceCatalog: $('#device-catalog'),
    adminWorkspaceForm: $('#admin-workspace-form'), adminWorkspaceButton: $('#admin-workspace-button'),
    adminWorkspaceMessage: $('#admin-workspace-message'), adminDeviceForm: $('#admin-device-form'),
    adminDeviceButton: $('#admin-device-button'), adminDeviceMessage: $('#admin-device-message'),
    adminProjectSelect: $('#admin-device-project'), adminCompanyCatalog: $('#admin-company-catalog'),
    adminDeviceCatalog: $('#admin-device-catalog'), adminPriority: $('#admin-priority'),
    adminNotificationList: $('#admin-notification-list'), adminCompanySwitcher: $('#admin-company-switcher'),
    adminCompanyChips: $('#admin-company-chips'), adminDetailContext: $('#admin-detail-context'),
    adminInventorySwitcher: $('#admin-inventory-switcher'), adminInventoryProject: $('#admin-inventory-project')
  };

  const rules = {
    offlineAfterMs: 30_000,
    inputMin: 100, inputMax: 140, outputMin: 100, outputMax: 140,
    batteryMin: 10.5, loadMax: 90, temperatureMax: 50
  };

  const colors = ['#ed6d05', '#0c91c7', '#1688b8', '#f59618', '#087b55', '#7b61a8', '#bd476b', '#46845c'];
  const presets = {
    ups: {
      title: 'Monitoreo de UPS y energía', kicker: 'Continuidad eléctrica',
      description: 'Consulta la comunicación de cada dispositivo, el último estado informado por el UPS y sus mediciones más recientes.',
      statusLabel: 'Último estado reportado del UPS',
      metrics: [
        { key: 'temperature_c', keys: ['temperature_c', 'temperature'], unit: '°C', label: 'Temperatura', description: 'Temperatura reportada por el dispositivo' },
        { key: 'input_voltage', keys: ['input_voltage'], unit: 'V', label: 'Voltaje de entrada', description: 'Alimentación recibida por el UPS' },
        { key: 'output_voltage', keys: ['output_voltage'], unit: 'V', label: 'Voltaje de salida', description: 'Alimentación entregada por el UPS' },
        { key: 'battery_voltage', keys: ['battery_voltage'], unit: 'V', label: 'Voltaje de batería', description: 'Nivel eléctrico del banco de baterías' },
        { key: 'load_percent', keys: ['load_percent'], unit: '%', label: 'Carga', description: 'Uso de la capacidad del UPS', fixedMin: 0, fixedMax: 100 }
      ]
    },
    agriculture: {
      title: 'Monitoreo de cosechas', kicker: 'Agricultura conectada',
      description: 'Consulta las condiciones ambientales y del suelo reportadas por los sensores de cada zona.',
      statusLabel: 'Último estado reportado del sensor',
      metrics: [
        { key: 'temperature_c', keys: ['temperature_c'], unit: '°C', label: 'Temperatura', description: 'Temperatura del ambiente' },
        { key: 'humidity_percent', keys: ['humidity_percent'], unit: '%', label: 'Humedad ambiental', description: 'Humedad relativa del aire', fixedMin: 0, fixedMax: 100 },
        { key: 'soil_moisture_percent', keys: ['soil_moisture_percent'], unit: '%', label: 'Humedad del suelo', description: 'Nivel reportado por la sonda', fixedMin: 0, fixedMax: 100 },
        { key: 'light_lux', keys: ['light_lux'], unit: 'lx', label: 'Iluminación', description: 'Luz recibida por el cultivo' }
      ]
    },
    aquarium: {
      title: 'Monitoreo de acuarios', kicker: 'Calidad del agua',
      description: 'Consulta la temperatura y los parámetros del agua reportados por cada acuario.',
      statusLabel: 'Último estado reportado del sensor',
      metrics: [
        { key: 'water_temperature_c', keys: ['water_temperature_c', 'temperature_c'], unit: '°C', label: 'Temperatura del agua', description: 'Temperatura reportada por la sonda' },
        { key: 'ph', keys: ['ph'], unit: 'pH', label: 'pH', description: 'Nivel de acidez o alcalinidad', fixedMin: 0, fixedMax: 14 },
        { key: 'dissolved_oxygen_mg_l', keys: ['dissolved_oxygen_mg_l'], unit: 'mg/L', label: 'Oxígeno disuelto', description: 'Oxígeno disponible en el agua' },
        { key: 'water_level_percent', keys: ['water_level_percent'], unit: '%', label: 'Nivel del agua', description: 'Porcentaje de nivel reportado', fixedMin: 0, fixedMax: 100 }
      ]
    },
    generic: {
      title: 'Monitoreo IoT', kicker: 'Proyecto conectado',
      description: 'Consulta el estado y las variables reportadas por tus dispositivos.',
      statusLabel: 'Último estado reportado', metrics: []
    }
  };

  let workspace = { profile: {}, projects: [] };
  let currentProject = null;
  let allRecords = [];
  let loadingRecords = false;
  let globalRecords = [];
  let loadingGlobalRecords = false;
  let adminCompanyFilter = 'all';
  let realtimeChannel = null;
  let bootToken = 0;
  let adminCatalog = { organizations: [], projects: [], members: [], devices: [] };

  const numberValue = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const validTime = record => {
    const time = new Date(record?.received_at).getTime();
    return Number.isFinite(time) ? time : 0;
  };

  const formatTime = value => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin datos';
  const formatDuration = milliseconds => {
    if (!Number.isFinite(milliseconds)) return 'sin datos';
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ${minutes % 60} min`;
    const days = Math.floor(hours / 24);
    return `${days} d ${hours % 24} h`;
  };
  const formatMetric = (value, unit) => value === null ? '—' : `${Number(value.toFixed(2))} ${unit}`;
  const humanizeKey = key => key.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());

  function preset(project = currentProject) {
    return presets[project?.project_type] || presets.generic;
  }

  function metricValue(record, metric) {
    for (const key of metric.keys) {
      const direct = numberValue(record?.[key]);
      if (direct !== null) return direct;
      const flexible = numberValue(record?.metric_values?.[key]);
      if (flexible !== null) return flexible;
    }
    return null;
  }

  function activeMetrics(project = currentProject, records = allRecords) {
    const configured = preset(project).metrics;
    if (configured.length) return configured;
    const keys = new Set();
    records.slice(0, 200).forEach(record => Object.keys(record.metric_values || {}).forEach(key => keys.add(key)));
    if (records.some(record => numberValue(record.temperature_c) !== null)) keys.add('temperature_c');
    return [...keys].slice(0, 8).map(key => ({
      key, keys: [key], unit: '', label: humanizeKey(key), description: 'Variable reportada por el dispositivo'
    }));
  }

  const normalizedStatus = record => String(record?.status || 'SIN_DATO').trim().toUpperCase();
  function readableStatus(record, project = currentProject) {
    const status = normalizedStatus(record);
    const upsLabels = {
      ONLINE: 'Operación normal', ON_BATTERY: 'Trabajando con batería', BATTERY: 'Trabajando con batería',
      LOW_BATTERY: 'Batería baja', UPS_DISCONNECTED: 'UPS sin comunicación', DISCONNECTED: 'Sin comunicación',
      OFFLINE: 'Apagado o sin comunicación', FAULT: 'Falla reportada', SIN_DATO: 'Sin estado reportado'
    };
    if (project?.project_type === 'ups') return upsLabels[status] || humanizeKey(status.toLowerCase());
    const labels = { ONLINE: 'Funcionamiento normal', OFFLINE: 'Sin comunicación', FAULT: 'Falla reportada', SIN_DATO: 'Sin estado reportado' };
    return labels[status] || humanizeKey(status.toLowerCase());
  }

  function reportedInterface(record) {
    const raw = String(record?.ups_interface || record?.interface_type || record?.data_interface || record?.source_interface || '').trim().toUpperCase();
    if (raw.includes('USB')) return 'USB';
    if (raw.includes('485')) return 'RS-485';
    return '';
  }

  const interfaceDescription = record => reportedInterface(record) || 'interfaz no reportada';
  function connectionState(record, now = Date.now()) {
    const lastSeen = validTime(record);
    const ageMs = lastSeen ? Math.max(0, now - lastSeen) : Number.POSITIVE_INFINITY;
    return { connected: Boolean(lastSeen) && ageMs <= rules.offlineAfterMs, lastSeen, ageMs };
  }

  function measurementAlerts(record, project = currentProject) {
    if (!record) return [];
    const alerts = [];
    const push = (key, severity, title, message) => alerts.push({ key, severity, title, message, time: validTime(record) });
    const status = normalizedStatus(record);
    if (project?.project_type === 'ups') {
      if (['UPS_DISCONNECTED', 'DISCONNECTED', 'OFFLINE'].includes(status)) {
        push('device-status', 'critical', 'UPS sin comunicación', `El dispositivo reportó pérdida de comunicación con el UPS mediante ${interfaceDescription(record)}.`);
      } else if (['ON_BATTERY', 'BATTERY'].includes(status)) {
        push('device-status', 'warning', 'UPS trabajando con batería', 'El UPS informó que no está disponible la alimentación principal.');
      } else if (status === 'LOW_BATTERY') {
        push('device-status', 'critical', 'Batería del UPS baja', 'El UPS informó poca energía disponible en su batería.');
      } else if (status !== 'ONLINE') {
        push('device-status', 'warning', `Estado del UPS: ${readableStatus(record, project)}`, 'El equipo informó una condición que requiere revisión.');
      }
      const metrics = activeMetrics(project, [record]);
      const temperature = metricValue(record, metrics.find(metric => metric.key === 'temperature_c') || { keys: [] });
      const input = numberValue(record.input_voltage);
      const output = numberValue(record.output_voltage);
      const battery = numberValue(record.battery_voltage);
      const load = numberValue(record.load_percent);
      if (input !== null && (input < rules.inputMin || input > rules.inputMax)) push('input-voltage', 'critical', 'Voltaje de entrada fuera de rango', `Lectura: ${formatMetric(input, 'V')}.`);
      if (output !== null && (output < rules.outputMin || output > rules.outputMax)) push('output-voltage', 'critical', 'Voltaje de salida fuera de rango', `Lectura: ${formatMetric(output, 'V')}.`);
      if (battery !== null && battery < rules.batteryMin) push('battery-voltage', 'critical', 'Batería baja', `Lectura: ${formatMetric(battery, 'V')}.`);
      if (load !== null && load >= rules.loadMax) push('high-load', 'warning', 'Carga elevada', `Lectura: ${formatMetric(load, '%')}.`);
      if (temperature !== null && temperature >= rules.temperatureMax) push('temperature', 'warning', 'Temperatura elevada', `Lectura: ${formatMetric(temperature, '°C')}.`);
    } else if (!['ONLINE', 'OK'].includes(status)) {
      push('device-status', status === 'FAULT' ? 'critical' : 'warning', `Estado reportado: ${readableStatus(record, project)}`, 'El sensor informó una condición distinta al funcionamiento normal.');
    }
    return alerts;
  }

  function currentAlerts(record, now = Date.now(), project = currentProject) {
    const connection = connectionState(record, now);
    if (connection.connected) return measurementAlerts(record, project);
    return [{
      key: 'connection', severity: 'critical',
      title: record ? 'Sin comunicación con el dispositivo' : 'El dispositivo todavía no envía datos',
      message: record ? `La plataforma lleva ${formatDuration(connection.ageMs)} sin recibir datos.` : 'Verifica que el equipo tenga el host, puerto e identificación correctos.',
      time: connection.lastSeen ? connection.lastSeen + rules.offlineAfterMs : now
    }];
  }

  function detectDisconnections(recordsAscending, now = Date.now()) {
    const incidents = [];
    for (let index = 1; index < recordsAscending.length; index += 1) {
      const previousTime = validTime(recordsAscending[index - 1]);
      const currentTime = validTime(recordsAscending[index]);
      if (previousTime && currentTime && currentTime - previousTime > rules.offlineAfterMs) {
        const startedAt = previousTime + rules.offlineAfterMs;
        incidents.push({ startedAt, endedAt: currentTime, durationMs: currentTime - startedAt, active: false });
      }
    }
    const latestTime = validTime(recordsAscending[recordsAscending.length - 1]);
    if (latestTime && now - latestTime > rules.offlineAfterMs) {
      const startedAt = latestTime + rules.offlineAfterMs;
      incidents.push({ startedAt, endedAt: null, durationMs: now - startedAt, active: true });
    }
    return incidents.sort((a, b) => b.startedAt - a.startedAt);
  }

  function buildAlertHistory(recordsAscending, disconnections) {
    const events = [];
    let previousKeys = new Set();
    recordsAscending.forEach(record => {
      const alerts = measurementAlerts(record);
      const keys = new Set(alerts.map(alert => alert.key));
      alerts.forEach(alert => { if (!previousKeys.has(alert.key)) events.push(alert); });
      previousKeys = keys;
    });
    disconnections.forEach(incident => events.push({
      key: 'connection', severity: 'critical',
      title: incident.active ? 'Sin comunicación con el dispositivo' : 'Comunicación recuperada',
      message: `${incident.active ? 'Tiempo sin recibir datos' : 'Duración de la interrupción'}: ${formatDuration(incident.durationMs)}.`,
      time: incident.startedAt
    }));
    return events.sort((a, b) => b.time - a.time).slice(0, 20);
  }

  function showView(view) {
    elements.login.classList.toggle('hidden', view !== 'login');
    elements.pending.classList.toggle('hidden', view !== 'pending');
    elements.dashboard.classList.toggle('hidden', view !== 'dashboard');
    elements.logout.classList.toggle('hidden', view !== 'dashboard');
    document.body.classList.toggle('session-active', view === 'dashboard');
  }

  function showPanel(panelId) {
    document.querySelectorAll('.dashboard-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== panelId));
    document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.panel === panelId));
    if (panelId === 'device-panel') renderDeviceDetail();
    if (panelId === 'devices-panel') renderDeviceCatalog();
    if (panelId === 'overview-panel' && workspace.is_platform_admin) renderAdminOverview();
    if (panelId === 'admin-panel' && workspace.is_platform_admin) loadAdminCatalog();
  }

  function setServerState(connected, text) {
    $('#server-status-text').textContent = text;
    $('#server-status').classList.toggle('error', !connected);
  }

  function projectDevices() {
    return Array.isArray(currentProject?.devices) ? currentProject.devices : [];
  }

  function deviceDefinition(deviceId) {
    return projectDevices().find(device => device.device_id === deviceId);
  }

  function deviceLabel(deviceId) {
    const device = deviceDefinition(deviceId);
    return device?.display_name || deviceId;
  }

  function latestDevices() {
    const latest = new Map();
    allRecords.forEach(record => { if (record.device_id && !latest.has(record.device_id)) latest.set(record.device_id, record); });
    const deviceIds = new Set([...projectDevices().map(device => device.device_id), ...latest.keys()]);
    return [...deviceIds].sort().map(deviceId => ({ deviceId, latest: latest.get(deviceId) || null }));
  }

  function overviewMetric(value, unit, connected) {
    const formatted = esc(formatMetric(value, unit));
    if (connected) return formatted;
    return `<span class="last-reading">${formatted}</span><span class="stale-note">Último dato recibido</span>`;
  }

  function applyAdministratorIdentity() {
    $('#header-project-title').textContent = 'Panel de administración Monitor IoT';
    $('#header-company-name').textContent = 'Gestión centralizada de empresas y dispositivos';
    $('#sidebar-project-name').textContent = 'Administración WiMobile';
    $('#sidebar-project-description').textContent = 'Acceso del administrador general para supervisar empresas, proyectos y dispositivos.';
    elements.projectSelect.classList.add('hidden');
  }

  function applyProjectPreset() {
    const selectedPreset = preset();
    if (workspace.is_platform_admin) {
      applyAdministratorIdentity();
      elements.adminDetailContext.classList.remove('hidden');
      $('#admin-detail-context-title').textContent = `${currentProject.organization_name} · ${currentProject.name}`;
      $('#detail-title').textContent = 'Estadísticas del equipo';
    } else {
      $('#header-project-title').textContent = currentProject.name;
      $('#header-company-name').textContent = currentProject.organization_name;
      $('#sidebar-project-name').textContent = currentProject.name;
      $('#sidebar-project-description').textContent = selectedPreset.description;
      $('#overview-kicker').textContent = selectedPreset.kicker;
      $('#overview-title').textContent = selectedPreset.title;
      $('#overview-description').textContent = selectedPreset.description;
      elements.adminDetailContext.classList.add('hidden');
      $('#detail-title').textContent = `Estadísticas · ${currentProject.name}`;
    }
    $('#detail-description').textContent = 'Consulta la conexión, alertas, gráficas e historial del dispositivo seleccionado.';
    $('#detail-status-label').textContent = selectedPreset.statusLabel;
    $('#workspace-description').textContent = `${currentProject.organization_name}: ${currentProject.business_description || currentProject.description || 'Proyecto privado de monitoreo.'}`;
    $('#alerts-subtitle').textContent = currentProject.project_type === 'ups'
      ? 'Eventos reportados por el UPS y problemas de comunicación detectados por la plataforma'
      : 'Estados informados por el sensor y problemas de comunicación detectados por la plataforma';
    $('#threshold-note').textContent = currentProject.project_type === 'ups'
      ? 'Límites iniciales: 30 s sin datos, entrada o salida fuera de 100–140 V, batería menor a 10.5 V, carga igual o mayor a 90 % y temperatura igual o mayor a 50 °C.'
      : 'La desconexión se detecta automáticamente. Los límites de cada variable deben configurarse según las necesidades técnicas del proyecto.';
    $('#disconnect-threshold-note').textContent = 'La plataforma marca una pérdida de comunicación después de 30 segundos sin recibir datos.';
  }

  function renderProjectSelector() {
    if (!currentProject) {
      elements.projectSelect.innerHTML = '';
      elements.projectSelect.classList.add('hidden');
      elements.adminInventoryProject.innerHTML = '';
      elements.adminInventorySwitcher.classList.add('hidden');
      return;
    }
    elements.projectSelect.innerHTML = workspace.projects.map(project => `<option value="${esc(project.id)}">${esc(project.name)}</option>`).join('');
    elements.projectSelect.value = currentProject.id;
    elements.projectSelect.classList.toggle('hidden', workspace.is_platform_admin || workspace.projects.length < 2);
    elements.adminInventoryProject.innerHTML = workspace.projects.map(project => `<option value="${esc(project.id)}">${esc(project.organization_name)} · ${esc(project.name)}</option>`).join('');
    elements.adminInventoryProject.value = currentProject.id;
    elements.adminInventorySwitcher.classList.toggle('hidden', !workspace.is_platform_admin);
    $('#admin-inventory-context').textContent = workspace.is_platform_admin
      ? `Visualizando: ${currentProject.organization_name} · ${currentProject.name}`
      : '';
  }

  function renderDeviceCatalog() {
    const devices = projectDevices();
    $('#device-catalog-meta').textContent = `${devices.length} dispositivo${devices.length === 1 ? '' : 's'} en este proyecto`;
    elements.deviceCatalog.innerHTML = devices.length ? devices.map(device => `
      <article class="device-catalog-item">
        <div><strong>${esc(device.display_name || device.device_id)}</strong><span>ID técnico: ${esc(device.device_id)} · tipo: ${esc(device.device_type)}</span></div>
        <button class="app-button secondary row-action" type="button" data-open-device="${esc(device.device_id)}">Ver lecturas</button>
      </article>`).join('') : '<div class="empty">Todavía no hay dispositivos vinculados a este proyecto.</div>';
  }

  function renderAdminCatalog() {
    const organizations = Array.isArray(adminCatalog.organizations) ? adminCatalog.organizations : [];
    const projects = Array.isArray(adminCatalog.projects) ? adminCatalog.projects : [];
    const members = Array.isArray(adminCatalog.members) ? adminCatalog.members : [];
    const devices = Array.isArray(adminCatalog.devices) ? adminCatalog.devices : [];

    $('#admin-company-count').textContent = organizations.length;
    $('#admin-user-count').textContent = members.length;
    $('#admin-project-count').textContent = projects.length;
    $('#admin-device-count').textContent = devices.length;

    elements.adminProjectSelect.innerHTML = '<option value="">Selecciona un proyecto</option>' + projects.map(project =>
      `<option value="${esc(project.id)}">${esc(project.organization_name)} · ${esc(project.name)}</option>`
    ).join('');

    elements.adminCompanyCatalog.innerHTML = organizations.length ? organizations.map(organization => {
      const companyMembers = members.filter(member => member.organization_id === organization.id);
      const companyProjects = projects.filter(project => project.organization_id === organization.id);
      return `<article class="admin-company-card">
        <h4>${esc(organization.name)}</h4>
        <p>${esc(organization.business_description || 'Sin descripción registrada.')}</p>
        <div class="admin-company-meta">
          <span>${companyMembers.length} usuario${companyMembers.length === 1 ? '' : 's'}</span>
          <span>${companyProjects.length} proyecto${companyProjects.length === 1 ? '' : 's'}</span>
          ${companyMembers.map(member => `<span>${esc(member.display_name || member.email)} · ${esc(member.email)}</span>`).join('')}
        </div>
        <div class="admin-project-list">${companyProjects.map(project => {
          const count = devices.filter(device => device.project_id === project.id).length;
          return `<div class="admin-project-item"><strong>${esc(project.name)}</strong> · ${esc(project.project_type)} · ${count} dispositivo${count === 1 ? '' : 's'}</div>`;
        }).join('') || '<div class="empty">Esta empresa todavía no tiene proyectos.</div>'}</div>
      </article>`;
    }).join('') : '<div class="empty">Todavía no existen empresas registradas.</div>';

    elements.adminDeviceCatalog.innerHTML = devices.length ? devices.map(device => `
      <article class="device-catalog-item">
        <div><strong>${esc(device.display_name || device.device_id)}</strong><span>ID: ${esc(device.device_id)} · ${device.project_id ? `${esc(device.organization_name)} / ${esc(device.project_name)}` : 'Sin empresa asignada'}</span></div>
        ${device.project_id ? `<button class="app-button secondary row-action" type="button" data-admin-unassign="${esc(device.device_id)}">Retirar</button>` : '<span class="pill neutral">Disponible</span>'}
      </article>`).join('') : '<div class="empty">Todavía no existen dispositivos registrados.</div>';
  }

  async function loadAdminCatalog() {
    if (!workspace.is_platform_admin) return;
    const { data, error } = await client.rpc('admin_get_catalog');
    if (error) {
      elements.adminCompanyCatalog.innerHTML = `<div class="empty">No fue posible cargar la administración: ${esc(error.message)}</div>`;
      return;
    }
    adminCatalog = data || { organizations: [], projects: [], members: [], devices: [] };
    renderAdminCatalog();
  }

  async function refreshWorkspace(preferredProjectId = currentProject?.id) {
    workspace = await loadWorkspace();
    elements.adminNav.classList.toggle('hidden', !workspace.is_platform_admin);
    if (!workspace.projects?.length) {
      currentProject = null;
      if (workspace.is_platform_admin) {
        applyAdministratorIdentity();
        renderProjectSelector();
        subscribeToProject();
        await loadGlobalRecords(true);
      }
      return;
    }
    const selected = workspace.projects.some(project => project.id === preferredProjectId)
      ? preferredProjectId
      : workspace.projects[0].id;
    if (workspace.is_platform_admin) {
      currentProject = workspace.projects.find(project => project.id === selected) || workspace.projects[0];
      applyAdministratorIdentity();
      renderProjectSelector();
      subscribeToProject();
      await loadGlobalRecords(true);
      return;
    }
    await activateProject(selected);
  }

  async function createCompanyAccount(email, password, displayName) {
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('La sesión del administrador terminó. Inicia sesión nuevamente.');
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No fue posible crear la cuenta de acceso.');
    return result;
  }

  function renderDeviceSelector() {
    if (!currentProject) {
      elements.deviceSelect.innerHTML = '<option value="">Sin dispositivos</option>';
      return;
    }
    const ids = latestDevices().map(item => item.deviceId);
    const previous = elements.deviceSelect.value;
    elements.deviceSelect.innerHTML = ids.length
      ? ids.map(id => `<option value="${esc(id)}">${esc(deviceLabel(id))}</option>`).join('')
      : '<option value="">Sin dispositivos</option>';
    elements.deviceSelect.value = ids.includes(previous) ? previous : (ids[0] || '');
  }

  function administratorDeviceEntries(now = Date.now()) {
    const latest = new Map();
    globalRecords.forEach(record => {
      const key = `${record.project_id || ''}|${record.device_id || ''}`;
      if (record.device_id && !latest.has(key)) latest.set(key, record);
    });
    return (workspace.projects || []).flatMap(project => (project.devices || []).map(device => {
      const record = latest.get(`${project.id}|${device.device_id}`) || null;
      const connection = connectionState(record, now);
      const alerts = currentAlerts(record, now, project);
      const maintenanceAlerts = record && connection.connected ? measurementAlerts(record, project) : [];
      return { project, device, latest: record, connection, alerts, maintenanceAlerts };
    }));
  }

  function primaryAlert(alerts) {
    return [...alerts].sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'))[0] || null;
  }

  function renderAdminCompanyChips(entries) {
    const companies = new Map();
    (workspace.projects || []).forEach(project => {
      if (!companies.has(project.organization_id)) companies.set(project.organization_id, project.organization_name);
    });
    if (adminCompanyFilter !== 'all' && !companies.has(adminCompanyFilter)) adminCompanyFilter = 'all';
    const totalDevices = entries.length;
    elements.adminCompanyChips.innerHTML = [
      `<button class="company-chip${adminCompanyFilter === 'all' ? ' active' : ''}" type="button" data-company-filter="all">Todas (${totalDevices})</button>`,
      ...[...companies.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([id, name]) => {
        const count = entries.filter(entry => entry.project.organization_id === id).length;
        return `<button class="company-chip${adminCompanyFilter === id ? ' active' : ''}" type="button" data-company-filter="${esc(id)}">${esc(name)} (${count})</button>`;
      })
    ].join('');
    const selectedName = adminCompanyFilter === 'all' ? 'Todas las empresas' : companies.get(adminCompanyFilter);
    $('#admin-company-filter-label').textContent = `Vista: ${selectedName}`;
  }

  function renderAdminOverview() {
    if (!workspace.is_platform_admin) return;
    applyAdministratorIdentity();
    $('#overview-kicker').textContent = 'Supervisión global';
    $('#overview-title').textContent = 'Resumen administrativo';
    $('#overview-description').textContent = 'Alertas y condiciones que requieren atención.';
    $('#overview-table-title').textContent = 'Equipos por empresa';
    $('#overview-table-description').textContent = 'Abre un equipo para consultar su ficha completa';
    $('#table-guidance').innerHTML = '<strong>Lectura administrativa:</strong> los datos de un equipo sin comunicación corresponden a su último reporte guardado y se muestran como históricos.';
    elements.adminPriority.classList.remove('hidden');
    elements.adminCompanySwitcher.classList.remove('hidden');
    elements.adminDetailContext.classList.add('hidden');

    const now = Date.now();
    const entries = administratorDeviceEntries(now);
    const companies = new Set((workspace.projects || []).map(project => project.organization_id));
    const alertEntries = entries.filter(entry => entry.alerts.length);
    const maintenanceEntries = entries.filter(entry => entry.maintenanceAlerts.length);
    $('#summary-card-1-label').textContent = 'Empresas';
    $('#summary-card-1-note').textContent = 'Entornos empresariales registrados';
    $('#summary-card-2-label').textContent = 'Dispositivos';
    $('#summary-card-2-note').textContent = 'Equipos asignados a las empresas';
    $('#summary-card-3-label').textContent = 'Alertas activas';
    $('#summary-card-3-note').textContent = 'Equipos que requieren revisión';
    $('#summary-card-4-label').textContent = 'Requieren mantenimiento';
    $('#device-count').textContent = companies.size;
    $('#online-count').textContent = entries.length;
    $('#offline-count').textContent = alertEntries.length;
    $('#active-alert-count').textContent = maintenanceEntries.length;
    $('#update-state').textContent = 'Condiciones técnicas reportadas por los equipos';

    renderAdminCompanyChips(entries);
    const filtered = adminCompanyFilter === 'all'
      ? entries
      : entries.filter(entry => entry.project.organization_id === adminCompanyFilter);
    const priority = filtered.filter(entry => entry.alerts.length).sort((a, b) => {
      const severity = entry => primaryAlert(entry.alerts)?.severity === 'critical' ? 0 : 1;
      return severity(a) - severity(b) || validTime(a.latest) - validTime(b.latest);
    });
    $('#admin-priority-meta').textContent = priority.length ? `${priority.length} equipo${priority.length === 1 ? '' : 's'} por revisar` : 'Sin incidentes activos';
    $('#admin-priority-meta').className = `pill${priority.length ? ' warning' : ''}`;
    elements.adminNotificationList.innerHTML = priority.length ? priority.slice(0, 8).map(entry => {
      const alert = primaryAlert(entry.alerts);
      return `<article class="admin-notification${alert.severity === 'critical' ? ' critical' : ''}">
        <span class="admin-priority-icon">!</span>
        <div><span class="company">${esc(entry.project.organization_name)}</span><span class="device">${esc(entry.device.display_name || entry.device.device_id)} · ${esc(entry.project.name)}</span></div>
        <div class="problem"><strong>${esc(alert.title)}</strong><span>${esc(alert.message)}</span></div>
        <time>${entry.latest ? esc(formatTime(entry.latest.received_at)) : 'Sin primera lectura'}<br>${entry.connection.connected ? 'Reporte reciente' : 'Atención pendiente'}</time>
      </article>`;
    }).join('') : '<div class="admin-notification-empty"><span>✓</span>No hay incidentes activos en la vista seleccionada.</div>';

    elements.deviceTableHead.innerHTML = '<th>Empresa</th><th>Proyecto</th><th>Dispositivo</th><th>Comunicación</th><th>Último estado reportado</th><th>Último dato recibido</th><th>Alerta</th><th></th>';
    const grouped = new Map();
    filtered.forEach(entry => {
      const key = entry.project.organization_id;
      if (!grouped.has(key)) grouped.set(key, { name: entry.project.organization_name, entries: [] });
      grouped.get(key).entries.push(entry);
    });
    elements.deviceRows.innerHTML = grouped.size ? [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(group => {
      const rows = group.entries.sort((a, b) => Number(Boolean(b.alerts.length)) - Number(Boolean(a.alerts.length)) || (a.device.display_name || a.device.device_id).localeCompare(b.device.display_name || b.device.device_id, 'es')).map(entry => {
        const latestStatus = entry.latest ? readableStatus(entry.latest, entry.project) : 'Sin estado reportado';
        const currentAlert = primaryAlert(entry.alerts);
        return `<tr class="device-row${entry.connection.connected ? '' : ' stale-row'}">
          <td class="company-name-cell"><strong>${esc(entry.project.organization_name)}</strong><span>Cliente registrado</span></td>
          <td>${esc(entry.project.name)}</td>
          <td><button class="device-name-button" type="button" data-open-device="${esc(entry.device.device_id)}" data-project-id="${esc(entry.project.id)}">${esc(entry.device.display_name || entry.device.device_id)}</button><span class="stale-note">${esc(entry.device.device_id)}</span></td>
          <td><span class="pill${entry.connection.connected ? '' : ' offline'}">${entry.connection.connected ? 'Comunicando' : 'Sin comunicación'}</span></td>
          <td>${entry.latest ? `<span class="pill${entry.connection.connected && normalizedStatus(entry.latest) === 'ONLINE' ? ' info' : ' warning'}">${entry.connection.connected ? '' : 'Último: '}${esc(latestStatus)}</span>${entry.connection.connected ? '' : '<span class="stale-note">Sin confirmar actualmente</span>'}` : '<span class="pill neutral">Sin datos</span>'}</td>
          <td>${entry.latest ? esc(formatTime(entry.latest.received_at)) : 'Nunca'}<span class="${entry.connection.connected ? 'muted' : 'stale-note'}">${entry.latest ? `${entry.connection.connected ? ' · Hace ' : 'Sin datos desde hace '}${esc(formatDuration(entry.connection.ageMs))}` : 'Esperando primera lectura'}</span></td>
          <td>${currentAlert ? `<span class="pill${currentAlert.severity === 'critical' ? ' offline' : ' warning'}">${esc(currentAlert.title)}</span>` : '<span class="pill neutral">Sin alertas</span>'}</td>
          <td><button class="app-button secondary row-action" type="button" data-open-device="${esc(entry.device.device_id)}" data-project-id="${esc(entry.project.id)}">Abrir equipo</button></td>
        </tr>`;
      }).join('');
      return `<tr class="company-group-row"><td colspan="8">${esc(group.name)} · ${group.entries.length} dispositivo${group.entries.length === 1 ? '' : 's'}</td></tr>${rows}`;
    }).join('') : '<tr><td colspan="8" class="empty">No hay dispositivos asignados en la vista seleccionada.</td></tr>';
  }

  function renderOverview() {
    if (workspace.is_platform_admin) {
      renderDeviceSelector();
      renderAdminOverview();
      return;
    }
    elements.adminPriority.classList.add('hidden');
    elements.adminCompanySwitcher.classList.add('hidden');
    elements.adminDetailContext.classList.add('hidden');
    $('#overview-table-title').textContent = 'Estado general de los equipos';
    $('#overview-table-description').textContent = 'Selecciona un dispositivo para consultar su ficha completa';
    $('#table-guidance').innerHTML = '<strong>Importante:</strong> si un dispositivo aparece sin comunicación, los valores mostrados son su última lectura guardada; no representan necesariamente el estado actual.';
    $('#summary-card-1-label').textContent = 'Dispositivos';
    $('#summary-card-1-note').textContent = 'Equipos registrados en la plataforma';
    $('#summary-card-2-label').textContent = 'Comunicando ahora';
    $('#summary-card-2-note').textContent = 'Enviaron datos en los últimos 30 segundos';
    $('#summary-card-3-label').textContent = 'Sin comunicación';
    $('#summary-card-3-note').textContent = 'Más de 30 segundos sin reportar datos';
    $('#summary-card-4-label').textContent = 'Alertas activas';
    const items = latestDevices();
    const metrics = activeMetrics();
    const now = Date.now();
    const summaries = items.map(item => ({ ...item, connection: connectionState(item.latest, now), alerts: currentAlerts(item.latest, now) }));
    const connected = summaries.filter(item => item.connection.connected).length;
    $('#device-count').textContent = items.length;
    $('#online-count').textContent = connected;
    $('#offline-count').textContent = items.length - connected;
    $('#active-alert-count').textContent = summaries.reduce((sum, item) => sum + item.alerts.length, 0);

    elements.deviceTableHead.innerHTML = `<th>Dispositivo</th><th>Comunicación</th><th>${esc(preset().statusLabel)}</th><th>Último dato recibido</th>${metrics.map(metric => `<th>${esc(metric.label)}</th>`).join('')}<th>Alertas</th><th></th>`;
    const columns = 6 + metrics.length;
    elements.deviceRows.innerHTML = summaries.length ? summaries.map(({ deviceId, latest, connection, alerts }) => {
      const status = readableStatus(latest);
      const statusClass = normalizedStatus(latest) === 'ONLINE' && connection.connected ? ' info' : ' warning';
      const statusCell = latest
        ? (connection.connected ? `<span class="pill${statusClass}">${esc(status)}</span>` : `<span class="pill${statusClass}">Último: ${esc(status)}</span><span class="stale-note">Sin confirmar actualmente</span>`)
        : '<span class="pill neutral">Sin datos</span>';
      const metricCells = metrics.map(metric => `<td>${overviewMetric(metricValue(latest, metric), metric.unit, connection.connected)}</td>`).join('');
      return `<tr class="device-row${connection.connected ? '' : ' stale-row'}">
        <td><button class="device-name-button" type="button" data-open-device="${esc(deviceId)}">${esc(deviceLabel(deviceId))}</button><span class="stale-note">${esc(deviceId)}</span></td>
        <td><span class="pill${connection.connected ? '' : ' offline'}">${connection.connected ? 'Comunicando' : 'Sin comunicación'}</span></td>
        <td>${statusCell}</td>
        <td>${latest ? esc(formatTime(latest.received_at)) : 'Nunca'}<br><span class="${connection.connected ? 'muted' : 'stale-note'}">${latest ? `${connection.connected ? 'Recibido hace' : 'Sin datos desde hace'} ${esc(formatDuration(connection.ageMs))}` : 'Esperando primera lectura'}</span></td>
        ${metricCells}<td><span class="pill${alerts.length ? ' warning' : ' neutral'}">${alerts.length}</span></td>
        <td><button class="app-button secondary row-action" type="button" data-open-device="${esc(deviceId)}">Abrir equipo</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="${columns}" class="empty">No hay equipos vinculados. Agrégalos desde “Mis dispositivos”.</td></tr>`;

    renderDeviceSelector();
  }

  function renderCharts(records) {
    const metrics = activeMetrics();
    elements.chartsGrid.innerHTML = metrics.length ? metrics.map((metric, index) => `
      <article class="chart-card" style="--chart-color:${colors[index % colors.length]}">
        <div class="chart-header"><div class="chart-title"><span class="chart-accent"></span><div><h3>${esc(metric.label)}</h3><span>${esc(metric.description)}</span></div></div><strong id="current-${esc(metric.key)}" class="chart-current">—</strong></div>
        <div id="chart-${esc(metric.key)}" class="chart" role="img" aria-label="Gráfica de ${esc(metric.label.toLowerCase())}"></div>
      </article>`).join('') : '<section class="section-card"><div class="empty">El dispositivo todavía no ha reportado variables numéricas.</div></section>';
    metrics.forEach(metric => renderLineChart(metric, records));
  }

  function renderLineChart(metric, records) {
    const container = $(`#chart-${metric.key}`);
    const current = $(`#current-${metric.key}`);
    if (!container || !current) return;
    const points = records.map(record => ({ time: new Date(record.received_at), value: metricValue(record, metric) }))
      .filter(point => Number.isFinite(point.time.getTime()) && point.value !== null);
    current.textContent = formatMetric(points.length ? points[points.length - 1].value : null, metric.unit);
    if (!points.length) {
      container.innerHTML = `<div class="chart-empty"><div><strong>Sin datos de ${esc(metric.label.toLowerCase())}</strong>Esta variable todavía no fue incluida por el dispositivo.</div></div>`;
      return;
    }
    const width = 720, height = 260, margin = { top: 14, right: 16, bottom: 36, left: 53 };
    const plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
    const values = points.map(point => point.value);
    let minimum = metric.fixedMin ?? Math.min(...values), maximum = metric.fixedMax ?? Math.max(...values);
    if (minimum === maximum) { minimum -= Math.max(Math.abs(minimum) * .05, 1); maximum += Math.max(Math.abs(maximum) * .05, 1); }
    else if (metric.fixedMin === undefined) { const padding = (maximum - minimum) * .12; minimum -= padding; maximum += padding; }
    const xAt = index => margin.left + (points.length === 1 ? plotWidth / 2 : index * plotWidth / (points.length - 1));
    const yAt = value => margin.top + (maximum - value) * plotHeight / (maximum - minimum);
    const coordinates = points.map((point, index) => ({ ...point, x: xAt(index), y: yAt(point.value) }));
    const linePath = coordinates.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const areaPath = `${linePath} L ${coordinates.at(-1).x.toFixed(2)} ${(margin.top + plotHeight).toFixed(2)} L ${coordinates[0].x.toFixed(2)} ${(margin.top + plotHeight).toFixed(2)} Z`;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4, y = margin.top + ratio * plotHeight, value = maximum - ratio * (maximum - minimum);
      return `<line class="chart-grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}"/><text class="chart-axis-text" x="${margin.left - 9}" y="${y + 3}" text-anchor="end">${esc(Number(value.toFixed(1)))}</text>`;
    }).join('');
    const indexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    const labels = indexes.map((index, position) => `<text class="chart-axis-text" x="${xAt(index)}" y="${height - 10}" text-anchor="${position === 0 ? 'start' : (position === indexes.length - 1 ? 'end' : 'middle')}">${esc(points[index].time.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</text>`).join('');
    const circles = coordinates.map(point => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"><title>${esc(`${point.time.toLocaleString('es-MX')}: ${formatMetric(point.value, metric.unit)}`)}</title></circle>`).join('');
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${grid}<path class="chart-area" d="${areaPath}"/><path class="chart-line" d="${linePath}"/>${circles}${labels}</svg>`;
  }

  function renderDeviceDetail() {
    const deviceId = elements.deviceSelect.value;
    if (workspace.is_platform_admin && currentProject) {
      $('#admin-detail-context-title').textContent = `${currentProject.organization_name} · ${currentProject.name}`;
      $('#admin-detail-context-device').textContent = deviceId ? deviceLabel(deviceId) : 'Sin dispositivo seleccionado';
    }
    const limit = Number(elements.rangeSelect.value) || 100;
    const descending = allRecords.filter(record => record.device_id === deviceId);
    const records = descending.slice(0, limit).reverse();
    const latest = records.at(-1);
    const hasData = Boolean(latest);
    $('#device-detail-content').classList.toggle('hidden', !hasData);
    $('#device-detail-empty').classList.toggle('hidden', hasData);
    $('#device-range-meta').textContent = hasData ? `${records.length} de ${descending.length} mediciones cargadas` : 'Esperando la primera lectura del equipo';
    if (!hasData) return;

    const now = Date.now(), connection = connectionState(latest, now), disconnections = detectDisconnections(records, now);
    const activeDisconnection = disconnections.find(incident => incident.active);
    const alerts = currentAlerts(latest, now), alertHistory = buildAlertHistory(records, disconnections);
    const totalDowntime = disconnections.reduce((sum, incident) => sum + incident.durationMs, 0);
    $('#detail-device').textContent = deviceLabel(deviceId);
    $('#detail-connection').textContent = connection.connected ? 'Comunicando datos' : 'Sin comunicación';
    $('#detail-downtime').textContent = activeDisconnection ? `Hace ${formatDuration(activeDisconnection.durationMs)} que no se reciben datos` : 'El dispositivo está reportando normalmente';
    $('#detail-ups-status').textContent = readableStatus(latest);
    $('#detail-ups-note').textContent = connection.connected ? 'Confirmado en el reporte más reciente' : 'Dato histórico sin confirmar actualmente';
    if (currentProject.project_type === 'ups') $('#detail-ups-note').textContent += ` · interfaz UPS: ${interfaceDescription(latest)}`;
    $('#detail-last-seen').textContent = new Date(latest.received_at).toLocaleTimeString('es-MX');
    $('#detail-last-age').textContent = `${formatTime(latest.received_at)} · recibido hace ${formatDuration(connection.ageMs)}`;
    $('#detail-disconnections').textContent = disconnections.length;
    $('#detail-total-downtime').textContent = `${formatDuration(totalDowntime)} en el periodo`;
    $('#detail-alerts').textContent = alerts.length;
    $('#detail-alerts-note').textContent = alerts.length ? 'Hay situaciones que requieren revisión' : 'No hay alertas activas';

    $('#alerts-list').innerHTML = alertHistory.length ? alertHistory.map(alert => `<article class="incident-item"><span class="incident-icon${alert.severity === 'critical' ? ' critical' : ''}">!</span><div class="incident-copy"><strong>${esc(alert.title)}</strong><span>${esc(alert.message)}</span></div><time class="incident-time">${esc(new Date(alert.time).toLocaleString('es-MX'))}</time></article>`).join('') : '<div class="empty">No se detectaron alertas en este periodo.</div>';
    $('#disconnect-list').innerHTML = disconnections.length ? disconnections.map(incident => `<article class="incident-item"><span class="incident-icon critical">!</span><div class="incident-copy"><strong>${incident.active ? 'Sin comunicación con el dispositivo' : 'Comunicación recuperada'}</strong><span>${incident.active ? 'Tiempo sin recibir datos' : 'Duración de la interrupción'}: ${esc(formatDuration(incident.durationMs))}.</span></div><time class="incident-time">${esc(new Date(incident.startedAt).toLocaleString('es-MX'))}${incident.endedAt ? `<br>hasta ${esc(new Date(incident.endedAt).toLocaleString('es-MX'))}` : '<br>en curso'}</time></article>`).join('') : '<div class="empty">No se detectaron desconexiones en este periodo.</div>';

    const metrics = activeMetrics();
    elements.historyTableHead.innerHTML = `<th>Fecha y hora</th><th>${esc(preset().statusLabel)}</th>${metrics.map(metric => `<th>${esc(metric.label)}</th>`).join('')}<th>Secuencia</th>`;
    elements.historyRows.innerHTML = descending.slice(0, limit).map(record => `<tr><td>${esc(new Date(record.received_at).toLocaleString('es-MX'))}</td><td><span class="pill${normalizedStatus(record) === 'ONLINE' ? ' info' : ' warning'}">${esc(readableStatus(record))}</span></td>${metrics.map(metric => `<td>${esc(formatMetric(metricValue(record, metric), metric.unit))}</td>`).join('')}<td>${esc(record.sequence)}</td></tr>`).join('');
    renderCharts(records);
  }

  function mergeLatestRecords(records) {
    const merged = new Map();
    [...records, ...allRecords].forEach(record => { const key = record.id || `${record.device_id}|${record.sequence}`; if (!merged.has(key)) merged.set(key, record); });
    return [...merged.values()].sort((a, b) => validTime(b) - validTime(a)).slice(0, 5000);
  }

  function mergeGlobalRecords(records) {
    const merged = new Map();
    [...records, ...globalRecords].forEach(record => {
      const key = record.id || `${record.project_id}|${record.device_id}|${record.sequence}`;
      if (!merged.has(key)) merged.set(key, record);
    });
    return [...merged.values()].sort((a, b) => validTime(b) - validTime(a)).slice(0, 5000);
  }

  async function loadGlobalRecords(fullHistory = false) {
    if (!workspace.is_platform_admin || loadingGlobalRecords) return;
    loadingGlobalRecords = true;
    $('#update-state').textContent = 'Actualizando condiciones de toda la plataforma…';
    try {
      const collected = [], pages = fullHistory ? 5 : 1;
      for (let page = 0; page < pages; page += 1) {
        const start = page * 1000;
        const { data, error } = await client.from('telemetry').select('*').order('received_at', { ascending: false }).range(start, start + 999);
        if (error) throw error;
        collected.push(...data);
        if (data.length < 1000) break;
      }
      globalRecords = fullHistory ? collected : mergeGlobalRecords(collected);
      renderAdminOverview();
      $('#last-update').textContent = `Actualizado: ${new Date().toLocaleTimeString('es-MX')} · ${globalRecords.length} lecturas recientes supervisadas`;
      setServerState(true, 'Servidor conectado');
    } catch (error) {
      $('#last-update').textContent = `No fue posible actualizar el resumen global: ${error.message}`;
      $('#update-state').textContent = 'No fue posible calcular las condiciones actuales';
      setServerState(false, 'Servidor sin conexión');
    } finally {
      loadingGlobalRecords = false;
    }
  }

  async function loadRecords(fullHistory = false) {
    if (loadingRecords || !currentProject) return;
    loadingRecords = true;
    $('#update-state').textContent = 'Actualizando el resumen…';
    try {
      const collected = [], pages = fullHistory ? 5 : 1;
      for (let page = 0; page < pages; page += 1) {
        const start = page * 1000;
        const { data, error } = await client.from('telemetry').select('*').eq('project_id', currentProject.id).order('received_at', { ascending: false }).range(start, start + 999);
        if (error) throw error;
        collected.push(...data);
        if (data.length < 1000) break;
      }
      allRecords = fullHistory ? collected : mergeLatestRecords(collected);
      if (workspace.is_platform_admin) renderDeviceSelector();
      else renderOverview();
      renderDeviceDetail(); renderDeviceCatalog();
      if (!workspace.is_platform_admin) {
        $('#last-update').textContent = `Actualizado: ${new Date().toLocaleTimeString('es-MX')} · ${allRecords.length} mediciones de este proyecto`;
        $('#update-state').textContent = 'Situaciones que requieren revisión';
      }
      setServerState(true, 'Servidor conectado');
    } catch (error) {
      $('#last-update').textContent = `Error: ${error.message}`;
      $('#update-state').textContent = 'No fue posible actualizar las alertas';
      setServerState(false, 'Servidor sin conexión');
    } finally { loadingRecords = false; }
  }

  async function loadWorkspace() {
    const { data, error } = await client.rpc('get_my_workspace');
    if (error) throw error;
    return data || { profile: {}, projects: [] };
  }

  function subscribeToProject() {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    if (workspace.is_platform_admin) {
      realtimeChannel = client.channel('telemetry-platform-admin')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry' }, () => {
          loadGlobalRecords(false);
          if (currentProject && !$('#device-panel').classList.contains('hidden')) loadRecords(false);
        })
        .subscribe();
      return;
    }
    if (!currentProject) return;
    realtimeChannel = client.channel(`telemetry-${currentProject.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry', filter: `project_id=eq.${currentProject.id}` }, () => loadRecords(false))
      .subscribe();
  }

  async function activateProject(projectId, options = {}) {
    currentProject = workspace.projects.find(project => project.id === projectId) || workspace.projects[0] || null;
    if (!currentProject) {
      if (workspace.is_platform_admin) {
        applyAdministratorIdentity();
        elements.projectSelect.classList.add('hidden');
        showView('dashboard');
        showPanel('overview-panel');
        subscribeToProject();
        await loadGlobalRecords(true);
      } else {
        showView('pending');
      }
      return;
    }
    localStorage.setItem('monitor-current-project', currentProject.id);
    allRecords = [];
    renderProjectSelector(); applyProjectPreset(); renderDeviceCatalog();
    if (workspace.is_platform_admin) renderAdminOverview();
    else renderOverview();
    subscribeToProject();
    showView('dashboard');
    await loadRecords(true);
    if (options.deviceId) elements.deviceSelect.value = options.deviceId;
    showPanel(options.panel || 'overview-panel');
  }

  async function bootstrapSession(session) {
    const token = ++bootToken;
    if (!session) {
      workspace = { profile: {}, projects: [] }; currentProject = null; allRecords = []; globalRecords = []; adminCompanyFilter = 'all';
      elements.adminNav.classList.add('hidden');
      showView('login'); return;
    }
    try {
      workspace = await loadWorkspace();
      if (token !== bootToken) return;
      elements.adminNav.classList.toggle('hidden', !workspace.is_platform_admin);
      if (workspace.is_platform_admin) {
        currentProject = workspace.projects?.find(project => project.id === localStorage.getItem('monitor-current-project')) || workspace.projects?.[0] || null;
        applyAdministratorIdentity();
        renderProjectSelector();
        showView('dashboard');
        showPanel('overview-panel');
        subscribeToProject();
        await loadGlobalRecords(true);
        return;
      }
      if (!workspace.projects?.length) {
        showView('pending');
        return;
      }
      const remembered = localStorage.getItem('monitor-current-project');
      await activateProject(workspace.projects.some(project => project.id === remembered) ? remembered : workspace.projects[0].id);
    } catch (error) {
      showView('login');
      elements.loginMessage.textContent = `La cuenta inició sesión, pero no se pudo cargar su espacio privado. Verifica que supabase_multitenant.sql se haya ejecutado. Detalle: ${error.message}`;
    }
  }

  async function openDevice(deviceId, projectId = currentProject?.id) {
    if (!deviceId) return;
    if (workspace.is_platform_admin && projectId && (currentProject?.id !== projectId || !allRecords.length)) {
      await activateProject(projectId, { panel: 'device-panel', deviceId });
    }
    elements.deviceSelect.value = deviceId;
    if (workspace.is_platform_admin && currentProject) {
      $('#admin-detail-context-title').textContent = `${currentProject.organization_name} · ${currentProject.name}`;
      $('#admin-detail-context-device').textContent = deviceLabel(deviceId);
      elements.adminDetailContext.classList.remove('hidden');
    }
    showPanel('device-panel');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  elements.loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client) return;
    elements.loginMessage.textContent = 'Ingresando…'; elements.loginButton.disabled = true;
    const { error } = await client.auth.signInWithPassword({ email: $('#email').value, password: elements.password.value });
    elements.loginButton.disabled = false;
    elements.loginMessage.textContent = error ? 'No se pudo iniciar sesión. Verifica tu correo y contraseña.' : '';
  });
  elements.loginForm.addEventListener('reset', () => { elements.loginMessage.textContent = ''; setTimeout(() => $('#email').focus(), 0); });
  elements.passwordToggle.addEventListener('click', () => {
    const showing = elements.password.type === 'text';
    elements.password.type = showing ? 'password' : 'text';
    elements.passwordToggle.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
    elements.passwordToggle.setAttribute('title', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  elements.adminWorkspaceForm.addEventListener('submit', async event => {
    event.preventDefault();
    elements.adminWorkspaceButton.disabled = true;
    elements.adminWorkspaceMessage.textContent = 'Preparando la cuenta y el entorno…';
    const email = $('#admin-user-email').value.trim();
    const password = $('#admin-user-password').value;
    const displayName = $('#admin-user-name').value.trim();
    let accountCreated = false;
    try {
      if (password) {
        await createCompanyAccount(email, password, displayName);
        accountCreated = true;
      }
      const { error } = await client.rpc('admin_create_workspace', {
        p_user_email: email,
        p_display_name: displayName,
        p_company_name: $('#admin-company-name').value.trim(),
        p_business_description: $('#admin-company-description').value.trim(),
        p_project_name: $('#admin-project-name').value.trim(),
        p_project_type: $('#admin-project-type').value
      });
      if (error) throw new Error(error.message);
      elements.adminWorkspaceForm.reset();
      elements.adminWorkspaceMessage.textContent = 'Empresa, usuario y proyecto creados correctamente.';
      await refreshWorkspace();
      showPanel('admin-panel');
    } catch (error) {
      elements.adminWorkspaceMessage.textContent = accountCreated
        ? `La cuenta fue creada, pero faltó preparar su entorno: ${error.message}. Deja la contraseña vacía al reintentar.`
        : `No fue posible completar el registro: ${error.message}`;
    } finally {
      elements.adminWorkspaceButton.disabled = false;
    }
  });

  elements.adminDeviceForm.addEventListener('submit', async event => {
    event.preventDefault();
    elements.adminDeviceButton.disabled = true;
    elements.adminDeviceMessage.textContent = 'Guardando la asignación…';
    const { error } = await client.rpc('admin_assign_device', {
      p_project_id: elements.adminProjectSelect.value,
      p_device_id: $('#admin-device-id').value.trim(),
      p_display_name: $('#admin-device-name').value.trim(),
      p_device_type: $('#admin-device-type').value
    });
    elements.adminDeviceButton.disabled = false;
    if (error) {
      elements.adminDeviceMessage.textContent = `No fue posible asignar el dispositivo: ${error.message}`;
      return;
    }
    elements.adminDeviceForm.reset();
    elements.adminDeviceMessage.textContent = 'Dispositivo asignado correctamente.';
    await refreshWorkspace();
    showPanel('admin-panel');
  });

  document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => {
    showPanel(button.dataset.panel);
    if (button.dataset.panel === 'device-panel' && workspace.is_platform_admin && currentProject && !allRecords.length) loadRecords(true);
  }));
  document.querySelectorAll('[data-show-overview]').forEach(button => button.addEventListener('click', () => {
    showPanel('overview-panel');
    if (workspace.is_platform_admin) loadGlobalRecords(false);
  }));
  elements.deviceRows.addEventListener('click', event => {
    const trigger = event.target.closest('[data-open-device]');
    if (trigger) openDevice(trigger.dataset.openDevice, trigger.dataset.projectId);
  });
  elements.deviceCatalog.addEventListener('click', event => { const trigger = event.target.closest('[data-open-device]'); if (trigger) openDevice(trigger.dataset.openDevice); });
  elements.adminDeviceCatalog.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-admin-unassign]');
    if (!trigger) return;
    const deviceId = trigger.dataset.adminUnassign;
    if (!window.confirm(`¿Retirar ${deviceId} de su empresa? Las lecturas anteriores dejarán de ser visibles para el cliente.`)) return;
    trigger.disabled = true;
    elements.adminDeviceMessage.textContent = `Retirando ${deviceId}…`;
    const { error } = await client.rpc('admin_unassign_device', { p_device_id: deviceId });
    if (error) {
      elements.adminDeviceMessage.textContent = `No fue posible retirar el dispositivo: ${error.message}`;
      trigger.disabled = false;
      return;
    }
    elements.adminDeviceMessage.textContent = `${deviceId} fue retirado correctamente.`;
    await refreshWorkspace();
    showPanel('admin-panel');
  });
  elements.adminCompanyChips.addEventListener('click', event => {
    const trigger = event.target.closest('[data-company-filter]');
    if (!trigger) return;
    adminCompanyFilter = trigger.dataset.companyFilter;
    renderAdminOverview();
  });
  elements.deviceSelect.addEventListener('change', renderDeviceDetail);
  elements.rangeSelect.addEventListener('change', renderDeviceDetail);
  elements.projectSelect.addEventListener('change', () => activateProject(elements.projectSelect.value));
  elements.adminInventoryProject.addEventListener('change', () => activateProject(elements.adminInventoryProject.value, { panel: 'devices-panel' }));
  elements.logout.addEventListener('click', () => client.auth.signOut());
  $('#pending-logout').addEventListener('click', () => client.auth.signOut());
  $('#refresh').addEventListener('click', () => workspace.is_platform_admin ? loadGlobalRecords(true) : loadRecords(true));
  $('#admin-refresh').addEventListener('click', loadAdminCatalog);

  if (!client) {
    elements.loginButton.disabled = true;
    elements.loginMessage.textContent = `Configuración incompleta en Render: ${config.error}`;
  } else {
    client.auth.onAuthStateChange((_event, session) => setTimeout(() => bootstrapSession(session), 0));
    setInterval(() => {
      if (elements.dashboard.classList.contains('hidden')) return;
      if (workspace.is_platform_admin && !$('#overview-panel').classList.contains('hidden')) loadGlobalRecords(false);
      else loadRecords(false);
    }, 5000);
  }
}());
