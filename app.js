import { appConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  doc,
  setDoc,
  addDoc,
  collection,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
  writeBatch,
  query,
  orderBy,
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const STORAGE_KEY = 'arslan_tracker_pro_v1';
const TIMER_KEY = 'arslan_tracker_timer_v1';
const CURRENT_SESSION_KEY = 'arslan_tracker_current_session_v1';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  defaultRestSeconds: 60,
  soundEnabled: true,
  keepAwake: false,
  currentWeekManual: 1,
};

const DEFAULT_META = {
  activeProgramId: '',
  cycleIndex: 0,
  currentView: 'home',
  lastSyncedAt: '',
};

function nowIso() {
  return new Date().toISOString();
}

function todayInputValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function normalizeText(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value = '') {
  const base = normalizeText(value).replace(/\s+/g, '_');
  return base || `item_${Math.random().toString(36).slice(2, 8)}`;
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function formatWeight(value) {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(1)} kg`;
}

function formatDelta(value) {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  const sign = number > 0 ? '+' : '';
  return `${sign}${number.toFixed(1)} kg`;
}

function formatSeconds(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}


function normalizeRemoteValue(value) {
  if (!value) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeRemoteValue);
  if (typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(([key, val]) => {
      output[key] = normalizeRemoteValue(val);
    });
    return output;
  }
  return value;
}

function weekDiff(startDate, endDate) {
  if (!startDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate || new Date());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const diffMs = end.setHours(0,0,0,0) - start.setHours(0,0,0,0);
  return Math.max(1, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1);
}

function getWeekRange(date = new Date()) {
  const target = new Date(date);
  const day = target.getDay();
  const mondayShift = day === 0 ? -6 : 1 - day;
  const start = new Date(target);
  start.setDate(target.getDate() + mondayShift);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function isWithinWeek(dateStr, date = new Date()) {
  if (!dateStr) return false;
  const value = new Date(dateStr);
  if (Number.isNaN(value.getTime())) return false;
  const { start, end } = getWeekRange(date);
  return value >= start && value < end;
}

function buildBaseProgram() {
  return {
    id: uid('program'),
    name: 'Rutina inicio Arslan',
    goal: 'Definición / recomposición',
    startDate: todayInputValue(),
    status: 'active',
    sourceText: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    protocol: {
      rirTarget: 2,
      execution: 'Subida explosiva y bajada en 3 segundos aprox. excepto donde se indique normal 1-1',
      defaultRestSeconds: 60,
    },
    cycle: [
      { id: 'day1', type: 'workout' },
      { id: 'day2', type: 'workout' },
      { id: 'rest', type: 'rest' },
      { id: 'day4', type: 'workout' },
      { id: 'day5', type: 'workout' },
      { id: 'rest_2', type: 'rest' },
    ],
    days: [
      {
        id: 'day1',
        title: 'Día 1',
        subtitle: 'Pecho-bíceps',
        type: 'workout',
        notes: 'RIR 2. Descanso 60 s salvo cambio manual.',
        exercises: [
          { name: 'Press banca plano en multipower', sets: 3, reps: '10', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Press superior mancuerna banco 45 grados', sets: 3, reps: '10', restSeconds: 60, tempo: 'Normal 1-1', notes: 'Ejecución normal' },
          { name: 'Cruces de polea alta', sets: 3, reps: '10', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Curl mancuerna 1 mano', sets: 2, reps: '8', restSeconds: 60, tempo: 'Normal 1-1', notes: 'Ejecución normal' },
          { name: 'Curl barra z', sets: 3, reps: '12', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Curl a 1 mano concentrado con apoyo en banco', sets: 3, reps: '12', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
        ],
      },
      {
        id: 'day2',
        title: 'Día 2',
        subtitle: 'Espalda-tríceps',
        type: 'workout',
        notes: 'RIR 2. Descanso 60 s salvo cambio manual.',
        exercises: [
          { name: 'Jalón polea al pecho', sets: 3, reps: '12', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Remo sentado en polea abierto', sets: 3, reps: '12', restSeconds: 60, tempo: 'Normal 1-1', notes: 'Ejecución normal' },
          { name: 'Remo mancuerna a 1 mano', sets: 3, reps: '12', restSeconds: 60, tempo: 'Normal 1-1', notes: 'Ejecución normal' },
          { name: 'Tríceps en polea 1 mano sin agarre', sets: 4, reps: '10', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: 'Agarras de la bola' },
          { name: 'Press francés mancuernas 2 manos', sets: 3, reps: '10', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
        ],
      },
      {
        id: 'day4',
        title: 'Día 4',
        subtitle: 'Piernas',
        type: 'workout',
        notes: 'RIR 2. Descanso 60 s salvo cambio manual.',
        exercises: [
          { name: 'Abductores máquina fuera/dentro', sets: 3, reps: '15', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Femoral tumbado', sets: 3, reps: '10', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Prensa pies al medio', sets: 3, reps: '12', restSeconds: 60, tempo: 'Normal 1-1', notes: 'Ejecución normal' },
          { name: 'Extensiones de cuádriceps máquina', sets: 3, reps: '12', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Zancadas dinámicas', sets: 3, reps: '12 cada pierna', restSeconds: 60, tempo: 'Normal 1-1', notes: 'Cada pierna · ejecución normal' },
        ],
      },
      {
        id: 'day5',
        title: 'Día 5',
        subtitle: 'Hombros',
        type: 'workout',
        notes: 'RIR 2. Descanso 60 s salvo cambio manual.',
        exercises: [
          { name: 'Press militar multipower', sets: 3, reps: '10', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Elevaciones laterales mancuerna', sets: 3, reps: '12', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Elevaciones frontales barra', sets: 3, reps: '10', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
          { name: 'Hombro trasero máquina', sets: 3, reps: '12', restSeconds: 60, tempo: 'Normal 1-1', notes: 'Ejecución normal' },
          { name: 'Encogimientos trapecio mancuernas', sets: 3, reps: '15', restSeconds: 60, tempo: 'Explosiva subida · 3s bajada', notes: '' },
        ],
      },
    ],
    extraBlocks: {
      core: {
        title: 'Core',
        frequency: 'Mínimo 2 días / semana',
        exercises: [
          { name: 'Encogimientos muy lentos', sets: 3, reps: '20', restSeconds: 60, tempo: 'Lento con apretón', notes: 'Suelo o máquina' },
          { name: 'Elevaciones de piernas estiradas', sets: 3, reps: '20', restSeconds: 60, tempo: '1 s cerca del suelo', notes: 'Sin llegar a tocar el suelo' },
          { name: 'Planchas', sets: 4, reps: '1 minuto', restSeconds: 60, tempo: 'Isométrico', notes: '1 min trabajo · 1 min descanso' },
        ],
      },
      calves: {
        title: 'Gemelos',
        frequency: '2 días / semana',
        exercises: [
          { name: 'Elevaciones en bordillo o escalera', sets: 1, reps: '50', restSeconds: 60, tempo: 'Controlado', notes: 'Sin descanso' },
        ],
      },
    },
  };
}

function buildDefaultExerciseLibrary(program) {
  const library = [];
  const pushFromExercise = (exercise, group = '') => {
    const id = slugify(exercise.name);
    if (library.some((item) => item.id === id)) return;
    library.push({
      id,
      name: exercise.name,
      aliases: [normalizeText(exercise.name)],
      muscleGroup: group,
      defaultTempo: exercise.tempo || '',
      defaultRestSeconds: safeNumber(exercise.restSeconds, 60),
      notes: exercise.notes || '',
      equipment: '',
    });
  };
  program.days.forEach((day) => day.exercises.forEach((exercise) => pushFromExercise(exercise, day.subtitle || '')));
  Object.values(program.extraBlocks).forEach((block) => block.exercises.forEach((exercise) => pushFromExercise(exercise, block.title || '')));
  return library;
}

function defaultReportDraft() {
  return {
    id: '',
    reportDate: todayInputValue(),
    weightCurrent: '',
    weightPrevious: '',
    weightDifference: '',
    feelingsStrength: '',
    feelingsCongestion: '',
    feelingsRecovery: '',
    sleepHours: '',
    sleepRecoveryDaily: '',
    cardioSessions: '',
    cardioDuration: '',
    cardioMoment: '',
    trainingSessions: '',
    trainingWeek: '',
    dietCompliance: '',
    foodsToChange: '',
    appetiteLevel: '',
    digestions: '',
    therapyWeek: '',
    tpcWeek: '',
    posesStatus: '',
    menstrualPhase: '',
    generalNotes: '',
    createdAt: '',
    updatedAt: '',
  };
}

function buildInitialState() {
  const baseProgram = buildBaseProgram();
  const library = buildDefaultExerciseLibrary(baseProgram);
  return {
    settings: clone(DEFAULT_SETTINGS),
    meta: {
      ...clone(DEFAULT_META),
      activeProgramId: baseProgram.id,
    },
    programs: [baseProgram],
    exerciseLibrary: library,
    sessions: [],
    reports: [],
    bodyMetrics: [],
    currentSession: null,
    reportDraft: defaultReportDraft(),
  };
}

function reviveState(raw) {
  const initial = buildInitialState();
  if (!raw || typeof raw !== 'object') return initial;
  return {
    settings: { ...initial.settings, ...(raw.settings || {}) },
    meta: { ...initial.meta, ...(raw.meta || {}) },
    programs: Array.isArray(raw.programs) && raw.programs.length ? raw.programs : initial.programs,
    exerciseLibrary: Array.isArray(raw.exerciseLibrary) && raw.exerciseLibrary.length ? raw.exerciseLibrary : initial.exerciseLibrary,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    reports: Array.isArray(raw.reports) ? raw.reports : [],
    bodyMetrics: Array.isArray(raw.bodyMetrics) ? raw.bodyMetrics : [],
    currentSession: raw.currentSession || null,
    reportDraft: raw.reportDraft ? { ...defaultReportDraft(), ...raw.reportDraft } : defaultReportDraft(),
  };
}

let state = reviveState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
let timerState = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null') || {
  secondsLeft: state.settings.defaultRestSeconds,
  running: false,
  endsAt: null,
};
let firebase = {
  enabled: false,
  app: null,
  auth: null,
  db: null,
  user: null,
  unsubscribers: [],
};
let importPreview = null;
let deferredInstallPrompt = null;
let wakeLock = null;

const els = {
  views: document.querySelectorAll('.view'),
  navButtons: document.querySelectorAll('.bottom-nav .nav-btn'),
  toast: document.getElementById('toast'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  startNextWorkoutBtn: document.getElementById('startNextWorkoutBtn'),
  openImportProgramBtn: document.getElementById('openImportProgramBtn'),
  activeProgramName: document.getElementById('activeProgramName'),
  activeProgramMeta: document.getElementById('activeProgramMeta'),
  nextDayLabel: document.getElementById('nextDayLabel'),
  nextDaySub: document.getElementById('nextDaySub'),
  currentBlockWeek: document.getElementById('currentBlockWeek'),
  currentBlockStart: document.getElementById('currentBlockStart'),
  latestWeightStat: document.getElementById('latestWeightStat'),
  latestWeightSub: document.getElementById('latestWeightSub'),
  homeActiveWorkout: document.getElementById('homeActiveWorkout'),
  homeSetsDone: document.getElementById('homeSetsDone'),
  homeVolume: document.getElementById('homeVolume'),
  homeTimerState: document.getElementById('homeTimerState'),
  quickCoreBtn: document.getElementById('quickCoreBtn'),
  quickCalvesBtn: document.getElementById('quickCalvesBtn'),
  quickReportBtn: document.getElementById('quickReportBtn'),
  quickWeightBtn: document.getElementById('quickWeightBtn'),
  weeklyTrainingCount: document.getElementById('weeklyTrainingCount'),
  weeklyCoreCount: document.getElementById('weeklyCoreCount'),
  weeklyCalvesCount: document.getElementById('weeklyCalvesCount'),
  weeklyReportCount: document.getElementById('weeklyReportCount'),
  latestReportLabel: document.getElementById('latestReportLabel'),
  latestReportDelta: document.getElementById('latestReportDelta'),
  latestReportSleep: document.getElementById('latestReportSleep'),
  latestReportCardio: document.getElementById('latestReportCardio'),
  syncBadge: document.getElementById('syncBadge'),
  recentSessionsBadge: document.getElementById('recentSessionsBadge'),
  recentSessionsList: document.getElementById('recentSessionsList'),
  timerDisplay: document.getElementById('timerDisplay'),
  timerStatusBadge: document.getElementById('timerStatusBadge'),
  timerMinusBtn: document.getElementById('timerMinusBtn'),
  timerPlusBtn: document.getElementById('timerPlusBtn'),
  timerToggleBtn: document.getElementById('timerToggleBtn'),
  workoutHeading: document.getElementById('workoutHeading'),
  workoutSubheading: document.getElementById('workoutSubheading'),
  copySimilarWorkoutBtn: document.getElementById('copySimilarWorkoutBtn'),
  saveWorkoutBtn: document.getElementById('saveWorkoutBtn'),
  includeCoreToggle: document.getElementById('includeCoreToggle'),
  includeCalvesToggle: document.getElementById('includeCalvesToggle'),
  workoutNotes: document.getElementById('workoutNotes'),
  workoutSetsSummary: document.getElementById('workoutSetsSummary'),
  workoutVolumeSummary: document.getElementById('workoutVolumeSummary'),
  workoutExerciseSummary: document.getElementById('workoutExerciseSummary'),
  workoutExercisesList: document.getElementById('workoutExercisesList'),
  createFromActiveBtn: document.getElementById('createFromActiveBtn'),
  programList: document.getElementById('programList'),
  importProgramName: document.getElementById('importProgramName'),
  importProgramStartDate: document.getElementById('importProgramStartDate'),
  importProgramGoal: document.getElementById('importProgramGoal'),
  carryHistoryToggle: document.getElementById('carryHistoryToggle'),
  activateImportedToggle: document.getElementById('activateImportedToggle'),
  programImportText: document.getElementById('programImportText'),
  programImportFile: document.getElementById('programImportFile'),
  previewProgramBtn: document.getElementById('previewProgramBtn'),
  saveImportedProgramBtn: document.getElementById('saveImportedProgramBtn'),
  importPreviewBox: document.getElementById('importPreviewBox'),
  weightDateInput: document.getElementById('weightDateInput'),
  weightValueInput: document.getElementById('weightValueInput'),
  weightNoteInput: document.getElementById('weightNoteInput'),
  saveWeightBtn: document.getElementById('saveWeightBtn'),
  weightList: document.getElementById('weightList'),
  exerciseSearchInput: document.getElementById('exerciseSearchInput'),
  exerciseHistoryBox: document.getElementById('exerciseHistoryBox'),
  reportModeBadge: document.getElementById('reportModeBadge'),
  reportDateInput: document.getElementById('reportDateInput'),
  reportWeightCurrentInput: document.getElementById('reportWeightCurrentInput'),
  reportWeightPreviousInput: document.getElementById('reportWeightPreviousInput'),
  reportWeightDifferenceInput: document.getElementById('reportWeightDifferenceInput'),
  reportStrengthInput: document.getElementById('reportStrengthInput'),
  reportCongestionInput: document.getElementById('reportCongestionInput'),
  reportRecoveryInput: document.getElementById('reportRecoveryInput'),
  reportSleepHoursInput: document.getElementById('reportSleepHoursInput'),
  reportSleepRecoveryInput: document.getElementById('reportSleepRecoveryInput'),
  reportCardioSessionsInput: document.getElementById('reportCardioSessionsInput'),
  reportCardioDurationInput: document.getElementById('reportCardioDurationInput'),
  reportCardioMomentInput: document.getElementById('reportCardioMomentInput'),
  reportTrainingSessionsInput: document.getElementById('reportTrainingSessionsInput'),
  reportTrainingWeekInput: document.getElementById('reportTrainingWeekInput'),
  reportDietComplianceInput: document.getElementById('reportDietComplianceInput'),
  reportFoodsToChangeInput: document.getElementById('reportFoodsToChangeInput'),
  reportAppetiteInput: document.getElementById('reportAppetiteInput'),
  reportDigestionsInput: document.getElementById('reportDigestionsInput'),
  reportTherapyWeekInput: document.getElementById('reportTherapyWeekInput'),
  reportTpcWeekInput: document.getElementById('reportTpcWeekInput'),
  reportPosesStatusInput: document.getElementById('reportPosesStatusInput'),
  reportMenstrualPhaseInput: document.getElementById('reportMenstrualPhaseInput'),
  reportGeneralNotesInput: document.getElementById('reportGeneralNotesInput'),
  duplicateReportBtn: document.getElementById('duplicateReportBtn'),
  autofillReportBtn: document.getElementById('autofillReportBtn'),
  saveReportBtn: document.getElementById('saveReportBtn'),
  reportList: document.getElementById('reportList'),
  reportCountBadge: document.getElementById('reportCountBadge'),
  accountModeBadge: document.getElementById('accountModeBadge'),
  authLoggedOutBox: document.getElementById('authLoggedOutBox'),
  authLoggedInBox: document.getElementById('authLoggedInBox'),
  authEmailInput: document.getElementById('authEmailInput'),
  authPasswordInput: document.getElementById('authPasswordInput'),
  signInBtn: document.getElementById('signInBtn'),
  signUpBtn: document.getElementById('signUpBtn'),
  seedCloudBtn: document.getElementById('seedCloudBtn'),
  signOutBtn: document.getElementById('signOutBtn'),
  userAvatar: document.getElementById('userAvatar'),
  userNameText: document.getElementById('userNameText'),
  userEmailText: document.getElementById('userEmailText'),
  syncStatusText: document.getElementById('syncStatusText'),
  syncLastText: document.getElementById('syncLastText'),
  settingsRestSecondsInput: document.getElementById('settingsRestSecondsInput'),
  settingsCurrentWeekInput: document.getElementById('settingsCurrentWeekInput'),
  settingsSoundEnabledInput: document.getElementById('settingsSoundEnabledInput'),
  settingsKeepAwakeInput: document.getElementById('settingsKeepAwakeInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  installPwaBtn: document.getElementById('installPwaBtn'),
  exportBackupBtn: document.getElementById('exportBackupBtn'),
  importBackupInput: document.getElementById('importBackupInput'),
  resetDemoBtn: document.getElementById('resetDemoBtn'),
};

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    settings: state.settings,
    meta: state.meta,
    programs: state.programs,
    exerciseLibrary: state.exerciseLibrary,
    sessions: state.sessions,
    reports: state.reports,
    bodyMetrics: state.bodyMetrics,
    currentSession: state.currentSession,
    reportDraft: state.reportDraft,
  }));
  localStorage.setItem(TIMER_KEY, JSON.stringify(timerState));
  if (state.currentSession) localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(state.currentSession));
  else localStorage.removeItem(CURRENT_SESSION_KEY);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function setView(view) {
  state.meta.currentView = view;
  els.views.forEach((panel) => panel.classList.toggle('active', panel.id === `view-${view}`));
  els.navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  saveLocal();
}

function getActiveProgram() {
  return state.programs.find((program) => program.id === state.meta.activeProgramId) || state.programs.find((program) => program.status === 'active') || state.programs[0] || null;
}

function getCycleEntry(program, index) {
  if (!program || !program.cycle?.length) return null;
  return program.cycle[((index % program.cycle.length) + program.cycle.length) % program.cycle.length];
}

function getDayById(program, dayId) {
  return program?.days?.find((day) => day.id === dayId) || null;
}

function getExtraBlock(program, blockId) {
  return program?.extraBlocks?.[blockId] || null;
}

function computeSessionSummary(session) {
  if (!session) return { sets: 0, volume: 0, exercises: 0 };
  const exercises = session.exercises || [];
  let sets = 0;
  let volume = 0;
  exercises.forEach((exercise) => {
    (exercise.setsData || []).forEach((set) => {
      if (set.done) {
        sets += 1;
        volume += safeNumber(set.weight) * safeNumber(set.reps);
      }
    });
  });
  return { sets, volume, exercises: exercises.length };
}

function getPreviousExercisePerformance(exerciseId) {
  const sorted = [...state.sessions].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  for (const session of sorted) {
    for (const exercise of session.exercises || []) {
      if (exercise.exerciseId === exerciseId) return exercise;
    }
  }
  return null;
}

function buildSessionExercise(exercise, programDayTitle) {
  const matchedExercise = ensureExerciseInLibrary(exercise, programDayTitle);
  const previous = getPreviousExercisePerformance(matchedExercise.id);
  const setsData = Array.from({ length: safeNumber(exercise.sets, 0) }).map((_, index) => {
    const previousSet = previous?.setsData?.[index] || {};
    return {
      index: index + 1,
      targetReps: exercise.reps || '',
      weight: previousSet.weight ?? '',
      reps: previousSet.reps ?? '',
      rir: previousSet.rir ?? '',
      restSeconds: previousSet.restSeconds ?? safeNumber(exercise.restSeconds, state.settings.defaultRestSeconds),
      done: false,
      completedAt: '',
    };
  });
  return {
    exerciseId: matchedExercise.id,
    name: exercise.name,
    tempo: exercise.tempo || matchedExercise.defaultTempo || '',
    notes: exercise.notes || matchedExercise.notes || '',
    targetSets: safeNumber(exercise.sets, 0),
    targetReps: exercise.reps || '',
    setsData,
  };
}

function createSessionFromDay(dayId) {
  const program = getActiveProgram();
  if (!program) return null;
  const day = getDayById(program, dayId);
  if (!day) return null;
  const session = {
    id: uid('session'),
    programId: program.id,
    programName: program.name,
    programSnapshot: clone(program),
    dayId: day.id,
    dayTitle: day.title,
    daySubtitle: day.subtitle || '',
    date: todayInputValue(),
    includeCore: false,
    includeCalves: false,
    notes: '',
    createdAt: nowIso(),
    completedAt: '',
    exercises: (day.exercises || []).map((exercise) => buildSessionExercise(exercise, day.subtitle || '')),
  };
  return session;
}

function appendBlockToSession(session, blockId) {
  const program = getActiveProgram();
  const block = getExtraBlock(program, blockId);
  if (!session || !block) return;
  const exists = session.exercises.some((exercise) => exercise.fromBlock === blockId);
  if (exists) return;
  block.exercises.forEach((exercise) => {
    const item = buildSessionExercise(exercise, block.title || '');
    item.fromBlock = blockId;
    session.exercises.push(item);
  });
}

function removeBlockFromSession(session, blockId) {
  if (!session) return;
  session.exercises = session.exercises.filter((exercise) => exercise.fromBlock !== blockId);
}

function startSession(dayId) {
  const program = getActiveProgram();
  if (!program) {
    showToast('No hay rutina activa.');
    setView('programs');
    return;
  }
  const session = createSessionFromDay(dayId);
  if (!session) {
    showToast('No se pudo iniciar ese día.');
    return;
  }
  state.currentSession = session;
  els.includeCoreToggle.checked = false;
  els.includeCalvesToggle.checked = false;
  els.workoutNotes.value = '';
  saveLocal();
  renderAll();
  setView('workout');
  showToast(`Sesión iniciada: ${session.dayTitle}`);
}

function startNextCycleWorkout() {
  const program = getActiveProgram();
  if (!program) {
    setView('programs');
    return;
  }
  let attempts = 0;
  while (attempts < program.cycle.length) {
    const entry = getCycleEntry(program, state.meta.cycleIndex + attempts);
    if (!entry) break;
    if (entry.type === 'workout') {
      startSession(entry.id);
      return;
    }
    if (entry.type === 'rest') {
      attempts += 1;
      state.meta.cycleIndex = (state.meta.cycleIndex + 1) % program.cycle.length;
    } else {
      attempts += 1;
    }
  }
  showToast('No se encontró un día de entreno en el ciclo.');
}

function advanceCycleAfterSaving(session) {
  const program = getActiveProgram();
  if (!program?.cycle?.length || !session) return;
  const currentIndex = program.cycle.findIndex((entry) => entry.id === session.dayId);
  if (currentIndex >= 0) state.meta.cycleIndex = (currentIndex + 1) % program.cycle.length;
  else state.meta.cycleIndex = (state.meta.cycleIndex + 1) % program.cycle.length;
}

function ensureExerciseInLibrary(exercise, group = '') {
  const normalized = normalizeText(exercise.name || '');
  let found = state.exerciseLibrary.find((item) => item.id === slugify(exercise.name || '') || item.aliases?.includes(normalized) || normalizeText(item.name) === normalized);
  if (found) {
    if (normalized && !found.aliases.includes(normalized)) found.aliases.push(normalized);
    if (!found.muscleGroup && group) found.muscleGroup = group;
    return found;
  }
  found = {
    id: slugify(exercise.name || uid('exercise')),
    name: exercise.name,
    aliases: normalized ? [normalized] : [],
    muscleGroup: group,
    defaultTempo: exercise.tempo || '',
    defaultRestSeconds: safeNumber(exercise.restSeconds, state.settings.defaultRestSeconds),
    notes: exercise.notes || '',
    equipment: '',
  };
  state.exerciseLibrary.push(found);
  return found;
}

function recalcReportDifference() {
  const current = safeNumber(els.reportWeightCurrentInput.value, NaN);
  const previous = safeNumber(els.reportWeightPreviousInput.value, NaN);
  if (Number.isFinite(current) && Number.isFinite(previous)) {
    els.reportWeightDifferenceInput.value = (current - previous).toFixed(1);
  } else {
    els.reportWeightDifferenceInput.value = '';
  }
}

function readReportDraftFromForm() {
  return {
    ...state.reportDraft,
    reportDate: els.reportDateInput.value || todayInputValue(),
    weightCurrent: els.reportWeightCurrentInput.value,
    weightPrevious: els.reportWeightPreviousInput.value,
    weightDifference: els.reportWeightDifferenceInput.value,
    feelingsStrength: els.reportStrengthInput.value,
    feelingsCongestion: els.reportCongestionInput.value,
    feelingsRecovery: els.reportRecoveryInput.value,
    sleepHours: els.reportSleepHoursInput.value,
    sleepRecoveryDaily: els.reportSleepRecoveryInput.value,
    cardioSessions: els.reportCardioSessionsInput.value,
    cardioDuration: els.reportCardioDurationInput.value,
    cardioMoment: els.reportCardioMomentInput.value,
    trainingSessions: els.reportTrainingSessionsInput.value,
    trainingWeek: els.reportTrainingWeekInput.value,
    dietCompliance: els.reportDietComplianceInput.value,
    foodsToChange: els.reportFoodsToChangeInput.value,
    appetiteLevel: els.reportAppetiteInput.value,
    digestions: els.reportDigestionsInput.value,
    therapyWeek: els.reportTherapyWeekInput.value,
    tpcWeek: els.reportTpcWeekInput.value,
    posesStatus: els.reportPosesStatusInput.value,
    menstrualPhase: els.reportMenstrualPhaseInput.value,
    generalNotes: els.reportGeneralNotesInput.value,
  };
}

function setReportForm(report) {
  const value = { ...defaultReportDraft(), ...(report || {}) };
  state.reportDraft = value;
  els.reportModeBadge.textContent = value.id ? 'EDITAR' : 'NUEVO';
  els.reportDateInput.value = value.reportDate || todayInputValue();
  els.reportWeightCurrentInput.value = value.weightCurrent || '';
  els.reportWeightPreviousInput.value = value.weightPrevious || '';
  els.reportWeightDifferenceInput.value = value.weightDifference || '';
  els.reportStrengthInput.value = value.feelingsStrength || '';
  els.reportCongestionInput.value = value.feelingsCongestion || '';
  els.reportRecoveryInput.value = value.feelingsRecovery || '';
  els.reportSleepHoursInput.value = value.sleepHours || '';
  els.reportSleepRecoveryInput.value = value.sleepRecoveryDaily || '';
  els.reportCardioSessionsInput.value = value.cardioSessions || '';
  els.reportCardioDurationInput.value = value.cardioDuration || '';
  els.reportCardioMomentInput.value = value.cardioMoment || '';
  els.reportTrainingSessionsInput.value = value.trainingSessions || '';
  els.reportTrainingWeekInput.value = value.trainingWeek || '';
  els.reportDietComplianceInput.value = value.dietCompliance || '';
  els.reportFoodsToChangeInput.value = value.foodsToChange || '';
  els.reportAppetiteInput.value = value.appetiteLevel || '';
  els.reportDigestionsInput.value = value.digestions || '';
  els.reportTherapyWeekInput.value = value.therapyWeek || '';
  els.reportTpcWeekInput.value = value.tpcWeek || '';
  els.reportPosesStatusInput.value = value.posesStatus || '';
  els.reportMenstrualPhaseInput.value = value.menstrualPhase || '';
  els.reportGeneralNotesInput.value = value.generalNotes || '';
}

function saveReport() {
  const draft = readReportDraftFromForm();
  const isEdit = Boolean(draft.id);
  const report = {
    ...draft,
    id: draft.id || uid('report'),
    updatedAt: nowIso(),
    createdAt: draft.createdAt || nowIso(),
  };
  const index = state.reports.findIndex((item) => item.id === report.id);
  if (index >= 0) state.reports[index] = report;
  else state.reports.unshift(report);
  state.reports.sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
  persistReport(report);
  setReportForm(defaultReportDraft());
  saveLocal();
  renderAll();
  showToast(isEdit ? 'Reporte actualizado.' : 'Reporte guardado.');
}

function autoFillReport() {
  const latestWeight = [...state.bodyMetrics].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const previousWeight = [...state.bodyMetrics].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[1];
  const weeklySessions = state.sessions.filter((session) => isWithinWeek(session.completedAt || session.date));
  els.reportWeightCurrentInput.value = latestWeight?.weight ?? els.reportWeightCurrentInput.value;
  els.reportWeightPreviousInput.value = previousWeight?.weight ?? els.reportWeightPreviousInput.value;
  els.reportTrainingSessionsInput.value = String(weeklySessions.length);
  els.reportTrainingWeekInput.value = String(getCurrentProgramWeek());
  recalcReportDifference();
  showToast('Reporte autocompletado con datos recientes.');
}

function duplicateLastReport() {
  const latest = state.reports[0];
  if (!latest) {
    showToast('No hay reportes previos.');
    return;
  }
  const duplicate = { ...clone(latest), id: '', reportDate: todayInputValue(), createdAt: '', updatedAt: '' };
  setReportForm(duplicate);
  setView('reports');
  showToast('Se copió el último reporte.');
}

function saveWeight() {
  const weight = safeNumber(els.weightValueInput.value, NaN);
  if (!Number.isFinite(weight) || weight <= 0) {
    showToast('Introduce un peso válido.');
    return;
  }
  const metric = {
    id: uid('weight'),
    type: 'weight',
    date: els.weightDateInput.value || todayInputValue(),
    weight: Number(weight.toFixed(1)),
    note: els.weightNoteInput.value || '',
    createdAt: nowIso(),
  };
  state.bodyMetrics.unshift(metric);
  state.bodyMetrics.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  persistMetric(metric);
  els.weightValueInput.value = '';
  els.weightNoteInput.value = '';
  saveLocal();
  renderAll();
  showToast('Peso guardado.');
}

function buildExerciseHistory(exerciseId) {
  const matching = state.sessions
    .flatMap((session) => (session.exercises || []).map((exercise) => ({ session, exercise })))
    .filter((item) => item.exercise.exerciseId === exerciseId)
    .sort((a, b) => (b.session.completedAt || '').localeCompare(a.session.completedAt || ''));
  if (!matching.length) return null;
  const latest = matching[0];
  let best = { weight: 0, reps: 0, volume: 0, date: '' };
  matching.forEach(({ session, exercise }) => {
    const volume = (exercise.setsData || []).reduce((sum, set) => sum + safeNumber(set.weight) * safeNumber(set.reps), 0);
    (exercise.setsData || []).forEach((set) => {
      const currentWeight = safeNumber(set.weight);
      const currentReps = safeNumber(set.reps);
      if (currentWeight > best.weight || (currentWeight === best.weight && currentReps > best.reps)) {
        best = { weight: currentWeight, reps: currentReps, volume, date: session.completedAt || session.date };
      }
    });
  });
  return { latest, matching, best };
}

function searchExercise() {
  const term = normalizeText(els.exerciseSearchInput.value || '');
  if (!term) {
    els.exerciseHistoryBox.className = 'preview-box empty';
    els.exerciseHistoryBox.textContent = 'Busca un ejercicio para ver últimas marcas, volumen y sesiones.';
    return;
  }
  const found = state.exerciseLibrary.find((item) => normalizeText(item.name).includes(term) || item.aliases?.some((alias) => alias.includes(term)));
  if (!found) {
    els.exerciseHistoryBox.className = 'preview-box empty';
    els.exerciseHistoryBox.textContent = 'No se encontró ese ejercicio en tu biblioteca.';
    return;
  }
  const history = buildExerciseHistory(found.id);
  if (!history) {
    els.exerciseHistoryBox.className = 'preview-box';
    els.exerciseHistoryBox.innerHTML = `<strong>${found.name}</strong><p class="muted">Existe en la biblioteca, pero aún no tiene sesiones registradas.</p>`;
    return;
  }
  const lastSets = history.latest.exercise.setsData.map((set) => `${set.weight || 0} kg × ${set.reps || 0}`).join(' · ');
  const recentItems = history.matching.slice(0, 5).map(({ session, exercise }) => {
    const volume = (exercise.setsData || []).reduce((sum, set) => sum + safeNumber(set.weight) * safeNumber(set.reps), 0);
    return `<div class="exercise-card"><strong>${formatDate(session.completedAt || session.date)} · ${session.dayTitle}</strong><div class="alias-line">${exercise.setsData.map((set) => `${set.weight || 0} kg × ${set.reps || 0}`).join(' · ')}</div><div class="alias-line">Volumen ${volume.toFixed(0)} kg</div></div>`;
  }).join('');
  els.exerciseHistoryBox.className = 'preview-box';
  els.exerciseHistoryBox.innerHTML = `
    <div class="stack">
      <div>
        <strong>${found.name}</strong>
        <div class="alias-line">Grupo: ${found.muscleGroup || '—'} · Descanso por defecto: ${found.defaultRestSeconds || state.settings.defaultRestSeconds}s</div>
      </div>
      <div class="kv-list">
        <div><span class="label">Última sesión</span><strong>${formatDate(history.latest.session.completedAt || history.latest.session.date)}</strong><div class="alias-line">${lastSets}</div></div>
        <div><span class="label">Mejor marca reciente</span><strong>${history.best.weight || 0} kg × ${history.best.reps || 0}</strong><div class="alias-line">${formatDate(history.best.date)}</div></div>
      </div>
      <div class="stack">${recentItems}</div>
    </div>
  `;
}

function getCurrentProgramWeek() {
  const program = getActiveProgram();
  if (!program) return state.settings.currentWeekManual || 1;
  return weekDiff(program.startDate, new Date());
}

function getLatestWeight() {
  return [...state.bodyMetrics].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
}

function getWeeklyStats() {
  const sessions = state.sessions.filter((session) => isWithinWeek(session.completedAt || session.date));
  const reports = state.reports.filter((report) => isWithinWeek(report.reportDate));
  const coreCount = sessions.filter((session) => session.includeCore).length;
  const calvesCount = sessions.filter((session) => session.includeCalves).length;
  return { sessions, reports, coreCount, calvesCount };
}

function persistProgram(program) {
  if (!firebase.enabled || !firebase.user) return;
  const ref = doc(firebase.db, 'users', firebase.user.uid, 'programs', program.id);
  setDoc(ref, { ...program, updatedAt: program.updatedAt || nowIso(), serverUpdatedAt: serverTimestamp() }, { merge: true }).catch((error) => showToast(error.message));
}

function persistSession(session) {
  if (!firebase.enabled || !firebase.user) return;
  const ref = doc(firebase.db, 'users', firebase.user.uid, 'sessions', session.id);
  setDoc(ref, { ...session, updatedAt: session.updatedAt || nowIso(), serverUpdatedAt: serverTimestamp() }, { merge: true }).catch((error) => showToast(error.message));
}

function persistReport(report) {
  if (!firebase.enabled || !firebase.user) return;
  const ref = doc(firebase.db, 'users', firebase.user.uid, 'reports', report.id);
  setDoc(ref, { ...report, updatedAt: report.updatedAt || nowIso(), serverUpdatedAt: serverTimestamp() }, { merge: true }).catch((error) => showToast(error.message));
}

function persistMetric(metric) {
  if (!firebase.enabled || !firebase.user) return;
  const ref = doc(firebase.db, 'users', firebase.user.uid, 'bodyMetrics', metric.id);
  setDoc(ref, { ...metric, updatedAt: metric.updatedAt || nowIso(), serverUpdatedAt: serverTimestamp() }, { merge: true }).catch((error) => showToast(error.message));
}

function persistExerciseLibraryEntry(item) {
  if (!firebase.enabled || !firebase.user) return;
  const ref = doc(firebase.db, 'users', firebase.user.uid, 'exerciseLibrary', item.id);
  setDoc(ref, { ...item, updatedAt: item.updatedAt || nowIso(), serverUpdatedAt: serverTimestamp() }, { merge: true }).catch((error) => showToast(error.message));
}

function persistSettings() {
  if (!firebase.enabled || !firebase.user) return;
  const ref = doc(firebase.db, 'users', firebase.user.uid, 'settings', 'app');
  setDoc(ref, {
    settings: state.settings,
    meta: state.meta,
    updatedAt: nowIso(),
    serverUpdatedAt: serverTimestamp(),
  }, { merge: true }).catch((error) => showToast(error.message));
}

async function deleteRemoteProgram(programId) {
  if (!firebase.enabled || !firebase.user) return;
  await deleteDoc(doc(firebase.db, 'users', firebase.user.uid, 'programs', programId));
}

async function seedCloudFromLocal() {
  if (!firebase.enabled || !firebase.user) {
    showToast('Activa Firebase e inicia sesión para subir a la nube.');
    return;
  }
  const batch = writeBatch(firebase.db);
  const userId = firebase.user.uid;
  state.programs.forEach((program) => batch.set(doc(firebase.db, 'users', userId, 'programs', program.id), program, { merge: true }));
  state.sessions.forEach((session) => batch.set(doc(firebase.db, 'users', userId, 'sessions', session.id), session, { merge: true }));
  state.reports.forEach((report) => batch.set(doc(firebase.db, 'users', userId, 'reports', report.id), report, { merge: true }));
  state.bodyMetrics.forEach((metric) => batch.set(doc(firebase.db, 'users', userId, 'bodyMetrics', metric.id), metric, { merge: true }));
  state.exerciseLibrary.forEach((item) => batch.set(doc(firebase.db, 'users', userId, 'exerciseLibrary', item.id), item, { merge: true }));
  batch.set(doc(firebase.db, 'users', userId, 'settings', 'app'), { settings: state.settings, meta: state.meta }, { merge: true });
  await batch.commit();
  showToast('Datos locales subidos a Firestore.');
}

function attachRemoteListeners() {
  firebase.unsubscribers.forEach((fn) => fn?.());
  firebase.unsubscribers = [];
  if (!firebase.enabled || !firebase.user) return;
  const userId = firebase.user.uid;

  const listenCollection = (name, target) => {
    const q = query(collection(firebase.db, 'users', userId, name), orderBy(name === 'sessions' ? 'completedAt' : name === 'reports' ? 'reportDate' : name === 'bodyMetrics' ? 'date' : 'updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((item) => normalizeRemoteValue({ id: item.id, ...item.data() }));
      state[target] = docs;
      if (target === 'exerciseLibrary' && !docs.length) state[target] = buildDefaultExerciseLibrary(getActiveProgram() || buildBaseProgram());
      saveLocal();
      renderAll();
    });
    firebase.unsubscribers.push(unsub);
  };

  listenCollection('programs', 'programs');
  listenCollection('sessions', 'sessions');
  listenCollection('reports', 'reports');
  listenCollection('bodyMetrics', 'bodyMetrics');
  listenCollection('exerciseLibrary', 'exerciseLibrary');

  const settingsUnsub = onSnapshot(doc(firebase.db, 'users', userId, 'settings', 'app'), (snapshot) => {
    if (!snapshot.exists()) {
      persistSettings();
      return;
    }
    const data = normalizeRemoteValue(snapshot.data() || {});
    state.settings = { ...state.settings, ...(data.settings || {}) };
    state.meta = { ...state.meta, ...(data.meta || {}) };
    saveLocal();
    applyTheme();
    renderAll();
  });
  firebase.unsubscribers.push(settingsUnsub);
}

async function initFirebase() {
  if (!appConfig.useFirebase || !appConfig.firebaseConfig?.apiKey) {
    firebase.enabled = false;
    renderAccount();
    return;
  }
  firebase.enabled = true;
  firebase.app = initializeApp(appConfig.firebaseConfig);
  try {
    firebase.db = initializeFirestore(firebase.app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
    });
  } catch (error) {
    console.warn('Firestore con caché persistente no disponible, usando fallback normal.', error);
    firebase.db = getFirestore(firebase.app);
  }
  firebase.auth = getAuth(firebase.app);
  onAuthStateChanged(firebase.auth, async (user) => {
    firebase.user = user;
    renderAccount();
    if (user) {
      attachRemoteListeners();
      persistSettings();
    } else {
      firebase.unsubscribers.forEach((fn) => fn?.());
      firebase.unsubscribers = [];
    }
  });
}

function applyTheme() {
  document.body.classList.toggle('light', state.settings.theme === 'light');
}

function beep() {
  if (!state.settings.soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gain.gain.value = 0.03;
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
  } catch (_) {
    // no-op
  }
}

function vibratePattern(pattern = [80, 40, 80]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function updateTimerDisplay() {
  els.timerDisplay.textContent = formatSeconds(timerState.secondsLeft);
  els.timerStatusBadge.textContent = timerState.running ? 'DESCANSO' : 'LISTO';
  els.homeTimerState.textContent = timerState.running ? `En marcha · ${formatSeconds(timerState.secondsLeft)}` : 'Listo';
  els.timerToggleBtn.textContent = timerState.running ? 'Pausar' : 'Iniciar';
}

function startTimer(seconds = state.settings.defaultRestSeconds) {
  timerState.secondsLeft = seconds;
  timerState.running = true;
  timerState.endsAt = Date.now() + seconds * 1000;
  saveLocal();
  updateTimerDisplay();
}

function pauseTimer() {
  timerState.running = false;
  timerState.endsAt = null;
  saveLocal();
  updateTimerDisplay();
}

function tickTimer() {
  if (!timerState.running || !timerState.endsAt) return;
  const remaining = Math.max(0, Math.round((timerState.endsAt - Date.now()) / 1000));
  timerState.secondsLeft = remaining;
  if (remaining <= 0) {
    timerState.running = false;
    timerState.endsAt = null;
    beep();
    vibratePattern();
    showToast('Descanso terminado.');
  }
  updateTimerDisplay();
  saveLocal();
}

function hydrateCurrentSessionFromStorage() {
  if (state.currentSession) return;
  const saved = localStorage.getItem(CURRENT_SESSION_KEY);
  if (!saved) return;
  try {
    state.currentSession = JSON.parse(saved);
  } catch (_) {
    state.currentSession = null;
  }
}

function renderHome() {
  const program = getActiveProgram();
  const nextEntry = getCycleEntry(program, state.meta.cycleIndex || 0);
  const nextDay = nextEntry?.type === 'workout' ? getDayById(program, nextEntry.id) : null;
  const weekly = getWeeklyStats();
  const latestReport = state.reports[0];
  const latestWeight = getLatestWeight();
  const sessionSummary = computeSessionSummary(state.currentSession);
  els.activeProgramName.textContent = program?.name || '—';
  els.activeProgramMeta.textContent = program ? `${program.goal || 'Sin objetivo'} · inicio ${formatDate(program.startDate)}` : 'Sin rutina activa';
  els.nextDayLabel.textContent = nextDay ? `${nextDay.title}` : nextEntry?.type === 'rest' ? 'Descanso' : '—';
  els.nextDaySub.textContent = nextDay ? nextDay.subtitle || 'Entreno' : nextEntry?.type === 'rest' ? 'Recuperación' : '—';
  els.currentBlockWeek.textContent = String(getCurrentProgramWeek());
  els.currentBlockStart.textContent = program?.startDate ? `Inicio ${formatDate(program.startDate)}` : 'Sin fecha';
  els.latestWeightStat.textContent = latestWeight ? formatWeight(latestWeight.weight) : '—';
  els.latestWeightSub.textContent = latestWeight ? `${formatDate(latestWeight.date)}${latestWeight.note ? ` · ${latestWeight.note}` : ''}` : 'Sin registro';
  els.homeActiveWorkout.textContent = state.currentSession ? `${state.currentSession.dayTitle} · ${state.currentSession.daySubtitle || ''}` : 'No iniciada';
  els.homeSetsDone.textContent = String(sessionSummary.sets);
  els.homeVolume.textContent = `${sessionSummary.volume.toFixed(0)} kg`;
  els.weeklyTrainingCount.textContent = String(weekly.sessions.length);
  els.weeklyCoreCount.textContent = `${weekly.coreCount} / 2`;
  els.weeklyCalvesCount.textContent = `${weekly.calvesCount} / 2`;
  els.weeklyReportCount.textContent = String(weekly.reports.length);
  els.latestReportLabel.textContent = latestReport ? formatDate(latestReport.reportDate) : '—';
  els.latestReportDelta.textContent = latestReport ? formatDelta(latestReport.weightDifference) : '—';
  els.latestReportSleep.textContent = latestReport?.sleepHours || '—';
  els.latestReportCardio.textContent = latestReport?.cardioSessions ? `${latestReport.cardioSessions} sesiones` : '—';
  els.syncBadge.textContent = firebase.enabled ? (firebase.user ? 'SYNC' : 'FIREBASE') : 'DEMO';

  const sessions = [...state.sessions].sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).slice(0, 6);
  els.recentSessionsBadge.textContent = String(state.sessions.length);
  if (!sessions.length) {
    els.recentSessionsList.className = 'stack empty';
    els.recentSessionsList.textContent = 'Aún no hay sesiones guardadas.';
  } else {
    els.recentSessionsList.className = 'stack';
    els.recentSessionsList.innerHTML = sessions.map((session) => {
      const summary = computeSessionSummary(session);
      return `
        <div class="session-card">
          <strong>${formatDate(session.completedAt || session.date)} · ${session.dayTitle}</strong>
          <div class="alias-line">${session.programName} · ${session.daySubtitle || ''}</div>
          <div class="kv-list">
            <div><span class="label">Series</span><strong>${summary.sets}</strong></div>
            <div><span class="label">Volumen</span><strong>${summary.volume.toFixed(0)} kg</strong></div>
          </div>
        </div>
      `;
    }).join('');
  }
}

function renderWorkout() {
  const session = state.currentSession;
  if (!session) {
    els.workoutHeading.textContent = 'Ninguna sesión iniciada';
    els.workoutSubheading.textContent = 'Inicia el siguiente día o elige uno desde Rutinas.';
    els.workoutExercisesList.className = 'stack empty';
    els.workoutExercisesList.textContent = 'Empieza una sesión para ver los ejercicios.';
    els.workoutSetsSummary.textContent = '0';
    els.workoutVolumeSummary.textContent = '0 kg';
    els.workoutExerciseSummary.textContent = '0';
    return;
  }
  const summary = computeSessionSummary(session);
  els.workoutHeading.textContent = `${session.dayTitle} · ${session.daySubtitle || ''}`;
  els.workoutSubheading.textContent = `${session.programName} · ${formatDate(session.date)}`;
  els.workoutSetsSummary.textContent = String(summary.sets);
  els.workoutVolumeSummary.textContent = `${summary.volume.toFixed(0)} kg`;
  els.workoutExerciseSummary.textContent = String(summary.exercises);
  els.includeCoreToggle.checked = Boolean(session.includeCore);
  els.includeCalvesToggle.checked = Boolean(session.includeCalves);
  els.workoutNotes.value = session.notes || '';
  els.homeSetsDone.textContent = String(summary.sets);
  els.homeVolume.textContent = `${summary.volume.toFixed(0)} kg`;

  els.workoutExercisesList.className = 'stack';
  els.workoutExercisesList.innerHTML = session.exercises.map((exercise, exerciseIndex) => {
    const previous = getPreviousExercisePerformance(exercise.exerciseId);
    const lastLine = previous?.setsData?.map((set) => `${set.weight || 0} kg × ${set.reps || 0}`).join(' · ') || 'Sin registro';
    return `
      <article class="workout-exercise">
        <div class="exercise-head">
          <div>
            <strong>${exercise.name}</strong>
            <div class="exercise-meta">${exercise.targetSets} series · ${exercise.targetReps} reps · ${exercise.tempo || 'Sin tempo'}</div>
            ${exercise.notes ? `<div class="alias-line">${exercise.notes}</div>` : ''}
            <div class="alias-line">Última vez: ${lastLine}</div>
          </div>
          ${exercise.fromBlock ? `<span class="helper-chip">${exercise.fromBlock === 'core' ? 'CORE' : 'GEMELOS'}</span>` : ''}
        </div>
        <div class="set-grid">
          ${exercise.setsData.map((set, setIndex) => `
            <div class="set-card ${set.done ? 'done' : ''}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}">
              <div class="set-title">
                <strong>Serie ${set.index}</strong>
                <span class="helper-chip">${set.targetReps}</span>
              </div>
              <div class="inline-mini">
                <label class="field"><span>Peso</span><input type="number" step="0.5" data-field="weight" value="${set.weight}" /></label>
                <label class="field"><span>Reps</span><input type="number" step="1" data-field="reps" value="${set.reps}" /></label>
                <label class="field"><span>RIR</span><input type="number" step="1" data-field="rir" value="${set.rir}" /></label>
                <label class="field"><span>Pausa</span><input type="number" step="5" data-field="restSeconds" value="${set.restSeconds}" /></label>
              </div>
              <div class="mini-actions">
                <button type="button" data-action="weight-minus">-2.5</button>
                <button type="button" data-action="weight-plus">+2.5</button>
                <button type="button" data-action="reps-minus">-1 rep</button>
                <button type="button" data-action="reps-plus">+1 rep</button>
                <button type="button" data-action="copy-previous">Copiar</button>
                <button type="button" data-action="toggle-done">${set.done ? 'Desmarcar' : 'Hecha'}</button>
              </div>
            </div>
          `).join('')}
        </div>
      </article>
    `;
  }).join('');
}

function renderPrograms() {
  const program = getActiveProgram();
  els.importProgramStartDate.value = els.importProgramStartDate.value || todayInputValue();
  if (!state.programs.length) {
    els.programList.className = 'stack empty';
    els.programList.textContent = 'No hay rutinas todavía.';
    return;
  }
  els.programList.className = 'stack';
  els.programList.innerHTML = [...state.programs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).map((item) => {
    const week = weekDiff(item.startDate, new Date());
    const workouts = item.days?.length || 0;
    const exerciseCount = item.days?.reduce((sum, day) => sum + (day.exercises?.length || 0), 0) || 0;
    return `
      <article class="program-card ${item.id === program?.id ? 'active-program' : ''}">
        <div class="section-head compact">
          <div>
            <strong>${item.name}</strong>
            <div class="alias-line">${item.goal || 'Sin objetivo'} · inicio ${formatDate(item.startDate)}</div>
          </div>
          <span class="badge">${item.status.toUpperCase()}</span>
        </div>
        <div class="kv-list">
          <div><span class="label">Semana</span><strong>${week}</strong></div>
          <div><span class="label">Días</span><strong>${workouts}</strong></div>
          <div><span class="label">Ejercicios</span><strong>${exerciseCount}</strong></div>
          <div><span class="label">Core / gemelos</span><strong>${Object.keys(item.extraBlocks || {}).length}</strong></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary" data-program-action="activate" data-id="${item.id}">Activar</button>
          <button class="btn btn-secondary" data-program-action="duplicate" data-id="${item.id}">Duplicar</button>
          <button class="btn btn-secondary" data-program-action="preview" data-id="${item.id}">Ver</button>
          <button class="btn btn-secondary" data-program-action="archive" data-id="${item.id}">${item.status === 'archived' ? 'Desarchivar' : 'Archivar'}</button>
          <button class="btn btn-danger" data-program-action="delete" data-id="${item.id}">Borrar</button>
        </div>
        <div class="card-actions">
          ${(item.days || []).map((day) => `<button class="pill-btn" data-program-action="start-day" data-id="${item.id}" data-day-id="${day.id}">${day.title}</button>`).join('')}
        </div>
      </article>
    `;
  }).join('');
  renderImportPreview();
}

function renderImportPreview() {
  if (!importPreview) {
    els.importPreviewBox.className = 'preview-box empty';
    els.importPreviewBox.textContent = 'Sin vista previa todavía.';
    return;
  }
  const dayCount = importPreview.days?.length || 0;
  const exerciseCount = importPreview.days?.reduce((sum, day) => sum + (day.exercises?.length || 0), 0) || 0;
  const newExercises = importPreview.matchSummary?.newExercises?.length || 0;
  const matchedExercises = importPreview.matchSummary?.matchedExercises?.length || 0;
  const restCount = importPreview.cycle?.filter((entry) => entry.type === 'rest').length || 0;
  els.importPreviewBox.className = 'preview-box';
  els.importPreviewBox.innerHTML = `
    <div class="stack">
      <div class="import-summary">
        <strong>${importPreview.name}</strong>
        <div class="alias-line">${dayCount} días de entreno · ${restCount} descansos · ${exerciseCount} ejercicios</div>
        <div class="alias-line">Coinciden ${matchedExercises} ejercicios · nuevos ${newExercises}</div>
      </div>
      ${(importPreview.days || []).map((day) => `
        <div class="day-card">
          <strong>${day.title} · ${day.subtitle || ''}</strong>
          <div class="alias-line">${(day.exercises || []).map((exercise) => `${exercise.name} (${exercise.sets}x${exercise.reps})`).join(' · ') || 'Descanso'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderWeights() {
  const weights = [...state.bodyMetrics].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
  els.weightDateInput.value = els.weightDateInput.value || todayInputValue();
  if (!weights.length) {
    els.weightList.className = 'stack empty';
    els.weightList.textContent = 'Sin registros de peso.';
    return;
  }
  els.weightList.className = 'stack';
  els.weightList.innerHTML = weights.map((metric) => `
    <div class="weight-card">
      <strong>${formatWeight(metric.weight)}</strong>
      <div class="alias-line">${formatDate(metric.date)}${metric.note ? ` · ${metric.note}` : ''}</div>
    </div>
  `).join('');
}

function renderReports() {
  const reports = [...state.reports].sort((a, b) => (b.reportDate || '').localeCompare(a.reportDate || ''));
  els.reportCountBadge.textContent = String(reports.length);
  if (!reports.length) {
    els.reportList.className = 'stack empty';
    els.reportList.textContent = 'Sin reportes guardados.';
  } else {
    els.reportList.className = 'stack';
    els.reportList.innerHTML = reports.map((report) => `
      <article class="report-card">
        <strong>${formatDate(report.reportDate)}</strong>
        <div class="alias-line">Peso ${report.weightCurrent || '—'} · Diferencia ${report.weightDifference || '—'} · Entrenos ${report.trainingSessions || '—'}</div>
        <div class="card-actions">
          <button class="btn btn-secondary" data-report-action="edit" data-id="${report.id}">Editar</button>
          <button class="btn btn-secondary" data-report-action="duplicate" data-id="${report.id}">Duplicar</button>
        </div>
      </article>
    `).join('');
  }
}

function renderAccount() {
  const modeText = firebase.enabled ? (firebase.user ? 'SYNC' : 'FIREBASE') : 'DEMO';
  els.accountModeBadge.textContent = modeText;
  els.syncStatusText.textContent = firebase.enabled ? (firebase.user ? 'Conectado a Firestore' : 'Firebase listo, falta iniciar sesión') : 'Modo demo local';
  els.syncLastText.textContent = state.meta.lastSyncedAt ? formatDateTime(state.meta.lastSyncedAt) : '—';
  if (firebase.user) {
    els.authLoggedOutBox.classList.add('hidden');
    els.authLoggedInBox.classList.remove('hidden');
    const initial = (firebase.user.email || 'U').slice(0, 1).toUpperCase();
    els.userAvatar.textContent = initial;
    els.userNameText.textContent = firebase.user.displayName || firebase.user.email || 'Usuario';
    els.userEmailText.textContent = firebase.user.email || '—';
  } else {
    els.authLoggedOutBox.classList.remove('hidden');
    els.authLoggedInBox.classList.add('hidden');
  }
}

function renderSettings() {
  els.settingsRestSecondsInput.value = String(state.settings.defaultRestSeconds || 60);
  els.settingsCurrentWeekInput.value = String(state.settings.currentWeekManual || getCurrentProgramWeek());
  els.settingsSoundEnabledInput.checked = Boolean(state.settings.soundEnabled);
  els.settingsKeepAwakeInput.checked = Boolean(state.settings.keepAwake);
}

function renderAll() {
  applyTheme();
  renderHome();
  renderWorkout();
  renderPrograms();
  renderWeights();
  renderReports();
  renderSettings();
  renderAccount();
  updateTimerDisplay();
  searchExercise();
}

function markSetDone(exerciseIndex, setIndex) {
  const session = state.currentSession;
  if (!session) return;
  const set = session.exercises?.[exerciseIndex]?.setsData?.[setIndex];
  if (!set) return;
  set.done = !set.done;
  set.completedAt = set.done ? nowIso() : '';
  if (set.done) startTimer(safeNumber(set.restSeconds, state.settings.defaultRestSeconds));
  saveLocal();
  renderAll();
}

function copyPreviousSet(exerciseIndex, setIndex) {
  const session = state.currentSession;
  if (!session) return;
  const exercise = session.exercises?.[exerciseIndex];
  const target = exercise?.setsData?.[setIndex];
  const previous = getPreviousExercisePerformance(exercise.exerciseId)?.setsData?.[setIndex];
  if (!target || !previous) {
    showToast('No hay una serie previa para copiar.');
    return;
  }
  target.weight = previous.weight ?? '';
  target.reps = previous.reps ?? '';
  target.rir = previous.rir ?? '';
  target.restSeconds = previous.restSeconds ?? target.restSeconds;
  saveLocal();
  renderWorkout();
}

function updateSessionField(exerciseIndex, setIndex, field, value) {
  const session = state.currentSession;
  const set = session?.exercises?.[exerciseIndex]?.setsData?.[setIndex];
  if (!set) return;
  set[field] = value;
  saveLocal();
}

function duplicateCurrentProgram() {
  const program = getActiveProgram();
  if (!program) return;
  const copy = clone(program);
  copy.id = uid('program');
  copy.name = `${program.name} · copia`;
  copy.status = 'draft';
  copy.startDate = todayInputValue();
  copy.createdAt = nowIso();
  copy.updatedAt = nowIso();
  state.programs.unshift(copy);
  persistProgram(copy);
  saveLocal();
  renderAll();
  showToast('Rutina duplicada como borrador.');
}

function setActiveProgram(programId) {
  state.programs = state.programs.map((program) => ({ ...program, status: program.id === programId ? 'active' : program.status === 'active' ? 'archived' : program.status }));
  state.meta.activeProgramId = programId;
  persistSettings();
  state.programs.forEach(persistProgram);
  saveLocal();
  renderAll();
  showToast('Rutina activada.');
}

function toggleArchiveProgram(programId) {
  const program = state.programs.find((item) => item.id === programId);
  if (!program) return;
  program.status = program.status === 'archived' ? 'draft' : 'archived';
  program.updatedAt = nowIso();
  persistProgram(program);
  saveLocal();
  renderAll();
}

async function deleteProgram(programId) {
  const program = state.programs.find((item) => item.id === programId);
  if (!program) return;
  if (state.programs.length <= 1) {
    showToast('Debe quedar al menos una rutina.');
    return;
  }
  state.programs = state.programs.filter((item) => item.id !== programId);
  if (state.meta.activeProgramId === programId) state.meta.activeProgramId = state.programs[0]?.id || '';
  await deleteRemoteProgram(programId);
  saveLocal();
  renderAll();
  showToast('Rutina borrada.');
}

function loadProgramIntoImporter(programId) {
  const program = state.programs.find((item) => item.id === programId);
  if (!program) return;
  els.importProgramName.value = `${program.name} · edición`;
  els.importProgramStartDate.value = todayInputValue();
  els.importProgramGoal.value = program.goal || '';
  els.programImportText.value = program.sourceText || programToText(program);
  setView('programs');
  showToast('Rutina cargada en el importador.');
}

function programToText(program) {
  if (!program) return '';
  const lines = [];
  program.days.forEach((day) => {
    lines.push(`${day.title}:`);
    if (day.subtitle) lines.push(day.subtitle);
    lines.push('');
    day.exercises.forEach((exercise) => {
      const notesSuffix = exercise.notes ? `. ${exercise.notes}` : '';
      lines.push(`${exercise.name}. ${exercise.sets}x${exercise.reps}${notesSuffix}`);
    });
    lines.push('');
  });
  if (program.extraBlocks?.core) {
    lines.push('Minimo 2 dias semana trabajamos zona de core');
    lines.push('');
    program.extraBlocks.core.exercises.forEach((exercise) => lines.push(`${exercise.name}. ${exercise.sets}x${exercise.reps}. ${exercise.notes || ''}`));
    lines.push('');
  }
  if (program.extraBlocks?.calves) {
    lines.push('Gemelos dos dias/semana');
    lines.push('');
    program.extraBlocks.calves.exercises.forEach((exercise) => lines.push(`${exercise.name}. ${exercise.sets}x${exercise.reps}. ${exercise.notes || ''}`));
    lines.push('');
  }
  return lines.join('\n');
}

function parseRoutineText(text, meta = {}) {
  const rawText = (text || '').replace(/\r/g, '\n');
  const lines = rawText.split('\n').map((line) => line.trim()).filter(Boolean);
  const name = meta.name || 'Rutina importada';
  const days = [];
  const cycle = [];
  const extraBlocks = {
    core: { title: 'Core', frequency: 'Mínimo 2 días / semana', exercises: [] },
    calves: { title: 'Gemelos', frequency: '2 días / semana', exercises: [] },
  };
  const protocol = {
    rirTarget: 2,
    execution: '',
    defaultRestSeconds: state.settings.defaultRestSeconds,
  };

  let currentDay = null;
  let currentBlock = null;
  let subtitleExpected = false;

  const pushCurrentDay = () => {
    if (currentDay) {
      currentDay.exercises = currentDay.exercises || [];
      days.push(currentDay);
      cycle.push({ id: currentDay.id, type: currentDay.type || 'workout' });
    }
    currentDay = null;
    subtitleExpected = false;
    currentBlock = null;
  };

  const addExercise = (target, line) => {
    const parsed = parseExerciseLine(line);
    if (parsed) target.exercises.push(parsed);
  };

  lines.forEach((line) => {
    const normalized = normalizeText(line);
    const dayMatch = line.match(/^d[ií]a\s*(\d+)\s*:?(.*)$/i);
    if (dayMatch) {
      pushCurrentDay();
      const dayNumber = dayMatch[1];
      const after = dayMatch[2]?.trim() || '';
      const isRest = normalizeText(after).includes('descansa');
      currentDay = {
        id: `day${dayNumber}`,
        title: `Día ${dayNumber}`,
        subtitle: '',
        type: isRest ? 'rest' : 'workout',
        notes: '',
        exercises: [],
      };
      subtitleExpected = !isRest;
      if (isRest) currentDay.subtitle = 'Descanso';
      return;
    }

    if (normalized.includes('descansas') && !currentDay) {
      cycle.push({ id: uid('rest'), type: 'rest' });
      return;
    }

    if (normalized.includes('zona de core') || normalized.startsWith('core') || normalized.includes('recto abdominal')) {
      pushCurrentDay();
      currentBlock = 'core';
      return;
    }

    if (normalized.includes('gemelos')) {
      pushCurrentDay();
      currentBlock = 'calves';
      return;
    }

    const rirMatch = normalized.match(/rir\s*(\d+)/);
    if (rirMatch) protocol.rirTarget = Number(rirMatch[1]);
    const minuteMatch = normalized.match(/descansar\s*(\d+)\s*minuto/);
    if (minuteMatch) protocol.defaultRestSeconds = Number(minuteMatch[1]) * 60;
    if (normalized.includes('subida explosiva') || normalized.includes('fase concentrica')) protocol.execution = line;

    if (currentBlock) {
      const exercise = parseExerciseLine(line);
      if (exercise) extraBlocks[currentBlock].exercises.push(exercise);
      return;
    }

    if (!currentDay) return;

    if (currentDay.type === 'rest') {
      if (normalized.includes('descansa')) cycle.push({ id: uid('rest'), type: 'rest' });
      return;
    }

    if (subtitleExpected && !parseExerciseLine(line)) {
      currentDay.subtitle = line;
      subtitleExpected = false;
      return;
    }

    const exercise = parseExerciseLine(line);
    if (exercise) {
      currentDay.exercises.push(exercise);
      subtitleExpected = false;
      return;
    }

    if (currentDay.notes) currentDay.notes += ` ${line}`;
    else currentDay.notes = line;
  });

  pushCurrentDay();

  if (!cycle.length && days.length) days.forEach((day) => cycle.push({ id: day.id, type: day.type || 'workout' }));
  if (!days.length) throw new Error('No se detectaron días de entrenamiento en el texto.');

  const program = {
    id: uid('program'),
    name,
    goal: meta.goal || '',
    startDate: meta.startDate || todayInputValue(),
    status: meta.activate ? 'active' : 'draft',
    sourceText: rawText,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    cycle,
    days,
    extraBlocks,
    protocol,
  };

  const matchSummary = summarizeExerciseMatches(program);
  return { ...program, matchSummary };
}

function parseExerciseLine(line) {
  const clean = line.replace(/[\u2022]/g, '').trim();
  if (!clean) return null;
  const pattern = /(.*?)\s*[:.]?\s*(\d+)\s*x\s*([0-9]+(?:\s*\/\s*cada\s*pierna)?|[0-9]+\s*reps?|1\s*minuto|1\s*min|[0-9]+\s*seg(?:undos?)?|[0-9]+(?:\s*cada\s*pierna)?)(.*)$/i;
  const match = clean.match(pattern);
  if (!match) return null;
  const [, rawName, sets, reps, notesRaw] = match;
  const name = rawName.replace(/[.:-]+$/, '').trim();
  if (!name) return null;
  const notes = notesRaw.replace(/^\s*[.:-]?\s*/, '').trim();
  return {
    name,
    sets: safeNumber(sets, 0),
    reps: reps.replace(/\s+/g, ' ').trim(),
    restSeconds: state.settings.defaultRestSeconds,
    tempo: notes.toLowerCase().includes('normal') ? 'Normal 1-1' : 'Explosiva subida · 3s bajada',
    notes,
  };
}

function summarizeExerciseMatches(program) {
  const matchedExercises = [];
  const newExercises = [];
  const source = [...(program.days || []).flatMap((day) => day.exercises || []), ...(program.extraBlocks?.core?.exercises || []), ...(program.extraBlocks?.calves?.exercises || [])];
  source.forEach((exercise) => {
    const normalized = normalizeText(exercise.name);
    const existing = state.exerciseLibrary.find((item) => normalizeText(item.name) === normalized || item.aliases?.includes(normalized));
    if (existing) matchedExercises.push(exercise.name);
    else newExercises.push(exercise.name);
  });
  return { matchedExercises, newExercises };
}

function previewImportedProgram() {
  const text = els.programImportText.value.trim();
  if (!text) {
    showToast('Pega texto o carga un archivo primero.');
    return;
  }
  try {
    importPreview = parseRoutineText(text, {
      name: els.importProgramName.value.trim() || 'Rutina importada',
      goal: els.importProgramGoal.value.trim(),
      startDate: els.importProgramStartDate.value || todayInputValue(),
      activate: els.activateImportedToggle.checked,
    });
    renderImportPreview();
    showToast('Vista previa generada.');
  } catch (error) {
    showToast(error.message || 'No se pudo generar la vista previa.');
  }
}

function saveImportedProgram() {
  if (!importPreview) previewImportedProgram();
  if (!importPreview) return;
  const program = clone(importPreview);
  if (els.activateImportedToggle.checked) {
    state.programs = state.programs.map((item) => ({ ...item, status: item.status === 'active' ? 'archived' : item.status }));
    state.meta.activeProgramId = program.id;
    program.status = 'active';
  }
  const addExercises = [...(program.days || []).flatMap((day) => day.exercises || []), ...(program.extraBlocks?.core?.exercises || []), ...(program.extraBlocks?.calves?.exercises || [])];
  addExercises.forEach((exercise) => {
    const item = ensureExerciseInLibrary(exercise, '');
    persistExerciseLibraryEntry(item);
  });
  state.programs.unshift(program);
  persistProgram(program);
  persistSettings();
  saveLocal();
  renderAll();
  showToast('Rutina guardada.');
}

async function handleProgramImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const extension = file.name.split('.').pop()?.toLowerCase();
  try {
    let text = '';
    if (extension === 'txt' || extension === 'md') {
      text = await file.text();
    } else if (extension === 'json') {
      const raw = JSON.parse(await file.text());
      if (raw.days && raw.cycle) {
        text = raw.sourceText || programToText(raw);
        els.importProgramName.value = raw.name || els.importProgramName.value;
        els.importProgramGoal.value = raw.goal || els.importProgramGoal.value;
        els.importProgramStartDate.value = raw.startDate || els.importProgramStartDate.value;
      } else {
        throw new Error('El JSON no tiene formato de rutina.');
      }
    } else if (extension === 'docx') {
      if (!window.mammoth) throw new Error('No se cargó el lector DOCX.');
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      text = result.value;
    } else {
      throw new Error('Formato no soportado. Usa TXT, DOCX o JSON.');
    }
    els.programImportText.value = text.trim();
    if (!els.importProgramName.value.trim()) els.importProgramName.value = file.name.replace(/\.[^.]+$/, '');
    showToast('Archivo cargado en el importador.');
  } catch (error) {
    showToast(error.message || 'No se pudo leer el archivo.');
  } finally {
    event.target.value = '';
  }
}

function exportBackup() {
  const payload = {
    exportedAt: nowIso(),
    app: 'Arslan Training Tracker Pro',
    data: {
      settings: state.settings,
      meta: state.meta,
      programs: state.programs,
      exerciseLibrary: state.exerciseLibrary,
      sessions: state.sessions,
      reports: state.reports,
      bodyMetrics: state.bodyMetrics,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `arslan-tracker-backup-${todayInputValue()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Backup exportado.');
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed.data || parsed;
    state = reviveState(data);
    saveLocal();
    renderAll();
    showToast('Backup importado.');
  } catch (error) {
    showToast('No se pudo importar el backup.');
  } finally {
    event.target.value = '';
  }
}

function saveSettingsFromForm() {
  state.settings.defaultRestSeconds = Math.max(15, safeNumber(els.settingsRestSecondsInput.value, 60));
  state.settings.currentWeekManual = Math.max(1, safeNumber(els.settingsCurrentWeekInput.value, 1));
  state.settings.soundEnabled = els.settingsSoundEnabledInput.checked;
  state.settings.keepAwake = els.settingsKeepAwakeInput.checked;
  timerState.secondsLeft = state.settings.defaultRestSeconds;
  persistSettings();
  saveLocal();
  requestWakeLockIfNeeded();
  renderAll();
  showToast('Ajustes guardados.');
}

async function requestWakeLockIfNeeded() {
  if (!('wakeLock' in navigator)) return;
  if (!state.settings.keepAwake) {
    try {
      await wakeLock?.release();
    } catch (_) {
      // no-op
    }
    wakeLock = null;
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {
    // ignore unsupported states
  }
}

async function handleSignIn() {
  if (!firebase.enabled || !firebase.auth) {
    showToast('Configura Firebase primero.');
    return;
  }
  const email = els.authEmailInput.value.trim();
  const password = els.authPasswordInput.value;
  if (!email || !password) {
    showToast('Introduce email y contraseña.');
    return;
  }
  try {
    await signInWithEmailAndPassword(firebase.auth, email, password);
    showToast('Sesión iniciada.');
  } catch (error) {
    showToast(error.message || 'No se pudo iniciar sesión.');
  }
}

async function handleSignUp() {
  if (!firebase.enabled || !firebase.auth) {
    showToast('Configura Firebase primero.');
    return;
  }
  const email = els.authEmailInput.value.trim();
  const password = els.authPasswordInput.value;
  if (!email || !password) {
    showToast('Introduce email y contraseña.');
    return;
  }
  try {
    await createUserWithEmailAndPassword(firebase.auth, email, password);
    showToast('Cuenta creada.');
  } catch (error) {
    showToast(error.message || 'No se pudo crear la cuenta.');
  }
}

async function handleSignOut() {
  if (!firebase.enabled || !firebase.auth) return;
  await signOut(firebase.auth);
  showToast('Sesión cerrada.');
}

function resetDemo() {
  state = buildInitialState();
  importPreview = null;
  timerState = { secondsLeft: state.settings.defaultRestSeconds, running: false, endsAt: null };
  saveLocal();
  renderAll();
  showToast('Modo demo restaurado.');
}

function saveCurrentWorkout() {
  const session = state.currentSession;
  if (!session) {
    showToast('No hay sesión activa.');
    return;
  }
  session.includeCore = els.includeCoreToggle.checked;
  session.includeCalves = els.includeCalvesToggle.checked;
  session.notes = els.workoutNotes.value;
  session.completedAt = nowIso();
  const existingIndex = state.sessions.findIndex((item) => item.id === session.id);
  if (existingIndex >= 0) state.sessions[existingIndex] = clone(session);
  else state.sessions.unshift(clone(session));
  advanceCycleAfterSaving(session);
  persistSession(session);
  persistSettings();
  state.currentSession = null;
  pauseTimer();
  saveLocal();
  renderAll();
  setView('home');
  showToast('Sesión guardada.');
}

function duplicateSimilarWorkout() {
  const session = state.currentSession;
  if (!session) return;
  session.exercises.forEach((exercise) => {
    const previous = getPreviousExercisePerformance(exercise.exerciseId);
    if (!previous) return;
    exercise.setsData = exercise.setsData.map((set, index) => ({
      ...set,
      weight: previous.setsData?.[index]?.weight ?? set.weight,
      reps: previous.setsData?.[index]?.reps ?? set.reps,
      rir: previous.setsData?.[index]?.rir ?? set.rir,
      restSeconds: previous.setsData?.[index]?.restSeconds ?? set.restSeconds,
    }));
  });
  saveLocal();
  renderAll();
  showToast('Se copiaron los últimos valores similares.');
}

function toggleSessionBlock(blockId, checked) {
  if (!state.currentSession) return;
  if (checked) appendBlockToSession(state.currentSession, blockId);
  else removeBlockFromSession(state.currentSession, blockId);
  if (blockId === 'core') state.currentSession.includeCore = checked;
  if (blockId === 'calves') state.currentSession.includeCalves = checked;
  saveLocal();
  renderAll();
}

function bindEvents() {
  els.navButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  els.themeToggleBtn.addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    persistSettings();
    saveLocal();
    applyTheme();
  });
  els.startNextWorkoutBtn.addEventListener('click', startNextCycleWorkout);
  els.openImportProgramBtn.addEventListener('click', () => setView('programs'));
  els.quickCoreBtn.addEventListener('click', () => {
    if (!state.currentSession) startNextCycleWorkout();
    toggleSessionBlock('core', true);
    els.includeCoreToggle.checked = true;
    setView('workout');
  });
  els.quickCalvesBtn.addEventListener('click', () => {
    if (!state.currentSession) startNextCycleWorkout();
    toggleSessionBlock('calves', true);
    els.includeCalvesToggle.checked = true;
    setView('workout');
  });
  els.quickReportBtn.addEventListener('click', () => { autoFillReport(); setView('reports'); });
  els.quickWeightBtn.addEventListener('click', () => setView('progress'));
  els.timerToggleBtn.addEventListener('click', () => {
    if (timerState.running) pauseTimer();
    else startTimer(timerState.secondsLeft || state.settings.defaultRestSeconds);
  });
  els.timerMinusBtn.addEventListener('click', () => {
    timerState.secondsLeft = Math.max(15, safeNumber(timerState.secondsLeft, state.settings.defaultRestSeconds) - 15);
    if (timerState.running) timerState.endsAt = Date.now() + timerState.secondsLeft * 1000;
    saveLocal();
    updateTimerDisplay();
  });
  els.timerPlusBtn.addEventListener('click', () => {
    timerState.secondsLeft = safeNumber(timerState.secondsLeft, state.settings.defaultRestSeconds) + 15;
    if (timerState.running) timerState.endsAt = Date.now() + timerState.secondsLeft * 1000;
    saveLocal();
    updateTimerDisplay();
  });
  els.copySimilarWorkoutBtn.addEventListener('click', duplicateSimilarWorkout);
  els.saveWorkoutBtn.addEventListener('click', saveCurrentWorkout);
  els.includeCoreToggle.addEventListener('change', (event) => toggleSessionBlock('core', event.target.checked));
  els.includeCalvesToggle.addEventListener('change', (event) => toggleSessionBlock('calves', event.target.checked));
  els.workoutNotes.addEventListener('input', () => {
    if (!state.currentSession) return;
    state.currentSession.notes = els.workoutNotes.value;
    saveLocal();
  });
  els.workoutExercisesList.addEventListener('input', (event) => {
    const card = event.target.closest('.set-card');
    if (!card || !state.currentSession) return;
    const exerciseIndex = Number(card.dataset.exerciseIndex);
    const setIndex = Number(card.dataset.setIndex);
    const field = event.target.dataset.field;
    if (!field) return;
    updateSessionField(exerciseIndex, setIndex, field, event.target.value);
    renderHome();
    renderWorkout();
  });
  els.workoutExercisesList.addEventListener('click', (event) => {
    const card = event.target.closest('.set-card');
    const action = event.target.dataset.action;
    if (!card || !action || !state.currentSession) return;
    const exerciseIndex = Number(card.dataset.exerciseIndex);
    const setIndex = Number(card.dataset.setIndex);
    const set = state.currentSession.exercises?.[exerciseIndex]?.setsData?.[setIndex];
    if (!set) return;
    if (action === 'weight-minus') set.weight = String(Math.max(0, safeNumber(set.weight, 0) - 2.5));
    if (action === 'weight-plus') set.weight = String(safeNumber(set.weight, 0) + 2.5);
    if (action === 'reps-minus') set.reps = String(Math.max(0, safeNumber(set.reps, 0) - 1));
    if (action === 'reps-plus') set.reps = String(safeNumber(set.reps, 0) + 1);
    if (action === 'copy-previous') copyPreviousSet(exerciseIndex, setIndex);
    if (action === 'toggle-done') markSetDone(exerciseIndex, setIndex);
    saveLocal();
    renderAll();
  });
  els.createFromActiveBtn.addEventListener('click', duplicateCurrentProgram);
  els.previewProgramBtn.addEventListener('click', previewImportedProgram);
  els.saveImportedProgramBtn.addEventListener('click', saveImportedProgram);
  els.programImportFile.addEventListener('change', handleProgramImportFile);
  els.programList.addEventListener('click', async (event) => {
    const action = event.target.dataset.programAction;
    const programId = event.target.dataset.id;
    const dayId = event.target.dataset.dayId;
    if (!action || !programId) return;
    if (action === 'activate') return setActiveProgram(programId);
    if (action === 'duplicate') return loadProgramIntoImporter(programId);
    if (action === 'preview') return loadProgramIntoImporter(programId);
    if (action === 'archive') return toggleArchiveProgram(programId);
    if (action === 'delete') return deleteProgram(programId);
    if (action === 'start-day') {
      if (state.meta.activeProgramId !== programId) setActiveProgram(programId);
      startSession(dayId);
    }
  });
  els.saveWeightBtn.addEventListener('click', saveWeight);
  els.exerciseSearchInput.addEventListener('input', searchExercise);
  els.reportWeightCurrentInput.addEventListener('input', recalcReportDifference);
  els.reportWeightPreviousInput.addEventListener('input', recalcReportDifference);
  els.duplicateReportBtn.addEventListener('click', duplicateLastReport);
  els.autofillReportBtn.addEventListener('click', autoFillReport);
  els.saveReportBtn.addEventListener('click', saveReport);
  els.reportList.addEventListener('click', (event) => {
    const action = event.target.dataset.reportAction;
    const id = event.target.dataset.id;
    if (!action || !id) return;
    const report = state.reports.find((item) => item.id === id);
    if (!report) return;
    if (action === 'edit') {
      setReportForm(report);
      setView('reports');
      showToast('Reporte cargado para edición.');
    }
    if (action === 'duplicate') {
      const duplicate = { ...clone(report), id: '', reportDate: todayInputValue(), createdAt: '', updatedAt: '' };
      setReportForm(duplicate);
      setView('reports');
    }
  });
  els.signInBtn.addEventListener('click', handleSignIn);
  els.signUpBtn.addEventListener('click', handleSignUp);
  els.signOutBtn.addEventListener('click', handleSignOut);
  els.seedCloudBtn.addEventListener('click', seedCloudFromLocal);
  els.saveSettingsBtn.addEventListener('click', saveSettingsFromForm);
  els.exportBackupBtn.addEventListener('click', exportBackup);
  els.importBackupInput.addEventListener('change', importBackup);
  els.resetDemoBtn.addEventListener('click', resetDemo);
  els.installPwaBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      showToast('Usa Añadir a pantalla de inicio si tu navegador no muestra instalación.');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tickTimer();
      requestWakeLockIfNeeded();
    }
  });
}

function hydrateFormDefaults() {
  els.importProgramStartDate.value = todayInputValue();
  els.weightDateInput.value = todayInputValue();
  setReportForm(state.reportDraft || defaultReportDraft());
  recalcReportDifference();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function syncTimerOnLoad() {
  if (timerState.running && timerState.endsAt) {
    timerState.secondsLeft = Math.max(0, Math.round((timerState.endsAt - Date.now()) / 1000));
    if (timerState.secondsLeft <= 0) {
      timerState.running = false;
      timerState.endsAt = null;
      timerState.secondsLeft = state.settings.defaultRestSeconds;
    }
  }
}

function init() {
  hydrateCurrentSessionFromStorage();
  syncTimerOnLoad();
  bindEvents();
  hydrateFormDefaults();
  setView(state.meta.currentView || 'home');
  applyTheme();
  renderAll();
  setInterval(tickTimer, 1000);
  registerServiceWorker();
  requestWakeLockIfNeeded();
  initFirebase();
}

init();
