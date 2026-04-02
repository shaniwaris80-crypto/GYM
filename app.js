const appConfig = window.appConfig || { useFirebase: false, firebaseConfig: null };
const exportReportPdf = window.exportReportPdf || (async () => alert('PDF no disponible.'));

const STORAGE_KEY = 'arslan_tracker_elite_state';
const CURRENT_SESSION_KEY = 'arslan_tracker_elite_current_session';
const TIMER_KEY = 'arslan_tracker_elite_timer';
const SOUND_KEY = 'arslan_tracker_elite_sound_unlocked';

const el = {
  bootCard: document.getElementById('bootCard'),
  bootText: document.getElementById('bootText'),
  themeBtn: document.getElementById('themeBtn'),
  fabTimer: document.getElementById('fabTimer'),
  views: {
    home: document.getElementById('view-home'),
    workout: document.getElementById('view-workout'),
    progress: document.getElementById('view-progress'),
    programs: document.getElementById('view-programs'),
    reports: document.getElementById('view-reports'),
    settings: document.getElementById('view-settings')
  }
};

let firebaseApi = null;
let unsubscribers = [];
let wakeLock = null;
let timerInterval = null;
let renderQueued = false;
let soundUnlocked = loadJson(SOUND_KEY, false);
let timerState = loadJson(TIMER_KEY, { total: 60, remaining: 60, running: false, startedAt: 0, source: '' });
let state = loadState();

const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();
const today = () => inputDate(new Date());

function inputDate(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

function normalize(value = '') {
  return String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ex(name, sets, reps, restSeconds, tempo = '', notes = '', extras = {}) {
  return {
    id: uid(),
    name,
    sets,
    reps,
    restSeconds,
    tempo,
    notes,
    group: extras.group || '',
    type: extras.type || '',
    unilateral: !!extras.unilateral,
    priority: extras.priority || 'main',
    aliases: extras.aliases || []
  };
}

function baseBlocks() {
  return {
    core: {
      title: 'Core',
      weeklyTarget: 2,
      exercises: [
        ex('Encogimientos muy lentos', 3, '20', 60, 'Lento', 'Suelo o máquina', { group: 'Core' }),
        ex('Elevaciones de piernas estiradas', 3, '20', 60, '1s cerca del suelo', 'Sin tocar suelo', { group: 'Core' }),
        ex('Planchas', 4, '1 minuto', 60, 'Isométrico', '1 min trabajo / 1 min descanso', { group: 'Core' })
      ]
    },
    calves: {
      title: 'Gemelos',
      weeklyTarget: 2,
      exercises: [ex('Elevaciones en bordillo o escalera', 1, '50', 60, 'Controlado', 'Sin descanso', { group: 'Gemelos' })]
    }
  };
}

function createDefaultProgram() {
  return {
    id: 'prog-default',
    name: 'Rutina base Arslan',
    status: 'active',
    goal: 'Definición',
    startDate: today(),
    endDate: '',
    currentWeek: 1,
    phaseNotes: 'RIR 2 · descanso general 60s · subida explosiva y bajada controlada 3s salvo ejecución normal.',
    days: [
      {
        id: 'day1', title: 'Día 1', subtitle: 'Pecho-bíceps',
        exercises: [
          ex('Press banca plano en multipower', 3, '10', 60, 'Explosiva + negativa 3s', '', { group: 'Pecho', type: 'Multipower' }),
          ex('Press superior mancuerna banco 45 grados', 3, '10', 60, 'Normal 1-1', 'Ejecución normal', { group: 'Pecho', type: 'Mancuernas' }),
          ex('Cruces de polea alta', 3, '10', 60, 'Explosiva + negativa 3s', '', { group: 'Pecho', type: 'Polea' }),
          ex('Curl mancuerna 1 mano', 2, '8', 60, 'Normal 1-1', 'Ejecución normal', { group: 'Bíceps', type: 'Mancuernas', unilateral: true }),
          ex('Curl barra Z', 3, '12', 60, 'Explosiva + negativa 3s', '', { group: 'Bíceps', type: 'Barra' }),
          ex('Curl concentrado con apoyo en banco', 3, '12', 60, 'Explosiva + negativa 3s', '', { group: 'Bíceps', type: 'Mancuernas', unilateral: true })
        ]
      },
      {
        id: 'day2', title: 'Día 2', subtitle: 'Espalda-tríceps',
        exercises: [
          ex('Jalón polea al pecho', 3, '12', 60, 'Explosiva + negativa 3s', '', { group: 'Espalda', type: 'Polea' }),
          ex('Remo sentado en polea abierto', 3, '12', 60, 'Normal 1-1', 'Ejecución normal', { group: 'Espalda', type: 'Polea' }),
          ex('Remo mancuerna a 1 mano', 3, '12', 60, 'Normal 1-1', 'Ejecución normal', { group: 'Espalda', type: 'Mancuernas', unilateral: true }),
          ex('Tríceps en polea 1 mano sin agarre', 4, '10', 60, 'Explosiva + negativa 3s', 'Agarras de la bola', { group: 'Tríceps', type: 'Polea', unilateral: true }),
          ex('Press francés mancuernas 2 manos', 3, '10', 60, 'Explosiva + negativa 3s', '', { group: 'Tríceps', type: 'Mancuernas' })
        ]
      },
      {
        id: 'day4', title: 'Día 4', subtitle: 'Piernas',
        exercises: [
          ex('Abductores máquina fuera/dentro', 3, '15', 60, 'Explosiva + negativa 3s', '', { group: 'Piernas', type: 'Máquina' }),
          ex('Femoral tumbado', 3, '10', 60, 'Explosiva + negativa 3s', '', { group: 'Piernas', type: 'Máquina' }),
          ex('Prensa pies al medio', 3, '12', 60, 'Normal 1-1', 'Ejecución normal', { group: 'Piernas', type: 'Máquina' }),
          ex('Extensiones de cuádriceps máquina', 3, '12', 60, 'Explosiva + negativa 3s', '', { group: 'Piernas', type: 'Máquina' }),
          ex('Zancadas dinámicas', 3, '12 cada pierna', 60, 'Normal 1-1', 'Cada pierna', { group: 'Piernas', type: 'Mancuernas', unilateral: true })
        ]
      },
      {
        id: 'day5', title: 'Día 5', subtitle: 'Hombros',
        exercises: [
          ex('Press militar multipower', 3, '10', 60, 'Explosiva + negativa 3s', '', { group: 'Hombros', type: 'Multipower' }),
          ex('Elevaciones laterales mancuerna', 3, '12', 60, 'Explosiva + negativa 3s', '', { group: 'Hombros', type: 'Mancuernas' }),
          ex('Elevaciones frontales barra', 3, '10', 60, 'Explosiva + negativa 3s', '', { group: 'Hombros', type: 'Barra' }),
          ex('Hombro trasero máquina', 3, '12', 60, 'Normal 1-1', 'Ejecución normal', { group: 'Hombros', type: 'Máquina' }),
          ex('Encogimientos trapecio mancuernas', 3, '15', 60, 'Explosiva + negativa 3s', '', { group: 'Trapecio', type: 'Mancuernas' })
        ]
      }
    ],
    blocks: baseBlocks()
  };
}

function defaultExerciseLibrary(programs = [createDefaultProgram()]) {
  return deriveExerciseLibrary([], programs);
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

function createEmptyMetric(overrides = {}) {
  return {
    id: uid(),
    date: today(),
    weight: '',
    waist: '',
    chest: '',
    arm: '',
    thigh: '',
    notes: '',
    updatedAt: nowIso(),
    ...overrides
  };
}

function loadState() {
  const cached = loadJson(STORAGE_KEY, null);
  if (cached) {
    const defaultProgram = createDefaultProgram();
    const bodyMetrics = Array.isArray(cached.bodyMetrics) ? cached.bodyMetrics : [];
    if (!bodyMetrics.length && Array.isArray(cached.weights)) {
      cached.weights.forEach((entry) => bodyMetrics.push(createEmptyMetric({ id: entry.id || uid(), date: entry.date || today(), weight: entry.weight || '', updatedAt: entry.updatedAt || nowIso() })));
    }
    const programs = Array.isArray(cached.programs) && cached.programs.length ? cached.programs : [defaultProgram];
    const exerciseLibrary = Array.isArray(cached.exerciseLibrary) && cached.exerciseLibrary.length ? cached.exerciseLibrary : defaultExerciseLibrary(programs);
    return {
      settings: {
        theme: 'dark',
        restSeconds: 60,
        soundMode: 'full',
        keepAwake: true,
        focusMode: false,
        coachMode: true,
        ...cached.settings
      },
      meta: {
        activeProgramId: programs[0]?.id || '',
        currentView: 'home',
        firebaseReady: false,
        syncStatus: appConfig.useFirebase ? 'Conectando…' : 'Solo local',
        currentSessionId: '',
        currentReportDraft: null,
        currentMetricDraft: null,
        progressSelectedExercise: '',
        ...cached.meta
      },
      programs,
      sessions: Array.isArray(cached.sessions) ? cached.sessions : [],
      reports: Array.isArray(cached.reports) ? cached.reports : [],
      bodyMetrics,
      exerciseLibrary,
      auth: cached.auth || { uid: '', email: '', loggedIn: false },
      undoStack: Array.isArray(cached.undoStack) ? cached.undoStack.slice(0, 10) : []
    };
  }

  const defaultProgram = createDefaultProgram();
  return {
    settings: { theme: 'dark', restSeconds: 60, soundMode: 'full', keepAwake: true, focusMode: false, coachMode: true },
    meta: { activeProgramId: defaultProgram.id, currentView: 'home', firebaseReady: false, syncStatus: appConfig.useFirebase ? 'Conectando…' : 'Solo local', currentSessionId: '', currentReportDraft: null, currentMetricDraft: null, progressSelectedExercise: '' },
    programs: [defaultProgram],
    sessions: [],
    reports: [],
    bodyMetrics: [],
    exerciseLibrary: defaultExerciseLibrary([defaultProgram]),
    auth: { uid: '', email: '', loggedIn: false },
    undoStack: []
  };
}

function persistState() {
  const payload = { ...state, undoStack: state.undoStack.slice(0, 10) };
  saveJson(STORAGE_KEY, payload);
}

function pushUndo(label) {
  state.undoStack.unshift({
    id: uid(),
    label,
    at: nowIso(),
    snapshot: clone({ programs: state.programs, sessions: state.sessions, reports: state.reports, bodyMetrics: state.bodyMetrics, exerciseLibrary: state.exerciseLibrary, meta: { activeProgramId: state.meta.activeProgramId } })
  });
  state.undoStack = state.undoStack.slice(0, 10);
}

function restoreUndo() {
  const entry = state.undoStack.shift();
  if (!entry) return alert('No hay nada para deshacer.');
  state.programs = entry.snapshot.programs || state.programs;
  state.sessions = entry.snapshot.sessions || state.sessions;
  state.reports = entry.snapshot.reports || state.reports;
  state.bodyMetrics = entry.snapshot.bodyMetrics || state.bodyMetrics;
  state.exerciseLibrary = entry.snapshot.exerciseLibrary || state.exerciseLibrary;
  state.meta.activeProgramId = entry.snapshot.meta?.activeProgramId || state.meta.activeProgramId;
  if (!activeProgram() && state.programs[0]) state.meta.activeProgramId = state.programs[0].id;
  if (state.auth.loggedIn && state.auth.uid) {
    ['programs', 'sessions', 'reports', 'bodyMetrics', 'exerciseLibrary'].forEach((name) => state[name].forEach((item) => syncCollectionItem(name, item.id, item)));
  }
  queueRender();
}

function setCurrentSession(session) {
  state.meta.currentSessionId = session?.id || '';
  saveJson(CURRENT_SESSION_KEY, session || null);
  persistState();
}

function currentSession() {
  return loadJson(CURRENT_SESSION_KEY, null);
}

function activeProgram() {
  return state.programs.find((item) => item.id === state.meta.activeProgramId)
    || state.programs.find((item) => item.status === 'active')
    || state.programs[0]
    || null;
}

function updateTheme() {
  document.body.classList.toggle('light', state.settings.theme === 'light');
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderView(state.meta.currentView || 'home');
    updateTimerFab();
    persistState();
  });
}

function setView(view) {
  state.meta.currentView = view;
  Object.entries(el.views).forEach(([name, node]) => node.classList.toggle('active', name === view));
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  queueRender();
}

function deriveExerciseLibrary(existing = [], programs = state.programs) {
  const map = new Map(existing.map((item) => [normalize(item.name), { ...item }]));
  programs.forEach((program) => {
    (program.days || []).forEach((day) => {
      (day.exercises || []).forEach((exercise) => {
        const key = normalize(exercise.name);
        const previous = map.get(key) || { id: uid(), aliases: [] };
        map.set(key, {
          id: previous.id,
          name: exercise.name,
          group: exercise.group || previous.group || '',
          type: exercise.type || previous.type || '',
          defaultTempo: exercise.tempo || previous.defaultTempo || '',
          defaultRest: Number(exercise.restSeconds || previous.defaultRest || state.settings.restSeconds || 60),
          unilateral: !!(exercise.unilateral || previous.unilateral),
          notes: exercise.notes || previous.notes || '',
          aliases: Array.from(new Set([...(previous.aliases || []), ...(exercise.aliases || [])])).filter(Boolean),
          updatedAt: nowIso()
        });
      });
    });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function syncLibraryFromPrograms() {
  state.exerciseLibrary = deriveExerciseLibrary(state.exerciseLibrary, state.programs);
  if (state.auth.loggedIn && state.auth.uid) {
    state.exerciseLibrary.forEach((item) => syncCollectionItem('exerciseLibrary', item.id, item));
  }
}

function weekRange(dateString = today()) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [inputDate(start), inputDate(end)];
}

function sessionsThisWeek() {
  const [start, end] = weekRange();
  return state.sessions.filter((item) => item.date >= start && item.date <= end);
}

function reportsThisWeek() {
  const [start, end] = weekRange();
  return state.reports.filter((item) => item.date >= start && item.date <= end);
}

function metricsSorted() {
  return [...state.bodyMetrics].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function latestMetric() {
  return metricsSorted()[0] || null;
}

function previousMetric() {
  return metricsSorted()[1] || null;
}

function getNextDay() {
  const program = activeProgram();
  if (!program?.days?.length) return null;
  const lastSession = [...state.sessions].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  if (!lastSession) return program.days[0];
  const index = program.days.findIndex((day) => day.id === lastSession.dayId);
  return program.days[(index + 1 + program.days.length) % program.days.length] || program.days[0];
}

function getLastExerciseMemory(name) {
  const key = normalize(name);
  const sessions = [...state.sessions].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  for (const session of sessions) {
    const found = (session.exercises || []).find((exercise) => normalize(exercise.name) === key);
    if (found) return found;
  }
  return null;
}

function getExerciseHistory(name, limit = 6) {
  const key = normalize(name);
  const rows = [];
  [...state.sessions]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .forEach((session) => {
      const found = (session.exercises || []).find((exercise) => normalize(exercise.name) === key);
      if (!found) return;
      const reps = (found.sets || []).map((set) => Number(set.reps || 0)).filter(Boolean);
      const weights = (found.sets || []).map((set) => Number(set.weight || 0)).filter(Boolean);
      rows.push({
        date: session.date,
        sessionId: session.id,
        dayTitle: session.dayTitle,
        bestWeight: weights.length ? Math.max(...weights) : 0,
        totalVolume: (found.sets || []).reduce((sum, set) => sum + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0),
        avgRir: avg((found.sets || []).map((set) => Number(set.rir || 0)).filter((value) => Number.isFinite(value))),
        repsText: reps.join('/'),
        sets: found.sets || []
      });
    });
  return rows.slice(0, limit);
}

function getBestExerciseRecord(name) {
  return getExerciseHistory(name, 20).sort((a, b) => (b.bestWeight || 0) - (a.bestWeight || 0) || (b.totalVolume || 0) - (a.totalVolume || 0))[0] || null;
}

function extractMinRep(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function avg(values) {
  if (!values?.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    programSnapshot: clone({ id: program.id, name: program.name, goal: program.goal, week: program.currentWeek, status: program.status }),
    dayId: day.id,
    dayTitle: day.title,
    daySubtitle: day.subtitle,
    date: today(),
    includeCore: false,
    includeCalves: false,
    cardioDone: false,
    notes: '',
    createdAt: nowIso(),
    finishedAt: '',
    exercises: (day.exercises || []).map((exercise) => {
      const memory = getLastExerciseMemory(exercise.name);
      const suggestion = suggestFromHistory(exercise.name);
      return {
        id: exercise.id || uid(),
        name: exercise.name,
        restSeconds: Number(exercise.restSeconds || state.settings.restSeconds || 60),
        tempo: exercise.tempo || '',
        notes: exercise.notes || '',
        group: exercise.group || '',
        type: exercise.type || '',
        unilateral: !!exercise.unilateral,
        priority: exercise.priority || 'main',
        suggestedNextWeight: suggestion.nextWeight || '',
        sets: Array.from({ length: Number(exercise.sets) || 0 }, (_, index) => {
          const previous = memory?.sets?.[index] || {};
          return {
            index: index + 1,
            targetReps: exercise.reps,
            weight: previous.weight || suggestion.nextWeight || '',
            reps: previous.reps || '',
            rir: previous.rir || '2',
            done: false,
            completedAt: ''
          };
        }),
        completed: false
      };
    })
  };
  setCurrentSession(session);
  maybeAcquireWakeLock();
  return session;
}

function currentExerciseIndex(session) {
  const exercises = session?.exercises || [];
  const index = exercises.findIndex((exercise) => (exercise.sets || []).some((set) => !set.done));
  return index >= 0 ? index : 0;
}

function volumeForSession(session) {
  return (session?.exercises || []).reduce((total, exercise) => total + (exercise.sets || []).reduce((sum, set) => sum + ((Number(set.weight) || 0) * (Number(set.reps) || 0)), 0), 0);
}

function setsDoneCount(session) {
  return (session?.exercises || []).reduce((total, exercise) => total + (exercise.sets || []).filter((set) => set.done).length, 0);
}

function workoutExerciseCount(session) {
  return session?.exercises?.length || 0;
}

function exerciseCompleted(exercise) {
  return (exercise?.sets || []).length ? exercise.sets.every((set) => set.done) : false;
}

function saveSession(finalize = false) {
  const session = currentSession();
  if (!session) return;
  pushUndo(finalize ? 'Guardar sesión' : 'Guardar borrador');
  const payload = { ...session, updatedAt: nowIso() };
  if (finalize) payload.finishedAt = nowIso();
  const index = state.sessions.findIndex((item) => item.id === payload.id);
  if (index >= 0) state.sessions[index] = payload;
  else state.sessions.unshift(payload);
  syncCollectionItem('sessions', payload.id, payload);
  setCurrentSession(finalize ? null : payload);
  if (finalize) releaseWakeLock();
  queueRender();
}

function saveReport(report) {
  pushUndo('Guardar reporte');
  const payload = { ...report, updatedAt: nowIso() };
  const index = state.reports.findIndex((item) => item.id === payload.id);
  if (index >= 0) state.reports[index] = payload;
  else state.reports.unshift(payload);
  syncCollectionItem('reports', payload.id, payload);
  queueRender();
}

function saveMetric(metric, updateDraft = false) {
  pushUndo('Guardar métrica');
  const payload = { ...metric, updatedAt: nowIso() };
  const index = state.bodyMetrics.findIndex((item) => item.id === payload.id);
  if (index >= 0) state.bodyMetrics[index] = payload;
  else state.bodyMetrics.unshift(payload);
  syncCollectionItem('bodyMetrics', payload.id, payload);
  if (updateDraft) state.meta.currentMetricDraft = createEmptyMetric();
  queueRender();
}

function duplicateSessionToCurrent(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const duplicated = clone(session);
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

function suggestFromHistory(name) {
  const memory = getLastExerciseMemory(name);
  if (!memory?.sets?.length) return { label: 'Primera vez en este ejercicio', nextWeight: '' };
  const lastWeight = Number(memory.sets[memory.sets.length - 1]?.weight || 0);
  const avgRir = avg(memory.sets.map((set) => Number(set.rir || 0)).filter((value) => Number.isFinite(value)));
  const allTargets = memory.sets.every((set) => Number(set.reps || 0) >= extractMinRep(set.targetReps));
  if (!lastWeight) return { label: 'Usa como base el último peso que te resulte cómodo', nextWeight: '' };
  if (allTargets && avgRir >= 2) return { label: `Coach: prueba ${formatNumber(lastWeight + 2.5)} kg`, nextWeight: String(lastWeight + 2.5) };
  if (avgRir < 1) return { label: `Coach: baja a ${formatNumber(Math.max(0, lastWeight - 2.5))} kg`, nextWeight: String(Math.max(0, lastWeight - 2.5)) };
  return { label: `Coach: mantén ${formatNumber(lastWeight)} kg`, nextWeight: String(lastWeight) };
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function formatMetricValue(value) {
  return value ? `${formatNumber(value)} cm` : '—';
}

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

function saveTimer() {
  saveJson(TIMER_KEY, timerState);
}

function playToneSequence(sequence, vibratePattern) {
  const soundMode = state.settings.soundMode;
  if (soundMode === 'silent') return;
  if (navigator.vibrate && vibratePattern && soundMode !== 'full') navigator.vibrate(vibratePattern);
  if (soundMode !== 'full') return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    sequence.forEach((tone) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type || 'triangle';
      osc.frequency.value = tone.frequency;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + tone.start + tone.duration);
      osc.stop(ctx.currentTime + tone.start + tone.duration);
    });
    if (navigator.vibrate && vibratePattern) navigator.vibrate(vibratePattern);
  } catch {
    if (navigator.vibrate && vibratePattern) navigator.vibrate(vibratePattern);
  }
}

function playRestStart() {
  if (state.settings.soundMode === 'silent') return;
  playToneSequence([{ frequency: 620, start: 0, duration: 0.12, type: 'sine' }], [60]);
}

function playTimerEnd() {
  if (state.settings.soundMode === 'silent') return;
  playToneSequence([
    { frequency: 720, start: 0, duration: 0.16 },
    { frequency: 880, start: 0.2, duration: 0.18 },
    { frequency: 1040, start: 0.42, duration: 0.32 }
  ], [100, 70, 120, 70, 180]);
}

function unlockSoundSoft() {
  if (soundUnlocked) return;
  soundUnlocked = true;
  saveJson(SOUND_KEY, true);
}

function startTimer(seconds, source = '') {
  unlockSoundSoft();
  playRestStart();
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
  const running = timerState.running;
  el.fabTimer.textContent = `${renderTimerValue()}${timerState.source ? ` · ${timerState.source}` : ''}`;
  el.fabTimer.classList.toggle('hidden', !running);
}

function renderTimerInWorkout() {
  const valueNode = document.getElementById('timerBoxValue');
  if (valueNode) valueNode.textContent = renderTimerValue();
  const sourceNode = document.getElementById('timerSourceLabel');
  if (sourceNode) sourceNode.textContent = timerState.source || 'Descanso';
}

async function maybeAcquireWakeLock() {
  if (!state.settings.keepAwake) return;
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {}
}

async function releaseWakeLock() {
  try {
    await wakeLock?.release();
    wakeLock = null;
  } catch {}
}

function computeWeightDelta(currentWeight, previousWeight) {
  const current = Number(String(currentWeight || '').replace(',', '.'));
  const previous = Number(String(previousWeight || '').replace(',', '.'));
  if (!Number.isFinite(current) || !Number.isFinite(previous) || !current || !previous) return '';
  const delta = current - previous;
  return `${delta > 0 ? '+' : ''}${formatNumber(delta)} kg`;
}

function reportAutoFill(base = {}) {
  const latest = latestMetric();
  const previous = previousMetric();
  return createEmptyReport({
    currentWeight: base.currentWeight ?? latest?.weight ?? '',
    previousWeight: base.previousWeight ?? previous?.weight ?? '',
    trainingSessions: base.trainingSessions ?? String(sessionsThisWeek().length || ''),
    systemWeek: base.systemWeek ?? String(activeProgram()?.currentWeek || ''),
    cardioSessions: base.cardioSessions ?? latestReportField('cardioSessions'),
    cardioDuration: base.cardioDuration ?? latestReportField('cardioDuration'),
    cardioTime: base.cardioTime ?? latestReportField('cardioTime'),
    weightDelta: computeWeightDelta(base.currentWeight ?? latest?.weight, base.previousWeight ?? previous?.weight),
    ...base
  });
}

function latestReportField(field) {
  return state.reports.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]?.[field] || '';
}

function createProgramVersionFromActive(name) {
  const current = activeProgram();
  if (!current) return;
  pushUndo('Duplicar rutina');
  state.programs.forEach((program) => {
    if (program.id === current.id && program.status === 'active') program.status = 'archived';
  });
  const copy = clone(current);
  copy.id = uid();
  copy.name = name || `${current.name} · ${today()}`;
  copy.status = 'active';
  copy.startDate = today();
  copy.endDate = '';
  copy.currentWeek = 1;
  state.programs.unshift(copy);
  state.meta.activeProgramId = copy.id;
  syncCollectionItem('programs', copy.id, copy);
  syncLibraryFromPrograms();
  queueRender();
}

function createBlankProgram() {
  const program = {
    id: uid(),
    name: `Nuevo bloque ${today()}`,
    status: 'draft',
    goal: '',
    startDate: today(),
    endDate: '',
    currentWeek: 1,
    phaseNotes: '',
    days: [
      { id: uid(), title: 'Día 1', subtitle: '', exercises: [] },
      { id: uid(), title: 'Día 2', subtitle: '', exercises: [] }
    ],
    blocks: baseBlocks()
  };
  pushUndo('Crear bloque');
  state.programs.unshift(program);
  state.meta.activeProgramId = program.id;
  syncCollectionItem('programs', program.id, program);
  queueRender();
}

function saveProgram(program) {
  program.updatedAt = nowIso();
  const index = state.programs.findIndex((item) => item.id === program.id);
  if (index >= 0) state.programs[index] = program;
  else state.programs.unshift(program);
  syncCollectionItem('programs', program.id, program);
  syncLibraryFromPrograms();
  queueRender();
}

function activateProgram(programId) {
  pushUndo('Activar bloque');
  state.programs.forEach((item) => {
    if (item.id === programId) item.status = 'active';
    else if (item.status === 'active') item.status = 'archived';
  });
  state.meta.activeProgramId = programId;
  const program = state.programs.find((item) => item.id === programId);
  if (program) syncCollectionItem('programs', program.id, program);
  queueRender();
}

function deleteProgram(programId) {
  if (!confirm('¿Borrar este bloque?')) return;
  pushUndo('Borrar bloque');
  state.programs = state.programs.filter((item) => item.id !== programId);
  if (!state.programs.length) state.programs = [createDefaultProgram()];
  if (state.meta.activeProgramId === programId) state.meta.activeProgramId = state.programs[0].id;
  removeCollectionItem('programs', programId);
  syncLibraryFromPrograms();
  queueRender();
}

function addExerciseToSelectedDays(formData) {
  const program = activeProgram();
  if (!program) return;
  const dayIds = formData.getAll('dayTargets');
  if (!dayIds.length) return alert('Selecciona al menos un día.');
  pushUndo('Añadir ejercicio en varios días');
  const template = ex(
    formData.get('exerciseName'),
    Number(formData.get('exerciseSets') || 3),
    formData.get('exerciseReps') || '10',
    Number(formData.get('exerciseRest') || state.settings.restSeconds || 60),
    formData.get('exerciseTempo') || '',
    formData.get('exerciseNotes') || '',
    {
      group: formData.get('exerciseGroup') || '',
      type: formData.get('exerciseType') || '',
      priority: formData.get('exercisePriority') || 'main'
    }
  );
  dayIds.forEach((dayId) => {
    const day = program.days.find((item) => item.id === dayId);
    if (day) day.exercises.push({ ...clone(template), id: uid() });
  });
  saveProgram(program);
}

function templateDefinitions() {
  return {
    core: [
      ex('Encogimientos muy lentos', 3, '20', 60, 'Lento', 'Suelo o máquina', { group: 'Core', priority: 'support' }),
      ex('Elevaciones de piernas estiradas', 3, '20', 60, 'Controlado', 'Sin tocar suelo', { group: 'Core', priority: 'support' })
    ],
    calves: [ex('Elevaciones en bordillo o escalera', 1, '50', 60, 'Controlado', 'Sin descanso', { group: 'Gemelos', priority: 'support' })],
    cardio: [ex('Cardio', 1, '20 min', 0, 'Continuo', 'Añade duración real', { group: 'Cardio', priority: 'optional' })],
    warmup: [ex('Calentamiento', 1, '8 min', 0, 'Progresivo', 'Movilidad + activación', { group: 'Warmup', priority: 'support' })]
  };
}

function addTemplateToDays(templateKey, dayIds) {
  const program = activeProgram();
  const templates = templateDefinitions();
  const items = templates[templateKey] || [];
  if (!program || !items.length || !dayIds.length) return alert('Selecciona una plantilla y al menos un día.');
  pushUndo('Añadir plantilla');
  dayIds.forEach((dayId) => {
    const day = program.days.find((item) => item.id === dayId);
    if (!day) return;
    items.forEach((exercise) => day.exercises.push({ ...clone(exercise), id: uid() }));
  });
  saveProgram(program);
}

function moveExercise(dayId, index, direction) {
  const program = activeProgram();
  if (!program) return;
  const day = program.days.find((item) => item.id === dayId);
  if (!day) return;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= day.exercises.length) return;
  pushUndo('Reordenar ejercicio');
  [day.exercises[index], day.exercises[nextIndex]] = [day.exercises[nextIndex], day.exercises[index]];
  saveProgram(program);
}

function deleteExerciseFromDay(dayId, index) {
  const program = activeProgram();
  if (!program) return;
  const day = program.days.find((item) => item.id === dayId);
  if (!day) return;
  if (!confirm('¿Quitar este ejercicio del día?')) return;
  pushUndo('Quitar ejercicio');
  day.exercises.splice(index, 1);
  saveProgram(program);
}

function importProgramFromText(raw) {
  const lines = String(raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return alert('Pega una rutina válida.');
  const program = {
    id: uid(),
    name: `Rutina importada ${today()}`,
    status: 'active',
    goal: '',
    startDate: today(),
    endDate: '',
    currentWeek: 1,
    phaseNotes: '',
    days: [],
    blocks: baseBlocks()
  };
  let currentDay = null;
  lines.forEach((line) => {
    if (/^dia\s*\d+/i.test(line)) {
      currentDay = { id: uid(), title: line.replace(':', ''), subtitle: '', exercises: [] };
      program.days.push(currentDay);
      return;
    }
    if (!currentDay) return;
    if (!currentDay.subtitle && !/\dx/i.test(line) && !/^rir|descanso|empezamos/i.test(line)) {
      currentDay.subtitle = line;
      return;
    }
    const match = line.match(/^(.*?)(\d+)x([^\.]+)(?:\.(.*))?$/i);
    if (match) {
      const name = match[1].replace(/[\.:-]+$/g, '').trim();
      currentDay.exercises.push(ex(name, Number(match[2]), match[3].trim(), state.settings.restSeconds || 60, '', (match[4] || '').trim()));
      return;
    }
    if (/descanso|rir/i.test(line)) program.phaseNotes += `${line}\n`;
  });
  if (!program.days.length) return alert('No se detectaron días en el texto.');
  pushUndo('Importar rutina');
  state.programs.forEach((item) => { if (item.status === 'active') item.status = 'archived'; });
  state.programs.unshift(program);
  state.meta.activeProgramId = program.id;
  syncCollectionItem('programs', program.id, program);
  syncLibraryFromPrograms();
  queueRender();
}

function importProgramFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (/\.json$/i.test(file.name)) {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (parsed?.days?.length) {
          const program = { ...parsed, id: uid(), status: 'active', startDate: today(), currentWeek: 1 };
          pushUndo('Importar JSON de rutina');
          state.programs.forEach((item) => { if (item.status === 'active') item.status = 'archived'; });
          state.programs.unshift(program);
          state.meta.activeProgramId = program.id;
          syncCollectionItem('programs', program.id, program);
          syncLibraryFromPrograms();
          queueRender();
          return;
        }
      } catch {
        alert('No se pudo leer el JSON de rutina.');
        return;
      }
    }
    importProgramFromText(String(reader.result || ''));
  };
  reader.readAsText(file);
}

function reportFields(draft) {
  const groups = [
    {
      title: 'Peso',
      fields: [
        ['date', 'Fecha', 'date'],
        ['currentWeight', 'Peso actual', 'text'],
        ['previousWeight', 'Peso semana pasada', 'text'],
        ['weightDelta', 'Diferencia de peso', 'text', true]
      ]
    },
    {
      title: 'Sensaciones',
      fields: [
        ['strength', 'Fuerza', 'text'],
        ['pump', 'Congestión', 'text'],
        ['recovery', 'Recuperación', 'text']
      ]
    },
    {
      title: 'Descanso',
      fields: [
        ['sleepHours', 'Horas dormidas', 'text'],
        ['dailyRecovery', 'Recuperación / estrés', 'textarea']
      ]
    },
    {
      title: 'Cardio y entreno',
      fields: [
        ['cardioSessions', 'Sesiones cardiovasculares', 'text'],
        ['cardioDuration', 'Duración cardio', 'text'],
        ['cardioTime', 'Momento del día', 'text'],
        ['trainingSessions', 'Sesiones de esta semana', 'text'],
        ['systemWeek', 'Semana del sistema actual', 'text']
      ]
    },
    {
      title: 'Alimentación',
      fields: [
        ['dietCompliance', 'Cumplimiento dieta', 'text'],
        ['foodChanges', 'Alimentos a cambiar', 'textarea'],
        ['appetite', 'Nivel de apetito', 'text'],
        ['digestion', 'Digestiones', 'textarea']
      ]
    },
    {
      title: 'Otros',
      fields: [
        ['therapyWeek', 'Semana de terapia actual', 'text'],
        ['tpcWeek', 'Semana de TPC actual', 'text'],
        ['photosStatus', 'Fotos reglamentarias', 'text'],
        ['menstrualPhase', 'Fase menstrual', 'text'],
        ['notes', 'Notas extra', 'textarea']
      ]
    }
  ];
  return groups.map((group) => `
    <div class="card inset-card">
      <div class="section-head"><div><p class="eyebrow">REPORTE</p><h3>${group.title}</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${group.fields.map(([key, label, type, readonly]) => `
          <div class="field">
            <span class="label">${label}</span>
            ${type === 'textarea'
              ? `<textarea name="${key}" ${readonly ? 'readonly' : ''}>${escapeHtml(draft[key] || '')}</textarea>`
              : `<input name="${key}" type="${type}" value="${escapeAttr(draft[key] || '')}" ${readonly ? 'readonly' : ''}>`}
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function coachForDay(day) {
  if (!day?.exercises?.length) return 'Carga una rutina o añade ejercicios.';
  const first = day.exercises[0];
  const memory = getLastExerciseMemory(first.name);
  const hint = suggestFromHistory(first.name);
  if (!memory) return `Hoy toca ${day.title} · ${day.subtitle}. Empieza por ${first.name}.`;
  const lastSet = memory.sets?.[memory.sets.length - 1] || {};
  return `Hoy toca ${day.title}. Última vez en ${first.name}: ${lastSet.weight || '—'} kg × ${lastSet.reps || '—'}. ${hint.label}.`;
}

function renderHome() {
  const program = activeProgram();
  const current = currentSession();
  const nextDay = current ? { title: current.dayTitle, subtitle: current.daySubtitle, exercises: current.exercises } : getNextDay();
  const weekSessions = sessionsThisWeek();
  const weekReports = reportsThisWeek();
  const latest = latestMetric();
  const previous = previousMetric();
  const weightDelta = computeWeightDelta(latest?.weight, previous?.weight);
  const coreCount = weekSessions.filter((item) => item.includeCore).length;
  const calvesCount = weekSessions.filter((item) => item.includeCalves).length;
  const currentWeek = Number(program?.currentWeek || 1);

  el.views.home.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">BLOQUE ACTIVO</p>
          <h2>${program?.name || 'Sin rutina activa'}</h2>
          <p class="subtitle">${program?.goal || 'Sin objetivo'} · semana ${currentWeek} · ${program?.status || '—'}</p>
          <p class="micro" style="margin-top:8px">${escapeHtml(program?.phaseNotes || 'Carga o crea una rutina para empezar.')}</p>
        </div>
        <span class="badge">${state.meta.syncStatus}</span>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="startWorkoutBtn">${current ? 'Continuar entreno' : 'Empezar siguiente día'}</button>
        <button class="btn btn-secondary" id="gotoProgramsBtn">Rutinas</button>
      </div>
    </div>

    <div class="card coach-card ${state.settings.coachMode ? '' : 'coach-card-off'}">
      <div class="section-head">
        <div>
          <p class="eyebrow">MODO COACH</p>
          <h3>${nextDay ? `${nextDay.title} · ${nextDay.subtitle || ''}` : 'Sin día siguiente'}</h3>
          <p class="subtitle">${state.settings.coachMode ? coachForDay(nextDay) : 'Actívalo en Ajustes para ver recomendaciones automáticas.'}</p>
        </div>
        <button class="chip" id="toggleCoachBtn">${state.settings.coachMode ? 'Ocultar coach' : 'Activar coach'}</button>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card stat"><span class="label">Peso actual</span><strong>${latest?.weight ? `${latest.weight} kg` : '—'}</strong></div>
      <div class="card stat"><span class="label">Diferencia</span><strong>${weightDelta || '—'}</strong></div>
      <div class="card stat"><span class="label">Entrenos semana</span><strong>${weekSessions.length}</strong></div>
      <div class="card stat"><span class="label">Reportes semana</span><strong>${weekReports.length}</strong></div>
      <div class="card stat"><span class="label">Core</span><strong>${coreCount} / ${program?.blocks?.core?.weeklyTarget || 2}</strong></div>
      <div class="card stat"><span class="label">Gemelos</span><strong>${calvesCount} / ${program?.blocks?.calves?.weeklyTarget || 2}</strong></div>
    </div>

    <div class="grid-2-md">
      <div class="card">
        <div class="section-head"><div><p class="eyebrow">ACCIONES RÁPIDAS</p><h3>Semana</h3></div></div>
        <div class="row" style="margin-top:12px">
          <button class="chip" id="quickCoreBtn">Añadir core</button>
          <button class="chip" id="quickCalvesBtn">Añadir gemelos</button>
          <button class="chip" id="quickWeightBtn">Registrar peso</button>
          <button class="chip" id="quickMetricBtn">Medidas</button>
          <button class="chip" id="quickReportBtn">Reporte</button>
        </div>
      </div>
      <div class="card">
        <div class="section-head"><div><p class="eyebrow">MEDIDAS</p><h3>Último control</h3></div></div>
        <div class="grid grid-2" style="margin-top:12px">
          <div class="stat"><span class="label">Cintura</span><strong>${formatMetricValue(latest?.waist)}</strong></div>
          <div class="stat"><span class="label">Pecho</span><strong>${formatMetricValue(latest?.chest)}</strong></div>
          <div class="stat"><span class="label">Brazo</span><strong>${formatMetricValue(latest?.arm)}</strong></div>
          <div class="stat"><span class="label">Pierna</span><strong>${formatMetricValue(latest?.thigh)}</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">SESIONES RECIENTES</p><h3>Rehacer o duplicar</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${state.sessions.slice(0, 6).map((session) => `
          <div class="session-card">
            <div class="section-head">
              <div>
                <strong>${session.dayTitle} · ${session.daySubtitle || ''}</strong>
                <div class="micro">${session.date} · ${setsDoneCount(session)} series · ${formatNumber(volumeForSession(session))} kg</div>
              </div>
              <div class="row tiny-row">
                <button class="chip" data-redo-session="${session.id}">Rehacer día</button>
                <button class="chip" data-clone-session="${session.id}">Duplicar</button>
              </div>
            </div>
          </div>`).join('') || '<div class="empty">Todavía no hay sesiones guardadas.</div>'}
      </div>
    </div>`;

  document.getElementById('startWorkoutBtn')?.addEventListener('click', () => {
    if (current) setView('workout');
    else if (nextDay) {
      buildWorkoutSession(nextDay.id);
      setView('workout');
    }
  });
  document.getElementById('gotoProgramsBtn')?.addEventListener('click', () => setView('programs'));
  document.getElementById('toggleCoachBtn')?.addEventListener('click', () => { state.settings.coachMode = !state.settings.coachMode; queueRender(); });
  document.getElementById('quickCoreBtn')?.addEventListener('click', () => {
    if (!currentSession()) buildWorkoutSession(getNextDay()?.id || activeProgram()?.days?.[0]?.id);
    const session = currentSession();
    if (!session) return;
    session.includeCore = true;
    setCurrentSession(session);
    setView('workout');
  });
  document.getElementById('quickCalvesBtn')?.addEventListener('click', () => {
    if (!currentSession()) buildWorkoutSession(getNextDay()?.id || activeProgram()?.days?.[0]?.id);
    const session = currentSession();
    if (!session) return;
    session.includeCalves = true;
    setCurrentSession(session);
    setView('workout');
  });
  document.getElementById('quickWeightBtn')?.addEventListener('click', () => {
    const value = prompt('Peso actual en kg');
    if (!value) return;
    saveMetric(createEmptyMetric({ weight: value }), false);
  });
  document.getElementById('quickMetricBtn')?.addEventListener('click', () => { state.meta.currentMetricDraft = createEmptyMetric(); setView('progress'); });
  document.getElementById('quickReportBtn')?.addEventListener('click', () => { state.meta.currentReportDraft = reportAutoFill(); setView('reports'); });
  el.views.home.querySelectorAll('[data-redo-session]').forEach((btn) => btn.addEventListener('click', () => duplicateSessionToCurrent(btn.dataset.redoSession)));
  el.views.home.querySelectorAll('[data-clone-session]').forEach((btn) => btn.addEventListener('click', () => duplicateSessionToCurrent(btn.dataset.cloneSession)));
}

function renderExerciseCard(session, exercise, exerciseIndex, focused = false) {
  const history = getExerciseHistory(exercise.name, 3);
  const best = getBestExerciseRecord(exercise.name);
  const coach = suggestFromHistory(exercise.name);
  return `
    <div class="exercise-card ${focused ? 'exercise-focus' : ''}">
      <div class="exercise-top">
        <div>
          <h3>${exercise.name}</h3>
          <div class="micro">${exercise.group || 'Grupo libre'} · ${exercise.type || 'Tipo libre'} · ${exercise.tempo || 'Tempo libre'} · descanso ${exercise.restSeconds}s</div>
          ${exercise.notes ? `<div class="micro">${escapeHtml(exercise.notes)}</div>` : ''}
          <div class="coach-inline">${coach.label}</div>
        </div>
        <div class="row tiny-row action-column">
          <button class="chip" data-ex-complete="${exerciseIndex}">Ejercicio hecho</button>
          <button class="chip" data-ex-redo="${exerciseIndex}">Rehacer</button>
        </div>
      </div>
      <div class="mini-history-grid">
        <div class="stat mini"><span class="label">Última</span><strong>${history[0]?.bestWeight ? `${formatNumber(history[0].bestWeight)} kg` : '—'}</strong></div>
        <div class="stat mini"><span class="label">Mejor</span><strong>${best?.bestWeight ? `${formatNumber(best.bestWeight)} kg` : '—'}</strong></div>
        <div class="stat mini"><span class="label">Volumen</span><strong>${history[0]?.totalVolume ? `${formatNumber(history[0].totalVolume)} kg` : '—'}</strong></div>
      </div>
      ${(exercise.sets || []).map((set, setIndex) => `
        <div class="set-grid ${set.done ? 'set-done' : ''}">
          <div class="set-chip">S${set.index}</div>
          <input data-set-field="weight" data-ex-index="${exerciseIndex}" data-set-index="${setIndex}" type="number" inputmode="decimal" placeholder="kg" value="${escapeAttr(set.weight)}">
          <input data-set-field="reps" data-ex-index="${exerciseIndex}" data-set-index="${setIndex}" type="number" inputmode="numeric" placeholder="reps" value="${escapeAttr(set.reps)}">
          <input class="rir-input" data-set-field="rir" data-ex-index="${exerciseIndex}" data-set-index="${setIndex}" type="number" inputmode="numeric" placeholder="RIR" value="${escapeAttr(set.rir)}">
          <button class="btn ${set.done ? 'btn-secondary' : 'btn-primary'} done-btn" data-set-done="${exerciseIndex}:${setIndex}">${set.done ? 'Hecha' : 'Marcar'}</button>
        </div>`).join('')}
      <div class="row tiny-row" style="margin-top:10px">
        <button class="chip" data-copy-last="${exerciseIndex}">Copiar última vez</button>
        <button class="chip" data-start-rest="${exerciseIndex}">Descanso</button>
      </div>
      ${history.length ? `<div class="history-list">${history.map((item) => `<div class="history-pill">${item.date}: ${formatNumber(item.bestWeight || 0)} kg · ${item.repsText || '—'}</div>`).join('')}</div>` : ''}
    </div>`;
}

function renderWorkout() {
  const session = currentSession();
  if (!session) {
    el.views.workout.innerHTML = `<div class="card"><div class="empty">No hay entreno activo. Empieza desde Inicio.</div></div>`;
    return;
  }
  const focusIndex = currentExerciseIndex(session);
  const currentExercise = session.exercises[focusIndex];
  const nextExercise = session.exercises[focusIndex + 1];
  const exercisesMarkup = state.settings.focusMode
    ? [
        currentExercise ? renderExerciseCard(session, currentExercise, focusIndex, true) : '',
        nextExercise ? `<div class="card inset-card"><p class="eyebrow">SIGUIENTE</p><h3 style="margin:0">${nextExercise.name}</h3><p class="subtitle">${nextExercise.tempo || 'Tempo libre'} · descanso ${nextExercise.restSeconds}s</p></div>` : ''
      ].join('')
    : session.exercises.map((exercise, index) => renderExerciseCard(session, exercise, index)).join('');

  el.views.workout.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">ENTRENO ACTIVO</p>
          <h2>${session.dayTitle} · ${session.daySubtitle || ''}</h2>
          <p class="subtitle">${session.programName} · ${session.date}</p>
        </div>
        <span class="badge">${setsDoneCount(session)} series</span>
      </div>
      <div class="grid grid-3" style="margin-top:12px">
        <div class="stat"><span class="label">Volumen</span><strong>${formatNumber(volumeForSession(session))} kg</strong></div>
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
        <label><input type="checkbox" id="workoutCardioToggle" ${session.cardioDone ? 'checked' : ''}> Cardio</label>
        <label><input type="checkbox" id="focusModeToggle" ${state.settings.focusMode ? 'checked' : ''}> Modo entreno</label>
      </div>
      <div class="field"><span class="label">Notas del entreno</span><textarea id="workoutNotesInput">${escapeHtml(session.notes || '')}</textarea></div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary" id="saveDraftBtn">Guardar borrador</button>
        <button class="btn btn-primary" id="finishWorkoutBtn">Guardar sesión</button>
      </div>
    </div>
    <div class="stack" id="exerciseList">${exercisesMarkup}</div>`;

  document.getElementById('timerStartBtn')?.addEventListener('click', () => timerState.running ? pauseTimer() : startTimer(timerState.remaining || state.settings.restSeconds || 60, timerState.source || 'Descanso'));
  document.getElementById('timerAddBtn')?.addEventListener('click', () => { timerState.running ? timerState.total += 15 : timerState.remaining += 15; saveTimer(); runTimerLoop(); });
  document.getElementById('timerSubBtn')?.addEventListener('click', () => { timerState.running ? timerState.total = Math.max(0, timerState.total - 15) : timerState.remaining = Math.max(0, timerState.remaining - 15); saveTimer(); runTimerLoop(); });
  document.getElementById('workoutCoreToggle')?.addEventListener('change', (event) => { const s = currentSession(); s.includeCore = event.target.checked; setCurrentSession(s); });
  document.getElementById('workoutCalvesToggle')?.addEventListener('change', (event) => { const s = currentSession(); s.includeCalves = event.target.checked; setCurrentSession(s); });
  document.getElementById('workoutCardioToggle')?.addEventListener('change', (event) => { const s = currentSession(); s.cardioDone = event.target.checked; setCurrentSession(s); });
  document.getElementById('focusModeToggle')?.addEventListener('change', async (event) => {
    state.settings.focusMode = event.target.checked;
    if (state.settings.focusMode) await maybeAcquireWakeLock();
    queueRender();
  });
  document.getElementById('workoutNotesInput')?.addEventListener('input', debounce((event) => { const s = currentSession(); s.notes = event.target.value; setCurrentSession(s); }, 180));
  document.getElementById('saveDraftBtn')?.addEventListener('click', () => saveSession(false));
  document.getElementById('finishWorkoutBtn')?.addEventListener('click', () => saveSession(true));

  el.views.workout.querySelectorAll('[data-set-field]').forEach((input) => {
    input.addEventListener('input', debounce((event) => {
      const s = currentSession();
      const exIndex = Number(event.target.dataset.exIndex);
      const setIndex = Number(event.target.dataset.setIndex);
      const field = event.target.dataset.setField;
      if (!s?.exercises?.[exIndex]?.sets?.[setIndex]) return;
      s.exercises[exIndex].sets[setIndex][field] = event.target.value;
      setCurrentSession(s);
    }, 100));
  });
  el.views.workout.querySelectorAll('[data-set-done]').forEach((btn) => btn.addEventListener('click', () => markSetDone(btn.dataset.setDone)));
  el.views.workout.querySelectorAll('[data-ex-complete]').forEach((btn) => btn.addEventListener('click', () => markExerciseDone(Number(btn.dataset.exComplete))));
  el.views.workout.querySelectorAll('[data-ex-redo]').forEach((btn) => btn.addEventListener('click', () => redoExercise(Number(btn.dataset.exRedo))));
  el.views.workout.querySelectorAll('[data-copy-last]').forEach((btn) => btn.addEventListener('click', () => copyLastIntoExercise(Number(btn.dataset.copyLast))));
  el.views.workout.querySelectorAll('[data-start-rest]').forEach((btn) => btn.addEventListener('click', () => { const s = currentSession(); const index = Number(btn.dataset.startRest); startTimer(s.exercises[index].restSeconds || state.settings.restSeconds || 60, s.exercises[index].name); }));
}

function markSetDone(token) {
  const [exerciseIndex, setIndex] = token.split(':').map(Number);
  const session = currentSession();
  if (!session?.exercises?.[exerciseIndex]?.sets?.[setIndex]) return;
  const set = session.exercises[exerciseIndex].sets[setIndex];
  set.done = !set.done;
  set.completedAt = set.done ? nowIso() : '';
  session.exercises[exerciseIndex].completed = exerciseCompleted(session.exercises[exerciseIndex]);
  setCurrentSession(session);
  if (set.done) startTimer(session.exercises[exerciseIndex].restSeconds || state.settings.restSeconds || 60, session.exercises[exerciseIndex].name);
  renderWorkout();
}

function markExerciseDone(exerciseIndex) {
  const session = currentSession();
  const exercise = session?.exercises?.[exerciseIndex];
  if (!exercise) return;
  exercise.sets.forEach((set) => {
    set.done = true;
    if (!set.reps) set.reps = extractMinRep(set.targetReps) || '';
    if (!set.rir) set.rir = '2';
    set.completedAt = nowIso();
  });
  exercise.completed = true;
  setCurrentSession(session);
  startTimer(exercise.restSeconds || state.settings.restSeconds || 60, exercise.name);
  renderWorkout();
}

function redoExercise(exerciseIndex) {
  const session = currentSession();
  const exercise = session?.exercises?.[exerciseIndex];
  if (!exercise) return;
  exercise.completed = false;
  exercise.sets.forEach((set) => {
    set.done = false;
    set.completedAt = '';
  });
  setCurrentSession(session);
  renderWorkout();
}

function copyLastIntoExercise(exerciseIndex) {
  const session = currentSession();
  const exercise = session?.exercises?.[exerciseIndex];
  if (!exercise) return;
  const memory = getLastExerciseMemory(exercise.name);
  if (!memory) return alert('No hay registro anterior para este ejercicio.');
  exercise.sets.forEach((set, index) => {
    const previous = memory.sets?.[index];
    if (!previous) return;
    set.weight = previous.weight || set.weight;
    set.reps = previous.reps || set.reps;
    set.rir = previous.rir || set.rir;
  });
  setCurrentSession(session);
  renderWorkout();
}

function renderProgress() {
  const latest = latestMetric();
  const draft = state.meta.currentMetricDraft || createEmptyMetric({ weight: latest?.weight || '' });
  const selectedName = state.meta.progressSelectedExercise || state.exerciseLibrary[0]?.name || '';
  const history = selectedName ? getExerciseHistory(selectedName, 8) : [];
  const best = selectedName ? getBestExerciseRecord(selectedName) : null;
  el.views.progress.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">PROGRESO</p>
          <h2>Peso, medidas e historial</h2>
          <p class="subtitle">Registra cintura, pecho, brazo y pierna. Revisa también el progreso por ejercicio.</p>
        </div>
        <span class="badge">${state.bodyMetrics.length} controles</span>
      </div>
    </div>

    <div class="grid-2-md">
      <div class="card">
        <div class="section-head"><div><p class="eyebrow">MEDIDAS</p><h3>Nuevo control</h3></div></div>
        <form id="metricForm" class="stack" style="margin-top:12px">
          <input type="hidden" name="id" value="${escapeAttr(draft.id)}">
          <div class="row">
            <div class="field"><span class="label">Fecha</span><input name="date" type="date" value="${escapeAttr(draft.date)}"></div>
            <div class="field"><span class="label">Peso</span><input name="weight" type="number" inputmode="decimal" value="${escapeAttr(draft.weight)}"></div>
          </div>
          <div class="row">
            <div class="field"><span class="label">Cintura</span><input name="waist" type="number" inputmode="decimal" value="${escapeAttr(draft.waist)}"></div>
            <div class="field"><span class="label">Pecho</span><input name="chest" type="number" inputmode="decimal" value="${escapeAttr(draft.chest)}"></div>
          </div>
          <div class="row">
            <div class="field"><span class="label">Brazo</span><input name="arm" type="number" inputmode="decimal" value="${escapeAttr(draft.arm)}"></div>
            <div class="field"><span class="label">Pierna</span><input name="thigh" type="number" inputmode="decimal" value="${escapeAttr(draft.thigh)}"></div>
          </div>
          <div class="field"><span class="label">Notas</span><textarea name="notes">${escapeHtml(draft.notes)}</textarea></div>
          <div class="row">
            <button class="btn btn-primary" type="submit">Guardar</button>
            <button class="btn btn-secondary" type="button" id="metricResetBtn">Limpiar</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="section-head"><div><p class="eyebrow">RESUMEN</p><h3>Último control</h3></div></div>
        <div class="grid grid-2" style="margin-top:12px">
          <div class="stat"><span class="label">Peso</span><strong>${latest?.weight ? `${latest.weight} kg` : '—'}</strong></div>
          <div class="stat"><span class="label">Cintura</span><strong>${formatMetricValue(latest?.waist)}</strong></div>
          <div class="stat"><span class="label">Pecho</span><strong>${formatMetricValue(latest?.chest)}</strong></div>
          <div class="stat"><span class="label">Brazo</span><strong>${formatMetricValue(latest?.arm)}</strong></div>
          <div class="stat"><span class="label">Pierna</span><strong>${formatMetricValue(latest?.thigh)}</strong></div>
          <div class="stat"><span class="label">Entrenos semana</span><strong>${sessionsThisWeek().length}</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">PROGRESO DE EJERCICIO</p><h3>Historial rápido</h3></div></div>
      <div class="row" style="margin-top:12px">
        <select id="exerciseSelect">
          ${state.exerciseLibrary.map((item) => `<option value="${escapeAttr(item.name)}" ${item.name === selectedName ? 'selected' : ''}>${item.name}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-3" style="margin-top:12px">
        <div class="stat"><span class="label">Última</span><strong>${history[0]?.bestWeight ? `${formatNumber(history[0].bestWeight)} kg` : '—'}</strong></div>
        <div class="stat"><span class="label">Mejor</span><strong>${best?.bestWeight ? `${formatNumber(best.bestWeight)} kg` : '—'}</strong></div>
        <div class="stat"><span class="label">Coach</span><strong>${selectedName ? escapeHtml(suggestFromHistory(selectedName).label) : '—'}</strong></div>
      </div>
      <div class="stack" style="margin-top:12px">
        ${history.map((item) => `<div class="history-pill full">${item.date} · ${item.dayTitle} · ${formatNumber(item.bestWeight || 0)} kg · volumen ${formatNumber(item.totalVolume || 0)} kg · RIR medio ${item.avgRir ? formatNumber(item.avgRir) : '—'}</div>`).join('') || '<div class="empty">Todavía no hay historial para este ejercicio.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">HISTORIAL DE MEDIDAS</p><h3>Últimos controles</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${metricsSorted().slice(0, 8).map((item) => `<div class="session-card"><div class="section-head"><div><strong>${item.date}</strong><div class="micro">Peso ${item.weight || '—'} kg · cintura ${item.waist || '—'} cm · pecho ${item.chest || '—'} cm</div></div><button class="chip" data-edit-metric="${item.id}">Editar</button></div></div>`).join('') || '<div class="empty">Todavía no has guardado medidas.</div>'}
      </div>
    </div>`;

  document.getElementById('exerciseSelect')?.addEventListener('change', (event) => { state.meta.progressSelectedExercise = event.target.value; queueRender(); });
  document.getElementById('metricForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    saveMetric(createEmptyMetric({ ...data, id: data.id || uid() }), true);
    state.meta.currentMetricDraft = createEmptyMetric();
  });
  document.getElementById('metricResetBtn')?.addEventListener('click', () => { state.meta.currentMetricDraft = createEmptyMetric(); queueRender(); });
  el.views.progress.querySelectorAll('[data-edit-metric]').forEach((btn) => btn.addEventListener('click', () => {
    const metric = state.bodyMetrics.find((item) => item.id === btn.dataset.editMetric);
    if (!metric) return;
    state.meta.currentMetricDraft = clone(metric);
    queueRender();
  }));
}

function renderPrograms() {
  const program = activeProgram();
  const templateDayCheckboxes = (program?.days || []).map((day) => `<label><input type="checkbox" name="templateDays" value="${day.id}">${day.title} · ${day.subtitle || ''}</label>`).join('');
  const exerciseDayCheckboxes = (program?.days || []).map((day) => `<label><input type="checkbox" name="dayTargets" value="${day.id}">${day.title} · ${day.subtitle || ''}</label>`).join('');
  el.views.programs.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">RUTINAS VERSIONADAS</p>
          <h2>${program?.name || 'Sin bloque activo'}</h2>
          <p class="subtitle">${program?.status || '—'} · objetivo ${program?.goal || 'sin definir'} · semana ${program?.currentWeek || 1}</p>
        </div>
        <span class="badge">${state.programs.length} bloques</span>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary" id="duplicateProgramBtn">Duplicar bloque</button>
        <button class="btn btn-secondary" id="createBlankProgramBtn">Nuevo bloque</button>
        <button class="btn btn-secondary" id="increaseWeekBtn">+ Semana</button>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">BLOQUE</p><h3>Datos del bloque</h3></div></div>
      <form id="programMetaForm" class="stack" style="margin-top:12px">
        <input name="name" placeholder="Nombre del bloque" value="${escapeAttr(program?.name || '')}">
        <div class="row">
          <select name="status">
            ${['active', 'draft', 'archived', 'future'].map((status) => `<option value="${status}" ${program?.status === status ? 'selected' : ''}>${status}</option>`).join('')}
          </select>
          <input name="goal" placeholder="Objetivo" value="${escapeAttr(program?.goal || '')}">
        </div>
        <div class="row">
          <input name="startDate" type="date" value="${escapeAttr(program?.startDate || today())}">
          <input name="endDate" type="date" value="${escapeAttr(program?.endDate || '')}">
          <input name="currentWeek" type="number" inputmode="numeric" value="${escapeAttr(program?.currentWeek || 1)}">
        </div>
        <textarea name="phaseNotes" placeholder="Notas del bloque">${escapeHtml(program?.phaseNotes || '')}</textarea>
        <button class="btn btn-primary" type="submit">Guardar bloque</button>
      </form>
    </div>

    <div class="grid-2-md">
      <div class="card">
        <div class="section-head"><div><p class="eyebrow">IMPORTAR</p><h3>Cargar rutina nueva</h3></div></div>
        <textarea id="programImportText" placeholder="Pega aquí la rutina nueva."></textarea>
        <div class="field"><span class="label">TXT o JSON</span><input type="file" id="programImportFile" accept=".txt,.json"></div>
        <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="importProgramBtn">Importar y activar</button></div>
      </div>
      <div class="card">
        <div class="section-head"><div><p class="eyebrow">PLANTILLAS</p><h3>Core, gemelos, cardio o calentamiento</h3></div></div>
        <div class="row" style="margin-top:12px">
          <select id="templateSelect">
            <option value="core">Core</option>
            <option value="calves">Gemelos</option>
            <option value="cardio">Cardio</option>
            <option value="warmup">Calentamiento</option>
          </select>
        </div>
        <div class="check-wrap" style="margin-top:12px">${templateDayCheckboxes}</div>
        <div class="row" style="margin-top:12px"><button class="btn btn-secondary" id="applyTemplateBtn">Añadir plantilla</button></div>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">EJERCICIOS POR DÍA</p><h3>Añadir a varios días</h3></div></div>
      <form id="exerciseMultiDayForm" class="stack" style="margin-top:12px">
        <input name="exerciseName" placeholder="Nombre ejercicio" required>
        <div class="row">
          <input name="exerciseGroup" placeholder="Grupo muscular">
          <input name="exerciseType" placeholder="Tipo (barra, mancuerna...)">
          <select name="exercisePriority">
            <option value="main">Principal</option>
            <option value="support">Soporte</option>
            <option value="optional">Opcional</option>
          </select>
        </div>
        <div class="row">
          <input name="exerciseSets" type="number" inputmode="numeric" placeholder="Series" value="3">
          <input name="exerciseReps" placeholder="Reps" value="10">
          <input name="exerciseRest" type="number" inputmode="numeric" placeholder="Descanso s" value="60">
        </div>
        <input name="exerciseTempo" placeholder="Tempo / ejecución">
        <textarea name="exerciseNotes" placeholder="Notas"></textarea>
        <div class="check-wrap">${exerciseDayCheckboxes}</div>
        <button class="btn btn-primary" type="submit">Guardar ejercicio en días seleccionados</button>
      </form>
    </div>

    <div class="stack">
      ${(program?.days || []).map((day) => `
        <div class="card">
          <div class="section-head"><div><p class="eyebrow">${day.title}</p><h3>${day.subtitle || 'Sin subtítulo'}</h3></div><span class="badge">${day.exercises.length} ejercicios</span></div>
          <div class="stack" style="margin-top:12px">
            ${day.exercises.map((exercise, index) => `
              <div class="session-card compact-card">
                <div class="section-head">
                  <div>
                    <strong>${exercise.name}</strong>
                    <div class="micro">${exercise.group || 'Grupo libre'} · ${exercise.sets}x${exercise.reps} · ${exercise.priority || 'main'} · ${exercise.restSeconds}s</div>
                  </div>
                  <div class="row tiny-row action-column">
                    <button class="chip" data-move-up="${day.id}:${index}">↑</button>
                    <button class="chip" data-move-down="${day.id}:${index}">↓</button>
                    <button class="chip" data-delete-exercise="${day.id}:${index}">Quitar</button>
                  </div>
                </div>
              </div>`).join('') || '<div class="empty">No hay ejercicios en este día.</div>'}
          </div>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">HISTORIAL</p><h3>Bloques guardados</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${state.programs.map((item) => `
          <div class="program-card">
            <div class="section-head">
              <div>
                <strong>${item.name}</strong>
                <div class="micro">${item.status} · ${item.startDate || '—'} · objetivo ${item.goal || '—'} · semana ${item.currentWeek || 1}</div>
              </div>
              <div class="row tiny-row action-column">
                <button class="chip" data-activate-program="${item.id}">Activar</button>
                <button class="chip" data-delete-program="${item.id}">Borrar</button>
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  document.getElementById('duplicateProgramBtn')?.addEventListener('click', () => createProgramVersionFromActive(prompt('Nombre del nuevo bloque', `${program?.name || 'Bloque'} · ${today()}`) || undefined));
  document.getElementById('createBlankProgramBtn')?.addEventListener('click', createBlankProgram);
  document.getElementById('increaseWeekBtn')?.addEventListener('click', () => { const current = activeProgram(); if (!current) return; pushUndo('Sumar semana'); current.currentWeek = Number(current.currentWeek || 1) + 1; saveProgram(current); });
  document.getElementById('importProgramBtn')?.addEventListener('click', () => importProgramFromText(document.getElementById('programImportText').value));
  document.getElementById('programImportFile')?.addEventListener('change', (event) => importProgramFile(event.target.files?.[0]));
  document.getElementById('applyTemplateBtn')?.addEventListener('click', () => {
    const templateKey = document.getElementById('templateSelect').value;
    const dayIds = [...el.views.programs.querySelectorAll('input[name="templateDays"]:checked')].map((input) => input.value);
    addTemplateToDays(templateKey, dayIds);
  });
  document.getElementById('exerciseMultiDayForm')?.addEventListener('submit', (event) => { event.preventDefault(); addExerciseToSelectedDays(new FormData(event.currentTarget)); event.currentTarget.reset(); });
  document.getElementById('programMetaForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const current = activeProgram();
    if (!current) return;
    pushUndo('Editar bloque');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    current.name = data.name || current.name;
    current.status = data.status || current.status;
    current.goal = data.goal || '';
    current.startDate = data.startDate || today();
    current.endDate = data.endDate || '';
    current.currentWeek = Number(data.currentWeek || 1);
    current.phaseNotes = data.phaseNotes || '';
    if (current.status === 'active') state.meta.activeProgramId = current.id;
    saveProgram(current);
  });
  el.views.programs.querySelectorAll('[data-activate-program]').forEach((btn) => btn.addEventListener('click', () => activateProgram(btn.dataset.activateProgram)));
  el.views.programs.querySelectorAll('[data-delete-program]').forEach((btn) => btn.addEventListener('click', () => deleteProgram(btn.dataset.deleteProgram)));
  el.views.programs.querySelectorAll('[data-move-up]').forEach((btn) => btn.addEventListener('click', () => { const [dayId, index] = btn.dataset.moveUp.split(':'); moveExercise(dayId, Number(index), -1); }));
  el.views.programs.querySelectorAll('[data-move-down]').forEach((btn) => btn.addEventListener('click', () => { const [dayId, index] = btn.dataset.moveDown.split(':'); moveExercise(dayId, Number(index), 1); }));
  el.views.programs.querySelectorAll('[data-delete-exercise]').forEach((btn) => btn.addEventListener('click', () => { const [dayId, index] = btn.dataset.deleteExercise.split(':'); deleteExerciseFromDay(dayId, Number(index)); }));
}

function renderReports() {
  const draft = state.meta.currentReportDraft || reportAutoFill();
  draft.weightDelta = computeWeightDelta(draft.currentWeight, draft.previousWeight);
  el.views.reports.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">REPORTE SEMANAL</p>
          <h2>Control completo</h2>
          <p class="subtitle">Autorrellena peso, diferencia, semana actual y sesiones realizadas.</p>
        </div>
        <span class="badge">${state.reports.length} reportes</span>
      </div>
    </div>

    <form id="reportForm" class="stack">
      ${reportFields(draft)}
      <div class="card">
        <div class="row">
          <button class="btn btn-secondary" type="button" id="autofillReportBtn">Autocompletar</button>
          <button class="btn btn-secondary" type="button" id="cloneLastReportBtn">Duplicar último</button>
          <button class="btn btn-primary" type="submit">Guardar reporte</button>
          <button class="btn btn-secondary" type="button" id="downloadReportPdfBtn">PDF</button>
        </div>
      </div>
    </form>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">HISTORIAL</p><h3>Reportes guardados</h3></div></div>
      <div class="stack" style="margin-top:12px">
        ${state.reports.map((report) => `
          <div class="report-card">
            <div class="section-head">
              <div>
                <strong>${report.date}</strong>
                <div class="micro">Peso ${report.currentWeight || '—'} · diferencia ${report.weightDelta || '—'} · semana ${report.systemWeek || '—'}</div>
              </div>
              <div class="row tiny-row action-column">
                <button class="chip" data-edit-report="${report.id}">Editar</button>
                <button class="chip" data-pdf-report="${report.id}">PDF</button>
              </div>
            </div>
          </div>`).join('') || '<div class="empty">Aún no hay reportes.</div>'}
      </div>
    </div>`;

  const form = document.getElementById('reportForm');
  form?.addEventListener('input', debounce(() => {
    state.meta.currentReportDraft = reportAutoFill(Object.fromEntries(new FormData(form).entries()));
  }, 120));
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const report = reportAutoFill({ ...data, id: data.id || draft.id || uid() });
    saveReport(report);
    state.meta.currentReportDraft = createEmptyReport();
    alert('Reporte guardado.');
  });
  document.getElementById('autofillReportBtn')?.addEventListener('click', () => { state.meta.currentReportDraft = reportAutoFill(); queueRender(); });
  document.getElementById('cloneLastReportBtn')?.addEventListener('click', () => {
    const last = [...state.reports].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    if (!last) return alert('No hay reporte anterior.');
    state.meta.currentReportDraft = reportAutoFill({ ...clone(last), id: uid(), date: today() });
    queueRender();
  });
  document.getElementById('downloadReportPdfBtn')?.addEventListener('click', async () => {
    const report = reportAutoFill(Object.fromEntries(new FormData(form).entries()));
    await exportReportPdf(report, activeProgram()?.name || 'Bloque actual');
  });
  el.views.reports.querySelectorAll('[data-edit-report]').forEach((btn) => btn.addEventListener('click', () => {
    const report = state.reports.find((item) => item.id === btn.dataset.editReport);
    if (!report) return;
    state.meta.currentReportDraft = clone(report);
    queueRender();
  }));
  el.views.reports.querySelectorAll('[data-pdf-report]').forEach((btn) => btn.addEventListener('click', async () => {
    const report = state.reports.find((item) => item.id === btn.dataset.pdfReport);
    if (!report) return;
    await exportReportPdf(report, activeProgram()?.name || 'Bloque actual');
  }));
}

function renderSettings() {
  el.views.settings.innerHTML = `
    <div class="card hero">
      <div class="section-head">
        <div>
          <p class="eyebrow">AJUSTES</p>
          <h2>Rendimiento, sonido y backup</h2>
          <p class="subtitle">Todo pensado para móvil: sonido del timer, pantalla activa, modo coach y copia de seguridad.</p>
        </div>
        <span class="badge">${state.meta.syncStatus}</span>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">TEMPORIZADOR</p><h3>Comportamiento</h3></div></div>
      <div class="stack" style="margin-top:12px">
        <div class="field"><span class="label">Sonido</span>
          <select id="soundModeSelect">
            <option value="full" ${state.settings.soundMode === 'full' ? 'selected' : ''}>Sonido + vibración</option>
            <option value="vibrate" ${state.settings.soundMode === 'vibrate' ? 'selected' : ''}>Solo vibración</option>
            <option value="silent" ${state.settings.soundMode === 'silent' ? 'selected' : ''}>Silencioso</option>
          </select>
        </div>
        <div class="check-wrap">
          <label><input type="checkbox" id="keepAwakeToggle" ${state.settings.keepAwake ? 'checked' : ''}> Mantener pantalla encendida</label>
          <label><input type="checkbox" id="focusModeDefaultToggle" ${state.settings.focusMode ? 'checked' : ''}> Modo entreno</label>
          <label><input type="checkbox" id="coachModeToggle" ${state.settings.coachMode ? 'checked' : ''}> Modo coach</label>
        </div>
        <div class="field"><span class="label">Descanso por defecto (segundos)</span><input id="restDefaultInput" type="number" inputmode="numeric" value="${state.settings.restSeconds || 60}"></div>
        <div class="row"><button class="btn btn-primary" id="saveSettingsBtn">Guardar ajustes</button></div>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">CUENTA FIREBASE</p><h3>${state.auth.loggedIn ? state.auth.email : 'No has iniciado sesión'}</h3></div></div>
      <div class="field"><span class="label">Email</span><input id="authEmailInput" type="email" placeholder="tu@email.com" value="${escapeAttr(state.auth.email || '')}"></div>
      <div class="field"><span class="label">Contraseña</span><input id="authPasswordInput" type="password" placeholder="••••••••"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="loginBtn">Entrar</button>
        <button class="btn btn-secondary" id="signupBtn">Crear cuenta</button>
        <button class="btn btn-danger" id="logoutBtn">Salir</button>
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><p class="eyebrow">DATOS</p><h3>Exportar, restaurar y deshacer</h3></div></div>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-secondary" id="exportJsonBtn">Exportar JSON</button>
        <button class="btn btn-secondary" id="undoBtn">Deshacer último cambio</button>
        <button class="btn btn-secondary" id="clearWorkoutBtn">Borrar entreno activo</button>
      </div>
      <div class="field"><span class="label">Importar backup JSON</span><input type="file" id="backupImportInput" accept=".json"></div>
    </div>`;

  document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    state.settings.soundMode = document.getElementById('soundModeSelect').value;
    state.settings.keepAwake = document.getElementById('keepAwakeToggle').checked;
    state.settings.focusMode = document.getElementById('focusModeDefaultToggle').checked;
    state.settings.coachMode = document.getElementById('coachModeToggle').checked;
    state.settings.restSeconds = Number(document.getElementById('restDefaultInput').value || 60);
    if (state.settings.keepAwake) await maybeAcquireWakeLock(); else await releaseWakeLock();
    queueRender();
  });
  document.getElementById('loginBtn')?.addEventListener('click', () => handleAuth('login'));
  document.getElementById('signupBtn')?.addEventListener('click', () => handleAuth('signup'));
  document.getElementById('logoutBtn')?.addEventListener('click', () => handleAuth('logout'));
  document.getElementById('exportJsonBtn')?.addEventListener('click', exportJsonBackup);
  document.getElementById('undoBtn')?.addEventListener('click', restoreUndo);
  document.getElementById('clearWorkoutBtn')?.addEventListener('click', () => { setCurrentSession(null); queueRender(); });
  document.getElementById('backupImportInput')?.addEventListener('change', importBackupFile);
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
  const blob = new Blob([JSON.stringify({ ...state, currentSession: currentSession() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `arslan-tracker-elite-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackupFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || '{}'));
      if (!parsed.programs || !parsed.sessions) throw new Error('Backup incompleto');
      pushUndo('Importar backup');
      state.programs = parsed.programs || state.programs;
      state.sessions = parsed.sessions || state.sessions;
      state.reports = parsed.reports || state.reports;
      state.bodyMetrics = parsed.bodyMetrics || state.bodyMetrics;
      state.exerciseLibrary = parsed.exerciseLibrary || deriveExerciseLibrary([], parsed.programs || state.programs);
      if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
      if (parsed.meta?.activeProgramId) state.meta.activeProgramId = parsed.meta.activeProgramId;
      if (parsed.currentSession) setCurrentSession(parsed.currentSession);
      syncLibraryFromPrograms();
      if (state.auth.loggedIn && state.auth.uid) {
        ['programs', 'sessions', 'reports', 'bodyMetrics', 'exerciseLibrary'].forEach((name) => state[name].forEach((item) => syncCollectionItem(name, item.id, item)));
      }
      queueRender();
      alert('Backup restaurado.');
    } catch {
      alert('No se pudo restaurar el backup.');
    }
  };
  reader.readAsText(file);
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
    state.meta.syncStatus = 'Solo local';
    queueRender();
    return;
  }
  try {
    if (!window.firebaseApiService) {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-local-firebase-service]');
        if (existing && existing.dataset.loaded === 'true') return resolve();
        if (existing) {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = './firebase-service.js';
        script.defer = true;
        script.dataset.localFirebaseService = '1';
        script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
        script.addEventListener('error', reject, { once: true });
        document.head.appendChild(script);
      });
    }
    const mod = window.firebaseApiService;
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
    firebaseApi.subscribeCollection(userId, 'bodyMetrics', (rows) => mergeRemoteCollection('bodyMetrics', rows)),
    firebaseApi.subscribeCollection(userId, 'exerciseLibrary', (rows) => mergeRemoteCollection('exerciseLibrary', rows))
  ];
  ['programs', 'sessions', 'reports', 'bodyMetrics', 'exerciseLibrary'].forEach((name) => state[name].forEach((item) => syncCollectionItem(name, item.id, item)));
}

function mergeRemoteCollection(name, rows) {
  if (!Array.isArray(rows)) return;
  const map = new Map(state[name].map((item) => [item.id, item]));
  rows.forEach((row) => {
    const local = map.get(row.id);
    if (!local || String(row.updatedAt || row.date || '') >= String(local.updatedAt || local.date || '')) map.set(row.id, row);
  });
  state[name] = [...map.values()].sort((a, b) => String(b.updatedAt || b.date || '').localeCompare(String(a.updatedAt || a.date || '')));
  if (name === 'programs' && !state.meta.activeProgramId && state.programs[0]) state.meta.activeProgramId = state.programs[0].id;
  if (name === 'programs') syncLibraryFromPrograms();
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

function renderView(view) {
  if (view === 'home') renderHome();
  if (view === 'workout') renderWorkout();
  if (view === 'progress') renderProgress();
  if (view === 'programs') renderPrograms();
  if (view === 'reports') renderReports();
  if (view === 'settings') renderSettings();
}

window.addEventListener('error', (event) => {
  console.error(event.error || event.message);
  if (el.bootText && !el.bootCard.classList.contains('hidden')) {
    el.bootText.textContent = 'La app abrió en modo local, pero hubo un error de carga. Vuelve a publicar o revisa el archivo.';
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
});

function start() {
  if (!state.meta.activeProgramId && state.programs[0]) state.meta.activeProgramId = state.programs[0].id;
  syncLibraryFromPrograms();
  updateTheme();
  setupNavigation();
  setView(state.meta.currentView || 'home');
  if (timerState.remaining === 0 && !timerState.running) resetTimer(state.settings.restSeconds || 60);
  runTimerLoop();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (el.bootText) el.bootText.textContent = 'Interfaz lista. Conectando sincronización...';
  setTimeout(() => el.bootCard.classList.add('hidden'), 140);
  const deferred = () => initFirebaseDeferred();
  if ('requestIdleCallback' in window) requestIdleCallback(deferred, { timeout: 1400 }); else setTimeout(deferred, 250);
}

start();
