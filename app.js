/**************************************************************************
 * PrepPilot AI — App logic (Version 1 MVP)
 * Vanilla JS, no build step — works straight from GitHub Pages.
 **************************************************************************/

const State = {
  user: null,       // { userId, name, email, examTarget, examDate, streak, ... }
  subjects: [],
  mcq: { questions: [], index: 0, score: 0, startTime: null, timerHandle: null, answered: false },
  checklist: { items: [], byId: {}, editingId: null, pendingConfidence: 0 }
};

// ---------------------------------------------------------------------
// BOOTSTRAP
// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bindAuthForms();
  bindNav();
  bindDashboard();
  bindPlanner();
  bindResources();
  bindMcq();
  bindSpeaking();
  bindNotes();
  bindProfile();
  bindAdmin();
  bindNoteReadModal();
  bindChecklist();

  const saved = localStorage.getItem('preppilot_user');
  if (saved) {
    State.user = JSON.parse(saved);
    enterApp();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------------------------------------------------------------------
// THEME
// ---------------------------------------------------------------------
function initTheme() {
  const saved = localStorage.getItem('preppilot_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('theme-toggle').textContent = saved === 'dark' ? '☀️' : '🌙';
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('preppilot_theme', next);
    document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

// ---------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------
function bindAuthForms() {
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.authTab;
      document.getElementById('login-form').classList.toggle('hidden', which !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', which !== 'register');
    });
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('login-msg');
    msg.textContent = 'Logging in…';
    const res = await Api.post('login', {
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value
    });
    if (res.ok) {
      State.user = res.user;
      localStorage.setItem('preppilot_user', JSON.stringify(res.user));
      msg.textContent = '';
      enterApp();
    } else {
      msg.textContent = res.error || 'Login failed.';
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('reg-msg');
    msg.textContent = 'Creating your account…';
    const res = await Api.post('register', {
      name: document.getElementById('reg-name').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      examTarget: document.getElementById('reg-target').value.trim(),
      examDate: document.getElementById('reg-date').value
    });
    if (res.ok) {
      msg.style.color = 'var(--accent)';
      msg.textContent = 'Account created! Logging you in…';
      State.user = {
        userId: res.userId, name: res.name,
        examTarget: document.getElementById('reg-target').value.trim(),
        examDate: document.getElementById('reg-date').value,
        streak: 0, totalStudyMinutes: 0
      };
      localStorage.setItem('preppilot_user', JSON.stringify(State.user));
      setTimeout(enterApp, 600);
    } else {
      msg.style.color = 'var(--danger)';
      msg.textContent = res.error || 'Could not create account.';
    }
  });
}

async function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const subjRes = await Api.get('getSubjects');
  if (subjRes.ok) {
    State.subjects = subjRes.subjects;
    fillSubjectSelects(State.subjects);
  }

  const isAdmin = State.user.isAdmin === true || State.user.isAdmin === 'TRUE';
  document.getElementById('admin-nav-btn').classList.toggle('hidden', !isAdmin);

  loadDashboard();
}

function fillSubjectSelects(subjects) {
  const selects = ['new-task-subject', 'resource-subject-filter', 'mcq-subject', 'note-subject',
                    'ar-subject', 'am-subject'];
  selects.forEach((id) => {
    const el = document.getElementById(id);
    subjects.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      el.appendChild(opt);
    });
  });
}

// ---------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------
function bindNav() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
}

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));

  if (name === 'planner') loadPlanner();
  if (name === 'checklist') loadChecklist();
  if (name === 'resources') loadResources();
  if (name === 'progress') loadProgress();
  if (name === 'speaking') loadSpeaking();
  if (name === 'notes') loadNotes();
  if (name === 'admin') loadAdminAll();
}

// ---------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------
function bindDashboard() {
  document.getElementById('quote-meaning-toggle').addEventListener('click', (e) => {
    const el = document.getElementById('dash-quote-meaning');
    el.classList.toggle('hidden');
    e.target.textContent = el.classList.contains('hidden') ? 'Show meaning ▾' : 'Hide meaning ▴';
  });

  document.getElementById('log-time-btn').addEventListener('click', async () => {
    const minutes = Number(document.getElementById('log-minutes').value);
    if (!minutes || minutes <= 0) { toast('Enter a valid number of minutes.'); return; }
    const res = await Api.post('logStudyTime', { userId: State.user.userId, minutes });
    if (res.ok) {
      document.getElementById('log-minutes').value = '';
      toast('Nice! Study time logged. 🔥');
      loadDashboard();
    }
  });
}

async function loadDashboard() {
  const res = await Api.get('getDashboard', { userId: State.user.userId });
  if (!res.ok) { toast(res.error || 'Could not load dashboard.'); return; }

  document.getElementById('dash-name').textContent = res.user.name || 'Aspirant';
  document.getElementById('dash-streak').textContent = res.user.streak || 0;
  document.getElementById('dash-minutes').textContent = res.user.totalStudyMinutes || 0;
  document.getElementById('dash-accuracy').textContent = res.overallAccuracy != null ? res.overallAccuracy + '%' : '—';
  document.getElementById('dash-countdown').textContent = res.examCountdown != null ? res.examCountdown : '—';
  document.getElementById('dash-exam-label').textContent = res.user.examTarget ? 'Days to ' + res.user.examTarget : 'Set your exam in Profile';

  if (res.quote) {
    document.getElementById('dash-quote-text').textContent = '“' + res.quote.quoteText + '”';
    document.getElementById('dash-quote-author').textContent = '— ' + res.quote.author;
    document.getElementById('dash-quote-meaning').textContent = res.quote.meaning;
  }

  const list = document.getElementById('dash-task-list');
  list.innerHTML = '';
  res.todayTasks.items.forEach((t) => list.appendChild(renderTaskRow(t, 'dash-task-progress')));
  document.getElementById('dash-task-progress').textContent = `${res.todayTasks.completed} / ${res.todayTasks.total}`;
}

/**
 * Renders one checklist <li>. Ticking the box updates instantly (optimistic
 * UI) — we don't wait for the server or reload the whole list, we just fire
 * the save in the background and only revert if it actually fails. This is
 * what makes taps feel instant instead of "stuck" while Apps Script responds.
 */
function renderTaskRow(task, progressPillId) {
  const li = document.createElement('li');
  const done = task.completed === true || task.completed === 'TRUE';
  li.innerHTML = `
    <input type="checkbox" ${done ? 'checked disabled' : ''} />
    <span class="task-title ${done ? 'task-done' : ''}">${escapeHtml(task.title)}</span>
    <span class="task-tag">${escapeHtml(task.taskType || '')}</span>
  `;
  const checkbox = li.querySelector('input');
  const titleEl = li.querySelector('.task-title');
  if (!done) {
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      titleEl.classList.add('task-done');
      bumpProgressPill(progressPillId, +1);

      const res = await Api.post('completeTask', { taskId: task.taskId });
      if (res.ok) {
        toast('Task completed ✅');
      } else {
        // revert — the save didn't actually go through
        checkbox.disabled = false;
        checkbox.checked = false;
        titleEl.classList.remove('task-done');
        bumpProgressPill(progressPillId, -1);
        toast(res.error || 'Could not save — check your connection and try again.');
      }
    });
  }
  return li;
}

function bumpProgressPill(id, delta) {
  const el = document.getElementById(id);
  if (!el) return;
  const [done, total] = el.textContent.split('/').map((s) => parseInt(s, 10) || 0);
  const next = Math.max(0, Math.min(total, done + delta));
  el.textContent = `${next} / ${total}`;
}

// ---------------------------------------------------------------------
// PLANNER
// ---------------------------------------------------------------------
function bindPlanner() {
  const dateInput = document.getElementById('planner-date');
  dateInput.valueAsDate = new Date();
  dateInput.addEventListener('change', loadPlanner);

  document.getElementById('add-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('new-task-title').value.trim();
    const subject = document.getElementById('new-task-subject').value;
    if (!title) return;
    const res = await Api.post('addTask', {
      userId: State.user.userId, title, subject, date: dateInput.value, taskType: 'Custom'
    });
    if (res.ok) {
      document.getElementById('new-task-title').value = '';
      toast('Task added.');
      loadPlanner();
    }
  });
}

async function loadPlanner() {
  const date = document.getElementById('planner-date').value || todayIso();
  const res = await Api.get('getStudyPlan', { userId: State.user.userId, date });
  if (!res.ok) return;
  const list = document.getElementById('planner-task-list');
  list.innerHTML = '';
  res.tasks.forEach((t) => list.appendChild(renderTaskRow(t, 'planner-progress')));
  const doneCount = res.tasks.filter((t) => t.completed === true || t.completed === 'TRUE').length;
  document.getElementById('planner-progress').textContent = `${doneCount} / ${res.tasks.length}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// RESOURCES
// ---------------------------------------------------------------------
function bindResources() {
  ['resource-subject-filter', 'resource-type-filter'].forEach((id) =>
    document.getElementById(id).addEventListener('change', loadResources)
  );
  document.getElementById('resource-search').addEventListener('input', debounce(loadResources, 350));
}

async function loadResources() {
  const params = {
    subject: document.getElementById('resource-subject-filter').value,
    type: document.getElementById('resource-type-filter').value,
    search: document.getElementById('resource-search').value.trim()
  };
  const res = await Api.get('getResources', params);
  const grid = document.getElementById('resource-list');
  grid.innerHTML = '';
  if (!res.ok || res.resources.length === 0) {
    grid.innerHTML = '<p class="muted">No resources found yet — check back soon or try a different filter.</p>';
    return;
  }
  const typeIcon = { video: '🎥', pdf: '📄', notes: '📝' };
  res.resources.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'resource-card glass';
    const action = r.type === 'notes'
      ? `<a href="#" class="read-note-link">Read note →</a>`
      : `<a href="${escapeAttr(r.url)}" target="_blank" rel="noopener">Open resource →</a>`;
    card.innerHTML = `
      <span class="r-type">${typeIcon[r.type] || '📄'}</span>
      <h4>${escapeHtml(r.title)}</h4>
      <p class="r-topic">${escapeHtml(r.subject)}${r.topic ? ' · ' + escapeHtml(r.topic) : ''}</p>
      ${action}
    `;
    if (r.type === 'notes') {
      card.querySelector('.read-note-link').addEventListener('click', (e) => {
        e.preventDefault();
        openNoteReadModal(r);
      });
    }
    grid.appendChild(card);
  });
}

function bindNoteReadModal() {
  document.getElementById('note-read-close').addEventListener('click', () =>
    document.getElementById('note-read-modal').classList.add('hidden')
  );
}

function openNoteReadModal(resource) {
  document.getElementById('note-read-title').textContent = resource.title;
  document.getElementById('note-read-meta').textContent =
    resource.subject + (resource.topic ? ' · ' + resource.topic : '');
  document.getElementById('note-read-content').textContent = resource.content || 'No content added yet.';
  document.getElementById('note-read-modal').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// MCQ ENGINE
// ---------------------------------------------------------------------
function bindMcq() {
  document.getElementById('mcq-start-btn').addEventListener('click', startMcq);
  document.getElementById('mcq-next-btn').addEventListener('click', nextMcqQuestion);
  document.getElementById('mcq-restart-btn').addEventListener('click', () => {
    document.getElementById('mcq-result').classList.add('hidden');
    document.getElementById('mcq-setup').classList.remove('hidden');
  });
}

async function startMcq() {
  const subject = document.getElementById('mcq-subject').value;
  const count = document.getElementById('mcq-count').value;
  if (!subject) { toast('Choose a subject first.'); return; }

  const res = await Api.get('getMCQs', { subject, count });
  if (!res.ok || res.mcqs.length === 0) { toast('No MCQs available for this subject yet.'); return; }

  State.mcq = { questions: res.mcqs, index: 0, score: 0, startTime: Date.now(), answered: false };
  document.getElementById('mcq-setup').classList.add('hidden');
  document.getElementById('mcq-result').classList.add('hidden');
  document.getElementById('mcq-quiz').classList.remove('hidden');
  renderMcqQuestion();
  startMcqTimer();
}

function startMcqTimer() {
  clearInterval(State.mcq.timerHandle);
  const qStart = Date.now();
  State.mcq.timerHandle = setInterval(() => {
    const secs = Math.floor((Date.now() - qStart) / 1000);
    document.getElementById('mcq-timer').textContent =
      '⏱ ' + String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
  }, 1000);
  State.mcq.qStartTime = qStart;
}

function renderMcqQuestion() {
  const q = State.mcq.questions[State.mcq.index];
  State.mcq.answered = false;
  document.getElementById('mcq-progress').textContent = `Q ${State.mcq.index + 1} / ${State.mcq.questions.length}`;
  document.getElementById('mcq-question').textContent = q.question;
  document.getElementById('mcq-explanation').classList.add('hidden');
  document.getElementById('mcq-next-btn').classList.add('hidden');

  const optsWrap = document.getElementById('mcq-options');
  optsWrap.innerHTML = '';
  ['A', 'B', 'C', 'D'].forEach((letter) => {
    const text = q['option' + letter];
    if (!text) return;
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = letter + '. ' + text;
    btn.addEventListener('click', () => selectMcqOption(letter, btn));
    optsWrap.appendChild(btn);
  });
  startMcqTimer();
}

async function selectMcqOption(letter, btnEl) {
  if (State.mcq.answered) return;
  State.mcq.answered = true;
  clearInterval(State.mcq.timerHandle);
  const timeTaken = Math.floor((Date.now() - State.mcq.qStartTime) / 1000);
  const q = State.mcq.questions[State.mcq.index];

  const res = await Api.post('submitMCQAnswer', {
    userId: State.user.userId, mcqId: q.mcqId, selectedOption: letter, timeTakenSec: timeTaken
  });

  document.querySelectorAll('.quiz-option').forEach((b) => {
    const optLetter = b.textContent.charAt(0);
    if (optLetter === res.correctOption) b.classList.add('correct');
    else if (b === btnEl) b.classList.add('wrong');
  });

  if (res.isCorrect) State.mcq.score++;
  if (res.explanation) {
    const exp = document.getElementById('mcq-explanation');
    exp.textContent = '💡 ' + res.explanation;
    exp.classList.remove('hidden');
  }
  document.getElementById('mcq-next-btn').classList.remove('hidden');
}

function nextMcqQuestion() {
  State.mcq.index++;
  if (State.mcq.index >= State.mcq.questions.length) {
    finishMcq();
  } else {
    renderMcqQuestion();
  }
}

function finishMcq() {
  clearInterval(State.mcq.timerHandle);
  document.getElementById('mcq-quiz').classList.add('hidden');
  document.getElementById('mcq-result').classList.remove('hidden');
  document.getElementById('mcq-result-score').textContent =
    `You scored ${State.mcq.score} / ${State.mcq.questions.length}`;
}

// ---------------------------------------------------------------------
// PROGRESS
// ---------------------------------------------------------------------
async function loadProgress() {
  const res = await Api.get('getProgress', { userId: State.user.userId });
  if (!res.ok) return;

  const bars = document.getElementById('progress-bars');
  bars.innerHTML = '';
  if (res.subjectStats.length === 0) {
    bars.innerHTML = '<p class="muted">Attempt a few MCQs to unlock your analytics.</p>';
  } else {
    res.subjectStats.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'progress-row';
      row.innerHTML = `
        <div class="p-label"><span>${escapeHtml(s.subject)}</span><span>${s.accuracy}% (${s.attempted} attempted)</span></div>
        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${s.accuracy}%"></div></div>
      `;
      bars.appendChild(row);
    });
  }

  renderChipList('weak-topics', res.weakTopics, 'weak');
  renderChipList('strong-topics', res.strongTopics, 'strong');
}

function renderChipList(elId, items, cls) {
  const el = document.getElementById(elId);
  if (!items || items.length === 0) {
    el.innerHTML = '<p class="muted">Nothing here yet.</p>';
    return;
  }
  el.innerHTML = items.map((i) => `<span class="chip ${cls}">${escapeHtml(i.subject)} · ${i.accuracy}%</span>`).join('');
}

// ---------------------------------------------------------------------
// SPEAKING PRACTICE (mic recording via MediaRecorder API)
// ---------------------------------------------------------------------
const SpeakingState = {
  prompts: [], currentPrompt: null, mediaRecorder: null, chunks: [],
  recordedBlob: null, timerHandle: null, seconds: 0, stream: null
};

function bindSpeaking() {
  document.getElementById('sp-category').addEventListener('change', () => {
    loadSpeakingPrompts(document.getElementById('sp-category').value);
  });
  document.getElementById('sp-next-btn').addEventListener('click', pickRandomPrompt);
  document.getElementById('sp-record-btn').addEventListener('click', toggleRecording);
  document.getElementById('sp-discard-btn').addEventListener('click', discardRecording);
  document.getElementById('sp-save-btn').addEventListener('click', uploadRecording);
}

async function loadSpeaking() {
  // populate category dropdown once
  const catSelect = document.getElementById('sp-category');
  if (catSelect.options.length <= 1) {
    const res = await Api.get('getSpeakingPrompts', {});
    if (res.ok) {
      const cats = [...new Set(res.prompts.map((p) => p.category))];
      cats.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        catSelect.appendChild(opt);
      });
      SpeakingState.prompts = res.prompts;
      if (!SpeakingState.currentPrompt) pickRandomPrompt();
    }
  }
  loadMyRecordings();
}

async function loadSpeakingPrompts(category) {
  const res = await Api.get('getSpeakingPrompts', category ? { category } : {});
  if (res.ok) {
    SpeakingState.prompts = res.prompts;
    pickRandomPrompt();
  }
}

function pickRandomPrompt() {
  if (SpeakingState.prompts.length === 0) return;
  const p = SpeakingState.prompts[Math.floor(Math.random() * SpeakingState.prompts.length)];
  SpeakingState.currentPrompt = p;
  document.getElementById('sp-prompt-card').innerHTML =
    `<span class="sp-cat">${escapeHtml(p.category)} · ${escapeHtml(p.difficulty)}</span>${escapeHtml(p.prompt)}`;
  discardRecording();
}

async function toggleRecording() {
  const btn = document.getElementById('sp-record-btn');
  if (SpeakingState.mediaRecorder && SpeakingState.mediaRecorder.state === 'recording') {
    SpeakingState.mediaRecorder.stop();
    return;
  }
  if (!SpeakingState.currentPrompt) { toast('Pick a prompt first.'); return; }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    SpeakingState.stream = stream;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    SpeakingState.mediaRecorder = recorder;
    SpeakingState.chunks = [];

    recorder.addEventListener('dataavailable', (e) => { if (e.data.size > 0) SpeakingState.chunks.push(e.data); });
    recorder.addEventListener('stop', onRecordingStop);

    recorder.start();
    btn.classList.add('recording');
    btn.textContent = '⏹️';
    document.getElementById('sp-status').textContent = 'Recording… tap again to stop';
    startRecTimer();
  } catch (err) {
    toast('Could not access microphone — check browser permissions.');
  }
}

function startRecTimer() {
  SpeakingState.seconds = 0;
  updateRecTimerLabel();
  SpeakingState.timerHandle = setInterval(() => {
    SpeakingState.seconds++;
    updateRecTimerLabel();
    if (SpeakingState.seconds >= 90) SpeakingState.mediaRecorder.stop(); // safety cap ~90s
  }, 1000);
}
function updateRecTimerLabel() {
  const m = String(Math.floor(SpeakingState.seconds / 60)).padStart(2, '0');
  const s = String(SpeakingState.seconds % 60).padStart(2, '0');
  document.getElementById('sp-rec-timer').textContent = `${m}:${s}`;
}

function onRecordingStop() {
  clearInterval(SpeakingState.timerHandle);
  const btn = document.getElementById('sp-record-btn');
  btn.classList.remove('recording');
  btn.textContent = '🎙️';
  document.getElementById('sp-status').textContent = 'Recording ready — listen below, then save it.';

  const mimeType = SpeakingState.mediaRecorder.mimeType || 'audio/webm';
  SpeakingState.recordedBlob = new Blob(SpeakingState.chunks, { type: mimeType });
  const url = URL.createObjectURL(SpeakingState.recordedBlob);
  const audioEl = document.getElementById('sp-playback');
  audioEl.src = url;
  audioEl.classList.remove('hidden');
  document.getElementById('sp-save-row').classList.remove('hidden');

  if (SpeakingState.stream) SpeakingState.stream.getTracks().forEach((t) => t.stop());
}

function discardRecording() {
  clearInterval(SpeakingState.timerHandle);
  SpeakingState.recordedBlob = null;
  SpeakingState.seconds = 0;
  document.getElementById('sp-rec-timer').textContent = '00:00';
  document.getElementById('sp-status').textContent = 'Tap the mic to start recording';
  document.getElementById('sp-playback').classList.add('hidden');
  document.getElementById('sp-save-row').classList.add('hidden');
  document.getElementById('sp-msg').textContent = '';
  const btn = document.getElementById('sp-record-btn');
  btn.classList.remove('recording');
  btn.textContent = '🎙️';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadRecording() {
  if (!SpeakingState.recordedBlob || !SpeakingState.currentPrompt) return;
  const msg = document.getElementById('sp-msg');
  msg.style.color = 'var(--text-muted)';
  msg.textContent = 'Uploading…';
  document.getElementById('sp-save-btn').disabled = true;

  try {
    const base64 = await blobToBase64(SpeakingState.recordedBlob);
    const res = await Api.post('saveRecording', {
      userId: State.user.userId,
      promptId: SpeakingState.currentPrompt.promptId,
      audioBase64: base64,
      mimeType: SpeakingState.recordedBlob.type,
      durationSec: SpeakingState.seconds
    });
    if (res.ok) {
      msg.style.color = 'var(--accent)'; msg.textContent = 'Saved! Listen to it anytime under "My recordings".';
      toast('Recording saved.');
      discardRecording();
      loadMyRecordings();
    } else {
      msg.style.color = 'var(--danger)'; msg.textContent = res.error || 'Upload failed — try again.';
    }
  } catch (err) {
    msg.style.color = 'var(--danger)'; msg.textContent = 'Upload failed — check your connection.';
  }
  document.getElementById('sp-save-btn').disabled = false;
}

async function loadMyRecordings() {
  const res = await Api.get('getMyRecordings', { userId: State.user.userId });
  const wrap = document.getElementById('sp-recordings-list');
  wrap.innerHTML = '';
  if (!res.ok || res.recordings.length === 0) {
    wrap.innerHTML = '<p class="muted">No recordings yet — practice a prompt above to get started.</p>';
    return;
  }
  res.recordings.forEach((r) => {
    const item = document.createElement('div');
    item.className = 'sp-rec-item';
    const date = new Date(r.createdAt).toLocaleDateString();
    item.innerHTML = `
      <button class="mini-btn danger" data-delete>Delete</button>
      <p class="sp-rec-meta">${escapeHtml(r.category)} · ${date} · ${r.durationSec}s</p>
      <p style="margin:0 0 8px;font-size:.88rem;">${escapeHtml(r.prompt)}</p>
      <audio controls src="${escapeAttr(r.fileUrl)}"></audio>
    `;
    item.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!confirm('Delete this recording?')) return;
      const delRes = await Api.post('deleteRecording', { userId: State.user.userId, recordingId: r.recordingId });
      if (delRes.ok) { toast('Recording deleted.'); loadMyRecordings(); }
    });
    wrap.appendChild(item);
  });
}

// ---------------------------------------------------------------------
// NOTES
// ---------------------------------------------------------------------
function bindNotes() {
  document.getElementById('note-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('note-content').value.trim();
    if (!content) return;
    const res = await Api.post('saveNote', {
      userId: State.user.userId,
      subject: document.getElementById('note-subject').value,
      topic: document.getElementById('note-topic').value.trim(),
      content
    });
    if (res.ok) {
      document.getElementById('note-content').value = '';
      document.getElementById('note-topic').value = '';
      toast('Note saved.');
      loadNotes();
    }
  });
}

async function loadNotes() {
  const res = await Api.get('getNotes', { userId: State.user.userId });
  const list = document.getElementById('notes-list');
  list.innerHTML = '';
  if (!res.ok || res.notes.length === 0) {
    list.innerHTML = '<p class="muted">No notes yet — write your first one above.</p>';
    return;
  }
  res.notes.slice().reverse().forEach((n) => {
    const item = document.createElement('div');
    item.className = 'note-item glass';
    item.innerHTML = `
      <p class="n-meta">${escapeHtml(n.subject || 'General')}${n.topic ? ' · ' + escapeHtml(n.topic) : ''}</p>
      <p>${escapeHtml(n.content)}</p>
    `;
    list.appendChild(item);
  });
}

// ---------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------
function bindProfile() {
  document.getElementById('profile-btn').addEventListener('click', () => {
    document.getElementById('profile-name').value = State.user.name || '';
    document.getElementById('profile-target').value = State.user.examTarget || '';
    document.getElementById('profile-date').value = State.user.examDate || '';
    document.getElementById('profile-modal').classList.remove('hidden');
  });
  document.getElementById('profile-close').addEventListener('click', () =>
    document.getElementById('profile-modal').classList.add('hidden')
  );
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = {
      userId: State.user.userId,
      name: document.getElementById('profile-name').value.trim(),
      examTarget: document.getElementById('profile-target').value.trim(),
      examDate: document.getElementById('profile-date').value
    };
    const res = await Api.post('updateProfile', updates);
    if (res.ok) {
      State.user = { ...State.user, ...updates };
      localStorage.setItem('preppilot_user', JSON.stringify(State.user));
      document.getElementById('profile-modal').classList.add('hidden');
      toast('Profile updated.');
      loadDashboard();
    }
  });
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('preppilot_user');
    location.reload();
  });
}

// ---------------------------------------------------------------------
// MASTER CHECKLIST (KREIS RPC syllabus tracker)
// ---------------------------------------------------------------------
// Perf notes: we use native <details>/<summary> for the accordion (no JS
// needed to expand/collapse — instant, browser-native) and ONE delegated
// click/change listener on the whole container instead of one listener per
// row (there are 200+ rows). Checkbox taps update instantly (optimistic)
// and only the summary counters are patched afterwards — we never
// re-fetch or re-render the whole list after a single tap.

function bindChecklist() {
  const container = document.getElementById('checklist-sections');

  container.addEventListener('change', (e) => {
    if (e.target.matches('.cl-topic-checkbox')) {
      const itemId = e.target.dataset.itemId;
      toggleChecklistComplete(itemId, e.target.checked, e.target);
    }
  });

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.cl-detail-btn');
    if (btn) openChecklistModal(btn.dataset.itemId);
  });

  document.getElementById('checklist-search').addEventListener('input', debounce(() => {
    renderChecklist(document.getElementById('checklist-search').value.trim().toLowerCase());
  }, 250));

  // Detail modal wiring
  document.getElementById('cm-close-btn').addEventListener('click', () =>
    document.getElementById('checklist-modal').classList.add('hidden')
  );
  document.getElementById('cm-mcq-attempted').addEventListener('input', updateAccuracyPreview);
  document.getElementById('cm-mcq-correct').addEventListener('input', updateAccuracyPreview);

  document.querySelectorAll('#cm-confidence-picker span').forEach((star) => {
    star.addEventListener('click', () => {
      const val = Number(star.dataset.star);
      State.checklist.pendingConfidence = val;
      paintStars(val);
    });
  });

  document.getElementById('cm-save-btn').addEventListener('click', saveChecklistModal);
}

async function loadChecklist() {
  const res = await Api.get('getChecklist', { userId: State.user.userId });
  if (!res.ok) { toast(res.error || 'Could not load checklist.'); return; }
  State.checklist = State.checklist || {};
  State.checklist.items = res.items;
  State.checklist.byId = {};
  res.items.forEach((i) => { State.checklist.byId[i.itemId] = i; });
  renderChecklist('');
  updateChecklistOverall();
}

function updateChecklistOverall() {
  const items = State.checklist.items || [];
  const done = items.filter((i) => i.completed).length;
  document.getElementById('checklist-overall-text').textContent = `${done} / ${items.length}`;
  document.getElementById('checklist-overall-fill').style.width = items.length ? `${Math.round(100 * done / items.length)}%` : '0%';
}

function renderChecklist(filterText) {
  const items = State.checklist.items || [];
  const filtered = filterText
    ? items.filter((i) => (i.topic + ' ' + i.subject + ' ' + i.section).toLowerCase().includes(filterText))
    : items;

  // group by section -> subject
  const sections = new Map();
  filtered.forEach((it) => {
    if (!sections.has(it.section)) sections.set(it.section, new Map());
    const subjMap = sections.get(it.section);
    if (!subjMap.has(it.subject)) subjMap.set(it.subject, []);
    subjMap.get(it.subject).push(it);
  });

  const frag = document.createDocumentFragment();
  sections.forEach((subjMap, sectionName) => {
    let sectionTotal = 0, sectionDone = 0;
    subjMap.forEach((topicList) => topicList.forEach((t) => { sectionTotal++; if (t.completed) sectionDone++; }));

    const details = document.createElement('details');
    details.className = 'cl-section';
    details.open = !!filterText; // auto-expand while searching
    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${escapeHtml(sectionName)}</span><span class="cl-badge">${sectionDone} / ${sectionTotal}</span>`;
    details.appendChild(summary);

    subjMap.forEach((topicList, subjectName) => {
      const subjDetails = document.createElement('details');
      subjDetails.className = 'cl-subject';
      subjDetails.open = !!filterText;
      const subjDone = topicList.filter((t) => t.completed).length;
      const subjSummary = document.createElement('summary');
      // Only show the subject header if it differs meaningfully from the section (avoids redundant "Aptitude > Aptitude")
      subjSummary.innerHTML = `<span>${escapeHtml(subjectName)}</span><span class="cl-badge">${subjDone} / ${topicList.length}</span>`;
      subjDetails.appendChild(subjSummary);

      topicList.forEach((item) => subjDetails.appendChild(renderChecklistRow(item)));
      details.appendChild(subjDetails);
    });

    frag.appendChild(details);
  });

  const container = document.getElementById('checklist-sections');
  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<p class="muted">No topics match your search.</p>';
    return;
  }
  container.appendChild(frag);
}

function renderChecklistRow(item) {
  const row = document.createElement('div');
  row.className = 'cl-topic-row';
  row.innerHTML = `
    <input type="checkbox" class="cl-topic-checkbox" data-item-id="${item.itemId}" ${item.completed ? 'checked' : ''} />
    <span class="cl-topic-title ${item.completed ? 'cl-done' : ''}">${escapeHtml(item.topic)}</span>
    <span class="cl-dots">
      <span class="${item.videoWatched ? 'on' : ''}">🎥</span><span class="${item.pdfRead ? 'on' : ''}">📄</span><span class="${item.notesCreated ? 'on' : ''}">📝</span>
    </span>
    <button type="button" class="cl-detail-btn" data-item-id="${item.itemId}">Details</button>
  `;
  return row;
}

async function toggleChecklistComplete(itemId, checked, checkboxEl) {
  const item = State.checklist.byId[itemId];
  if (!item) return;
  item.completed = checked; // optimistic
  checkboxEl.closest('.cl-topic-row').querySelector('.cl-topic-title').classList.toggle('cl-done', checked);
  updateChecklistOverall();
  patchSectionBadges();

  const res = await Api.post('updateChecklistItem', { userId: State.user.userId, itemId, completed: checked });
  if (!res.ok) {
    item.completed = !checked; // revert
    checkboxEl.checked = !checked;
    checkboxEl.closest('.cl-topic-row').querySelector('.cl-topic-title').classList.toggle('cl-done', !checked);
    updateChecklistOverall();
    patchSectionBadges();
    toast('Could not save — try again.');
  }
}

// Cheap patch of the "done / total" badges on open <summary> elements
// without re-rendering the whole accordion (keeps taps snappy at 200+ rows).
function patchSectionBadges() {
  document.querySelectorAll('#checklist-sections .cl-section').forEach((sectionEl) => {
    let total = 0, done = 0;
    sectionEl.querySelectorAll('.cl-topic-checkbox').forEach((cb) => { total++; if (cb.checked) done++; });
    const badge = sectionEl.querySelector(':scope > summary .cl-badge');
    if (badge) badge.textContent = `${done} / ${total}`;
  });
  document.querySelectorAll('#checklist-sections .cl-subject').forEach((subjEl) => {
    let total = 0, done = 0;
    subjEl.querySelectorAll('.cl-topic-checkbox').forEach((cb) => { total++; if (cb.checked) done++; });
    const badge = subjEl.querySelector(':scope > summary .cl-badge');
    if (badge) badge.textContent = `${done} / ${total}`;
  });
}

function openChecklistModal(itemId) {
  const item = State.checklist.byId[itemId];
  if (!item) return;
  State.checklist.editingId = itemId;
  State.checklist.pendingConfidence = item.confidence || 0;

  document.getElementById('cm-topic-title').textContent = item.topic;
  document.getElementById('cm-topic-meta').textContent = `${item.section} · ${item.subject}`;
  document.getElementById('cm-completed').checked = item.completed;
  document.getElementById('cm-video').checked = item.videoWatched;
  document.getElementById('cm-pdf').checked = item.pdfRead;
  document.getElementById('cm-notes').checked = item.notesCreated;
  document.getElementById('cm-mcq-attempted').value = item.mcqsAttempted || 0;
  document.getElementById('cm-mcq-correct').value = item.mcqsCorrect || 0;
  document.getElementById('cm-rev1').checked = item.revision1;
  document.getElementById('cm-rev2').checked = item.revision2;
  document.getElementById('cm-rev3').checked = item.revision3;
  document.getElementById('cm-time').value = item.timeSpent || 0;
  document.getElementById('cm-remarks').value = item.remarks || '';
  paintStars(item.confidence || 0);
  updateAccuracyPreview();

  document.getElementById('checklist-modal').classList.remove('hidden');
}

function paintStars(value) {
  document.querySelectorAll('#cm-confidence-picker span').forEach((star) => {
    star.classList.toggle('filled', Number(star.dataset.star) <= value);
  });
}

function updateAccuracyPreview() {
  const attempted = Number(document.getElementById('cm-mcq-attempted').value) || 0;
  const correct = Number(document.getElementById('cm-mcq-correct').value) || 0;
  const el = document.getElementById('cm-accuracy');
  el.textContent = attempted > 0 ? `Accuracy: ${Math.round(100 * correct / attempted)}%` : 'Accuracy: —';
}

async function saveChecklistModal() {
  const itemId = State.checklist.editingId;
  const item = State.checklist.byId[itemId];
  if (!item || !itemId) return;

  const payload = {
    userId: State.user.userId,
    itemId: itemId,
    completed: document.getElementById('cm-completed').checked,
    videoWatched: document.getElementById('cm-video').checked,
    pdfRead: document.getElementById('cm-pdf').checked,
    notesCreated: document.getElementById('cm-notes').checked,
    mcqsAttempted: Number(document.getElementById('cm-mcq-attempted').value) || 0,
    mcqsCorrect: Number(document.getElementById('cm-mcq-correct').value) || 0,
    revision1: document.getElementById('cm-rev1').checked,
    revision2: document.getElementById('cm-rev2').checked,
    revision3: document.getElementById('cm-rev3').checked,
    confidence: State.checklist.pendingConfidence || 0,
    timeSpent: Number(document.getElementById('cm-time').value) || 0,
    remarks: document.getElementById('cm-remarks').value.trim()
  };

  // optimistic local update
  Object.assign(item, payload);
  document.getElementById('checklist-modal').classList.add('hidden');
  renderChecklist(document.getElementById('checklist-search').value.trim().toLowerCase());
  updateChecklistOverall();
  toast('Saved.');

  const res = await Api.post('updateChecklistItem', payload);
  if (!res.ok) toast(res.error || 'Could not save — try again.');
}

// ---------------------------------------------------------------------
// ADMIN DASHBOARD
// ---------------------------------------------------------------------
function bindAdmin() {
  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('admin-panel-' + tab.dataset.adminTab).classList.add('active');
    });
  });

  // Resources / Notes form: toggle url vs content fields based on type
  const typeSelect = document.getElementById('ar-type');
  const urlField = document.getElementById('ar-url');
  const contentField = document.getElementById('ar-content');
  function syncResourceFields() {
    const isNotes = typeSelect.value === 'notes';
    urlField.style.display = isNotes ? 'none' : 'block';
    contentField.style.display = isNotes ? 'block' : 'none';
  }
  typeSelect.addEventListener('change', syncResourceFields);
  syncResourceFields();

  document.getElementById('admin-resource-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ar-id').value;
    const payload = {
      userId: State.user.userId,
      subject: document.getElementById('ar-subject').value,
      topic: document.getElementById('ar-topic').value.trim(),
      type: document.getElementById('ar-type').value,
      title: document.getElementById('ar-title').value.trim(),
      url: document.getElementById('ar-url').value.trim(),
      content: document.getElementById('ar-content').value.trim()
    };
    const msg = document.getElementById('ar-msg');
    if (!payload.subject || !payload.title) { msg.textContent = 'Subject and title are required.'; return; }

    const res = id
      ? await Api.post('updateResource', { ...payload, resourceId: id })
      : await Api.post('addResource', payload);

    if (res.ok) {
      msg.style.color = 'var(--accent)'; msg.textContent = id ? 'Updated!' : 'Uploaded! Students can see it now.';
      resetResourceForm();
      loadAdminResources();
      toast(id ? 'Resource updated.' : 'Resource uploaded — visible to students immediately.');
    } else {
      msg.style.color = 'var(--danger)'; msg.textContent = res.error || 'Something went wrong.';
    }
  });
  document.getElementById('ar-cancel-btn').addEventListener('click', resetResourceForm);

  // MCQ form
  document.getElementById('admin-mcq-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('am-id').value;
    const payload = {
      userId: State.user.userId,
      subject: document.getElementById('am-subject').value,
      topic: document.getElementById('am-topic').value.trim(),
      question: document.getElementById('am-question').value.trim(),
      optionA: document.getElementById('am-optionA').value.trim(),
      optionB: document.getElementById('am-optionB').value.trim(),
      optionC: document.getElementById('am-optionC').value.trim(),
      optionD: document.getElementById('am-optionD').value.trim(),
      correctOption: document.getElementById('am-correct').value,
      difficulty: document.getElementById('am-difficulty').value,
      explanation: document.getElementById('am-explanation').value.trim()
    };
    const msg = document.getElementById('am-msg');
    if (!payload.subject || !payload.question) { msg.textContent = 'Subject and question are required.'; return; }

    const res = id
      ? await Api.post('updateMCQ', { ...payload, mcqId: id })
      : await Api.post('addMCQ', payload);

    if (res.ok) {
      msg.style.color = 'var(--accent)'; msg.textContent = id ? 'Updated!' : 'MCQ added!';
      resetMcqForm();
      loadAdminMCQs();
      toast(id ? 'MCQ updated.' : 'MCQ added to the question bank.');
    } else {
      msg.style.color = 'var(--danger)'; msg.textContent = res.error || 'Something went wrong.';
    }
  });
  document.getElementById('am-cancel-btn').addEventListener('click', resetMcqForm);

  // Speaking Prompt form
  document.getElementById('admin-prompt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ap-id').value;
    const payload = {
      userId: State.user.userId,
      category: document.getElementById('ap-category').value.trim(),
      prompt: document.getElementById('ap-prompt').value.trim(),
      difficulty: document.getElementById('ap-difficulty').value
    };
    const msg = document.getElementById('ap-msg');
    if (!payload.category || !payload.prompt) { msg.textContent = 'Category and prompt text are required.'; return; }

    const res = id
      ? await Api.post('updateSpeakingPrompt', { ...payload, promptId: id })
      : await Api.post('addSpeakingPrompt', payload);

    if (res.ok) {
      msg.style.color = 'var(--accent)'; msg.textContent = id ? 'Updated!' : 'Prompt added!';
      resetPromptForm();
      loadAdminPrompts();
      toast(id ? 'Prompt updated.' : 'Prompt added — students will see it in Speaking Practice.');
    } else {
      msg.style.color = 'var(--danger)'; msg.textContent = res.error || 'Something went wrong.';
    }
  });
  document.getElementById('ap-cancel-btn').addEventListener('click', resetPromptForm);
}

function resetResourceForm() {
  document.getElementById('admin-resource-form').reset();
  document.getElementById('ar-id').value = '';
  document.getElementById('ar-submit-btn').textContent = 'Upload';
  document.getElementById('resource-form-title').textContent = 'Upload a note / PDF / video';
  document.getElementById('ar-cancel-btn').classList.add('hidden');
  document.getElementById('ar-msg').textContent = '';
  document.getElementById('ar-type').dispatchEvent(new Event('change'));
}
function resetMcqForm() {
  document.getElementById('admin-mcq-form').reset();
  document.getElementById('am-id').value = '';
  document.getElementById('am-submit-btn').textContent = 'Add MCQ';
  document.getElementById('mcq-form-title').textContent = 'Add an MCQ';
  document.getElementById('am-cancel-btn').classList.add('hidden');
  document.getElementById('am-msg').textContent = '';
}
function resetPromptForm() {
  document.getElementById('admin-prompt-form').reset();
  document.getElementById('ap-id').value = '';
  document.getElementById('ap-submit-btn').textContent = 'Add prompt';
  document.getElementById('prompt-form-title').textContent = 'Add a speaking prompt';
  document.getElementById('ap-cancel-btn').classList.add('hidden');
  document.getElementById('ap-msg').textContent = '';
}

async function loadAdminAll() {
  loadAdminStats();
  loadAdminResources();
  loadAdminMCQs();
  loadAdminPrompts();
}

async function loadAdminStats() {
  const res = await Api.get('getAdminStats', { userId: State.user.userId });
  if (!res.ok) return;
  document.getElementById('admin-stat-users').textContent = res.stats.totalUsers;
  document.getElementById('admin-stat-resources').textContent = res.stats.totalResources;
  document.getElementById('admin-stat-mcqs').textContent = res.stats.totalMCQs;
  document.getElementById('admin-stat-prompts').textContent = res.stats.totalPrompts;
  document.getElementById('admin-stat-recordings').textContent = res.stats.totalRecordings;
}

async function loadAdminResources() {
  const res = await Api.get('getResources', {});
  const wrap = document.getElementById('admin-resource-table');
  wrap.innerHTML = '';
  if (!res.ok || res.resources.length === 0) { wrap.innerHTML = '<p class="muted">No resources yet.</p>'; return; }
  const typeIcon = { video: '🎥', pdf: '📄', notes: '📝' };
  res.resources.slice().reverse().forEach((r) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="ar-info"><strong>${typeIcon[r.type] || '📄'} ${escapeHtml(r.title)}</strong>
      <span>${escapeHtml(r.subject)}${r.topic ? ' · ' + escapeHtml(r.topic) : ''}</span></div>
      <div class="ar-actions">
        <button class="mini-btn" data-edit>Edit</button>
        <button class="mini-btn danger" data-delete>Delete</button>
      </div>`;
    row.querySelector('[data-edit]').addEventListener('click', () => editResource(r));
    row.querySelector('[data-delete]').addEventListener('click', () => deleteResourceRow(r.resourceId));
    wrap.appendChild(row);
  });
}

function editResource(r) {
  document.getElementById('ar-id').value = r.resourceId;
  document.getElementById('ar-subject').value = r.subject;
  document.getElementById('ar-topic').value = r.topic || '';
  document.getElementById('ar-type').value = r.type;
  document.getElementById('ar-type').dispatchEvent(new Event('change'));
  document.getElementById('ar-title').value = r.title;
  document.getElementById('ar-url').value = r.url || '';
  document.getElementById('ar-content').value = r.content || '';
  document.getElementById('ar-submit-btn').textContent = 'Save changes';
  document.getElementById('resource-form-title').textContent = 'Edit resource';
  document.getElementById('ar-cancel-btn').classList.remove('hidden');
  document.getElementById('admin-panel-resources').scrollIntoView({ behavior: 'smooth' });
}

async function deleteResourceRow(resourceId) {
  if (!confirm('Delete this resource? This cannot be undone.')) return;
  const res = await Api.post('deleteResource', { userId: State.user.userId, resourceId });
  if (res.ok) { toast('Resource deleted.'); loadAdminResources(); loadAdminStats(); }
}

async function loadAdminMCQs() {
  const res = await Api.get('getMCQs', { count: 500 });
  const wrap = document.getElementById('admin-mcq-table');
  wrap.innerHTML = '';
  if (!res.ok || res.mcqs.length === 0) { wrap.innerHTML = '<p class="muted">No MCQs yet.</p>'; return; }
  res.mcqs.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="ar-info"><strong>${escapeHtml(m.question)}</strong>
      <span>${escapeHtml(m.subject)}${m.topic ? ' · ' + escapeHtml(m.topic) : ''} · Correct: ${escapeHtml(m.correctOption)}</span></div>
      <div class="ar-actions">
        <button class="mini-btn" data-edit>Edit</button>
        <button class="mini-btn danger" data-delete>Delete</button>
      </div>`;
    row.querySelector('[data-edit]').addEventListener('click', () => editMcq(m));
    row.querySelector('[data-delete]').addEventListener('click', () => deleteMcqRow(m.mcqId));
    wrap.appendChild(row);
  });
}

function editMcq(m) {
  document.getElementById('am-id').value = m.mcqId;
  document.getElementById('am-subject').value = m.subject;
  document.getElementById('am-topic').value = m.topic || '';
  document.getElementById('am-question').value = m.question;
  document.getElementById('am-optionA').value = m.optionA || '';
  document.getElementById('am-optionB').value = m.optionB || '';
  document.getElementById('am-optionC').value = m.optionC || '';
  document.getElementById('am-optionD').value = m.optionD || '';
  document.getElementById('am-correct').value = m.correctOption;
  document.getElementById('am-difficulty').value = m.difficulty || 'Medium';
  document.getElementById('am-explanation').value = m.explanation || '';
  document.getElementById('am-submit-btn').textContent = 'Save changes';
  document.getElementById('mcq-form-title').textContent = 'Edit MCQ';
  document.getElementById('am-cancel-btn').classList.remove('hidden');
  document.getElementById('admin-panel-mcqs').scrollIntoView({ behavior: 'smooth' });
}

async function deleteMcqRow(mcqId) {
  if (!confirm('Delete this MCQ? This cannot be undone.')) return;
  const res = await Api.post('deleteMCQ', { userId: State.user.userId, mcqId });
  if (res.ok) { toast('MCQ deleted.'); loadAdminMCQs(); loadAdminStats(); }
}

async function loadAdminPrompts() {
  const res = await Api.get('getSpeakingPrompts', {});
  const wrap = document.getElementById('admin-prompt-table');
  wrap.innerHTML = '';
  if (!res.ok || res.prompts.length === 0) { wrap.innerHTML = '<p class="muted">No prompts yet.</p>'; return; }
  res.prompts.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="ar-info"><strong>${escapeHtml(p.prompt)}</strong>
      <span>${escapeHtml(p.category)} · ${escapeHtml(p.difficulty)}</span></div>
      <div class="ar-actions">
        <button class="mini-btn" data-edit>Edit</button>
        <button class="mini-btn danger" data-delete>Delete</button>
      </div>`;
    row.querySelector('[data-edit]').addEventListener('click', () => editPrompt(p));
    row.querySelector('[data-delete]').addEventListener('click', () => deletePromptRow(p.promptId));
    wrap.appendChild(row);
  });
}

function editPrompt(p) {
  document.getElementById('ap-id').value = p.promptId;
  document.getElementById('ap-category').value = p.category;
  document.getElementById('ap-prompt').value = p.prompt;
  document.getElementById('ap-difficulty').value = p.difficulty || 'Medium';
  document.getElementById('ap-submit-btn').textContent = 'Save changes';
  document.getElementById('prompt-form-title').textContent = 'Edit prompt';
  document.getElementById('ap-cancel-btn').classList.remove('hidden');
  document.getElementById('admin-panel-prompts').scrollIntoView({ behavior: 'smooth' });
}

async function deletePromptRow(promptId) {
  if (!confirm('Delete this prompt? This cannot be undone.')) return;
  const res = await Api.post('deleteSpeakingPrompt', { userId: State.user.userId, promptId });
  if (res.ok) { toast('Prompt deleted.'); loadAdminPrompts(); loadAdminStats(); }
}

// ---------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------
function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
