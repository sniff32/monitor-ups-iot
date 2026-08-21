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
    adminCompanyChips: $('#admin-company-chips'), adminCompanySelect: $('#admin-company-select'),
    adminDetailContext: $('#admin-detail-context'),
    adminInventorySwitcher: $('#admin-inventory-switcher'), adminInventoryProject: $('#admin-inventory-project'),
    adminThresholdForm: $('#admin-threshold-form'), adminThresholdDevice: $('#admin-threshold-device'),
    adminThresholdButton: $('#admin-threshold-button'), adminThresholdMessage: $('#admin-threshold-message'),
    intelligenceHistoryList: $('#intelligence-history-list')
  };

  const rules = {
    offlineAfterMs: 30_000,
    adminUrgentAfterMs: 5 * 60_000,
    minimumStatisticalSamples: 8,
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
        { key: 'water_temperature_c', keys: ['water_temperature_c'], unit: '°C', label: 'Temperatura del agua', description: 'Temperatura reportada por la sonda' },
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

  const metricDefinitions = {
    input_voltage: { unit: 'V', label: 'Voltaje de entrada', description: 'Tensión eléctrica recibida por el equipo' },
    output_voltage: { unit: 'V', label: 'Voltaje de salida', description: 'Tensión eléctrica entregada por el equipo' },
    battery_voltage: { unit: 'V', label: 'Voltaje de batería', description: 'Tensión reportada por la batería' },
    load_percent: { unit: '%', label: 'Carga', description: 'Porcentaje de capacidad utilizada', fixedMin: 0, fixedMax: 100 },
    battery_percent: { unit: '%', label: 'Nivel de batería', description: 'Porcentaje de batería disponible', fixedMin: 0, fixedMax: 100 },
    temperature_c: { unit: '°C', label: 'Temperatura', description: 'Temperatura reportada por el dispositivo' },
    water_temperature_c: { unit: '°C', label: 'Temperatura del agua', description: 'Temperatura reportada por la sonda' },
    input_current_a: { unit: 'A', label: 'Corriente de entrada', description: 'Corriente recibida por el equipo' },
    output_current_a: { unit: 'A', label: 'Corriente de salida', description: 'Corriente entregada por el equipo' },
    battery_current_a: { unit: 'A', label: 'Corriente de batería', description: 'Corriente reportada por la batería' },
    active_power_w: { unit: 'W', label: 'Potencia activa', description: 'Potencia activa reportada' },
    apparent_power_va: { unit: 'VA', label: 'Potencia aparente', description: 'Potencia aparente reportada' },
    reactive_power_var: { unit: 'var', label: 'Potencia reactiva', description: 'Potencia reactiva reportada' },
    energy_wh: { unit: 'Wh', label: 'Energía acumulada', description: 'Energía acumulada reportada' },
    energy_kwh: { unit: 'kWh', label: 'Energía acumulada', description: 'Energía acumulada reportada' },
    input_frequency_hz: { unit: 'Hz', label: 'Frecuencia de entrada', description: 'Frecuencia eléctrica recibida' },
    output_frequency_hz: { unit: 'Hz', label: 'Frecuencia de salida', description: 'Frecuencia eléctrica entregada' },
    frequency_hz: { unit: 'Hz', label: 'Frecuencia', description: 'Frecuencia reportada por el equipo' },
    runtime_minutes: { unit: 'min', label: 'Autonomía estimada', description: 'Tiempo de funcionamiento restante' },
    power_factor: { unit: '', label: 'Factor de potencia', description: 'Relación entre potencia activa y aparente' },
    humidity_percent: { unit: '%', label: 'Humedad ambiental', description: 'Humedad relativa reportada', fixedMin: 0, fixedMax: 100 },
    soil_moisture_percent: { unit: '%', label: 'Humedad del suelo', description: 'Humedad reportada por la sonda', fixedMin: 0, fixedMax: 100 },
    water_level_percent: { unit: '%', label: 'Nivel del agua', description: 'Nivel de agua reportado', fixedMin: 0, fixedMax: 100 },
    ph: { unit: 'pH', label: 'pH', description: 'Nivel de acidez o alcalinidad', fixedMin: 0, fixedMax: 14 },
    dissolved_oxygen_mg_l: { unit: 'mg/L', label: 'Oxígeno disuelto', description: 'Oxígeno disuelto reportado' },
    light_lux: { unit: 'lx', label: 'Iluminación', description: 'Nivel de iluminación reportado' },
    signal_dbm: { unit: 'dBm', label: 'Señal celular', description: 'Potencia de señal recibida por el módem' },
    signal_percent: { unit: '%', label: 'Calidad de señal', description: 'Calidad de señal reportada', fixedMin: 0, fixedMax: 100 }
  };

  const directMetricKeys = ['input_voltage', 'output_voltage', 'battery_voltage', 'load_percent', 'temperature_c'];

  let workspace = { profile: {}, projects: [] };
  let currentProject = null;
  let allRecords = [];
  let loadingRecords = false;
  let recordsLoadVersion = 0;
  let globalRecords = [];
  let loadingGlobalRecords = false;
  let adminCompanyFilter = 'all';
  let realtimeChannel = null;
  let bootToken = 0;
  let adminCatalog = { organizations: [], projects: [], members: [], devices: [] };
  let thresholdRecords = [];
  let intelligenceEvents = [];
  let healthRecords = [];
  let intelligenceStorageAvailable = true;
  const lastIntelligenceSync = new Map();

  const numberValue = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  function thresholdsForDevice(device) {
    const stored = thresholdRecords.find(item => item.device_uuid === device?.id) || {};
    const numeric = (key, fallback) => numberValue(stored[key]) ?? fallback;
    return {
      offline_seconds: numeric('offline_seconds', rules.offlineAfterMs / 1000),
      urgent_offline_seconds: numeric('urgent_offline_seconds', rules.adminUrgentAfterMs / 1000),
      input_voltage_min: numeric('input_voltage_min', rules.inputMin),
      input_voltage_max: numeric('input_voltage_max', rules.inputMax),
      output_voltage_min: numeric('output_voltage_min', rules.outputMin),
      output_voltage_max: numeric('output_voltage_max', rules.outputMax),
      battery_voltage_min: numeric('battery_voltage_min', rules.batteryMin),
      load_percent_max: numeric('load_percent_max', rules.loadMax),
      temperature_c_max: numeric('temperature_c_max', rules.temperatureMax),
      metric_limits: stored.metric_limits || {}
    };
  }

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

  function inferredUnit(key) {
    if (key === 'ph') return 'pH';
    const suffixes = [
      ['_percent', '%'], ['_pct', '%'], ['_temperature_c', '°C'], ['_c', '°C'], ['_temperature_f', '°F'], ['_f', '°F'],
      ['_voltage', 'V'], ['_v', 'V'], ['_current_a', 'A'], ['_kva', 'kVA'], ['_va', 'VA'], ['_a', 'A'],
      ['_frequency_hz', 'Hz'], ['_hz', 'Hz'], ['_energy_kwh', 'kWh'], ['_kwh', 'kWh'],
      ['_energy_wh', 'Wh'], ['_wh', 'Wh'], ['_power_kw', 'kW'], ['_kw', 'kW'], ['_power_w', 'W'], ['_w', 'W'], ['_power_va', 'VA'],
      ['_var', 'var'], ['_minutes', 'min'], ['_seconds', 's'], ['_mg_l', 'mg/L'], ['_ppm', 'ppm'], ['_lux', 'lx'],
      ['_dbm', 'dBm'], ['_rpm', 'rpm'], ['_bar', 'bar'], ['_psi', 'psi']
    ];
    return suffixes.find(([suffix]) => key.endsWith(suffix))?.[1] || '';
  }

  function inferredMetric(key) {
    const known = metricDefinitions[key];
    if (known) return { key, keys: [key], ...known };
    return {
      key, keys: [key], unit: inferredUnit(key), label: humanizeKey(key),
      description: 'Variable detectada automáticamente en la telemetría recibida'
    };
  }

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
    const available = new Set();
    records.forEach(record => {
      if (project?.id && record?.project_id !== project.id) return;
      directMetricKeys.forEach(key => { if (numberValue(record?.[key]) !== null) available.add(key); });
      Object.entries(record?.metric_values || {}).forEach(([key, value]) => {
        if (numberValue(value) !== null) available.add(key);
      });
    });

    const metrics = [];
    const represented = new Set();
    preset(project).metrics.forEach(metric => {
      if (!metric.keys.some(key => available.has(key))) return;
      metrics.push(metric);
      metric.keys.forEach(key => represented.add(key));
    });
    [...available].sort((a, b) => a.localeCompare(b, 'es')).forEach(key => {
      if (represented.has(key)) return;
      metrics.push(inferredMetric(key));
      represented.add(key);
    });
    return metrics;
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
  function connectionState(record, now = Date.now(), thresholds = null) {
    const lastSeen = validTime(record);
    const ageMs = lastSeen ? Math.max(0, now - lastSeen) : Number.POSITIVE_INFINITY;
    const offlineAfterMs = (thresholds?.offline_seconds ?? rules.offlineAfterMs / 1000) * 1000;
    return { connected: Boolean(lastSeen) && ageMs <= offlineAfterMs, lastSeen, ageMs, offlineAfterMs };
  }

  function measurementAlerts(record, project = currentProject, thresholds = null) {
    if (!record) return [];
    const limits = thresholds || thresholdsForDevice(null);
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
      } else if (status === 'FAULT') {
        push('device-status', 'critical', 'Falla reportada por el UPS', 'El UPS informó una condición de falla que requiere atención inmediata.');
      } else if (status !== 'ONLINE') {
        push('device-status', 'warning', `Estado del UPS: ${readableStatus(record, project)}`, 'El equipo informó una condición que requiere revisión.');
      }
      const metrics = activeMetrics(project, [record]);
      const temperature = metricValue(record, metrics.find(metric => metric.key === 'temperature_c') || { keys: [] });
      const input = metricValue(record, { keys: ['input_voltage'] });
      const output = metricValue(record, { keys: ['output_voltage'] });
      const battery = metricValue(record, { keys: ['battery_voltage'] });
      const load = metricValue(record, { keys: ['load_percent'] });
      if (input !== null && (input < limits.input_voltage_min || input > limits.input_voltage_max)) push('input-voltage', 'critical', 'Voltaje de entrada fuera de rango', `Lectura: ${formatMetric(input, 'V')}.`);
      if (output !== null && (output < limits.output_voltage_min || output > limits.output_voltage_max)) push('output-voltage', 'critical', 'Voltaje de salida fuera de rango', `Lectura: ${formatMetric(output, 'V')}.`);
      if (battery !== null && battery < limits.battery_voltage_min) push('battery-voltage', 'critical', 'Batería baja', `Lectura: ${formatMetric(battery, 'V')}.`);
      if (load !== null && load >= limits.load_percent_max) push('high-load', 'warning', 'Carga elevada', `Lectura: ${formatMetric(load, '%')}.`);
      if (temperature !== null && temperature >= limits.temperature_c_max) push('temperature', 'warning', 'Temperatura elevada', `Lectura: ${formatMetric(temperature, '°C')}.`);
    } else if (!['ONLINE', 'OK'].includes(status)) {
      push('device-status', status === 'FAULT' ? 'critical' : 'warning', `Estado reportado: ${readableStatus(record, project)}`, 'El sensor informó una condición distinta al funcionamiento normal.');
    }
    const specialized = new Set(['input_voltage', 'output_voltage', 'battery_voltage', 'load_percent', 'temperature_c']);
    activeMetrics(project, [record]).forEach(metric => {
      if (project?.project_type === 'ups' && specialized.has(metric.key)) return;
      const configured = limits.metric_limits?.[metric.key];
      if (!configured || typeof configured !== 'object') return;
      const minimum = numberValue(configured.min);
      const maximum = numberValue(configured.max);
      const reading = metricValue(record, metric);
      if (reading === null) return;
      if (minimum !== null && reading < minimum) {
        push(`configured-${metric.key}-minimum`, 'critical', `${metric.label} por debajo del límite`, `Lectura: ${formatMetric(reading, metric.unit)}; mínimo configurado: ${formatMetric(minimum, metric.unit)}.`);
      } else if (maximum !== null && reading > maximum) {
        push(`configured-${metric.key}-maximum`, 'critical', `${metric.label} por encima del límite`, `Lectura: ${formatMetric(reading, metric.unit)}; máximo configurado: ${formatMetric(maximum, metric.unit)}.`);
      }
    });
    return alerts;
  }

  function currentAlerts(record, now = Date.now(), project = currentProject, thresholds = null) {
    const connection = connectionState(record, now, thresholds);
    if (connection.connected) return measurementAlerts(record, project, thresholds);
    return [{
      key: 'connection', severity: 'critical',
      title: record ? 'Sin comunicación con el dispositivo' : 'El dispositivo todavía no envía datos',
      message: record ? `La plataforma lleva ${formatDuration(connection.ageMs)} sin recibir datos.` : 'Verifica que el equipo tenga el host, puerto e identificación correctos.',
      time: connection.lastSeen ? connection.lastSeen + connection.offlineAfterMs : now
    }];
  }

  function detectDisconnections(recordsAscending, now = Date.now(), thresholds = null) {
    const offlineAfterMs = (thresholds?.offline_seconds ?? rules.offlineAfterMs / 1000) * 1000;
    const incidents = [];
    for (let index = 1; index < recordsAscending.length; index += 1) {
      const previousTime = validTime(recordsAscending[index - 1]);
      const currentTime = validTime(recordsAscending[index]);
      if (previousTime && currentTime && currentTime - previousTime > offlineAfterMs) {
        const startedAt = previousTime + offlineAfterMs;
        incidents.push({ startedAt, endedAt: currentTime, durationMs: currentTime - startedAt, active: false });
      }
    }
    const latestTime = validTime(recordsAscending[recordsAscending.length - 1]);
    if (latestTime && now - latestTime > offlineAfterMs) {
      const startedAt = latestTime + offlineAfterMs;
      incidents.push({ startedAt, endedAt: null, durationMs: now - startedAt, active: true });
    }
    return incidents.sort((a, b) => b.startedAt - a.startedAt);
  }

  function buildAlertHistory(recordsAscending, disconnections, project = currentProject, thresholds = null) {
    const events = [];
    let previousKeys = new Set();
    recordsAscending.forEach(record => {
      const alerts = measurementAlerts(record, project, thresholds);
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

  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const standardDeviation = values => {
    if (values.length < 2) return 0;
    const mean = average(values);
    return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
  };

  function intelligenceIssue({ key, category, severity = 'warning', urgent = false, score = 50, title, message, recommendation, time, samples = 0 }) {
    return {
      key, category, severity, urgent, score, title, message, recommendation, time,
      confidence: samples >= 20 ? 'Alta' : (samples >= rules.minimumStatisticalSamples ? 'Media' : 'Inicial')
    };
  }

  function analyzeDeviceIntelligence(records, project, device, now = Date.now()) {
    if (!project || !device) return [];
    const thresholds = thresholdsForDevice(device);
    const scoped = records
      .filter(record => record.project_id === project.id && record.device_id === device.device_id)
      .sort((a, b) => validTime(a) - validTime(b));
    const latest = scoped.at(-1);
    if (!latest) {
      return [intelligenceIssue({
        key: 'no-data', category: 'revision', score: 45,
        title: 'Equipo pendiente de primera lectura',
        message: 'Todavía no existen datos suficientes para evaluar su condición.',
        recommendation: 'Verificar identificación, conectividad y puesta en servicio del dispositivo.',
        time: now
      })];
    }

    const issues = [];
    const push = issue => {
      if (!issues.some(existing => existing.key === issue.key)) issues.push(intelligenceIssue(issue));
    };
    const connection = connectionState(latest, now, thresholds);
    if (!connection.connected) {
      const urgent = connection.ageMs >= thresholds.urgent_offline_seconds * 1000;
      push({
        key: 'connection-loss', category: 'corrective', severity: urgent ? 'critical' : 'warning', urgent,
        score: urgent ? 96 : 78,
        title: urgent ? 'Pérdida prolongada de comunicación' : 'Comunicación interrumpida',
        message: `No se reciben datos desde hace ${formatDuration(connection.ageMs)}.`,
        recommendation: 'Revisar alimentación, red celular o Ethernet, configuración del servidor y cableado del equipo.',
        time: validTime(latest) + thresholds.offline_seconds * 1000, samples: scoped.length
      });
    } else {
      measurementAlerts(latest, project, thresholds).forEach(alert => push({
        key: `reported-${alert.key}`,
        category: alert.severity === 'critical' ? 'corrective' : 'preventive',
        severity: alert.severity,
        urgent: alert.severity === 'critical',
        score: alert.severity === 'critical' ? 94 : 72,
        title: alert.title,
        message: alert.message,
        recommendation: alert.severity === 'critical'
          ? 'Atender el equipo de inmediato y confirmar la recuperación antes de cerrar la incidencia.'
          : 'Programar una inspección preventiva y comprobar si la condición vuelve a presentarse.',
        time: alert.time, samples: scoped.length
      }));
    }

    const disconnections = detectDisconnections(scoped, now, thresholds);
    if (disconnections.length >= 3) {
      push({
        key: 'repeated-disconnections', category: 'preventive', score: Math.min(88, 62 + disconnections.length * 4),
        title: 'Comunicación inestable',
        message: `Se detectaron ${disconnections.length} pérdidas de comunicación dentro del periodo analizado.`,
        recommendation: 'Revisar señal, alimentación, antena, cableado y estabilidad de la conexión antes de que ocurra una interrupción permanente.',
        time: disconnections[0].startedAt, samples: scoped.length
      });
    }

    const metrics = activeMetrics(project, scoped);
    const seriesFor = metric => scoped.map(record => metricValue(record, metric)).filter(value => value !== null);
    const specializedKeys = new Set();

    if (project.project_type === 'ups') {
      const inspectVoltage = (key, minimum, maximum, label) => {
        const metric = metrics.find(item => item.keys.includes(key));
        if (!metric) return;
        specializedKeys.add(metric.key);
        const values = seriesFor(metric).slice(-20);
        if (values.length < 5) return;
        const outOfRange = values.filter(value => value < minimum || value > maximum).length;
        const deviation = standardDeviation(values);
        if (outOfRange >= 3 || deviation >= 4) push({
          key: `${key}-instability`, category: 'preventive', score: Math.min(89, 65 + outOfRange * 3),
          title: `${label} inestable`,
          message: `${outOfRange} de las últimas ${values.length} lecturas estuvieron fuera del rango esperado; desviación ${Number(deviation.toFixed(2))} V.`,
          recommendation: 'Programar revisión de alimentación, conexiones y regulación del UPS.',
          time: validTime(latest), samples: values.length
        });
      };
      inspectVoltage('input_voltage', thresholds.input_voltage_min, thresholds.input_voltage_max, 'Voltaje de entrada');
      inspectVoltage('output_voltage', thresholds.output_voltage_min, thresholds.output_voltage_max, 'Voltaje de salida');

      const batteryMetric = metrics.find(item => item.keys.includes('battery_voltage'));
      if (batteryMetric) {
        specializedKeys.add(batteryMetric.key);
        const values = seriesFor(batteryMetric).slice(-20);
        if (values.length >= 8) {
          const segment = Math.max(3, Math.floor(values.length / 3));
          const initial = average(values.slice(0, segment));
          const recent = average(values.slice(-segment));
          const drop = initial - recent;
          if (drop >= Math.max(.5, initial * .05) && recent >= thresholds.battery_voltage_min) push({
            key: 'battery-degradation', category: 'preventive', score: 82,
            title: 'Posible degradación de batería',
            message: `El promedio reciente bajó ${Number(drop.toFixed(2))} V respecto al inicio del periodo.`,
            recommendation: 'Programar prueba de autonomía y revisión del banco de baterías.',
            time: validTime(latest), samples: values.length
          });
        }
      }

      const sustainedRules = [
        ['load_percent', thresholds.load_percent_max * .9, 'Carga sostenida elevada', 'Redistribuir cargas y revisar la capacidad disponible del UPS.'],
        ['temperature_c', thresholds.temperature_c_max * .9, 'Temperatura sostenida elevada', 'Revisar ventilación, limpieza y condiciones ambientales del equipo.']
      ];
      sustainedRules.forEach(([key, threshold, title, recommendation]) => {
        const metric = metrics.find(item => item.keys.includes(key));
        if (!metric) return;
        specializedKeys.add(metric.key);
        const values = seriesFor(metric).slice(-10);
        if (values.length >= 5 && average(values) >= threshold) push({
          key: `${key}-sustained`, category: 'preventive', score: 80,
          title, message: `El promedio de las últimas ${values.length} lecturas es ${formatMetric(average(values), metric.unit)}.`,
          recommendation, time: validTime(latest), samples: values.length
        });
      });
    }

    metrics.forEach(metric => {
      if (specializedKeys.has(metric.key)) return;
      const values = seriesFor(metric).slice(-40);
      if (values.length < rules.minimumStatisticalSamples) return;
      const latestValue = values.at(-1);
      const baseline = values.slice(0, -1);
      const mean = average(baseline);
      const deviation = standardDeviation(baseline);
      const naturalTolerance = Math.max(Math.abs(mean) * .03, .1);
      const difference = Math.abs(latestValue - mean);
      if (difference >= Math.max(deviation * 3.5, naturalTolerance * 3)) push({
        key: `${metric.key}-outlier`, category: 'preventive', score: difference >= Math.max(deviation * 5, naturalTolerance * 5) ? 88 : 74,
        title: `Comportamiento atípico en ${metric.label.toLowerCase()}`,
        message: `Último valor: ${formatMetric(latestValue, metric.unit)}; promedio anterior: ${formatMetric(mean, metric.unit)}.`,
        recommendation: 'Confirmar la lectura, inspeccionar el sensor y revisar la tendencia antes de que evolucione a una falla.',
        time: validTime(latest), samples: values.length
      });
    });

    return issues.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.score - a.score).slice(0, 8);
  }

  function calculateDeviceHealth(issues, hasData = true) {
    if (!hasData) return { score: 50, label: 'Sin evaluar', summary: 'No existen lecturas suficientes para evaluar el equipo.', factors: ['Sin telemetría'] };
    let penalty = 0;
    issues.forEach(issue => {
      if (issue.urgent) penalty += 45;
      else if (issue.severity === 'critical') penalty += 32;
      else if (issue.category === 'corrective') penalty += 25;
      else if (issue.category === 'preventive') penalty += 14;
      else penalty += 7;
    });
    const score = Math.max(0, Math.min(100, 100 - penalty));
    const label = score >= 90 ? 'Saludable' : (score >= 70 ? 'Observacion' : (score >= 40 ? 'Preventivo' : 'Correctivo'));
    const displayLabel = label === 'Observacion' ? 'Observación' : label;
    const summary = issues.length
      ? `${displayLabel}: ${issues[0].title}.`
      : 'Saludable: no se detectaron condiciones anormales en el periodo analizado.';
    return { score, label, summary, factors: issues.slice(0, 8).map(issue => ({ key: issue.key, title: issue.title, score: issue.score })) };
  }

  function intelligenceStorageError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)
      || message.includes('device_thresholds')
      || message.includes('intelligence_events')
      || message.includes('device_health')
      || message.includes('sync_device_intelligence');
  }

  async function loadIntelligenceStorage(projectId = null) {
    if (!intelligenceStorageAvailable) return;
    try {
      let eventsQuery = client.from('intelligence_events').select('*').order('last_detected_at', { ascending: false }).limit(500);
      let healthQuery = client.from('device_health').select('*');
      if (projectId) {
        eventsQuery = eventsQuery.eq('project_id', projectId);
        healthQuery = healthQuery.eq('project_id', projectId);
      }
      const [thresholdResult, eventResult, healthResult] = await Promise.all([
        client.from('device_thresholds').select('*'), eventsQuery, healthQuery
      ]);
      const error = thresholdResult.error || eventResult.error || healthResult.error;
      if (error) throw error;
      thresholdRecords = thresholdResult.data || [];
      intelligenceEvents = eventResult.data || [];
      healthRecords = healthResult.data || [];
    } catch (error) {
      if (intelligenceStorageError(error)) {
        intelligenceStorageAvailable = false;
        thresholdRecords = [];
        intelligenceEvents = [];
        healthRecords = [];
        return;
      }
      console.warn('No fue posible actualizar los datos del asistente inteligente.', error);
    }
  }

  function issuePayload(issue) {
    return {
      key: issue.key,
      category: issue.category,
      severity: issue.severity,
      urgent: Boolean(issue.urgent),
      score: issue.score,
      confidence: issue.confidence,
      title: issue.title,
      message: issue.message,
      recommendation: issue.recommendation,
      evidence: { detected_at: issue.time ? new Date(issue.time).toISOString() : new Date().toISOString() }
    };
  }

  async function syncDeviceIntelligence(project, device, issues, health) {
    if (!intelligenceStorageAvailable || !project?.id || !device?.device_id) return;
    const key = `${project.id}|${device.device_id}`;
    const payload = issues.map(issuePayload);
    const signature = JSON.stringify({
      payload: payload.map(({ evidence, message, ...issue }) => issue),
      health: { score: health.score, label: health.label, factors: health.factors }
    });
    const previous = lastIntelligenceSync.get(key);
    const elapsed = previous ? Date.now() - previous.time : Number.POSITIVE_INFINITY;
    if (previous && elapsed < (previous.signature === signature ? 60_000 : 10_000)) return;
    lastIntelligenceSync.set(key, { signature, time: Date.now() });
    const { error } = await client.rpc('sync_device_intelligence', {
      p_project_id: project.id,
      p_device_id: device.device_id,
      p_issues: payload,
      p_health_score: health.score,
      p_health_label: health.label,
      p_health_summary: health.summary,
      p_factors: health.factors
    });
    if (error) {
      lastIntelligenceSync.delete(key);
      if (intelligenceStorageError(error)) intelligenceStorageAvailable = false;
    }
  }

  function renderIntelligenceHistory(deviceId) {
    if (!elements.intelligenceHistoryList) return;
    const meta = $('#intelligence-history-meta');
    if (!intelligenceStorageAvailable) {
      meta.textContent = 'Pendiente de activar';
      meta.className = 'pill warning';
      elements.intelligenceHistoryList.innerHTML = '<div class="empty">Ejecuta <b>supabase_intelligence.sql</b> para conservar los diagnósticos.</div>';
      return;
    }
    const events = intelligenceEvents
      .filter(event => event.project_id === currentProject?.id && event.device_id === deviceId)
      .sort((a, b) => new Date(b.last_detected_at) - new Date(a.last_detected_at));
    const active = events.filter(event => event.status === 'active').length;
    meta.textContent = events.length ? `${active} activo${active === 1 ? '' : 's'} · ${events.length} registrado${events.length === 1 ? '' : 's'}` : 'Sin diagnósticos guardados';
    meta.className = `pill${active ? ' warning' : ' neutral'}`;
    elements.intelligenceHistoryList.innerHTML = events.length ? events.map(event => {
      const resolved = event.status === 'resolved';
      const classification = event.classification === 'corrective' ? 'Correctivo' : (event.classification === 'preventive' ? 'Preventivo' : 'Revisión');
      return `<article class="incident-item"><span class="incident-icon${event.severity === 'critical' ? ' critical' : ''}">${resolved ? '✓' : '!'}</span><div class="incident-copy"><strong>${esc(event.title)}</strong><span>${esc(event.message)}</span><span><b>${esc(classification)}:</b> ${esc(event.recommendation)}</span></div><time class="incident-time"><b>${resolved ? 'Resuelto' : 'Activo'}</b><br>Primera detección: ${esc(formatTime(event.first_detected_at))}<br>Última revisión: ${esc(formatTime(event.last_detected_at))}</time></article>`;
    }).join('') : '<div class="empty">Todavía no hay diagnósticos guardados para este dispositivo.</div>';
  }

  function healthClass(health) {
    return health.score >= 90 ? 'health-good' : (health.score >= 40 ? 'health-watch' : 'health-critical');
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

  function projectContextForDevice(deviceId, project = currentProject) {
    if (!project) return project;
    const device = (Array.isArray(project.devices) ? project.devices : []).find(item => item.device_id === deviceId);
    const deviceType = String(device?.device_type || '').trim().toLowerCase();
    if (!deviceType || !presets[deviceType] || deviceType === project.project_type) return project;
    return { ...project, project_type: deviceType };
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
      ? 'Reglas eléctricas, tendencias, variaciones y eventos reportados por el UPS'
      : 'Tendencias, valores atípicos y eventos reportados por los sensores';
    $('#threshold-note').textContent = currentProject.project_type === 'ups'
      ? 'Análisis orientativo: considera desconexiones, límites eléctricos, promedios, dispersión, tendencias y repetición de fallas. No sustituye la inspección de un técnico calificado.'
      : 'Análisis orientativo: compara cada variable con su propio historial para detectar cambios atípicos y tendencias. No sustituye la inspección de un técnico calificado.';
    $('#disconnect-threshold-note').textContent = 'La plataforma marca una pérdida de comunicación cuando se supera el límite configurado para este dispositivo.';
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

    const previousThresholdDevice = elements.adminThresholdDevice.value;
    const assignedDevices = devices.filter(device => device.project_id);
    elements.adminThresholdDevice.innerHTML = '<option value="">Selecciona un dispositivo</option>' + assignedDevices.map(device =>
      `<option value="${esc(device.device_id)}">${esc(device.organization_name)} · ${esc(device.project_name)} · ${esc(device.display_name || device.device_id)}</option>`
    ).join('');
    if (assignedDevices.some(device => device.device_id === previousThresholdDevice)) {
      elements.adminThresholdDevice.value = previousThresholdDevice;
    }
    fillThresholdForm(elements.adminThresholdDevice.value);
  }

  function fillThresholdForm(deviceId) {
    const device = (adminCatalog.devices || []).find(item => item.device_id === deviceId);
    const thresholds = thresholdsForDevice(device);
    $('#threshold-offline-seconds').value = thresholds.offline_seconds;
    $('#threshold-urgent-seconds').value = thresholds.urgent_offline_seconds;
    $('#threshold-input-min').value = thresholds.input_voltage_min;
    $('#threshold-input-max').value = thresholds.input_voltage_max;
    $('#threshold-output-min').value = thresholds.output_voltage_min;
    $('#threshold-output-max').value = thresholds.output_voltage_max;
    $('#threshold-battery-min').value = thresholds.battery_voltage_min;
    $('#threshold-load-max').value = thresholds.load_percent_max;
    $('#threshold-temperature-max').value = thresholds.temperature_c_max;
    elements.adminThresholdButton.disabled = !device;
    const dynamicContainer = $('#admin-dynamic-limits');
    const baseProject = device ? (adminCatalog.projects || []).find(project => project.id === device.project_id) : null;
    const isUps = Boolean(device) && (device.device_type === 'ups' || (!device.device_type && baseProject?.project_type === 'ups'));
    document.querySelectorAll('.electrical-threshold').forEach(field => field.classList.toggle('hidden', !isUps));
    if (!device) {
      dynamicContainer.innerHTML = '<div class="empty">Selecciona un dispositivo para consultar sus variables.</div>';
      return;
    }
    const deviceProject = { ...(baseProject || { id: device.project_id, project_type: 'generic' }), project_type: device.device_type || baseProject?.project_type || 'generic' };
    const records = globalRecords.filter(record => record.project_id === device.project_id && record.device_id === device.device_id);
    const specialized = new Set(['input_voltage', 'output_voltage', 'battery_voltage', 'load_percent', 'temperature_c']);
    const metrics = activeMetrics(deviceProject, records).filter(metric => !(deviceProject.project_type === 'ups' && specialized.has(metric.key)));
    Object.keys(thresholds.metric_limits || {}).forEach(key => {
      if (!metrics.some(metric => metric.key === key)) metrics.push(inferredMetric(key));
    });
    dynamicContainer.innerHTML = metrics.length ? '<div class="dynamic-limit-header"><span>Variable supervisada</span><span>Límite mínimo</span><span>Límite máximo</span></div>' + metrics.map(metric => {
      const configured = thresholds.metric_limits?.[metric.key] || {};
      return `<div class="dynamic-limit-item" data-metric-key="${esc(metric.key)}"><strong>${esc(metric.label)}${metric.unit ? ` (${esc(metric.unit)})` : ''}</strong><label><span class="dynamic-limit-mobile-label">Mínimo</span><input data-limit-min type="number" step="any" value="${numberValue(configured.min) ?? ''}" placeholder="Sin límite" aria-label="Límite mínimo de ${esc(metric.label)}"></label><label><span class="dynamic-limit-mobile-label">Máximo</span><input data-limit-max type="number" step="any" value="${numberValue(configured.max) ?? ''}" placeholder="Sin límite" aria-label="Límite máximo de ${esc(metric.label)}"></label></div>`;
    }).join('') : '<div class="empty">Este dispositivo aún no ha transmitido variables adicionales. Aparecerán aquí después de su primera lectura.</div>';
  }

  async function loadAdminCatalog() {
    if (!workspace.is_platform_admin) return;
    const { data, error } = await client.rpc('admin_get_catalog');
    if (error) {
      elements.adminCompanyCatalog.innerHTML = `<div class="empty">No fue posible cargar la administración: ${esc(error.message)}</div>`;
      return;
    }
    adminCatalog = data || { organizations: [], projects: [], members: [], devices: [] };
    await loadIntelligenceStorage(null);
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
    const histories = new Map();
    globalRecords.forEach(record => {
      const key = `${record.project_id || ''}|${record.device_id || ''}`;
      if (record.device_id && !latest.has(key)) latest.set(key, record);
      if (!histories.has(key)) histories.set(key, []);
      histories.get(key).push(record);
    });
    return (workspace.projects || []).flatMap(project => (project.devices || []).map(device => {
      const key = `${project.id}|${device.device_id}`;
      const record = latest.get(key) || null;
      const history = histories.get(key) || [];
      const deviceProject = projectContextForDevice(device.device_id, project);
      const thresholds = thresholdsForDevice(device);
      const connection = connectionState(record, now, thresholds);
      const alerts = currentAlerts(record, now, deviceProject, thresholds);
      const intelligence = analyzeDeviceIntelligence(history, deviceProject, device, now);
      const health = calculateDeviceHealth(intelligence, Boolean(record));
      const maintenanceAlerts = intelligence.filter(issue => ['preventive', 'corrective'].includes(issue.category));
      return { project, device, deviceProject, latest: record, connection, alerts, intelligence, health, maintenanceAlerts };
    }));
  }

  function primaryAlert(alerts) {
    return [...alerts].sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'))[0] || null;
  }

  function renderAdminCompanyChips(entries) {
    const companies = new Map();
    (workspace.projects || []).forEach(project => {
      if (!companies.has(project.organization_id)) companies.set(project.organization_id, { name: project.organization_name, projects: [] });
      companies.get(project.organization_id).projects.push(project);
    });
    if (adminCompanyFilter !== 'all' && !companies.has(adminCompanyFilter)) adminCompanyFilter = 'all';
    const sortedCompanies = [...companies.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'));
    elements.adminCompanySelect.innerHTML = '<option value="all">Todas las empresas</option>' + sortedCompanies.map(([id, company]) =>
      `<option value="${esc(id)}">${esc(company.name)}</option>`
    ).join('');
    elements.adminCompanySelect.value = adminCompanyFilter;
    elements.adminCompanyChips.innerHTML = sortedCompanies.map(([id, company]) => {
        const count = entries.filter(entry => entry.project.organization_id === id).length;
        const projectCount = company.projects.length;
        return `<button class="company-chip${adminCompanyFilter === id ? ' active' : ''}" type="button" data-company-filter="${esc(id)}">
          <span class="company-chip-icon" aria-hidden="true">▦</span>
          <span><strong>${esc(company.name)}</strong><span>${projectCount} proyecto${projectCount === 1 ? '' : 's'} · ${count} dispositivo${count === 1 ? '' : 's'}</span></span>
        </button>`;
      }).join('');
    const selectedName = adminCompanyFilter === 'all' ? 'Todas las empresas' : companies.get(adminCompanyFilter)?.name;
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
    entries.forEach(entry => { void syncDeviceIntelligence(entry.project, entry.device, entry.intelligence, entry.health); });
    const companies = new Set((workspace.projects || []).map(project => project.organization_id));
    const alertEntries = entries.filter(entry => entry.intelligence.length);
    const maintenanceEntries = entries.filter(entry => entry.maintenanceAlerts.length);
    $('#summary-card-1-label').textContent = 'Empresas';
    $('#summary-card-1-note').textContent = 'Entornos empresariales registrados';
    $('#summary-card-2-label').textContent = 'Dispositivos';
    $('#summary-card-2-note').textContent = 'Equipos asignados a las empresas';
    $('#summary-card-3-label').textContent = 'Alertas activas';
    $('#summary-card-3-note').textContent = 'Equipos que requieren revisión';
    $('#summary-card-4-label').textContent = 'Requieren mantenimiento';
    $('#summary-card-2').classList.add('admin-device-card');
    $('#summary-card-4').classList.add('admin-maintenance-card');
    $('#device-count').textContent = companies.size;
    $('#online-count').textContent = entries.length;
    $('#offline-count').textContent = alertEntries.length;
    $('#active-alert-count').textContent = maintenanceEntries.length;
    $('#update-state').textContent = 'Diagnóstico estadístico de mantenimiento';

    renderAdminCompanyChips(entries);
    const filtered = adminCompanyFilter === 'all'
      ? entries
      : entries.filter(entry => entry.project.organization_id === adminCompanyFilter);
    const selectedCompanyName = adminCompanyFilter === 'all'
      ? ''
      : workspace.projects.find(project => project.organization_id === adminCompanyFilter)?.organization_name || '';
    $('#overview-table-title').textContent = adminCompanyFilter === 'all'
      ? 'Equipos de todas las empresas'
      : `Equipos de ${selectedCompanyName}`;
    $('#admin-priority-heading').textContent = 'Urgencias detectadas por el asistente inteligente';
    $('#admin-priority-heading').nextElementSibling.textContent = 'El administrador general recibe únicamente situaciones que requieren atención inmediata.';
    const priority = filtered.flatMap(entry => entry.intelligence
      .filter(issue => issue.urgent)
      .map(issue => ({ entry, issue })))
      .sort((a, b) => b.issue.score - a.issue.score || validTime(a.entry.latest) - validTime(b.entry.latest));
    $('#admin-priority-meta').textContent = priority.length ? `${priority.length} urgencia${priority.length === 1 ? '' : 's'} activa${priority.length === 1 ? '' : 's'}` : 'Sin urgencias activas';
    $('#admin-priority-meta').className = `pill${priority.length ? ' warning' : ''}`;
    elements.adminNotificationList.innerHTML = priority.length ? `<div class="admin-notification-header"><span></span><span>Empresa</span><span>Dispositivo</span><span>Diagnóstico</span><span>Prioridad</span><span>Acción</span></div>` + priority.slice(0, 8).map(({ entry, issue }) => {
      return `<article class="admin-notification critical">
        <span class="admin-priority-icon">!</span>
        <div><span class="company">${esc(entry.project.organization_name)}</span><span class="device">${esc(entry.project.name)}</span></div>
        <div class="device"><strong>${esc(entry.device.display_name || entry.device.device_id)}</strong><span>${esc(entry.device.device_id)}</span></div>
        <div class="problem"><strong>${esc(issue.title)}</strong><span>${esc(issue.message)}</span></div>
        <time>${esc(issue.score)}/100 · confianza ${esc(issue.confidence.toLowerCase())}</time>
        <div class="notification-state"><span class="pill offline">Atención urgente</span><span class="stale-note">${esc(issue.recommendation)}</span></div>
      </article>`;
    }).join('') : '<div class="admin-notification-empty"><span>✓</span>No hay necesidades urgentes en la vista seleccionada.</div>';

    elements.deviceTableHead.innerHTML = '<th>Empresa</th><th>Proyecto</th><th>Dispositivo</th><th>Comunicación</th><th>Salud</th><th>Último estado reportado</th><th>Último dato recibido</th><th>Alerta</th><th></th>';
    const grouped = new Map();
    filtered.forEach(entry => {
      const key = entry.project.organization_id;
      if (!grouped.has(key)) grouped.set(key, { name: entry.project.organization_name, entries: [] });
      grouped.get(key).entries.push(entry);
    });
    elements.deviceRows.innerHTML = grouped.size ? [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(group => {
      const rows = group.entries.sort((a, b) => Number(Boolean(b.alerts.length)) - Number(Boolean(a.alerts.length)) || (a.device.display_name || a.device.device_id).localeCompare(b.device.display_name || b.device.device_id, 'es')).map(entry => {
        const latestStatus = entry.latest ? readableStatus(entry.latest, entry.deviceProject) : 'Sin estado reportado';
        const currentAlert = entry.intelligence[0] || primaryAlert(entry.alerts);
        return `<tr class="device-row${entry.connection.connected ? '' : ' stale-row'}">
          <td class="company-name-cell"><strong>${esc(entry.project.organization_name)}</strong><span>Cliente registrado</span></td>
          <td>${esc(entry.project.name)}</td>
          <td><button class="device-name-button" type="button" data-open-device="${esc(entry.device.device_id)}" data-project-id="${esc(entry.project.id)}">${esc(entry.device.display_name || entry.device.device_id)}</button><span class="stale-note">${esc(entry.device.device_id)}</span></td>
          <td><span class="pill${entry.connection.connected ? '' : ' offline'}">${entry.connection.connected ? 'Comunicando' : 'Sin comunicación'}</span></td>
          <td><span class="pill${entry.health.score < 40 ? ' offline' : (entry.health.score < 90 ? ' warning' : ' info')}">${esc(entry.health.score)}/100 · ${esc(entry.health.label === 'Observacion' ? 'Observación' : entry.health.label)}</span></td>
          <td>${entry.latest ? `<span class="pill${entry.connection.connected && normalizedStatus(entry.latest) === 'ONLINE' ? ' info' : ' warning'}">${entry.connection.connected ? '' : 'Último: '}${esc(latestStatus)}</span>${entry.connection.connected ? '' : '<span class="stale-note">Sin confirmar actualmente</span>'}` : '<span class="pill neutral">Sin datos</span>'}</td>
          <td>${entry.latest ? esc(formatTime(entry.latest.received_at)) : 'Nunca'}<span class="${entry.connection.connected ? 'muted' : 'stale-note'}">${entry.latest ? `${entry.connection.connected ? ' · Hace ' : 'Sin datos desde hace '}${esc(formatDuration(entry.connection.ageMs))}` : 'Esperando primera lectura'}</span></td>
          <td>${currentAlert ? `<span class="pill${currentAlert.severity === 'critical' ? ' offline' : ' warning'}">${esc(currentAlert.title)}</span>` : '<span class="pill neutral">Sin alertas</span>'}</td>
          <td><button class="app-button secondary row-action" type="button" data-open-device="${esc(entry.device.device_id)}" data-project-id="${esc(entry.project.id)}">Abrir equipo</button></td>
        </tr>`;
      }).join('');
      return `<tr class="company-group-row"><td colspan="9">${esc(group.name)} · ${group.entries.length} dispositivo${group.entries.length === 1 ? '' : 's'}</td></tr>${rows}`;
    }).join('') : '<tr><td colspan="9" class="empty">No hay dispositivos asignados en la vista seleccionada.</td></tr>';
  }

  function renderOverview() {
    if (workspace.is_platform_admin) {
      renderDeviceSelector();
      renderAdminOverview();
      return;
    }
    elements.adminPriority.classList.remove('hidden');
    elements.adminCompanySwitcher.classList.add('hidden');
    elements.adminDetailContext.classList.add('hidden');
    $('#admin-priority-heading').textContent = 'Asistente inteligente de mantenimiento';
    $('#admin-priority-heading').nextElementSibling.textContent = 'Análisis estadístico exclusivo de los equipos de tu empresa.';
    $('#overview-table-title').textContent = 'Estado general de los equipos';
    $('#overview-table-description').textContent = 'Selecciona un dispositivo para consultar su ficha completa';
    $('#table-guidance').innerHTML = '<strong>Importante:</strong> si un dispositivo aparece sin comunicación, los valores mostrados son su última lectura guardada; no representan necesariamente el estado actual.';
    $('#summary-card-1-label').textContent = 'Dispositivos';
    $('#summary-card-1-note').textContent = 'Equipos registrados en la plataforma';
    $('#summary-card-2-label').textContent = 'Comunicando ahora';
    $('#summary-card-2-note').textContent = 'Dentro del límite configurado por equipo';
    $('#summary-card-3-label').textContent = 'Sin comunicación';
    $('#summary-card-3-note').textContent = 'Fuera del límite configurado por equipo';
    $('#summary-card-4-label').textContent = 'Alertas activas';
    $('#summary-card-2').classList.remove('admin-device-card');
    $('#summary-card-4').classList.remove('admin-maintenance-card');
    const items = latestDevices();
    const metrics = activeMetrics();
    const now = Date.now();
    const summaries = items.map(item => {
      const device = deviceDefinition(item.deviceId) || { device_id: item.deviceId, display_name: item.deviceId, device_type: currentProject?.project_type || 'generic' };
      const deviceProject = projectContextForDevice(item.deviceId);
      const history = allRecords.filter(record => record.project_id === currentProject?.id && record.device_id === item.deviceId);
      const thresholds = thresholdsForDevice(device);
      const intelligence = analyzeDeviceIntelligence(history, deviceProject, device, now);
      return {
        ...item, device, deviceProject,
        connection: connectionState(item.latest, now, thresholds),
        alerts: currentAlerts(item.latest, now, deviceProject, thresholds),
        intelligence,
        health: calculateDeviceHealth(intelligence, Boolean(item.latest))
      };
    });
    summaries.forEach(item => { void syncDeviceIntelligence(currentProject, item.device, item.intelligence, item.health); });
    const connected = summaries.filter(item => item.connection.connected).length;
    $('#device-count').textContent = items.length;
    $('#online-count').textContent = connected;
    $('#offline-count').textContent = items.length - connected;
    $('#active-alert-count').textContent = summaries.reduce((sum, item) => sum + item.intelligence.length, 0);

    const companyNotifications = summaries.flatMap(item => item.intelligence.map(issue => ({ item, issue })))
      .sort((a, b) => Number(b.issue.urgent) - Number(a.issue.urgent) || b.issue.score - a.issue.score);
    $('#admin-priority-meta').textContent = companyNotifications.length
      ? `${companyNotifications.length} recomendación${companyNotifications.length === 1 ? '' : 'es'}`
      : 'Sin recomendaciones activas';
    $('#admin-priority-meta').className = `pill${companyNotifications.length ? ' warning' : ''}`;
    elements.adminNotificationList.innerHTML = companyNotifications.length
      ? `<div class="admin-notification-header"><span></span><span>Tipo</span><span>Dispositivo</span><span>Diagnóstico</span><span>Confianza</span><span>Acción recomendada</span></div>` + companyNotifications.slice(0, 8).map(({ item, issue }) => {
        const category = issue.category === 'corrective' ? 'Correctivo' : (issue.category === 'preventive' ? 'Preventivo' : 'Revisión');
        return `<article class="admin-notification${issue.severity === 'critical' ? ' critical' : ''}">
          <span class="admin-priority-icon">!</span>
          <div><span class="company">Mantenimiento ${category.toLowerCase()}</span><span class="device">Prioridad ${esc(issue.score)}/100</span></div>
          <div class="device"><strong>${esc(deviceLabel(item.deviceId))}</strong><span>${esc(item.deviceId)}</span></div>
          <div class="problem"><strong>${esc(issue.title)}</strong><span>${esc(issue.message)}</span></div>
          <time>${esc(issue.confidence)}</time>
          <div class="notification-state"><span class="pill${issue.urgent ? ' offline' : ' warning'}">${esc(category)}</span><span class="stale-note">${esc(issue.recommendation)}</span></div>
        </article>`;
      }).join('')
      : '<div class="admin-notification-empty"><span>✓</span>El análisis no detectó condiciones que requieran mantenimiento.</div>';

    elements.deviceTableHead.innerHTML = `<th>Dispositivo</th><th>Comunicación</th><th>Salud</th><th>${esc(preset().statusLabel)}</th><th>Último dato recibido</th>${metrics.map(metric => `<th>${esc(metric.label)}</th>`).join('')}<th>Alertas</th><th></th>`;
    const columns = 7 + metrics.length;
    elements.deviceRows.innerHTML = summaries.length ? summaries.map(({ deviceId, latest, connection, intelligence, health, deviceProject }) => {
      const status = readableStatus(latest, deviceProject);
      const statusClass = normalizedStatus(latest) === 'ONLINE' && connection.connected ? ' info' : ' warning';
      const statusCell = latest
        ? (connection.connected ? `<span class="pill${statusClass}">${esc(status)}</span>` : `<span class="pill${statusClass}">Último: ${esc(status)}</span><span class="stale-note">Sin confirmar actualmente</span>`)
        : '<span class="pill neutral">Sin datos</span>';
      const metricCells = metrics.map(metric => `<td>${overviewMetric(metricValue(latest, metric), metric.unit, connection.connected)}</td>`).join('');
      return `<tr class="device-row${connection.connected ? '' : ' stale-row'}">
        <td><button class="device-name-button" type="button" data-open-device="${esc(deviceId)}">${esc(deviceLabel(deviceId))}</button><span class="stale-note">${esc(deviceId)}</span></td>
        <td><span class="pill${connection.connected ? '' : ' offline'}">${connection.connected ? 'Comunicando' : 'Sin comunicación'}</span></td>
        <td><span class="pill${health.score < 40 ? ' offline' : (health.score < 90 ? ' warning' : ' info')}">${esc(health.score)}/100 · ${esc(health.label === 'Observacion' ? 'Observación' : health.label)}</span></td>
        <td>${statusCell}</td>
        <td>${latest ? esc(formatTime(latest.received_at)) : 'Nunca'}<br><span class="${connection.connected ? 'muted' : 'stale-note'}">${latest ? `${connection.connected ? 'Recibido hace' : 'Sin datos desde hace'} ${esc(formatDuration(connection.ageMs))}` : 'Esperando primera lectura'}</span></td>
        ${metricCells}<td><span class="pill${intelligence.length ? ' warning' : ' neutral'}">${intelligence.length}</span></td>
        <td><button class="app-button secondary row-action" type="button" data-open-device="${esc(deviceId)}">Abrir equipo</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="${columns}" class="empty">No hay equipos vinculados. Agrégalos desde “Mis dispositivos”.</td></tr>`;

    renderDeviceSelector();
  }

  function renderCharts(records, metrics = activeMetrics(currentProject, records)) {
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
    const detailProject = projectContextForDevice(deviceId);
    const selectedDevice = deviceDefinition(deviceId) || { device_id: deviceId, display_name: deviceId, device_type: detailProject?.project_type || 'generic' };
    const thresholds = thresholdsForDevice(selectedDevice);
    if (workspace.is_platform_admin && currentProject) {
      $('#admin-detail-context-title').textContent = `${currentProject.organization_name} · ${currentProject.name}`;
      $('#admin-detail-context-device').textContent = deviceId ? deviceLabel(deviceId) : 'Sin dispositivo seleccionado';
    }
    const limit = Number(elements.rangeSelect.value) || 100;
    const descending = allRecords.filter(record =>
      record.project_id === currentProject?.id && record.device_id === deviceId
    );
    const records = descending.slice(0, limit).reverse();
    const latest = records.at(-1);
    const hasData = Boolean(latest);
    $('#device-detail-content').classList.toggle('hidden', !hasData);
    $('#device-detail-empty').classList.toggle('hidden', hasData);
    $('#device-range-meta').textContent = hasData ? `${records.length} de ${descending.length} mediciones cargadas` : 'Esperando la primera lectura del equipo';
    renderIntelligenceHistory(deviceId);
    if (!hasData) {
      const intelligence = analyzeDeviceIntelligence(descending, detailProject, selectedDevice);
      void syncDeviceIntelligence(currentProject, selectedDevice, intelligence, calculateDeviceHealth(intelligence, false));
      return;
    }

    const now = Date.now(), connection = connectionState(latest, now, thresholds), disconnections = detectDisconnections(records, now, thresholds);
    const activeDisconnection = disconnections.find(incident => incident.active);
    const alertHistory = buildAlertHistory(records, disconnections, detailProject, thresholds);
    const intelligence = analyzeDeviceIntelligence(descending, detailProject, selectedDevice, now);
    const health = calculateDeviceHealth(intelligence, true);
    void syncDeviceIntelligence(currentProject, selectedDevice, intelligence, health);
    const totalDowntime = disconnections.reduce((sum, incident) => sum + incident.durationMs, 0);
    $('#detail-device').textContent = deviceLabel(deviceId);
    $('#detail-connection').textContent = connection.connected ? 'Comunicando datos' : 'Sin comunicación';
    $('#detail-downtime').textContent = activeDisconnection ? `Hace ${formatDuration(activeDisconnection.durationMs)} que no se reciben datos` : 'El dispositivo está reportando normalmente';
    $('#detail-ups-status').textContent = readableStatus(latest, detailProject);
    $('#detail-ups-note').textContent = connection.connected ? 'Confirmado en el reporte más reciente' : 'Dato histórico sin confirmar actualmente';
    if (detailProject?.project_type === 'ups') $('#detail-ups-note').textContent += ` · interfaz UPS: ${interfaceDescription(latest)}`;
    $('#detail-last-seen').textContent = new Date(latest.received_at).toLocaleTimeString('es-MX');
    $('#detail-last-age').textContent = `${formatTime(latest.received_at)} · recibido hace ${formatDuration(connection.ageMs)}`;
    $('#detail-disconnections').textContent = disconnections.length;
    $('#detail-total-downtime').textContent = `${formatDuration(totalDowntime)} en el periodo`;
    $('#detail-alerts').textContent = intelligence.length;
    $('#detail-alerts-note').textContent = intelligence.length ? 'El asistente recomienda una revisión' : 'Sin recomendaciones activas';
    $('#detail-health-score').textContent = `${health.score}/100`;
    $('#detail-health-note').textContent = health.summary;
    const healthCard = $('#detail-health-card');
    healthCard.classList.remove('health-good', 'health-watch', 'health-critical');
    healthCard.classList.add(healthClass(health));
    $('#threshold-note').textContent = detailProject?.project_type === 'ups'
      ? `Límites aplicados a este equipo: comunicación ${thresholds.offline_seconds} s; urgencia ${thresholds.urgent_offline_seconds} s; entrada ${thresholds.input_voltage_min}–${thresholds.input_voltage_max} V; salida ${thresholds.output_voltage_min}–${thresholds.output_voltage_max} V; batería mínima ${thresholds.battery_voltage_min} V; carga máxima ${thresholds.load_percent_max} %; temperatura máxima ${thresholds.temperature_c_max} °C.`
      : `El análisis utiliza el límite de comunicación de ${thresholds.offline_seconds} s y compara cada variable con el historial exclusivo de este dispositivo.`;

    $('#alerts-list').innerHTML = intelligence.length ? intelligence.map(issue => {
      const category = issue.category === 'corrective' ? 'Mantenimiento correctivo' : (issue.category === 'preventive' ? 'Mantenimiento preventivo' : 'Revisión técnica');
      return `<article class="incident-item"><span class="incident-icon${issue.severity === 'critical' ? ' critical' : ''}">!</span><div class="incident-copy"><strong>${esc(issue.title)}</strong><span>${esc(issue.message)}</span><span><b>${esc(category)}:</b> ${esc(issue.recommendation)}</span></div><time class="incident-time">Prioridad ${esc(issue.score)}/100<br>Confianza ${esc(issue.confidence.toLowerCase())}</time></article>`;
    }).join('') : (alertHistory.length ? alertHistory.map(alert => `<article class="incident-item"><span class="incident-icon${alert.severity === 'critical' ? ' critical' : ''}">!</span><div class="incident-copy"><strong>${esc(alert.title)}</strong><span>${esc(alert.message)}</span></div><time class="incident-time">${esc(new Date(alert.time).toLocaleString('es-MX'))}</time></article>`).join('') : '<div class="empty">El análisis no detectó condiciones que requieran mantenimiento en este periodo.</div>');
    $('#disconnect-list').innerHTML = disconnections.length ? disconnections.map(incident => `<article class="incident-item"><span class="incident-icon critical">!</span><div class="incident-copy"><strong>${incident.active ? 'Sin comunicación con el dispositivo' : 'Comunicación recuperada'}</strong><span>${incident.active ? 'Tiempo sin recibir datos' : 'Duración de la interrupción'}: ${esc(formatDuration(incident.durationMs))}.</span></div><time class="incident-time">${esc(new Date(incident.startedAt).toLocaleString('es-MX'))}${incident.endedAt ? `<br>hasta ${esc(new Date(incident.endedAt).toLocaleString('es-MX'))}` : '<br>en curso'}</time></article>`).join('') : '<div class="empty">No se detectaron desconexiones en este periodo.</div>';

    const metrics = activeMetrics(detailProject, descending);
    elements.historyTableHead.innerHTML = `<th>Fecha y hora</th><th>${esc(preset(detailProject).statusLabel)}</th>${metrics.map(metric => `<th>${esc(metric.label)}</th>`).join('')}<th>Secuencia</th>`;
    elements.historyRows.innerHTML = descending.slice(0, limit).map(record => `<tr><td>${esc(new Date(record.received_at).toLocaleString('es-MX'))}</td><td><span class="pill${normalizedStatus(record) === 'ONLINE' ? ' info' : ' warning'}">${esc(readableStatus(record, detailProject))}</span></td>${metrics.map(metric => `<td>${esc(formatMetric(metricValue(record, metric), metric.unit))}</td>`).join('')}<td>${esc(record.sequence)}</td></tr>`).join('');
    renderCharts(records, metrics);
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
      await loadIntelligenceStorage(null);
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
    if (!currentProject) return;
    const projectId = currentProject.id;
    if (loadingRecords === projectId) return;
    const loadVersion = ++recordsLoadVersion;
    loadingRecords = projectId;
    $('#update-state').textContent = 'Actualizando el resumen…';
    try {
      const collected = [], pages = fullHistory ? 5 : 1;
      for (let page = 0; page < pages; page += 1) {
        const start = page * 1000;
        const { data, error } = await client.from('telemetry').select('*').eq('project_id', projectId).order('received_at', { ascending: false }).range(start, start + 999);
        if (error) throw error;
        collected.push(...data);
        if (data.length < 1000) break;
      }
      if (loadVersion !== recordsLoadVersion || currentProject?.id !== projectId) return;
      const scopedRecords = collected.filter(record => record.project_id === projectId);
      allRecords = fullHistory
        ? scopedRecords
        : mergeLatestRecords(scopedRecords).filter(record => record.project_id === projectId);
      await loadIntelligenceStorage(projectId);
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
    } finally {
      if (loadVersion === recordsLoadVersion) loadingRecords = false;
    }
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
    recordsLoadVersion += 1;
    loadingRecords = false;
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

  async function selectAdministratorCompany(companyId) {
    adminCompanyFilter = companyId;
    if (companyId === 'all') {
      renderAdminOverview();
      return;
    }
    const companyProjects = (workspace.projects || []).filter(project => project.organization_id === companyId);
    if (!companyProjects.length) {
      adminCompanyFilter = 'all';
      renderAdminOverview();
      return;
    }
    const targetProject = companyProjects.find(project => project.id === currentProject?.id) || companyProjects[0];
    if (currentProject?.id !== targetProject.id || !allRecords.length) {
      await activateProject(targetProject.id, { panel: 'overview-panel' });
      return;
    }
    renderAdminOverview();
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

  elements.adminThresholdDevice.addEventListener('change', () => {
    elements.adminThresholdMessage.textContent = '';
    fillThresholdForm(elements.adminThresholdDevice.value);
  });

  elements.adminThresholdForm.addEventListener('submit', async event => {
    event.preventDefault();
    const deviceId = elements.adminThresholdDevice.value;
    const device = (adminCatalog.devices || []).find(item => item.device_id === deviceId);
    if (!device) {
      elements.adminThresholdMessage.textContent = 'Selecciona un dispositivo asignado.';
      return;
    }
    const value = selector => Number($(selector).value);
    const settings = {
      offline: value('#threshold-offline-seconds'), urgent: value('#threshold-urgent-seconds'),
      inputMin: value('#threshold-input-min'), inputMax: value('#threshold-input-max'),
      outputMin: value('#threshold-output-min'), outputMax: value('#threshold-output-max'),
      batteryMin: value('#threshold-battery-min'), loadMax: value('#threshold-load-max'),
      temperatureMax: value('#threshold-temperature-max')
    };
    const metricLimits = {};
    let invalidDynamicLimit = false;
    document.querySelectorAll('#admin-dynamic-limits [data-metric-key]').forEach(row => {
      const minimumText = row.querySelector('[data-limit-min]').value.trim();
      const maximumText = row.querySelector('[data-limit-max]').value.trim();
      const minimum = minimumText === '' ? null : Number(minimumText);
      const maximum = maximumText === '' ? null : Number(maximumText);
      if ((minimum !== null && !Number.isFinite(minimum)) || (maximum !== null && !Number.isFinite(maximum))
          || (minimum !== null && maximum !== null && minimum >= maximum)) {
        invalidDynamicLimit = true;
        return;
      }
      if (minimum !== null || maximum !== null) metricLimits[row.dataset.metricKey] = { min: minimum, max: maximum };
    });
    if (!Object.values(settings).every(Number.isFinite)
        || settings.urgent < settings.offline
        || settings.inputMin >= settings.inputMax
        || settings.outputMin >= settings.outputMax
        || invalidDynamicLimit) {
      elements.adminThresholdMessage.textContent = 'Revisa los valores: los máximos deben superar a los mínimos y la urgencia no puede comenzar antes que la alerta.';
      return;
    }
    elements.adminThresholdButton.disabled = true;
    elements.adminThresholdMessage.textContent = 'Guardando límites privados del dispositivo…';
    const { data, error } = await client.rpc('admin_update_device_thresholds', {
      p_device_id: deviceId,
      p_offline_seconds: settings.offline,
      p_urgent_offline_seconds: settings.urgent,
      p_input_voltage_min: settings.inputMin,
      p_input_voltage_max: settings.inputMax,
      p_output_voltage_min: settings.outputMin,
      p_output_voltage_max: settings.outputMax,
      p_battery_voltage_min: settings.batteryMin,
      p_load_percent_max: settings.loadMax,
      p_temperature_c_max: settings.temperatureMax,
      p_metric_limits: metricLimits
    });
    elements.adminThresholdButton.disabled = false;
    if (error) {
      elements.adminThresholdMessage.textContent = `No fue posible guardar los límites: ${error.message}`;
      return;
    }
    thresholdRecords = thresholdRecords.filter(item => item.device_uuid !== device.id);
    thresholdRecords.push(data);
    lastIntelligenceSync.delete(`${device.project_id}|${device.device_id}`);
    fillThresholdForm(deviceId);
    elements.adminThresholdMessage.textContent = 'Límites guardados. El siguiente análisis utilizará esta configuración.';
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
  elements.adminCompanyChips.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-company-filter]');
    if (!trigger) return;
    await selectAdministratorCompany(trigger.dataset.companyFilter);
  });
  elements.adminCompanySelect.addEventListener('change', async () => {
    await selectAdministratorCompany(elements.adminCompanySelect.value);
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
