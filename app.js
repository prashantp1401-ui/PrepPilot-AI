/**************************************************************************
 * PrepPilot AI — App logic (Version 1 MVP)
 * Vanilla JS, no build step — works straight from GitHub Pages.
 **************************************************************************/

const State = {
  user: null,       // { userId, name, email, examTarget, examDate, streak, ... }
  subjects: [],
  mcq: { questions: [], index: 0, score: 0, startTime: null, timerHandle: null, answered: false }
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
  bindVacancy();
  bindNotes();
  bindProfile();
  bindAdmin();
  bindNoteReadModal();

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
  if (name === 'resources') loadResources();
  if (name === 'progress') loadProgress();
  if (name === 'vacancy') loadVacancies();
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
  res.todayTasks.items.forEach((t) => list.appendChild(renderTaskRow(t, loadDashboard)));
  document.getElementById('dash-task-progress').textContent = `${res.todayTasks.completed} / ${res.todayTasks.total}`;
}

function renderTaskRow(task, onDone) {
  const li = document.createElement('li');
  const done = task.completed === true || task.completed === 'TRUE';
  li.innerHTML = `
    <input type="checkbox" ${done ? 'checked disabled' : ''} />
    <span class="task-title ${done ? 'task-done' : ''}">${escapeHtml(task.title)}</span>
    <span class="task-tag">${escapeHtml(task.taskType || '')}</span>
  `;
  const checkbox = li.querySelector('input');
  if (!done) {
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      const res = await Api.post('completeTask', { taskId: task.taskId });
      if (res.ok) { toast('Task completed ✅'); onDone(); }
    });
  }
  return li;
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
  res.tasks.forEach((t) => list.appendChild(renderTaskRow(t, loadPlanner)));
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
// VACANCY TRACKER
// ---------------------------------------------------------------------
function bindVacancy() {
  document.getElementById('vacancy-search').addEventListener('input', debounce(loadVacancies, 350));
}

async function loadVacancies() {
  const search = document.getElementById('vacancy-search').value.trim();
  const res = await Api.get('getVacancies', { search });
  const list = document.getElementById('vacancy-list');
  list.innerHTML = '';
  if (!res.ok || res.vacancies.length === 0) {
    list.innerHTML = '<p class="muted">No vacancies posted yet. Check back soon!</p>';
    return;
  }
  res.vacancies.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'vacancy-card glass';
    card.innerHTML = `
      <h4>${escapeHtml(v.title)}</h4>
      <div class="vacancy-meta">
        <span>🏢 ${escapeHtml(v.department || '—')}</span>
        <span>💰 ${escapeHtml(v.salary || '—')}</span>
        <span>🎓 ${escapeHtml(v.eligibility || '—')}</span>
        <span>💳 Fees: ${escapeHtml(v.fees || '—')}</span>
        <span>📅 Exam: ${escapeHtml(v.examDate || 'TBA')}</span>
        <span>⏰ Last date: ${escapeHtml(v.lastDate || 'TBA')}</span>
      </div>
      ${v.notificationLink ? `<a class="btn btn-primary" href="${escapeAttr(v.notificationLink)}" target="_blank" rel="noopener">View notification</a>` : ''}
    `;
    list.appendChild(card);
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

  // Vacancy form
  document.getElementById('admin-vacancy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('av-id').value;
    const payload = {
      userId: State.user.userId,
      title: document.getElementById('av-title').value.trim(),
      department: document.getElementById('av-department').value.trim(),
      notificationLink: document.getElementById('av-link').value.trim(),
      eligibility: document.getElementById('av-eligibility').value.trim(),
      salary: document.getElementById('av-salary').value.trim(),
      fees: document.getElementById('av-fees').value.trim(),
      examDate: document.getElementById('av-examdate').value.trim(),
      lastDate: document.getElementById('av-lastdate').value.trim()
    };
    const msg = document.getElementById('av-msg');
    if (!payload.title) { msg.textContent = 'Post title is required.'; return; }

    const res = id
      ? await Api.post('updateVacancy', { ...payload, vacancyId: id })
      : await Api.post('addVacancy', payload);

    if (res.ok) {
      msg.style.color = 'var(--accent)'; msg.textContent = id ? 'Updated!' : 'Vacancy posted!';
      resetVacancyForm();
      loadAdminVacancies();
      toast(id ? 'Vacancy updated.' : 'Vacancy posted — visible to students immediately.');
    } else {
      msg.style.color = 'var(--danger)'; msg.textContent = res.error || 'Something went wrong.';
    }
  });
  document.getElementById('av-cancel-btn').addEventListener('click', resetVacancyForm);
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
function resetVacancyForm() {
  document.getElementById('admin-vacancy-form').reset();
  document.getElementById('av-id').value = '';
  document.getElementById('av-submit-btn').textContent = 'Add vacancy';
  document.getElementById('vac-form-title').textContent = 'Add a vacancy';
  document.getElementById('av-cancel-btn').classList.add('hidden');
  document.getElementById('av-msg').textContent = '';
}

async function loadAdminAll() {
  loadAdminStats();
  loadAdminResources();
  loadAdminMCQs();
  loadAdminVacancies();
}

async function loadAdminStats() {
  const res = await Api.get('getAdminStats', { userId: State.user.userId });
  if (!res.ok) return;
  document.getElementById('admin-stat-users').textContent = res.stats.totalUsers;
  document.getElementById('admin-stat-resources').textContent = res.stats.totalResources;
  document.getElementById('admin-stat-mcqs').textContent = res.stats.totalMCQs;
  document.getElementById('admin-stat-vacancies').textContent = res.stats.totalVacancies;
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

async function loadAdminVacancies() {
  const res = await Api.get('getVacancies', {});
  const wrap = document.getElementById('admin-vacancy-table');
  wrap.innerHTML = '';
  if (!res.ok || res.vacancies.length === 0) { wrap.innerHTML = '<p class="muted">No vacancies yet.</p>'; return; }
  res.vacancies.slice().reverse().forEach((v) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    row.innerHTML = `
      <div class="ar-info"><strong>${escapeHtml(v.title)}</strong>
      <span>${escapeHtml(v.department || '')} · Last date: ${escapeHtml(v.lastDate || 'TBA')}</span></div>
      <div class="ar-actions">
        <button class="mini-btn" data-edit>Edit</button>
        <button class="mini-btn danger" data-delete>Delete</button>
      </div>`;
    row.querySelector('[data-edit]').addEventListener('click', () => editVacancy(v));
    row.querySelector('[data-delete]').addEventListener('click', () => deleteVacancyRow(v.vacancyId));
    wrap.appendChild(row);
  });
}

function editVacancy(v) {
  document.getElementById('av-id').value = v.vacancyId;
  document.getElementById('av-title').value = v.title;
  document.getElementById('av-department').value = v.department || '';
  document.getElementById('av-link').value = v.notificationLink || '';
  document.getElementById('av-eligibility').value = v.eligibility || '';
  document.getElementById('av-salary').value = v.salary || '';
  document.getElementById('av-fees').value = v.fees || '';
  document.getElementById('av-examdate').value = v.examDate || '';
  document.getElementById('av-lastdate').value = v.lastDate || '';
  document.getElementById('av-submit-btn').textContent = 'Save changes';
  document.getElementById('vac-form-title').textContent = 'Edit vacancy';
  document.getElementById('av-cancel-btn').classList.remove('hidden');
  document.getElementById('admin-panel-vacancies').scrollIntoView({ behavior: 'smooth' });
}

async function deleteVacancyRow(vacancyId) {
  if (!confirm('Delete this vacancy? This cannot be undone.')) return;
  const res = await Api.post('deleteVacancy', { userId: State.user.userId, vacancyId });
  if (res.ok) { toast('Vacancy deleted.'); loadAdminVacancies(); loadAdminStats(); }
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
