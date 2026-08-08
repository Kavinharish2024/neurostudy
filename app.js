/* =========================================================
   NeuroStudy — local-first study planner
   All data lives in localStorage. No backend required.
   ========================================================= */

const STORE = {
  courses: 'ns_courses',
  history: 'ns_history',
};

const TASK_LABELS = {
  problem_solving: 'Problem solving',
  memorization: 'Memorization / retrieval',
  reading: 'Reading comprehension',
  conceptual: 'Learning new material',
  writing: 'Writing / synthesis',
  practice_testing: 'Practice testing',
};

const BASE_BLOCK_MIN = {
  problem_solving: 35,
  memorization: 22,
  reading: 30,
  conceptual: 30,
  writing: 35,
  practice_testing: 25,
};

/* ---------- storage helpers ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error('Storage failed', e); }
}
function getCourses() { return loadJSON(STORE.courses, []); }
function saveCourses(list) { saveJSON(STORE.courses, list); }
function getHistory() { return loadJSON(STORE.history, []); }
function saveHistory(list) { saveJSON(STORE.history, list); }

/* ---------- app state (current in-progress session) ---------- */
let current = {
  course: null,
  taskType: null,
  minutes: 60,
  pvt: { trials: [], lapses: 0, median: null },
  wm: { span: 0 },
  plan: null,
  blockIndex: 0,
  timer: { seconds: 0, total: 0, interval: null, paused: false },
};

/* =========================================================
   NAVIGATION
   ========================================================= */
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  if (view === 'home') renderHome();
  if (view === 'history') renderHistory();
  if (view === 'session') resetSessionFlow();
}

document.getElementById('mainTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (btn) switchView(btn.dataset.view);
});
document.getElementById('startSessionBtn').addEventListener('click', () => switchView('session'));

function goToStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-' + n).classList.add('active');
  document.querySelectorAll('.step').forEach(s => {
    const sn = Number(s.dataset.step);
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
  });
}

/* =========================================================
   HOME VIEW
   ========================================================= */
function renderHome() {
  const history = getHistory();
  const courses = getCourses();

  document.getElementById('statSessions').textContent = history.length;
  const totalMin = history.reduce((s, h) => s + (h.actualMinutes || h.minutes || 0), 0);
  document.getElementById('statMinutes').textContent = totalMin;

  const focusVals = history.map(h => h.review && h.review.focus).filter(Boolean);
  document.getElementById('statFocus').textContent = focusVals.length
    ? (focusVals.reduce((a, b) => a + b, 0) / focusVals.length).toFixed(1)
    : '—';

  const baseline = computeBaseline();
  document.getElementById('statBaseline').textContent = baseline
    ? Math.round(baseline.medianRT) + ' ms'
    : (history.length + ' / 3');

  const courseListEl = document.getElementById('courseListHome');
  courseListEl.innerHTML = '';
  if (courses.length === 0) {
    courseListEl.innerHTML = '<span class="chip empty">No courses yet</span>';
  } else {
    courses.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = c;
      courseListEl.appendChild(chip);
    });
  }

  const recentEl = document.getElementById('recentSessions');
  recentEl.innerHTML = '';
  const recent = [...history].reverse().slice(0, 5);
  if (recent.length === 0) {
    recentEl.innerHTML = '<p class="muted">Nothing logged yet. Your first session will show up here.</p>';
  } else {
    recent.forEach(h => {
      const row = document.createElement('div');
      row.className = 'recent-item';
      row.innerHTML = `
        <span class="recent-course">${escapeHTML(h.course)}</span>
        <span class="recent-meta">${escapeHTML(TASK_LABELS[h.taskType] || h.taskType)} · ${h.actualMinutes || h.minutes} min</span>
      `;
      recentEl.appendChild(row);
    });
  }
}
document.getElementById('manageCoursesBtn').addEventListener('click', () => openCourseModal());

/* =========================================================
   COURSE MODAL
   ========================================================= */
function openCourseModal() { document.getElementById('courseModal').classList.add('open'); document.getElementById('newCourseInput').focus(); }
function closeCourseModal() { document.getElementById('courseModal').classList.remove('open'); document.getElementById('newCourseInput').value = ''; }
document.getElementById('addCourseBtn').addEventListener('click', openCourseModal);
document.getElementById('cancelCourseBtn').addEventListener('click', closeCourseModal);
document.getElementById('saveCourseBtn').addEventListener('click', () => {
  const val = document.getElementById('newCourseInput').value.trim();
  if (!val) return;
  const courses = getCourses();
  if (!courses.includes(val)) { courses.push(val); saveCourses(courses); }
  closeCourseModal();
  populateCourseSelect();
  document.getElementById('courseSelect').value = val;
});

function populateCourseSelect() {
  const sel = document.getElementById('courseSelect');
  const courses = getCourses();
  sel.innerHTML = '';
  if (courses.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'Add a course to begin';
    opt.value = '';
    sel.appendChild(opt);
    return;
  }
  courses.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

/* =========================================================
   SESSION FLOW — STEP 1: TASK SETUP
   ========================================================= */
function resetSessionFlow() {
  current = {
    course: null, taskType: null, minutes: Number(document.getElementById('timeSlider').value),
    pvt: { trials: [], lapses: 0, median: null }, wm: { span: 0 },
    plan: null, blockIndex: 0, timer: { seconds: 0, total: 0, interval: null, paused: false },
  };
  populateCourseSelect();
  document.querySelectorAll('#taskTypeSelect button').forEach(b => b.classList.remove('selected'));
  goToStep(1);
  resetPVT();
  resetWM();
}

document.getElementById('timeSlider').addEventListener('input', e => {
  document.getElementById('timeValue').textContent = e.target.value;
});

document.getElementById('taskTypeSelect').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#taskTypeSelect button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  current.taskType = btn.dataset.value;
});

document.getElementById('toStep2Btn').addEventListener('click', () => {
  const courseVal = document.getElementById('courseSelect').value;
  if (!courseVal) { openCourseModal(); return; }
  if (!current.taskType) { alert('Pick what kind of work this session is.'); return; }
  current.course = courseVal;
  current.minutes = Number(document.getElementById('timeSlider').value);
  goToStep(2);
  startPVT();
});

/* =========================================================
   STEP 2A — PVT (reaction / vigilance) TASK
   ========================================================= */
const PVT_TRIALS = 8;
let pvtState = { armed: false, waiting: false, timeoutId: null, goAt: 0 };

function resetPVT() {
  current.pvt = { trials: [], lapses: 0, median: null };
  pvtState = { armed: false, waiting: false, timeoutId: null, goAt: 0 };
  document.getElementById('pvtCount').textContent = `0 / ${PVT_TRIALS}`;
  const target = document.getElementById('pvtTarget');
  target.textContent = 'Click start';
  target.className = 'pvt-target';
  document.getElementById('pvtHint').textContent = 'Click the button, then wait for it to turn teal — tap the instant it does.';
  document.getElementById('pvtCard').classList.remove('hidden');
  document.getElementById('wmCard').classList.add('hidden');
  document.getElementById('checkDoneCard').classList.add('hidden');
}

function startPVT() { resetPVT(); ambientPulse(true); }

document.getElementById('pvtTarget').addEventListener('click', () => {
  const target = document.getElementById('pvtTarget');

  if (!pvtState.armed && !pvtState.waiting) {
    // arm a trial
    pvtState.armed = true;
    target.className = 'pvt-target armed';
    target.textContent = '…';
    document.getElementById('pvtHint').textContent = 'Wait for it…';
    const delay = 1200 + Math.random() * 2600;
    pvtState.timeoutId = setTimeout(() => {
      pvtState.armed = false;
      pvtState.waiting = true;
      pvtState.goAt = performance.now();
      target.className = 'pvt-target go';
      target.textContent = 'TAP';
      pulseSpike();
    }, delay);
    return;
  }

  if (pvtState.armed && !pvtState.waiting) {
    // early click / false start
    clearTimeout(pvtState.timeoutId);
    pvtState.armed = false;
    target.className = 'pvt-target early';
    target.textContent = 'Too soon';
    document.getElementById('pvtHint').textContent = 'Clicked before the signal — that trial doesn\u2019t count. Try again.';
    setTimeout(() => resetPvtButtonOnly(), 700);
    return;
  }

  if (pvtState.waiting) {
    const rt = performance.now() - pvtState.goAt;
    pvtState.waiting = false;
    current.pvt.trials.push(rt);
    if (rt > 500) current.pvt.lapses++;
    document.getElementById('pvtCount').textContent = `${current.pvt.trials.length} / ${PVT_TRIALS}`;
    target.className = 'pvt-target';
    target.textContent = Math.round(rt) + ' ms';
    document.getElementById('pvtHint').textContent = 'Nice. Click to arm the next trial.';
    setTimeout(() => {
      if (current.pvt.trials.length >= PVT_TRIALS) {
        finishPVT();
      } else {
        resetPvtButtonOnly();
      }
    }, 500);
  }
});

function resetPvtButtonOnly() {
  const target = document.getElementById('pvtTarget');
  target.className = 'pvt-target';
  target.textContent = 'Click start';
  document.getElementById('pvtHint').textContent = 'Click the button, then wait for it to turn teal — tap the instant it does.';
}

function finishPVT() {
  ambientPulse(false);
  const sorted = [...current.pvt.trials].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  current.pvt.median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  document.getElementById('pvtCard').classList.add('hidden');
  startWM();
}

/* ambient / spike pulse line animation */
let ambientInterval = null;
function ambientPulse(on) {
  clearInterval(ambientInterval);
  if (!on) return;
  ambientInterval = setInterval(() => {
    const pts = [];
    for (let x = 0; x <= 400; x += 20) {
      const y = 25 + (Math.random() - 0.5) * 6;
      pts.push(`${x},${y.toFixed(1)}`);
    }
    document.getElementById('pulseLiveLine').setAttribute('points', pts.join(' '));
  }, 220);
}
function pulseSpike() {
  const pts = [];
  for (let x = 0; x <= 400; x += 20) {
    let y = 25;
    if (x >= 180 && x <= 220) y = x === 200 ? 4 : 18;
    pts.push(`${x},${y}`);
  }
  document.getElementById('pulseLiveLine').setAttribute('points', pts.join(' '));
}

/* =========================================================
   STEP 2B — VISUAL WORKING MEMORY (Corsi-style span task)
   ========================================================= */
let wmState = { span: 3, sequence: [], userIdx: 0, showing: false };

function resetWM() {
  wmState = { span: 3, sequence: [], userIdx: 0, showing: false };
  buildWMGrid();
}

function buildWMGrid() {
  const grid = document.getElementById('wmGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'wm-cell';
    cell.dataset.idx = i;
    cell.addEventListener('click', () => onWmCellClick(i));
    grid.appendChild(cell);
  }
}

function startWM() {
  document.getElementById('wmCard').classList.remove('hidden');
  resetWM();
  nextWMRound();
}

function nextWMRound() {
  wmState.sequence = [];
  wmState.userIdx = 0;
  const cells = 9;
  const chosen = new Set();
  while (chosen.size < wmState.span) chosen.add(Math.floor(Math.random() * cells));
  wmState.sequence = [...chosen];
  document.getElementById('wmCount').textContent = `Span ${wmState.span}`;
  document.getElementById('wmHint').textContent = 'Watch closely…';
  playWMSequence();
}

function playWMSequence() {
  wmState.showing = true;
  const cellsEls = document.querySelectorAll('.wm-cell');
  let i = 0;
  const step = () => {
    cellsEls.forEach(c => c.classList.remove('lit'));
    if (i > 0) cellsEls[wmState.sequence[i - 1]].classList.remove('lit');
    if (i >= wmState.sequence.length) {
      wmState.showing = false;
      document.getElementById('wmHint').textContent = 'Your turn — click the squares in the same order.';
      return;
    }
    cellsEls[wmState.sequence[i]].classList.add('lit');
    i++;
    setTimeout(step, 650);
  };
  step();
}

function onWmCellClick(idx) {
  if (wmState.showing) return;
  const cellsEls = document.querySelectorAll('.wm-cell');
  const expected = wmState.sequence[wmState.userIdx];
  if (idx === expected) {
    cellsEls[idx].classList.add('picked');
    wmState.userIdx++;
    if (wmState.userIdx === wmState.sequence.length) {
      // success — increase span
      current.wm.span = wmState.span;
      if (wmState.span >= 7) { finishWM(); return; }
      wmState.span++;
      setTimeout(() => {
        cellsEls.forEach(c => c.classList.remove('picked'));
        nextWMRound();
      }, 500);
    }
  } else {
    cellsEls[idx].classList.add('wrong');
    document.getElementById('wmHint').textContent = 'That breaks the sequence — recording your score.';
    setTimeout(finishWM, 700);
  }
}

function finishWM() {
  document.getElementById('wmCard').classList.add('hidden');
  document.getElementById('checkDoneCard').classList.remove('hidden');
  setTimeout(() => {
    buildPlanAndShow();
  }, 900);
}

/* =========================================================
   BASELINE + PLAN GENERATION
   ========================================================= */
function computeBaseline() {
  const history = getHistory().filter(h => h.pvt && h.pvt.median && h.wm && h.wm.span);
  if (history.length < 3) return null;
  const recent = history.slice(-5);
  const medianRT = recent.reduce((s, h) => s + h.pvt.median, 0) / recent.length;
  const wmSpan = recent.reduce((s, h) => s + h.wm.span, 0) / recent.length;
  return { medianRT, wmSpan };
}

function compositeScore(medianRT, wmSpan) {
  const reactionScore = clamp(650 - medianRT, 50, 500);
  const wmScore = wmSpan * 100;
  return reactionScore + wmScore;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function buildPlanAndShow() {
  const baseline = computeBaseline();
  const todayScore = compositeScore(current.pvt.median, current.wm.span);
  let ratio = 1;
  let state = 'building';
  if (baseline) {
    const baseScore = compositeScore(baseline.medianRT, baseline.wmSpan);
    ratio = todayScore / baseScore;
    state = ratio >= 1.1 ? 'above' : ratio <= 0.85 ? 'below' : 'normal';
  }

  const base = BASE_BLOCK_MIN[current.taskType] || 25;
  let blockLen = base;
  if (state === 'below') blockLen = clamp(Math.round(base * 0.75), 15, 45);
  else if (state === 'above') blockLen = clamp(Math.round(base * 1.15), 15, 45);
  else blockLen = clamp(base, 15, 45);

  const breakLen = blockLen > 25 ? 7 : 5;

  const blocks = [];
  let remaining = current.minutes;
  let blockNum = 1;
  while (remaining > 10) {
    const thisLen = Math.min(blockLen, remaining - (remaining > blockLen ? breakLen : 0));
    if (thisLen < 10) break;
    blocks.push({ type: 'study', label: `Block ${blockNum}`, minutes: thisLen });
    remaining -= thisLen;
    blockNum++;
    if (remaining > 10) {
      blocks.push({ type: 'break', label: 'Break', minutes: breakLen });
      remaining -= breakLen;
    }
  }
  if (remaining > 0 && blocks.length) {
    blocks[blocks.length - 1].minutes += remaining;
  }
  if (blocks.length === 0) {
    blocks.push({ type: 'study', label: 'Block 1', minutes: current.minutes });
  }

  current.plan = { blocks, state, ratio };

  // explanation text
  let explain;
  if (state === 'building') {
    explain = `Still building your personal baseline (${getHistory().length}/3 sessions with a cognitive check) — using a standard ${TASK_LABELS[current.taskType].toLowerCase()} structure for now.`;
  } else if (state === 'below') {
    explain = `Your performance today is running below your recent baseline, so blocks are shorter than usual with more frequent breaks. That's normal — it's not a diagnosis, just today's state.`;
  } else if (state === 'above') {
    explain = `You're performing above your recent baseline today, so blocks are a bit longer than usual — a good day to tackle the harder material first.`;
  } else {
    explain = `Your performance today is consistent with your usual range, so this is a standard session structure for ${TASK_LABELS[current.taskType].toLowerCase()}.`;
  }
  document.getElementById('planExplain').textContent = explain;

  const listEl = document.getElementById('blocksList');
  listEl.innerHTML = '';
  blocks.forEach(b => {
    const row = document.createElement('div');
    row.className = 'block-row' + (b.type === 'break' ? ' is-break' : '');
    row.innerHTML = `
      <div>
        <div class="block-name">${b.label}</div>
        <div class="block-sub">${b.type === 'break' ? 'Step away from the material' : escapeHTML(TASK_LABELS[current.taskType])}</div>
      </div>
      <div class="block-len">${b.minutes} min</div>
    `;
    listEl.appendChild(row);
  });

  goToStep(3);
}

document.getElementById('toStudyBtn').addEventListener('click', () => {
  current.blockIndex = 0;
  goToStep(4);
  startBlock();
});

/* =========================================================
   STEP 4 — STUDY TIMER
   ========================================================= */
const RING_CIRC = 2 * Math.PI * 88;

function startBlock() {
  const block = current.plan.blocks[current.blockIndex];
  if (!block) { goToStep(5); return; }

  document.getElementById('studyCourseLabel').textContent = current.course;
  document.getElementById('studyBlockLabel').textContent =
    block.type === 'break' ? 'Break' : block.label + ' — ' + TASK_LABELS[current.taskType];

  const next = current.plan.blocks[current.blockIndex + 1];
  document.getElementById('upNext').textContent = next
    ? `Up next: ${next.type === 'break' ? 'Break' : next.label} (${next.minutes} min)`
    : 'Last block — review comes after this.';

  current.timer.total = block.minutes * 60;
  current.timer.seconds = current.timer.total;
  current.timer.paused = false;
  document.getElementById('pauseBtn').textContent = 'Pause';

  clearInterval(current.timer.interval);
  updateTimerDisplay();
  current.timer.interval = setInterval(() => {
    if (current.timer.paused) return;
    current.timer.seconds--;
    updateTimerDisplay();
    if (current.timer.seconds <= 0) {
      clearInterval(current.timer.interval);
      current.blockIndex++;
      startBlock();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const s = current.timer.seconds;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  document.getElementById('timerReadout').textContent = `${m}:${String(sec).padStart(2, '0')}`;
  const frac = current.timer.total ? s / current.timer.total : 0;
  document.getElementById('ringFg').setAttribute('stroke-dashoffset', RING_CIRC * frac);
  document.getElementById('ringFg').setAttribute('stroke-dasharray', RING_CIRC);
}

document.getElementById('pauseBtn').addEventListener('click', () => {
  current.timer.paused = !current.timer.paused;
  document.getElementById('pauseBtn').textContent = current.timer.paused ? 'Resume' : 'Pause';
});
document.getElementById('skipBlockBtn').addEventListener('click', () => {
  clearInterval(current.timer.interval);
  current.blockIndex++;
  startBlock();
});

/* =========================================================
   STEP 5 — REVIEW / SAVE
   ========================================================= */
let reviewAnswers = { focus: null, completion: null, length: null };

document.getElementById('focusScale').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  document.querySelectorAll('#focusScale button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  reviewAnswers.focus = Number(btn.dataset.value);
});
document.getElementById('completionSelect').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  document.querySelectorAll('#completionSelect button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  reviewAnswers.completion = btn.dataset.value;
});
document.getElementById('lengthSelect').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  document.querySelectorAll('#lengthSelect button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  reviewAnswers.length = btn.dataset.value;
});

document.getElementById('finishSessionBtn').addEventListener('click', () => {
  const history = getHistory();
  const actualMinutes = current.plan.blocks.filter(b => b.type === 'study').reduce((s, b) => s + b.minutes, 0);
  history.push({
    id: Date.now(),
    date: new Date().toISOString(),
    course: current.course,
    taskType: current.taskType,
    minutes: current.minutes,
    actualMinutes,
    pvt: { median: current.pvt.median, lapses: current.pvt.lapses },
    wm: { span: current.wm.span },
    planState: current.plan.state,
    review: { ...reviewAnswers },
  });
  saveHistory(history);
  reviewAnswers = { focus: null, completion: null, length: null };
  document.querySelectorAll('#focusScale button, #completionSelect button, #lengthSelect button').forEach(b => b.classList.remove('selected'));
  switchView('home');
});

/* =========================================================
   HISTORY VIEW
   ========================================================= */
function renderHistory() {
  const history = [...getHistory()].reverse();
  const listEl = document.getElementById('historyList');
  const emptyEl = document.getElementById('historyEmpty');
  listEl.innerHTML = '';
  emptyEl.style.display = history.length ? 'none' : 'block';

  history.forEach(h => {
    const row = document.createElement('div');
    row.className = 'history-row';
    const d = new Date(h.date);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    row.innerHTML = `
      <div class="history-top">
        <span class="history-course">${escapeHTML(h.course)}</span>
        <span class="history-date">${dateStr}</span>
      </div>
      <div class="history-meta">
        ${escapeHTML(TASK_LABELS[h.taskType] || h.taskType)} · ${h.actualMinutes || h.minutes} min ·
        ${h.pvt && h.pvt.median ? Math.round(h.pvt.median) + ' ms reaction' : 'no check'} ·
        ${h.wm && h.wm.span ? 'span ' + h.wm.span : ''} ·
        ${h.review && h.review.focus ? 'focus ' + h.review.focus + '/5' : ''}
      </div>
    `;
    listEl.appendChild(row);
  });
}

/* =========================================================
   UTIL
   ========================================================= */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ambient idle animation for the brand mark */
(function idleBrandPulse() {
  const line = document.getElementById('brandPulseLine');
  let t = 0;
  setInterval(() => {
    t += 0.15;
    const pts = [];
    for (let x = 0; x <= 120; x += 6) {
      let y = 16;
      if (x > 20 && x < 40) y = 16 + Math.sin(t + x / 3) * 9;
      pts.push(`${x},${y.toFixed(1)}`);
    }
    line.setAttribute('points', pts.join(' '));
  }, 260);
})();

/* =========================================================
   INIT
   ========================================================= */
populateCourseSelect();
renderHome();
