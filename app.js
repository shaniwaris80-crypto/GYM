import { appConfig } from './firebase-config.js';
import { exportReportPdf } from './pdf-service.js';

const STORAGE_KEY = 'arslan_tracker_v3_mobile';
const CURRENT_SESSION_KEY = 'arslan_tracker_v3_current_session';
const TIMER_KEY = 'arslan_tracker_v3_timer';
const SOUND_KEY = 'arslan_tracker_v3_sound_allowed';

const el = {
  bootCard: document.getElementById('bootCard'),
  themeBtn: document.getElementById('themeBtn'),
  views: {
    home: document.getElementById('view-home'),
    workout: document.getElementById('view-workout'),
    programs: document.getElementById('view-programs'),
    reports: document.getElementById('view-reports'),
    settings: document.getElementById('view-settings')
  },
  fabTimer: document.getElementById('fabTimer')
};

let firebaseApi = null;
let unsubscribers = [];
let wakeLock = null;
let timerInterval = null;
let timerState = loadJson(TIMER_KEY, { total: 60, remaining: 60, running: false, startedAt: 0, source: '' });
let state = loadState();
let renderQueued = false;
let soundUnlocked = loadJson(SOUND_KEY, false);

const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const inputDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const normalize = (value = '') => String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function ex(name, sets, reps, restSeconds, tempo = '', notes = '') {
  return { id: uid(), name, sets, reps, restSeconds, tempo, notes };
}

function createDefaultProgram() {
  return {
    id: 'prog-default',
    name: 'Rutina base Arslan',
    status: 'active',
    startDate: today(),
    currentWeek: 1,
    notes: 'RIR 2 · descanso general 60 segundos · subida explosiva y bajada controlada 3 segundos salvo indicación normal.',
    days: [
      {
        id: 'day1', title: 'Día 1', subtitle: 'Pecho-bíceps',
        exercises: [
          ex('Press banca plano en multipower', 3, '10', 60, 'Explosiva + negativa 3s'),
          ex('Press superior mancuerna banco 45 grados', 3, '10', 60, 'Normal 1-1', 'Ejecución normal'),
          ex('Cruces de polea alta', 3, '10', 60, 'Explosiva + negativa 3s'),
          ex('Curl mancuerna 1 mano', 2, '8', 60, 'Normal 1-1', 'Ejecución normal'),
          ex('Curl barra Z', 3, '12', 60, 'Explosiva + negativa 3s'),
          ex('Curl concentrado con apoyo en banco', 3, '12', 60, 'Explosiva + negativa 3s')
        ]
      },
      {
        id: 'day2', title: 'Día 2', subtitle: 'Espalda-tríceps',
        exercises: [
          ex('Jalón polea al pecho', 3, '12', 60, 'Explosiva + negativa 3s'),
          ex('Remo sentado en polea abierto', 3, '12', 60, 'Normal 1-1', 'Ejecución normal'),
          ex('Remo mancuerna a 1 mano', 3, '12', 60, 'Normal 1-1', 'Ejecución normal'),
          ex('Tríceps en polea 1 mano sin agarre', 4, '10', 60, 'Explosiva + negativa 3s', 'Agarras de la bola'),
          ex('Press francés mancuernas 2 manos', 3, '10', 60, 'Explosiva + negativa 3s')
        ]
      },
      {
        id: 'day4', title: 'Día 4', subtitle: 'Piernas',
        exercises: [
          ex('Abductores máquina fuera/dentro', 3, '15', 60, 'Explosiva + negativa 3s'),
          ex('Femoral tumbado', 3, '10', 60, 'Explosiva + negativa 3s'),
          ex('Prensa pies al medio', 3, '12', 60, 'Normal 1-1', 'Ejecución normal'),
          ex('Extensiones de cuádriceps máquina', 3, '12', 60, 'Explosiva + negativa 3s'),
          ex('Zancadas dinámicas', 3, '12 cada pierna', 60, 'Normal 1-1', 'Cada pierna')
        ]
      },
      {
        id: 'day5', title: 'Día 5', subtitle: 'Hombros',
        exercises: [
          ex('Press militar multipower', 3, '10', 60, 'Explosiva + negativa 3s'),
          ex('Elevaciones laterales mancuerna', 3, '12', 60, 'Explosiva + negativa 3s'),
          ex('Elevaciones frontales barra', 3, '10', 60, 'Explosiva + negativa 3s'),
          ex('Hombro trasero máquina', 3, '12', 60, 'Normal 1-1', 'Ejecución normal'),
          ex('Encogimientos trapecio mancuernas', 3, '15', 60, 'Explosiva + negativa 3s')
        ]
      }
    ],
    blocks: {
      core: {
        title: 'Core',
        weeklyTarget: 2,
        exercises: [
          ex('Encogimientos muy lentos', 3, '20', 60, 'Lento', 'Suelo o máquina'),
          ex('Elevaciones de piernas estiradas', 3, '20', 60, '1s cerca del suelo', 'Sin tocar suelo'),
          ex('Planchas', 4, '1 minuto', 60, 'Isométrico', '1 min trabajo / 1 min descanso')
        ]
      },
      calves: {
        title: 'Gemelos',
        weeklyTarget: 2,
        exercises: [ex('Elevaciones en bordillo o escalera', 1, '50', 60, 'Controlado', 'Sin descanso')]
      }
    }
  };
}

function createEmptyReport(overrides = {}) {
  return {
    id: uid(),
    date: today(),
    currentWeight: '',
    previousWeight: '',
    weightDelta: '',
    strength: '',
    pump: '',
    recovery: '',
    sleepHours: '',
    dailyRecovery: '',
    cardioSessions: '',
    cardioDuration: '',
    cardioTime: '',
    trainingSessions: '',
    systemWeek: '',
    dietCompliance: '',
    foodChanges: '',
    appetite: '',
    digestion: '',
    therapyWeek: '',
    tpcWeek: '',
    photosStatus: '',
    menstrualPhase: '',
    notes: '',
    updatedAt: nowIso(),
    ...overrides
  };
}

function loadState() {
  const cached = loadJson(STORAGE_KEY, null);
  if (cached) {
    return {
      settings: { theme: 'dark', restSeconds: 60, soundEnabled: true, keepAwake: false, ...cached.settings },
      meta: { activeProgramId: '', currentView: 'home', firebaseReady: false, syncStatus: appConfig.useFirebase ? 'Conectando…' : 'Solo local', currentSessionId: '', currentReportDraft: null, ...cached.meta },
      programs: Array.isArray(cached.programs) && cached.programs.length ? cached.programs : [createDefaultProgram()],
      sessions: Array.isArray(cached.sessions) ? cached.sessions : [],
      reports: Array.isArray(cached.reports) ? cached.reports : [],
      weights: Array.isArray(cached.weights) ? cached.weights : [],
      auth: cached.auth || { uid: '', email: '', loggedIn: false }
    };
  }
  const defaultProgram = createDefaultProgram();
  return {
    settings: { theme: 'dark', restSeconds: 60, soundEnabled: true, keepAwake: false },
    meta: { activeProgramId: defaultProgram.id, currentView: 'home', firebaseReady: false, syncStatus: appConfig.useFirebase ? 'Conectando…' : 'Solo local', currentSessionId: '', currentReportDraft: null },
    programs: [defaultProgram],
    sessions: [],
    reports: [],
    weights: [],
    auth: { uid: '', email: '', loggedIn: false }
  };
}

function persistState() { saveJson(STORAGE_KEY, state); }

function activeProgram() {
  return state.programs.find((p) => p.id === state.meta.activeProgramId) || state.programs.find((p) => p.status === 'active') || state.programs[0] || null;
}

function currentSession() { return loadJson(CURRENT_SESSION_KEY, null); }

function setCurrentSession(session) {
  state.meta.currentSessionId = session?.id || '';
  saveJson(CURRENT_SESSION_KEY, session || null);
  persistState();
}

function updateTheme() { document.body.classList.toggle('light', state.settings.theme === 'light'); }

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderView(state.meta.currentView);
    updateTimerFab();
    persistState();
  });
}

function setView(view) {
  state.meta.currentView = view;
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  Object.entries(el.views).forEach(([name, node]) => node.classList.toggle('active', name === view));
  queueRender();
}

function weekRange(dateString = today()) {
  const date = new Date(dateString);
  const day = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [inputDate(start), inputDate(end)];
}

function sessionsThisWeek() {
  const [start, end] = weekRange();
  return state.sessions.filter((s) => s.date >= start && s.date <= end);
}

function reportsThisWeek() {
  const [start, end] = weekRange();
  return state.reports.filter((r) => r.date >= start && r.date <= end);
}

function latestWeight() {
  return [...state.weights].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
}

function previousWeight() {
  const rows = [...state.weights].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return rows[1] || null;
}

function getNextDay() {
  const program = activeProgram();
  if (!program || !program.days?.length) return null;
  const lastSession = [...state.sessions].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  if (!lastSession) return program.days[0];
  const index = program.days.findIndex((d) => d.id === lastSession.dayId);
  return program.days[(index + 1) % program.days.length];
}

function getLastExerciseMemory(name) {
  const key = normalize(name);
  const sessions = [...state.sessions].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  for (const session of sessions) {
    const found = (session.exercises || []).find((exercise) => normalize(exercise.name) === key);
    if (found) return found;
  }
  return null;
}

function buildWorkoutSession(dayId) {
  const program = activeProgram();
  if (!program) return null;
  const day = program.days.find((item) => item.id === dayId) || program.days[0];
  if (!day) return null;
  const session = {
    id: uid(),
    programId: program.id,
    programName: program.name,
    dayId: day.id,
    dayTitle: day.title,
    daySubtitle: day.subtitle,
    date: today(),
    includeCore: false,
    includeCalves: false,
    notes: '',
    createdAt: nowIso(),
    finishedAt: '',
    exercises: day.exercises.map((exercise) => {
      const memory = getLastExerciseMemory(exercise.name);
      const sets = Array.from({ length: Number(exercise.sets) || 0 }, (_, idx) => {
        const previous = memory?.sets?.[idx] || {};
        return {
          index: idx + 1,
          targetReps: exercise.reps,
          weight: previous.weight || '',
          reps: previous.reps || '',
          rir: previous.rir || '2',
          done: false,
          completedAt: ''
        };
      });
      return {
        id: exercise.id || uid(),
        name: exercise.name,
        restSeconds: Number(exercise.restSeconds || state.settings.restSeconds || 60),
        tempo: exercise.tempo || '',
        notes: exercise.notes || '',
        sets,
        completed: false
      };
    })
  };
  setCurrentSession(session);
  maybeAcquireWakeLock();
  queueRender();
  return session;
}

function volumeForSession(session) {
  return (session?.exercises || []).reduce((total, exercise) => total + (exercise.sets || []).reduce((sum, set) => sum + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0), 0);
}

function setsDoneCount(session) {
  return (session?.exercises || []).reduce((total, exercise) => total + (exercise.sets || []).filter((set) => set.done).length, 0);
}

function workoutExerciseCount(session) { return session?.exercises?.length || 0; }

function saveSession(finalize = false) {
  const session = currentSession();
  if (!session) return;
  const payload = { ...session, updatedAt: nowIso() };
  if (finalize) payload.finishedAt = nowIso();
  const existingIndex = state.sessions.findIndex((item) => item.id === payload.id);
  if (existingIndex >= 0) state.sessions[existingIndex] = payload;
  else state.sessions.unshift(payload);
  setCurrentSession(finalize ? null : payload);
  if (finalize) releaseWakeLock();
  syncCollectionItem('sessions', payload.id, payload);
  queueRender();
}

function saveReport(report) {
  const index = state.reports.findIndex((item) => item.id === report.id);
  const payload = { ...report, updatedAt: nowIso() };
  if (index >= 0) state.reports[index] = payload;
  else state.reports.unshift(payload);
  syncCollectionItem('reports', payload.id, payload);
  queueRender();
}

function saveWeightEntry(weightValue) {
  const entry = { id: uid(), date: today(), weight: weightValue, updatedAt: nowIso() };
  state.weights.unshift(entry);
  syncCollectionItem('weights', entry.id, entry);
  queueRender();
}

function duplicateSessionToCurrent(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const duplicated = JSON.parse(JSON.stringify(session));
  duplicated.id = uid();
  duplicated.date = today();
  duplicated.createdAt = nowIso();
  duplicated.finishedAt = '';
  duplicated.updatedAt = nowIso();
  duplicated.exercises.forEach((exercise) => {
    exercise.completed = false;
    exercise.sets.forEach((set) => {
      set.done = false;
      set.completedAt = '';
    });
  });
  setCurrentSession(duplicated);
  maybeAcquireWakeLock();
  setView('workout');
}

function extractMinRep(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function computeSuggestedWeight(exercise) {
  const sets = exercise.sets || [];
  if (!sets.length) return null;
  const allDone = sets.every((set) => set.done);
  if (!allDone) return null;
  const avgRir = sets.reduce((sum, set) => sum + (Number(set.rir) || 0), 0) / sets.length;
  const lastWeight = Number(sets[sets.length - 1].weight || 0);
  if (!lastWeight) return null;
  if (avgRir >= 2 && sets.every((set) => Number(set.reps || 0) >= extractMinRep(set.targetReps))) return `Sugerencia próxima: ${formatNumber(lastWeight + 2.5)} kg`;
  if (avgRir < 1) return `Sugerencia próxima: ${formatNumber(Math.max(0, lastWeight - 2.5))} kg`;
  return `Sugerencia próxima: mantener ${formatNumber(lastWeight)} kg`;
}

function formatNumber(num) { return Number(num).toLocaleString('es-ES', { maximumFractionDigits: 2 }); }

function timerRemaining() {
  if (!timerState.running) return timerState.remaining;
  const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
  return Math.max(0, timerState.total - elapsed);
}

function renderTimerValue() {
  const value = timerRemaining();
  const min = String(Math.floor(value / 60)).padStart(2, '0');
  const sec = String(value % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

function saveTimer() { saveJson(TIMER_KEY, timerState); }

function startTimer(seconds, source = '') {
  unlockSoundSoft();
  timerState = { total: seconds, remaining: seconds, running: true, startedAt: Date.now(), source };
  saveTimer();
  runTimerLoop();
}

function pauseTimer() {
  timerState.remaining = timerRemaining();
  timerState.running = false;
  timerState.startedAt = 0;
  saveTimer();
  runTimerLoop();
}

function resetTimer(seconds = state.settings.restSeconds || 60, source = '') {
  timerState = { total: seconds, remaining: seconds, running: false, startedAt: 0, source };
  saveTimer();
  runTimerLoop();
}

function runTimerLoop() {
  clearInterval(timerInterval);
  updateTimerFab();
  renderTimerInWorkout();
  if (!timerState.running) return;
  timerInterval = setInterval(() => {
    const remaining = timerRemaining();
    renderTimerInWorkout();
    updateTimerFab();
    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerState.running = false;
      timerState.remaining = 0;
      saveTimer();
      playTimerEnd();
      renderTimerInWorkout();
      updateTimerFab();
    }
  }, 250);
}

function updateTimerFab() {
  const value = renderTimerValue();
  const running = timerState.running;
  el.fabTimer.textContent = `${value}${timerState.source ? ' · ' + timerState.source : ''}`;
  el.fabTimer.classList.toggle('hidden', !running);
}

function renderTimerInWorkout() {
  const node = document.getElementById('timerBoxValue');
  if (node) node.textContent = renderTimerValue();
  const label = document.getElementById('timerSourceLabel');
  if (label) label.textContent = timerState.source || 'Descanso';
}

function playTimerEnd() {
  if (!state.settings.soundEnabled) {
    if (navigator.vibrate) navigator.vibrate([100, 80, 180]);
    return;
  }
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const play = (frequency, start, duration, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.stop(start + duration);
    };
    const now = ctx.currentTime;
    play(720, now, 0.18, 'triangle');
    play(880, now + 0.22, 0.2, 'triangle');
    play(1040, now + 0.46, 0.38, 'triangle');
    if (navigator.vibrate) navigator.vibrate([90, 50, 120, 50, 180]);
  } catch {
    if (navigator.vibrate) navigator.vibrate([100, 80, 180]);
  }
}

function unlockSoundSoft() {
  if (soundUnlocked) return;
  soundUnlocked = true;
  saveJson(SOUND_KEY, true);
}

async function maybeAcquireWakeLock() {
  if (!state.settings.keepAwake) return;
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {}
}

async function releaseWakeLock() {
  try { await wakeLock?.release(); wakeLock = null; } catch {}
}

function createProgramVersionFromActive(name) {
  const current = activeProgram();
  if (!current) return;
  state.programs.forEach((program) => { if (program.id === current.id) program.status = 'archived'; });
  const copy = JSON.parse(JSON.stringify(current));
  copy.id = uid();
  copy.name = name || `${current.name} · copia ${today()}`;
  copy.status = 'active';
  copy.startDate = today();
  copy.currentWeek = 1;
  state.programs.unshift(copy);
  state.meta.activeProgramId = copy.id;
  syncCollectionItem('programs', copy.id, copy);
  queueRender();
}

function addExerciseToSelectedDays(formData) {
  const program = activeProgram();
  if (!program) return;
  const dayIds = formData.getAll('dayTargets');
  if (!dayIds.length) return alert('Selecciona al menos un día.');
  const exercise = ex(
    formData.get('exerciseName'),
    Number(formData.get('exerciseSets') || 3),
    formData.get('exerciseReps') || '10',
    Number(formData.get('exerciseRest') || state.settings.restSeconds || 60),
    formData.get('exerciseTempo') || '',
    formData.get('exerciseNotes') || ''
  );
  dayIds.forEach((dayId) => {
    const day = program.days.find((item) => item.id === dayId);
    if (day) day.exercises.push({ ...exercise, id: uid() });
  });
  syncCollectionItem('programs', program.id, program);
  queueRender();
}

function importProgramFromText(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return alert('Pega una rutina válida.');
  const newProgram = { id: uid(), name: `Rutina importada ${today()}`, status: 'active', startDate: today(), currentWeek: 1, notes: '', days: [], blocks: JSON.parse(JSON.stringify(activeProgram()?.blocks || {})) };
  let currentDay = null;
  lines.forEach((line) => {
    if (/^dia\s*\d+/i.test(line)) {
      currentDay = { id: uid(), title: line.replace(':', ''), subtitle: '', exercises: [] };
      newProgram.days.push(currentDay);
      return;
    }
    if (!currentDay) return;
    if (!currentDay.subtitle && !/\dx\d+/i.test(line) && !/^rir|descanso|empezamos/i.test(line)) {
      currentDay.subtitle = line;
      return;
    }
    const match = line.match(/^(.*?)(\d+)x([^\.]+)(?:\.(.*))?$/i);
    if (match) {
      const name = match[1].replace(/[\.:-]+$/g, '').trim();
      currentDay.exercises.push(ex(name, Number(match[2]), match[3].trim(), state.settings.restSeconds || 60, '', (match[4] || '').trim()));
      return;
    }
    if (/descanso|rir/i.test(line)) newProgram.notes += `${line}\n`;
  });
  if (!newProgram.days.length) return alert('No se detectaron días.');
  state.programs.forEach((program) => { if (program.id === state.meta.activeProgramId) program.status = 'archived'; });
  state.programs.unshift(newProgram);
  state.meta.activeProgramId = newProgram.id;
  syncCollectionItem('programs', newProgram.id, newProgram);
  queueRender();
}

function computeWeightDelta(currentWeight, previousWeight) {
  const current = Number(String(currentWeight || '').replace(',', '.'));
  const previous = Number(String(previousWeight || '').replace(',', '.'));
  if (!current || !previous) return '';
  const delta = current - previous;
  return `${delta > 0 ? '+' : ''}${formatNumber(delta)} kg`;
}

function reportAutoFill(base = {}) {
  const latest = latestWeight();
  const previous = previousWeight();
  return createEmptyReport({
    currentWeight: base.currentWeight ?? latest?.weight ?? '',
    previousWeight: base.previousWeight ?? previous?.weight ?? '',
    trainingSessions: base.trainingSessions ?? String(sessionsThisWeek().length || ''),
    systemWeek: base.systemWeek ?? String(activeProgram()?.currentWeek || ''),
    weightDelta: computeWeightDelta(base.currentWeight ?? latest?.weight, base.previousWeight ?? previous?.weight),
    ...base
  });
}

function renderView(view) {
  if (view === 'home') renderHome();
  if (view === 'workout') renderWorkout();
  if (view === 'programs') renderPrograms();
  if (view === 'reports') renderReports();
  if (view === 'settings') renderSettings();
}

function renderHome() {
  const program = activeProgram();
  const nextDay = getNextDay();
  const weekSessions = sessionsThisWeek();
  const weekReports = reportsThisWeek();
  const current = currentSession();
  const lastReport = [...state.reports].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const weight = latestWeight();
  const coreCount = weekSessions.filter((s) => s.includeCore).length;
  const calvesCount = weekSessions.filter((s) => s.includeCalves).length;

  el.views.home.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">LISTO PARA MÓVIL</p>
          <h2>${program?.name || 'Sin rutina activa'}</h2>
          <p class="subtitle">${program?.notes || 'Crea o importa una rutina.'}</p>
        </div>
        <span class="badge">${state.meta.syncStatus}</span>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="startWorkoutBtn">${current ? 'Continuar entreno' : 'Empezar siguiente día'}</button>
        <button class="btn btn-secondary" id="gotoImportBtn">Cargar rutina nueva</button>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card stat"><span class="label">Siguiente día</span><strong>${nextDay ? `${nextDay.title} · ${nextDay.subtitle}` : '—'}</strong></div>
      <div class="card stat"><span class="label">Semana del bloque</span><strong>${program?.currentWeek || 1}</strong></div>
      <div class="card stat"><span class="label">Sesión activa</span><strong>${current ? `${current.dayTitle} · ${current.daySubtitle}` : 'No iniciada'}</strong></div>
      <div class="card stat"><span class="label">Último peso</span><strong>${weight ? `${weight.weight} kg` : '—'}</strong></div>
    </div>

    <div class="grid-2-md">
      <div class="card">
        <div class="section-head"><div><p class="eyebrow">SEMANA</p><h3>Control rápido</h3></div></div>
        <div class="grid grid-2" style="margin-top:12px">
          <div class="stat"><span class="label">Entrenos</span><strong>${weekSessions.length}</strong></div>
          <div class="stat"><span class="label">Reportes</span><strong>${weekReports.length}</strong></div>
          <div class="stat"><span class="label">Core</span><strong>${coreCount} / ${program?.blocks?.core?.weeklyTarget || 2}</strong></div>
          <div class="stat"><span class="label">Gemelos</span><strong>${calvesCount} / ${program?.blocks?.calves?.weeklyTarget || 2}</strong></div>
        </div>
        <div class="separator"></div>
        <div class="row">
          <button class="chip" id="quickCoreBtn">Añadir core</button>
          <button class="chip" id="quickCalvesBtn">Añadir gemelos</button>
          <button class="chip" id="quickWeightBtn">Registrar peso</button>
          <button class="chip" id="quickReportBtn">Nuevo reporte</button>
        </div>
      </div>
      <div class="card">
        <div class="section-head"><div><p class="eyebrow">ÚLTIMO REPORTE</p><h3>${lastReport?.date || 'Sin reporte'}</h3></div></div>
        <div class="grid grid-2" style="margin-top:12px">
          <div class="stat"><span class="label">Diferencia</span><strong>${lastReport?.weightDelta || '—'}</strong></div>
          <div class="stat"><span class="label">Sueño</span><strong>${lastReport?.sleepHours || '—'}</strong></div>
          <div class="stat"><span class="label">Cardio</span><strong>${lastReport?.cardioSessions || '—'}</strong></div>
          <div class="stat"><span class="label">Semana</span><strong>${lastReport?.systemWeek || '—'}</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">SESIONES RECIENTES</p><h3>Historial rápido</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${state.sessions.slice(0, 6).map((session) => `
          <div class="session-card">
            <div class="section-head">
              <div>
                <strong>${session.dayTitle} · ${session.daySubtitle}</strong>
                <div class="micro">${session.date} · ${setsDoneCount(session)} series · ${formatNumber(volumeForSession(session))} kg</div>
              </div>
              <button class="chip" data-redo-day="${session.id}">Rehacer día</button>
            </div>
          </div>`).join('') || '<div class="empty">Todavía no has guardado sesiones.</div>'}
      </div>
    </div>`;

  document.getElementById('startWorkoutBtn')?.addEventListener('click', () => {
    if (current) setView('workout');
    else if (nextDay) { buildWorkoutSession(nextDay.id); setView('workout'); }
  });
  document.getElementById('gotoImportBtn')?.addEventListener('click', () => setView('programs'));
  document.getElementById('quickCoreBtn')?.addEventListener('click', () => { ensureCurrentSession(); const s = currentSession(); s.includeCore = true; setCurrentSession(s); setView('workout'); });
  document.getElementById('quickCalvesBtn')?.addEventListener('click', () => { ensureCurrentSession(); const s = currentSession(); s.includeCalves = true; setCurrentSession(s); setView('workout'); });
  document.getElementById('quickWeightBtn')?.addEventListener('click', () => {
    const value = prompt('Peso actual en kg');
    if (value) saveWeightEntry(value);
  });
  document.getElementById('quickReportBtn')?.addEventListener('click', () => {
    state.meta.currentReportDraft = reportAutoFill();
    setView('reports');
  });
  el.views.home.querySelectorAll('[data-redo-day]').forEach((btn) => btn.addEventListener('click', () => duplicateSessionToCurrent(btn.dataset.redoDay)));
}

function ensureCurrentSession() {
  if (!currentSession()) {
    const next = getNextDay();
    if (next) buildWorkoutSession(next.id);
  }
}

function renderWorkout() {
  const session = currentSession();
  if (!session) {
    el.views.workout.innerHTML = `<div class="card"><div class="empty">No hay entreno activo. Inicia uno desde Inicio.</div></div>`;
    return;
  }
  const volume = formatNumber(volumeForSession(session));
  el.views.workout.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">ENTRENO ACTIVO</p>
          <h2>${session.dayTitle} · ${session.daySubtitle}</h2>
          <p class="subtitle">${session.programName} · ${session.date}</p>
        </div>
        <span class="badge">${setsDoneCount(session)} series</span>
      </div>
      <div class="grid grid-3" style="margin-top:12px">
        <div class="stat"><span class="label">Volumen</span><strong>${volume} kg</strong></div>
        <div class="stat"><span class="label">Ejercicios</span><strong>${workoutExerciseCount(session)}</strong></div>
        <div class="stat"><span class="label" id="timerSourceLabel">${timerState.source || 'Descanso'}</span><strong id="timerBoxValue">${renderTimerValue()}</strong></div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary" id="timerStartBtn">${timerState.running ? 'Pausar timer' : 'Iniciar timer'}</button>
        <button class="btn btn-secondary" id="timerAddBtn">+15 s</button>
        <button class="btn btn-secondary" id="timerSubBtn">-15 s</button>
      </div>
      <div class="check-wrap" style="margin-top:12px">
        <label><input type="checkbox" id="workoutCoreToggle" ${session.includeCore ? 'checked' : ''}> Core</label>
        <label><input type="checkbox" id="workoutCalvesToggle" ${session.includeCalves ? 'checked' : ''}> Gemelos</label>
      </div>
      <div class="field"><span class="label">Notas del entreno</span><textarea id="workoutNotesInput">${escapeHtml(session.notes || '')}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary" id="saveDraftBtn">Guardar borrador</button>
        <button class="btn btn-primary" id="finishWorkoutBtn">Guardar sesión</button>
      </div>
    </div>
    <div class="stack" id="exerciseList"></div>`;

  const list = document.getElementById('exerciseList');
  list.innerHTML = session.exercises.map((exercise, exerciseIndex) => {
    const suggestion = computeSuggestedWeight(exercise);
    return `
      <div class="exercise-card">
        <div class="exercise-top">
          <div>
            <h3>${exercise.name}</h3>
            <div class="micro">${exercise.tempo || 'Tempo libre'} · descanso ${exercise.restSeconds}s</div>
            ${exercise.notes ? `<div class="micro">${exercise.notes}</div>` : ''}
            ${suggestion ? `<div class="micro" style="color:var(--accent);margin-top:6px">${suggestion}</div>` : ''}
          </div>
          <div class="row" style="max-width:220px">
            <button class="chip" data-ex-complete="${exerciseIndex}">Ejercicio hecho</button>
            <button class="chip" data-ex-redo="${exerciseIndex}">Rehacer</button>
          </div>
        </div>
        ${(exercise.sets || []).map((set, setIndex) => `
          <div class="set-grid ${set.done ? 'set-done' : ''}">
            <div class="set-chip">S${set.index}</div>
            <input data-set-field="weight" data-ex-index="${exerciseIndex}" data-set-index="${setIndex}" type="number" inputmode="decimal" placeholder="kg" value="${escapeAttr(set.weight)}">
            <input data-set-field="reps" data-ex-index="${exerciseIndex}" data-set-index="${setIndex}" type="number" inputmode="numeric" placeholder="reps" value="${escapeAttr(set.reps)}">
            <input class="rir-input" data-set-field="rir" data-ex-index="${exerciseIndex}" data-set-index="${setIndex}" type="number" inputmode="numeric" placeholder="RIR" value="${escapeAttr(set.rir)}">
            <button class="btn ${set.done ? 'btn-secondary' : 'btn-primary'} done-btn" data-set-done="${exerciseIndex}:${setIndex}">${set.done ? 'Hecha' : 'Marcar'}</button>
          </div>`).join('')}
        <div class="row" style="margin-top:10px">
          <button class="chip" data-copy-last="${exerciseIndex}">Copiar última vez</button>
          <button class="chip" data-start-rest="${exerciseIndex}">Descanso</button>
        </div>
      </div>`;
  }).join('');

  document.getElementById('timerStartBtn')?.addEventListener('click', () => timerState.running ? pauseTimer() : startTimer(timerState.remaining || state.settings.restSeconds || 60, timerState.source || 'Descanso'));
  document.getElementById('timerAddBtn')?.addEventListener('click', () => {
    if (timerState.running) timerState.total += 15;
    else timerState.remaining += 15;
    saveTimer(); runTimerLoop();
  });
  document.getElementById('timerSubBtn')?.addEventListener('click', () => {
    if (timerState.running) timerState.total = Math.max(0, timerState.total - 15);
    else timerState.remaining = Math.max(0, timerState.remaining - 15);
    saveTimer(); runTimerLoop();
  });
  document.getElementById('workoutCoreToggle')?.addEventListener('change', (e) => { const s = currentSession(); s.includeCore = e.target.checked; setCurrentSession(s); });
  document.getElementById('workoutCalvesToggle')?.addEventListener('change', (e) => { const s = currentSession(); s.includeCalves = e.target.checked; setCurrentSession(s); });
  document.getElementById('workoutNotesInput')?.addEventListener('input', debounce((e) => { const s = currentSession(); s.notes = e.target.value; setCurrentSession(s); }, 250));
  document.getElementById('saveDraftBtn')?.addEventListener('click', () => saveSession(false));
  document.getElementById('finishWorkoutBtn')?.addEventListener('click', () => saveSession(true));

  list.querySelectorAll('[data-set-field]').forEach((input) => {
    input.addEventListener('input', debounce((event) => {
      const s = currentSession();
      const exIndex = Number(event.target.dataset.exIndex);
      const setIndex = Number(event.target.dataset.setIndex);
      const field = event.target.dataset.setField;
      s.exercises[exIndex].sets[setIndex][field] = event.target.value;
      setCurrentSession(s);
    }, 120));
  });
  list.querySelectorAll('[data-set-done]').forEach((btn) => btn.addEventListener('click', () => markSetDone(btn.dataset.setDone)));
  list.querySelectorAll('[data-ex-complete]').forEach((btn) => btn.addEventListener('click', () => markExerciseDone(Number(btn.dataset.exComplete))));
  list.querySelectorAll('[data-ex-redo]').forEach((btn) => btn.addEventListener('click', () => redoExercise(Number(btn.dataset.exRedo))));
  list.querySelectorAll('[data-copy-last]').forEach((btn) => btn.addEventListener('click', () => copyLastIntoExercise(Number(btn.dataset.copyLast))));
  list.querySelectorAll('[data-start-rest]').forEach((btn) => btn.addEventListener('click', () => {
    const s = currentSession();
    const exIndex = Number(btn.dataset.startRest);
    startTimer(s.exercises[exIndex].restSeconds || state.settings.restSeconds || 60, s.exercises[exIndex].name);
  }));
}

function markSetDone(token) {
  const [exIndex, setIndex] = token.split(':').map(Number);
  const s = currentSession();
  const set = s.exercises[exIndex].sets[setIndex];
  set.done = !set.done;
  set.completedAt = set.done ? nowIso() : '';
  setCurrentSession(s);
  if (set.done) startTimer(s.exercises[exIndex].restSeconds || state.settings.restSeconds || 60, s.exercises[exIndex].name);
  renderWorkout();
}

function markExerciseDone(exIndex) {
  const s = currentSession();
  const exercise = s.exercises[exIndex];
  exercise.sets.forEach((set) => {
    set.done = true;
    if (!set.reps) set.reps = extractMinRep(set.targetReps) || '';
    if (!set.rir) set.rir = '2';
    set.completedAt = nowIso();
  });
  exercise.completed = true;
  setCurrentSession(s);
  startTimer(exercise.restSeconds || state.settings.restSeconds || 60, exercise.name);
  renderWorkout();
}

function redoExercise(exIndex) {
  const s = currentSession();
  const exercise = s.exercises[exIndex];
  exercise.completed = false;
  exercise.sets.forEach((set) => {
    set.done = false;
    set.completedAt = '';
  });
  setCurrentSession(s);
  renderWorkout();
}

function copyLastIntoExercise(exIndex) {
  const s = currentSession();
  const exercise = s.exercises[exIndex];
  const memory = getLastExerciseMemory(exercise.name);
  if (!memory) return alert('No hay registro anterior para este ejercicio.');
  exercise.sets.forEach((set, idx) => {
    const previous = memory.sets?.[idx];
    if (!previous) return;
    set.weight = previous.weight || set.weight;
    set.reps = previous.reps || set.reps;
    set.rir = previous.rir || set.rir;
  });
  setCurrentSession(s);
  renderWorkout();
}

function renderPrograms() {
  const program = activeProgram();
  el.views.programs.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">RUTINAS VERSIONADAS</p>
          <h2>${program?.name || 'Sin rutina'}</h2>
          <p class="subtitle">Activa desde ${program?.startDate || '—'} · semana ${program?.currentWeek || 1}</p>
        </div>
        <span class="badge">${state.programs.length} bloques</span>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary" id="duplicateProgramBtn">Duplicar rutina activa</button>
        <button class="btn btn-secondary" id="increaseWeekBtn">+ Semana bloque</button>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">IMPORTAR</p><h3>Pegar rutina nueva</h3></div></div>
      <textarea id="programImportText" placeholder="Pega aquí la rutina. Ejemplo:\nDia 1\nPecho-bíceps\nPress banca plano en multipower.3x10\n..."></textarea>
      <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="importProgramBtn">Importar y activar</button></div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">EJERCICIOS POR DÍA</p><h3>Añadir a varios días</h3></div></div>
      <form id="exerciseMultiDayForm" class="stack" style="margin-top:12px">
        <input name="exerciseName" placeholder="Nombre ejercicio" required>
        <div class="row">
          <input name="exerciseSets" type="number" inputmode="numeric" placeholder="Series" value="3">
          <input name="exerciseReps" placeholder="Reps" value="10">
          <input name="exerciseRest" type="number" inputmode="numeric" placeholder="Descanso s" value="60">
        </div>
        <input name="exerciseTempo" placeholder="Tempo / ejecución">
        <textarea name="exerciseNotes" placeholder="Notas"></textarea>
        <div class="check-wrap">${(program?.days || []).map((day) => `<label><input type="checkbox" name="dayTargets" value="${day.id}">${day.title} · ${day.subtitle}</label>`).join('')}</div>
        <button class="btn btn-primary" type="submit">Guardar ejercicio en días seleccionados</button>
      </form>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">HISTORIAL</p><h3>Bloques guardados</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${state.programs.map((item) => `
          <div class="program-card">
            <div class="section-head">
              <div>
                <strong>${item.name}</strong>
                <div class="micro">${item.status} · ${item.startDate} · semana ${item.currentWeek || 1}</div>
              </div>
              <div class="row" style="max-width:220px">
                <button class="chip" data-activate-program="${item.id}">Activar</button>
                <button class="chip" data-delete-program="${item.id}">Borrar</button>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  document.getElementById('duplicateProgramBtn')?.addEventListener('click', () => {
    const name = prompt('Nombre de la nueva rutina', `${program?.name || 'Rutina'} · ${today()}`);
    if (name) createProgramVersionFromActive(name);
  });
  document.getElementById('increaseWeekBtn')?.addEventListener('click', () => {
    const current = activeProgram();
    if (!current) return;
    current.currentWeek = Number(current.currentWeek || 1) + 1;
    syncCollectionItem('programs', current.id, current);
    queueRender();
  });
  document.getElementById('importProgramBtn')?.addEventListener('click', () => importProgramFromText(document.getElementById('programImportText').value));
  document.getElementById('exerciseMultiDayForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    addExerciseToSelectedDays(new FormData(event.currentTarget));
    event.currentTarget.reset();
  });
  el.views.programs.querySelectorAll('[data-activate-program]').forEach((btn) => btn.addEventListener('click', () => activateProgram(btn.dataset.activateProgram)));
  el.views.programs.querySelectorAll('[data-delete-program]').forEach((btn) => btn.addEventListener('click', () => deleteProgram(btn.dataset.deleteProgram)));
}

function activateProgram(programId) {
  state.programs.forEach((item) => item.status = item.id === programId ? 'active' : (item.status === 'draft' ? 'draft' : 'archived'));
  state.meta.activeProgramId = programId;
  const program = state.programs.find((item) => item.id === programId);
  if (program) syncCollectionItem('programs', program.id, program);
  queueRender();
}

function deleteProgram(programId) {
  if (!confirm('¿Borrar esta rutina?')) return;
  state.programs = state.programs.filter((item) => item.id !== programId);
  if (state.meta.activeProgramId === programId) state.meta.activeProgramId = state.programs[0]?.id || '';
  removeCollectionItem('programs', programId);
  queueRender();
}

function reportFields(draft) {
  const fields = [
    ['date', 'Fecha', 'date'],
    ['currentWeight', 'Peso actual', 'text'],
    ['previousWeight', 'Peso semana pasada', 'text'],
    ['weightDelta', 'Diferencia de peso', 'text', true],
    ['strength', 'Fuerza', 'text'],
    ['pump', 'Congestión', 'text'],
    ['recovery', 'Recuperación', 'text'],
    ['sleepHours', 'Horas dormidas', 'text'],
    ['dailyRecovery', 'Recuperación y descanso / estrés', 'textarea'],
    ['cardioSessions', 'Sesiones cardiovasculares', 'text'],
    ['cardioDuration', 'Duración cardio', 'text'],
    ['cardioTime', 'Momento del día', 'text'],
    ['trainingSessions', 'Sesiones de esta semana', 'text'],
    ['systemWeek', 'Semana del sistema actual', 'text'],
    ['dietCompliance', 'Cumplimiento dieta', 'text'],
    ['foodChanges', 'Alimentos a cambiar', 'textarea'],
    ['appetite', 'Nivel de apetito', 'text'],
    ['digestion', 'Digestiones', 'textarea'],
    ['therapyWeek', 'Semana de terapia actual', 'text'],
    ['tpcWeek', 'Semana de TPC actual', 'text'],
    ['photosStatus', 'Fotos reglamentarias', 'text'],
    ['menstrualPhase', 'Fase menstrual', 'text'],
    ['notes', 'Notas extra', 'textarea']
  ];
  return fields.map(([key, label, type, readonly]) => `
    <div class="field">
      <span class="label">${label}</span>
      ${type === 'textarea'
        ? `<textarea name="${key}" ${readonly ? 'readonly' : ''}>${escapeHtml(draft[key] || '')}</textarea>`
        : `<input name="${key}" type="${type}" value="${escapeAttr(draft[key] || '')}" ${readonly ? 'readonly' : ''}>`}
    </div>`).join('');
}

function renderReports() {
  const draft = state.meta.currentReportDraft || reportAutoFill();
  draft.weightDelta = computeWeightDelta(draft.currentWeight, draft.previousWeight);
  el.views.reports.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">REPORTE SEMANAL</p>
          <h2>Formulario + PDF</h2>
          <p class="subtitle">Autorrellena peso previo, diferencia y sesiones semanales.</p>
        </div>
        <span class="badge">${state.reports.length} guardados</span>
      </div>
    </div>

    <div class="card">
      <form id="reportForm" class="stack">
        ${reportFields(draft)}
        <div class="row" style="margin-top:12px">
          <button class="btn btn-secondary" type="button" id="autofillReportBtn">Autocompletar</button>
          <button class="btn btn-primary" type="submit">Guardar reporte</button>
          <button class="btn btn-secondary" type="button" id="downloadReportPdfBtn">PDF</button>
        </div>
      </form>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">HISTORIAL</p><h3>Reportes guardados</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${state.reports.map((report) => `
          <div class="report-card">
            <div class="section-head">
              <div>
                <strong>${report.date}</strong>
                <div class="micro">Peso ${report.currentWeight || '—'} · diferencia ${report.weightDelta || '—'}</div>
              </div>
              <div class="row" style="max-width:220px">
                <button class="chip" data-edit-report="${report.id}">Editar</button>
                <button class="chip" data-pdf-report="${report.id}">PDF</button>
              </div>
            </div>
          </div>`).join('') || '<div class="empty">Aún no hay reportes.</div>'}
      </div>
    </div>`;

  const form = document.getElementById('reportForm');
  form?.addEventListener('input', debounce(() => {
    const fd = new FormData(form);
    state.meta.currentReportDraft = reportAutoFill(Object.fromEntries(fd.entries()));
  }, 100));
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const report = reportAutoFill(Object.fromEntries(fd.entries()));
    if (!report.id) report.id = uid();
    saveReport(report);
    state.meta.currentReportDraft = createEmptyReport();
    alert('Reporte guardado.');
  });
  document.getElementById('autofillReportBtn')?.addEventListener('click', () => {
    state.meta.currentReportDraft = reportAutoFill();
    renderReports();
  });
  document.getElementById('downloadReportPdfBtn')?.addEventListener('click', async () => {
    const fd = new FormData(form);
    const report = reportAutoFill(Object.fromEntries(fd.entries()));
    await exportReportPdf(report, activeProgram()?.name);
  });
  el.views.reports.querySelectorAll('[data-edit-report]').forEach((btn) => btn.addEventListener('click', () => {
    const report = state.reports.find((item) => item.id === btn.dataset.editReport);
    if (!report) return;
    state.meta.currentReportDraft = { ...report };
    renderReports();
  }));
  el.views.reports.querySelectorAll('[data-pdf-report]').forEach((btn) => btn.addEventListener('click', async () => {
    const report = state.reports.find((item) => item.id === btn.dataset.pdfReport);
    if (!report) return;
    await exportReportPdf(report, activeProgram()?.name);
  }));
}

function renderSettings() {
  const user = state.auth;
  el.views.settings.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">AJUSTES</p>
          <h2>Cuenta, rendimiento y sonido</h2>
          <p class="subtitle">Pensado para abrir más rápido en móvil y sincronizar después.</p>
        </div>
        <span class="badge">${state.meta.syncStatus}</span>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">TEMPORIZADOR</p><h3>Comportamiento</h3></div></div>
      <div class="check-wrap" style="margin-top:12px">
        <label><input type="checkbox" id="soundEnabledToggle" ${state.settings.soundEnabled ? 'checked' : ''}> Sonido al terminar</label>
        <label><input type="checkbox" id="keepAwakeToggle" ${state.settings.keepAwake ? 'checked' : ''}> Mantener pantalla encendida</label>
      </div>
      <div class="field"><span class="label">Descanso por defecto (segundos)</span><input id="restDefaultInput" type="number" inputmode="numeric" value="${state.settings.restSeconds || 60}"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="saveSettingsBtn">Guardar ajustes</button>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">CUENTA FIREBASE</p><h3>${user.loggedIn ? user.email : 'No has iniciado sesión'}</h3></div></div>
      <div class="field"><span class="label">Email</span><input id="authEmailInput" type="email" placeholder="tu@email.com" value="${escapeAttr(user.email || '')}"></div>
      <div class="field"><span class="label">Contraseña</span><input id="authPasswordInput" type="password" placeholder="••••••••"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="loginBtn">Entrar</button>
        <button class="btn btn-secondary" id="signupBtn">Crear cuenta</button>
        <button class="btn btn-danger" id="logoutBtn">Salir</button>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">DATOS</p><h3>Backup local</h3></div></div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary" id="exportJsonBtn">Exportar JSON</button>
        <button class="btn btn-secondary" id="clearCurrentWorkoutBtn">Borrar entreno activo</button>
      </div>
    </div>`;

  document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    state.settings.soundEnabled = document.getElementById('soundEnabledToggle').checked;
    state.settings.keepAwake = document.getElementById('keepAwakeToggle').checked;
    state.settings.restSeconds = Number(document.getElementById('restDefaultInput').value || 60);
    if (state.settings.keepAwake) await maybeAcquireWakeLock(); else await releaseWakeLock();
    queueRender();
  });
  document.getElementById('loginBtn')?.addEventListener('click', async () => handleAuth('login'));
  document.getElementById('signupBtn')?.addEventListener('click', async () => handleAuth('signup'));
  document.getElementById('logoutBtn')?.addEventListener('click', async () => handleAuth('logout'));
  document.getElementById('exportJsonBtn')?.addEventListener('click', exportJsonBackup);
  document.getElementById('clearCurrentWorkoutBtn')?.addEventListener('click', () => { setCurrentSession(null); queueRender(); });
}

async function handleAuth(mode) {
  if (!firebaseApi) return alert('Firebase todavía se está conectando.');
  const email = document.getElementById('authEmailInput')?.value.trim();
  const password = document.getElementById('authPasswordInput')?.value;
  try {
    if (mode === 'login') await firebaseApi.login(email, password);
    if (mode === 'signup') await firebaseApi.signup(email, password);
    if (mode === 'logout') await firebaseApi.logout();
  } catch (error) {
    alert(error.message || 'Error de autenticación.');
  }
}

function exportJsonBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `arslan-tracker-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function debounce(fn, delay = 200) {
  let handle;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), delay);
  };
}

async function syncCollectionItem(collectionName, id, payload) {
  if (!firebaseApi || !state.auth.loggedIn || !state.auth.uid) return;
  try {
    await firebaseApi.upsertDocument(state.auth.uid, collectionName, id, payload);
  } catch (error) {
    console.warn('No se pudo sincronizar', collectionName, error);
  }
}

async function removeCollectionItem(collectionName, id) {
  if (!firebaseApi || !state.auth.loggedIn || !state.auth.uid) return;
  try {
    await firebaseApi.removeDocument(state.auth.uid, collectionName, id);
  } catch (error) {
    console.warn('No se pudo borrar remoto', collectionName, error);
  }
}

async function initFirebaseDeferred() {
  if (!appConfig.useFirebase) {
    state.meta.firebaseReady = false;
    state.meta.syncStatus = 'Solo local';
    queueRender();
    return;
  }
  try {
    const mod = await import('./firebase-service.js');
    await mod.initFirebase();
    firebaseApi = mod;
    state.meta.firebaseReady = true;
    state.meta.syncStatus = 'Firebase listo';
    mod.listenAuth((user) => {
      if (user) {
        state.auth = { uid: user.uid, email: user.email || '', loggedIn: true };
        state.meta.syncStatus = 'Sincronizando';
        attachRealtime(user.uid);
      } else {
        state.auth = { uid: '', email: '', loggedIn: false };
        state.meta.syncStatus = 'Firebase listo';
        unsubscribers.forEach((fn) => fn());
        unsubscribers = [];
      }
      queueRender();
    });
  } catch (error) {
    console.error(error);
    state.meta.syncStatus = 'Error Firebase';
    queueRender();
  }
}

function attachRealtime(userId) {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [
    firebaseApi.subscribeCollection(userId, 'programs', (rows) => mergeRemoteCollection('programs', rows)),
    firebaseApi.subscribeCollection(userId, 'sessions', (rows) => mergeRemoteCollection('sessions', rows)),
    firebaseApi.subscribeCollection(userId, 'reports', (rows) => mergeRemoteCollection('reports', rows)),
    firebaseApi.subscribeCollection(userId, 'weights', (rows) => mergeRemoteCollection('weights', rows))
  ];
  ['programs', 'sessions', 'reports', 'weights'].forEach((name) => state[name].forEach((item) => syncCollectionItem(name, item.id, item)));
}

function mergeRemoteCollection(name, rows) {
  if (!rows?.length) return;
  const localMap = new Map(state[name].map((item) => [item.id, item]));
  rows.forEach((row) => {
    const local = localMap.get(row.id);
    if (!local || String(row.updatedAt || '') >= String(local.updatedAt || '')) localMap.set(row.id, row);
  });
  state[name] = [...localMap.values()].sort((a, b) => String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || '')));
  if (name === 'programs' && !state.meta.activeProgramId && state.programs[0]) state.meta.activeProgramId = state.programs[0].id;
  state.meta.syncStatus = 'Sincronizado';
  queueRender();
}

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
  el.themeBtn.addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    updateTheme();
    persistState();
  });
  document.body.addEventListener('pointerdown', unlockSoundSoft, { once: true });
}

function start() {
  if (!state.meta.activeProgramId && state.programs[0]) state.meta.activeProgramId = state.programs[0].id;
  updateTheme();
  setupNavigation();
  setView(state.meta.currentView || 'home');
  if (timerState.remaining === 0 && !timerState.running) resetTimer(state.settings.restSeconds || 60);
  runTimerLoop();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  const deferred = () => initFirebaseDeferred();
  if ('requestIdleCallback' in window) requestIdleCallback(deferred, { timeout: 1600 }); else setTimeout(deferred, 400);
  setTimeout(() => el.bootCard.classList.add('hidden'), 700);
}

start();
