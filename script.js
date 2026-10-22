(() => {
  'use strict';

  const chapters = window.TEXTBOOK_CHAPTERS || [];
  chapters.forEach(ch => { ch.title = String(ch.title || '').replace(/^\d+-тарау\.\s*/, ''); });
  const glossary = window.GLOSSARY || [];
  const practicals = window.PRACTICALS || [];
  const finalQuiz = window.FINAL_QUIZ || [];
  const finalRubric = window.FINAL_PROJECT_RUBRIC || [];
  const STORAGE_KEY = 'bilimtech-textbook-v1';
  const defaultState = { preferences: { dark: false, reader: false, fontSize: 17 }, completedChapters: [], quizResults: {}, bookmarks: [], practicalChecks: {}, lessonDraft: {}, lastView: 'home', lastChapter: 'ch1', lastSection: '', activity: '' };
  let state = loadState();
  let currentView = 'home';
  let currentChapterId = '';
  let currentSectionId = '';
  let alphabetFilter = '';
  let quizSession = null;
  let sessionStarted = Date.now();
  let currentQuizId = '';
  let sectionObserver = null;
  const byId = id => document.getElementById(id);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved && typeof saved === 'object' ? { ...defaultState, ...saved, preferences: { ...defaultState.preferences, ...(saved.preferences || {}) }, quizResults: saved.quizResults || {}, bookmarks: saved.bookmarks || [], completedChapters: saved.completedChapters || [], practicalChecks: saved.practicalChecks || {}, lessonDraft: saved.lessonDraft || {} } : structuredCloneSafe(defaultState);
    } catch (_) { return structuredCloneSafe(defaultState); }
  }
  function structuredCloneSafe(value) { return JSON.parse(JSON.stringify(value)); }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { toast('Браузерде сақтау мүмкін болмады. Жергілікті сақтау баптауын тексеріңіз.'); }
    updateDashboard();
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function stripHtml(html) { const box = document.createElement('div'); box.innerHTML = html || ''; return (box.textContent || box.innerText || '').replace(/\s+/g, ' ').trim(); }
  function chapterById(id) { return chapters.find(ch => ch.id === id); }
  function recordActivity(message) { state.activity = message; saveState(); }
  function toast(message) {
    const region = byId('toast-region');
    if (!region) return;
    const item = document.createElement('div'); item.className = 'toast'; item.textContent = message; region.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function buildSidebar() {
    const nav = byId('chapter-nav');
    if (!nav) return;
    nav.innerHTML = chapters.map((chapter, index) => {
      const open = chapter.id === currentChapterId;
      return `<div class="chapter-group"><button class="chapter-trigger ${open ? 'current' : ''}" type="button" data-chapter="${esc(chapter.id)}" aria-expanded="${open}" aria-controls="subnav-${esc(chapter.id)}"><span class="chapter-number">${String(index + 1).padStart(2, '0')}</span><span class="chapter-title-short">${esc(chapter.shortTitle || chapter.title)}</span><span class="chapter-arrow" aria-hidden="true">›</span></button><div class="chapter-subnav" id="subnav-${esc(chapter.id)}" ${open ? '' : 'hidden'}>${(chapter.sections || []).map(section => `<button type="button" data-section="${esc(section.id)}" data-section-chapter="${esc(chapter.id)}" class="${section.id === currentSectionId ? 'selected' : ''}">${esc(section.title)}</button>`).join('')}</div></div>`;
    }).join('');
    const home = document.querySelector('.home-nav');
    if (home) home.classList.toggle('active', currentView === 'home');
    document.querySelectorAll('.sidebar-top [data-view="title"]').forEach(button => button.classList.toggle('active', currentView === 'title'));
    document.querySelectorAll('.utility-nav [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === currentView));
    const badge = byId('bookmark-count'); if (badge) badge.textContent = String(state.bookmarks.length);
  }

  function updateDashboard() {
    const doneChapters = state.completedChapters.length;
    const quizCount = Object.keys(state.quizResults).length;
    const percent = Math.round(((doneChapters + quizCount) / Math.max(1, chapters.length * 2)) * 100);
    const safePercent = Math.min(100, percent);
    const labels = ['header-progress-label', 'ring-percent'];
    labels.forEach(id => { if (byId(id)) byId(id).textContent = `${safePercent}%`; });
    if (byId('header-progress-bar')) byId('header-progress-bar').style.width = `${safePercent}%`;
    if (byId('ring-value')) byId('ring-value').style.strokeDashoffset = String(314.16 * (1 - safePercent / 100));
    if (byId('completed-chapters')) byId('completed-chapters').textContent = `${doneChapters}/${chapters.length || 7}`;
    if (byId('completed-quizzes')) byId('completed-quizzes').textContent = String(quizCount);
    if (byId('bookmark-count')) byId('bookmark-count').textContent = String(state.bookmarks.length);
    const study = byId('study-time');
    if (study) {
      const estimated = chapters.reduce((total, chapter) => total + Number(String(chapter.time || '').match(/\d+/)?.[0] || 0), 0);
      const academicHours = chapters.length > 0 && chapters.every(chapter => /академиялық сағат/i.test(chapter.time || ''));
      if (estimated) study.textContent = academicHours ? `Шамамен ${estimated} академиялық сағат` : `Шамамен ${estimated} минут`;
      else study.textContent = 'Әзірге есептелмеді';
    }
    const latestResult = Object.entries(state.quizResults).sort((a,b) => String(b[1].at || '').localeCompare(String(a[1].at || '')))[0];
    const resultNode = byId('current-quiz-result');
    if (resultNode) {
      if (!latestResult) resultNode.textContent = 'Әзірге тест тапсырылмады';
      else { const id = latestResult[0]; const chapter = chapterById(id.replace(/^quiz-/, '')); const title = id === 'quiz-final' ? 'Қорытынды емтихан' : chapter?.shortTitle || 'Тарау тесті'; resultNode.textContent = `${title}: ${latestResult[1].percent}%`; }
    }
    const recent = byId('recent-activity');
    if (recent && state.activity) recent.innerHTML = `<span class="activity-icon" aria-hidden="true">✓</span><p>${esc(state.activity)}</p>`;
    renderContextLinks();
  }
  function renderContextLinks() {
    const target = byId('context-sections');
    if (!target) return;
    const chapter = chapterById(currentChapterId);
    if (!chapter) { target.innerHTML = ''; return; }
    target.innerHTML = (chapter.sections || []).map(section => `<button class="context-link ${section.id === currentSectionId ? 'selected' : ''}" type="button" data-section="${esc(section.id)}" data-section-chapter="${esc(chapter.id)}">${esc(section.title)}</button>`).join('');
  }

  function setTheme() {
    document.body.classList.toggle('dark-mode', !!state.preferences.dark);
    document.body.classList.toggle('reading-mode', !!state.preferences.reader);
    document.documentElement.style.setProperty('--body-size', `${state.preferences.fontSize || 17}px`);
    const theme = byId('theme-toggle');
    if (theme) { theme.setAttribute('aria-pressed', String(!!state.preferences.dark)); theme.setAttribute('aria-label', state.preferences.dark ? 'Ашық тақырыпты қосу' : 'Қою тақырыпты қосу'); }
    const reader = byId('reader-toggle');
    if (reader) { reader.setAttribute('aria-pressed', String(!!state.preferences.reader)); reader.setAttribute('aria-label', state.preferences.reader ? 'Қалыпты оқу көрінісіне қайту' : 'Оқу режимін қосу'); }
  }

  function closeDrawer() {
    const sidebar = byId('left-sidebar'), scrim = byId('drawer-scrim'), toggle = byId('menu-toggle');
    sidebar?.classList.remove('open'); if (scrim) scrim.hidden = true; toggle?.setAttribute('aria-expanded', 'false');
  }
  function setActiveView(view) {
    currentView = view;
    buildSidebar();
    closeDrawer();
    state.lastView = view;
    saveState();
    window.scrollTo({ top: 0, behavior: state.preferences.reader ? 'auto' : 'smooth' });
  }
  function navigateToChapter(chapterId, sectionId = '') {
    const chapter = chapterById(chapterId);
    if (!chapter) return;
    currentChapterId = chapterId;
    currentSectionId = sectionId || (chapter.sections?.[0]?.id ?? '');
    currentView = 'chapter';
    state.lastChapter = chapterId; state.lastSection = currentSectionId; state.lastView = 'chapter';
    recordActivity(`${chapter.shortTitle || chapter.title}${currentSectionId ? ' · ' + (chapter.sections.find(s => s.id === currentSectionId)?.title || '') : ''} бөлімі ашылды`);
    buildSidebar(); renderChapter(chapter); revealContent(); closeDrawer();
    if (sectionId) requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function revealContent() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const root = byId('content'); if (!root) return;
    let items = [...root.children].filter(el => !el.classList.contains('title-page'));
    if (items.length === 1 && items[0].children.length > 2) items = [...items[0].children];
    if (!items.length) return;
    items.forEach(el => el.classList.add('reveal'));
    const io = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach((entry, i) => {
        const el = entry.target; io.unobserve(el);
        el.style.transitionDelay = Math.min(i, 6) * 70 + 'ms';
        el.classList.add('in');
        window.setTimeout(() => { el.style.transitionDelay = ''; }, 1100);
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
    items.forEach(el => io.observe(el));
    window.setTimeout(() => { io.disconnect(); items.forEach(el => el.classList.add('in')); }, 3500);
  }
  function navigateView(view) {
    setActiveView(view);
    const root = byId('content'); if (!root) return;
    if (view === 'home') renderHome();
    else if (view === 'title') renderTitlePage();
    else if (view === 'authors') renderAuthors();
    else if (view === 'practicals') renderPracticals();
    else if (view === 'exam') renderExam();
    else if (view === 'glossary') renderGlossary();
    else if (view === 'references') renderReferences();
    else if (view === 'bookmarks') renderBookmarks();
    else if (view === 'settings') renderSettings();
    revealContent();
  }
  function crumbs(label) { return `<div class="crumbs"><button type="button" data-view="home">Басты бет</button><span class="crumb-separator" aria-hidden="true">›</span><span>${esc(label)}</span></div>`; }
  function pageIntro(kicker, title, subtitle) { return `${crumbs(kicker)}<div class="eyebrow">${esc(kicker.toLocaleUpperCase('kk-KZ'))}</div><h1 class="page-heading">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p>`; }

  function renderTitlePage() {
    const info = {
      university: 'Қорқыт Ата университеті',
      faculty: '',
      supervisor: '',
      city: '',
      year: '2026'
    };
    const org = value => value ? `<p class="title-org">${esc(value)}</p>` : '';
    byId('content').innerHTML = `<article class="title-page" aria-labelledby="title-heading">
      <div class="tp-hero">
        <header class="title-top">
          <span class="logo-tile"><img class="title-logo" src="ku-logo.jpg" alt="Университет логотипі" width="64" height="64"></span>
          <div class="title-orgs">${org(info.university)}${org(info.faculty)}</div>
        </header>
      </div>
      <div class="tp-sheet">
        <div class="title-main">
          <h1 id="title-heading">Білім берудегі<br>цифрлық технологиялар</h1>
          <p class="title-sub">Заманауи білім беру технологияларын меңгеруге арналған интерактивті электрондық оқулық</p>
        </div>
        <footer class="tp-foot">
          <div class="title-meta">${info.supervisor ? `<span>Ғылыми жетекші: ${esc(info.supervisor)}</span>` : ''}<strong>${esc([info.city, info.year].filter(Boolean).join(' '))}</strong></div>
        </footer>
      </div>
    </article>
    <div class="title-actions"><button class="primary-button" type="button" data-view="home">Оқулыққа өту <span aria-hidden="true">→</span></button>${state.activity && chapterById(state.lastChapter) ? `<button class="outline-button" type="button" data-chapter="${esc(state.lastChapter)}">Оқуды жалғастыру</button>` : ''}<button class="quiet-button" type="button" id="print-title">Басып шығару</button></div>`;
    byId('print-title')?.addEventListener('click', () => window.print());
    buildSidebar(); window.scrollTo({ top: 0 });
  }

  function renderAuthors() {
    const info = {
      university: 'Қорқыт Ата университеті',
      group: 'Инф-24-1',
      year: '2026',
      authors: ['Абилтай Фархат', 'Өмір Нұрсұлтан', 'Амангельді Рамазан', 'Жумабекова Жансая']
    };
    byId('content').innerHTML = `<section class="authors-page" aria-labelledby="authors-title">
      <header class="authors-head">
        <span class="eyebrow">ЖОБА ТОБЫ</span>
        <h1 id="authors-title">Авторлар туралы</h1>
        <p>«Білім берудегі цифрлық технологиялар» электрондық оқулығын әзірлеген студенттер.</p>
      </header>
      <ul class="authors-grid">${info.authors.map((name, i) => `<li class="author-card-lg"><span class="author-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><div><h2>${esc(name)}</h2><p>Студент · ${esc(info.group)}</p></div></li>`).join('')}</ul>
      <dl class="authors-about">
        <div><dt>Университет</dt><dd>${esc(info.university)}</dd></div>
        <div><dt>Топ</dt><dd>${esc(info.group)}</dd></div>
        <div><dt>Жоба</dt><dd>Электрондық оқулық</dd></div>
        <div><dt>Жыл</dt><dd>${esc(info.year)}</dd></div>
      </dl>
      <div class="title-actions"><button class="primary-button" type="button" data-view="home">Басты бетке <span aria-hidden="true">→</span></button><button class="outline-button" type="button" data-view="title">Титул беті</button></div>
    </section>`;
    buildSidebar();
  }

  function renderHome() {
    const done = new Set(state.completedChapters);
    const cards = chapters.map((chapter, index) => `<article class="chapter-card" role="button" tabindex="0" data-chapter="${esc(chapter.id)}" aria-label="${esc(chapter.title)} тарауын ашу"><div class="chapter-card-top"><span class="chapter-card-icon" aria-hidden="true">${esc(chapter.icon || '◈')}</span><span class="chapter-card-index">${String(index + 1).padStart(2, '0')} / 07</span></div><h3>${esc(chapter.title.replace(/^\d-тарау\.\s*/, ''))}</h3><p>${esc(chapter.description || '')}</p><div class="chapter-card-footer"><span>${esc(chapter.time || 'Оқу уақыты бөлім мазмұнына қарай')}</span><span class="card-progress" aria-label="${done.has(chapter.id) ? 'Аяқталған' : 'Басталмаған'}"><span style="width:${done.has(chapter.id) ? 100 : 0}%"></span></span></div></article>`).join('');
    const outcomes = ['Цифрлық білім берудің ұғымы мен қағидаларын түсіндіру','Оқу технологиялары мен ресурстарды жіктеп, бағалау','Оқу платформаларын педагогикалық мақсатқа сай пайдалану','Интерактивті оқу материалдары мен сабақ жоспарын әзірлеу','ЖИ-ді жауапты қолданып, оның нәтижесін тексеру','Цифрлық бағалау, кері байланыс және оқу аналитикасын қолдану','Қолжетімді, қауіпсіз және инклюзивті цифрлық орта жобалау','Киберқауіпсіздік, авторлық құқық және цифрлық этика тәуекелдерін тану'];
    byId('content').innerHTML = `<section class="hero-panel"><span class="hero-kicker"><span aria-hidden="true">✦</span> УНИВЕРСИТЕТТІК ЭЛЕКТРОНДЫҚ ОҚУЛЫҚ</span><h1>Білім берудегі<br>цифрлық технологиялар</h1><div class="hero-actions"><button class="primary-button" type="button" data-chapter="${esc(chapters[0]?.id || '')}">Оқуды бастау <span aria-hidden="true">→</span></button><button class="outline-button" type="button" data-view="glossary">Оқулықпен танысу</button><button class="quiet-button" type="button" data-view="title">← Титул беті</button></div><div class="hero-note"><span aria-hidden="true">✓</span> Теория, әдістеме және практикалық дағды бір ортада</div></section>
      <section class="dashboard-stats" aria-label="Оқу көрсеткіштері"><div class="dashboard-stat"><span class="dashboard-stat-icon" aria-hidden="true">▤</span><div><strong>07</strong><span>оқу тарауы</span></div></div><div class="dashboard-stat"><span class="dashboard-stat-icon" aria-hidden="true">✓</span><div><strong>${Object.keys(state.quizResults).length}</strong><span>орындалған тест</span></div></div><div class="dashboard-stat"><span class="dashboard-stat-icon" aria-hidden="true">☆</span><div><strong>${state.bookmarks.length}</strong><span>сақталған бетбелгі</span></div></div><div class="dashboard-stat"><span class="dashboard-stat-icon" aria-hidden="true">◎</span><div><strong>${Math.min(100,Math.round(((state.completedChapters.length + Object.keys(state.quizResults).length) / 14) * 100))}%</strong><span>жеке оқу прогресі</span></div></div></section>
      <section aria-labelledby="outcomes-heading"><div class="section-heading-row"><h2 id="outcomes-heading" class="section-title">Бұл оқулықтан не үйренесіз?</h2><span class="eyebrow">ОҚУ НӘТИЖЕЛЕРІ</span></div><ul class="chapter-outcomes">${outcomes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      <section aria-labelledby="chapters-heading"><div class="section-heading-row"><h2 id="chapters-heading" class="section-title">Оқу жолы</h2><span class="eyebrow">ТЕОРИЯДАН ПРАКТИКАҒА</span></div><div class="roadmap">${chapters.map((ch,i) => `<button class="roadmap-step ${done.has(ch.id) ? 'done' : ''}" type="button" data-chapter="${esc(ch.id)}"><strong>${String(i+1).padStart(2,'0')}</strong><span>${esc(ch.shortTitle || ch.title.replace(/^\d-тарау\.\s*/, ''))}</span></button>`).join('')}</div><div class="chapter-grid" style="margin-top:14px">${cards}</div></section>
      <section aria-labelledby="tools-heading"><h2 id="tools-heading" class="section-title">Цифрлық білім берудің негізгі құралдары</h2><div class="feature-grid"><article class="feature-card"><div class="feature-icon" aria-hidden="true">▣</div><h3>Оқу платформалары</h3><p>Moodle мен Google Classroom оқу материалын, тапсырманы және кері байланысты бір оқу кеңістігінде ұйымдастыру тәсілдерін таныстырады.</p></article><article class="feature-card"><div class="feature-icon" aria-hidden="true">◇</div><h3>Интерактивті бағалау</h3><p>Kahoot!, Quizizz және басқа бағалау құралдарына педагогикалық мақсат пен қауіпсіздік тұрғысынан қарайсыз.</p></article><article class="feature-card"><div class="feature-icon" aria-hidden="true">✦</div><h3>Жасанды интеллект</h3><p>Генеративті ЖИ-ді оқу жоспарына және материал әзірлеуге жауапты қолданып, нәтижесін тексеруді үйренесіз.</p></article></div></section>
      <section><div class="section-heading-row"><h2 class="section-title">Практика мен өзіндік бағалау</h2><span class="eyebrow">БЕКІТУ ЖӘНЕ ҚОЛДАНУ</span></div><div class="feature-grid"><article class="feature-card"><div class="feature-icon" aria-hidden="true">▧</div><h3>Алты практикалық жұмыс</h3><p>Оқулық құрылымын жобалаудан бастап HTML, CSS және JavaScript прототипіне дейінгі тапсырмалар мен рубрикалар.</p><button class="quiet-button" data-view="practicals" type="button">Тапсырмаларды қарау →</button></article><article class="feature-card"><div class="feature-icon" aria-hidden="true">✓</div><h3>Тарау тесттері</h3><p>Әр тараудан кейін түсіндірмесі бар кемінде бес сұрақ арқылы негізгі ұғымдарды тексеріңіз.</p><button class="quiet-button" data-chapter="${esc(chapters[0]?.id || '')}" type="button">Тестке өту →</button></article><article class="feature-card"><div class="feature-icon" aria-hidden="true">Aa</div><h3>Ізделетін глоссарий</h3><p>Қазақша анықтамалардан терминді іздеңіз немесе әліпби бойынша сүзіңіз.</p><button class="quiet-button" data-view="glossary" type="button">Глоссарийді ашу →</button></article></div></section>
      <section><h2 class="section-title">Күтілетін оқу бағыты</h2><div class="info-callout"><span class="callout-label">Оқу туралы</span>Цифрлық құралды таңдау өз алдына мақсат емес: ол оқу нәтижесіне, студент қажеттілігіне және оқу жағдайына сай болғанда ғана педагогикалық құндылық береді. Бөлімдерді өз қарқыныңызбен оқып, қиын тұстарды бетбелгіге сақтаңыз.</div></section>`;
    buildSidebar(); updateDashboard();
  }

  function renderChapter(chapter) {
    currentView = 'chapter';
    const index = chapters.findIndex(ch => ch.id === chapter.id);
    const prev = chapters[index - 1], next = chapters[index + 1];
    const isBookmarked = state.bookmarks.some(item => item.chapterId === chapter.id && item.sectionId === currentSectionId);
    const sections = (chapter.sections || []).map(section => `<section class="chapter-section" id="${esc(section.id)}"><h2 class="section-title">${esc(section.title)}</h2>${section.content || ''}</section>`).join('');
    const learningSupports = `<section><h2 class="section-title">Тарауды бекіту</h2><div class="content-card"><h3>Негізгі ұғымдар</h3><p>${(chapter.keyConcepts || []).map(x => `<span class="meta-chip">${esc(x)}</span>`).join(' ')}</p></div><h3 class="subsection-title">Өзін-өзі тексеру сұрақтары</h3><ol>${(chapter.selfQuestions || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol><h3 class="subsection-title">Талқылауға арналған сұрақтар</h3><ul>${(chapter.discussion || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="feature-grid"><div class="content-card"><h3>Жеке жұмыс</h3><ul>${(chapter.independent || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="content-card"><h3>Топтық жұмыс</h3><ul>${(chapter.group || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div><div class="example-callout"><span class="callout-label">Рефлексия</span>${esc(chapter.reflection || 'Бүгінгі оқу мақсатыңызға қаншалықты жеттіңіз?')}</div></section>`;
    let extra = '';
    if (chapter.id === 'ch5') extra = renderLessonForm();
    if (chapter.id === 'ch7') extra = renderPracticalsMarkup();
    byId('content').innerHTML = `${crumbs(chapter.shortTitle || chapter.title)}<div class="page-toolbar"><div class="chapter-meta"><span class="meta-chip">${esc(chapter.icon || '◈')} ${String(index + 1).padStart(2,'0')} / 07</span><span>${esc(chapter.time || '')}</span></div><div class="toolbar-actions"><button class="soft-button" type="button" data-bookmark-toggle="${esc(chapter.id)}" data-section-id="${esc(currentSectionId)}" aria-pressed="${isBookmarked}">${isBookmarked ? '★ Сақталды' : '☆ Бетбелгі'}</button></div></div><h1 class="page-heading">${esc(chapter.title)}</h1><p class="page-subtitle">${esc(chapter.description || '')}</p><div class="chapter-outcomes-wrap"><h2 class="subsection-title">Оқу нәтижелері</h2><ul class="chapter-outcomes">${(chapter.outcomes || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>${sections}${extra}${learningSupports}<section class="quiz-panel" id="chapter-quiz"><div id="quiz-root"></div></section><div class="completion-row"><p>${state.completedChapters.includes(chapter.id) ? 'Бұл тарауды оқып шыққаныңыз белгіленді.' : 'Тарауды оқып болған соң, оқу барысын белгілеңіз.'}</p><button class="primary-button" type="button" data-complete-chapter="${esc(chapter.id)}">${state.completedChapters.includes(chapter.id) ? '✓ Тарау аяқталды' : 'Тарауды оқып шықтым'}</button></div><div class="chapter-footer-nav">${prev ? `<button class="soft-button" data-chapter="${esc(prev.id)}" type="button">← Алдыңғы тарау</button>` : '<span></span>'}${next ? `<button class="soft-button" data-chapter="${esc(next.id)}" type="button">Келесі тарау →</button>` : '<button class="soft-button" data-view="exam" type="button">Қорытынды емтихан →</button>'}</div>`;
    renderQuiz(`quiz-${chapter.id}`, chapter.quiz || [], `«${chapter.shortTitle || chapter.title}» тарауының тесті`);
    trackSectionReading();
    renderContextLinks(); buildSidebar(); updateDashboard();
  }

  function trackSectionReading() {
    if (sectionObserver) sectionObserver.disconnect();
    if (!('IntersectionObserver' in window)) return;
    sectionObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible || visible.target.id === currentSectionId) return;
      currentSectionId = visible.target.id;
      state.lastSection = currentSectionId;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* оқу орны тек осы браузерде сақталады */ }
      document.querySelectorAll('.chapter-subnav [data-section], .context-link[data-section]').forEach(button => button.classList.toggle('selected', button.dataset.section === currentSectionId));
      renderContextLinks();
    }, { rootMargin: '-100px 0px -65% 0px', threshold: [0.05, 0.25, 0.5] });
    document.querySelectorAll('.chapter-section[id]').forEach(section => sectionObserver.observe(section));
  }

  function quizProgressMarkup(session, questions) {
    const q = questions[session.index];
    const checked = session.checked;
    const percent = Math.round((session.index / Math.max(1, questions.length)) * 100);
    const options = q.answers.map((answer, i) => {
      const cls = checked ? (i === q.correct ? 'correct' : i === session.selected ? 'incorrect' : '') : '';
      return `<label class="answer-option ${cls}"><input type="radio" name="quiz-answer" value="${i}" ${session.selected === i ? 'checked' : ''} ${checked ? 'disabled' : ''}><span>${esc(answer)}</span></label>`;
    }).join('');
    const feedback = checked ? `<div class="feedback-box ${session.selected === q.correct ? 'correct' : 'incorrect'}" role="status"><strong>${session.selected === q.correct ? 'Дұрыс жауап.' : 'Дұрыс емес.'}</strong> ${esc(q.explanation)}</div>` : '';
    return `<div class="quiz-progress-head"><span>${session.title || 'Білімді тексеру'}</span><span>${session.index + 1} / ${questions.length}</span></div><div class="quiz-progress" aria-label="Тест барысы"><span style="width:${Math.max(6, percent)}%"></span></div><h3 class="quiz-question">${esc(q.question)}</h3><div class="answer-list">${options}</div>${feedback}<div class="quiz-actions">${checked ? `<button class="primary-button" type="button" data-quiz-next>${session.index === questions.length - 1 ? 'Нәтижені көру' : 'Келесі сұрақ →'}</button>` : `<button class="primary-button" type="button" data-quiz-check>Жауабын тексеру</button>`}</div>`;
  }
  function renderQuiz(quizId, questions, title) {
    const root = byId('quiz-root'); if (!root) return;
    currentQuizId = quizId;
    if (!questions || !questions.length) { root.innerHTML = '<p class="muted">Бұл бөлімге тест сұрақтары әлі қосылған жоқ.</p>'; return; }
    root.dataset.quizId = quizId;
    root.dataset.quizTitle = title;
    if (quizSession && quizSession.id === quizId && quizSession.done) { renderQuizSummary(root, quizSession, questions); return; }
    if (!quizSession || quizSession.id !== quizId) quizSession = { id: quizId, title, index: 0, selected: null, checked: false, score: 0, answers: [], done: false };
    root.innerHTML = `<h2>Білімді тексеру</h2><p class="quiz-intro">Әр сұрақта бір дұрыс жауап бар. Жауаптан кейін түсіндірме бірден көрсетіледі.</p>${quizProgressMarkup(quizSession, questions)}`;
  }
  function renderQuizSummary(root, session, questions) {
    const percent = Math.round((session.score / questions.length) * 100);
    const note = percent >= 85 ? 'Өте жақсы! Ұғымдарды сенімді меңгергенсіз.' : percent >= 60 ? 'Жақсы нәтиже. Қиын болған бөлімдерді қайта қарап шығыңыз.' : 'Тақырыптарды тағы бір рет оқып, тестті қайталап көріңіз.';
    root.innerHTML = `<h2>Тест нәтижесі</h2><div class="quiz-summary"><span class="eyebrow">ҚОРЫТЫНДЫ ҰПАЙ</span><span class="score">${session.score} / ${questions.length}</span><strong>${percent}%</strong><p>${note}</p><div class="quiz-actions" style="justify-content:center"><button class="soft-button" type="button" data-quiz-review>Дұрыс жауаптарды шолу</button><button class="primary-button" type="button" data-quiz-restart>Қайталап өту</button></div></div>`;
  }
  function showQuizReview(root, questions, session) {
    const rows = questions.map((q, i) => `<article class="review-item"><strong>${i + 1}. ${esc(q.question)}</strong><p>Дұрыс жауап: <b>${esc(q.answers[q.correct])}</b></p><p>${esc(q.explanation)}</p></article>`).join('');
    root.innerHTML = `<h2>Жауаптарды шолу</h2><p class="quiz-intro">Әр сұрақтың дұрыс жауабы мен түсіндірмесі көрсетілген.</p><div class="review-list">${rows}</div><div class="quiz-actions"><button class="soft-button" type="button" data-quiz-summary>Нәтижеге қайту</button><button class="primary-button" type="button" data-quiz-restart>Қайталап өту</button></div>`;
  }

  const lessonFields = [
    ['subject','Пән атауы','input'], ['level','Сынып немесе білім беру деңгейі','input'], ['topic','Сабақ тақырыбы','input'], ['objectives','Оқу мақсаттары','textarea'], ['outcomes','Күтілетін нәтижелер','textarea'], ['tools','Қолданылатын цифрлық құралдар','input'], ['stages','Сабақ кезеңдері','textarea'], ['studentActions','Оқушы әрекеттері','textarea'], ['assessment','Бағалау әдістері','textarea'], ['feedback','Кері байланыс','textarea'], ['reflection','Рефлексия','textarea']
  ];
  function renderLessonForm() {
    return `<section class="chapter-section" id="lesson-plan"><h2 class="section-title">Практикалық үлгі: цифрлық сабақ жоспары</h2><p>Оқу мақсаты, сабақ әрекеті мен бағалауды өзара сәйкестендіріп жоспарлаңыз. Өрістерді толтырған сайын алдын ала қарау жаңарады; жоба осы браузерде сақталады.</p><form id="lesson-form" class="lesson-form">${lessonFields.map(([key,label,type]) => `<div class="form-field ${['objectives','outcomes','stages','studentActions','assessment','feedback','reflection'].includes(key) ? 'full' : ''}"><label for="lesson-${key}">${label}</label>${type === 'textarea' ? `<textarea id="lesson-${key}" name="${key}" data-lesson-field="${key}" placeholder="Қысқаша жазыңыз">${esc(state.lessonDraft[key] || '')}</textarea>` : `<input id="lesson-${key}" name="${key}" data-lesson-field="${key}" value="${esc(state.lessonDraft[key] || '')}" placeholder="${label}">`}</div>`).join('')}<div class="form-field full"><div class="quiz-actions"><button class="primary-button" type="submit">Жоспарды алдын ала қарау</button><button class="soft-button" type="button" data-lesson-clear>Өрістерді тазарту</button></div></div></form><div class="lesson-preview" id="lesson-preview" aria-live="polite"><h3>Жоспардың алдын ала көрінісі</h3><dl>${lessonFields.map(([key,label]) => `<dt>${label}</dt><dd>${esc(state.lessonDraft[key] || 'Әзірге толтырылмады')}</dd>`).join('')}</dl></div></section>`;
  }

  function renderPracticalsMarkup() {
    return `<section class="chapter-section" id="practical-projects"><h2 class="section-title">Алты практикалық жұмыс</h2><p>Әр жұмысты орындап, нәтижесін сипаттап, өз жұмысыңызды көрсетілген критерийлермен бағалаңыз.</p>${renderPracticalsCards()}</section><section class="chapter-section final-rubric"><h2 class="section-title">Қорытынды жоба рубрикасы</h2><p>Ұсынылатын жоба: белгілі бір оқу тақырыбы бойынша интерактивті цифрлық ресурс әзірлеу. Әр критерий бойынша ұпай жинақталып, барлығы 100 ұпайды құрайды.</p>${renderRubricTable(finalRubric, 100)}</section>`;
  }
  function renderRubricTable(rubric, total) {
    if (!rubric?.length) return '<p class="muted">Бағалау өлшемдері қосылады.</p>';
    return `<div class="table-wrap"><table class="rubric-table"><thead><tr><th>Бағалау критерийі</th><th>Ең жоғары ұпай</th></tr></thead><tbody>${rubric.map(item => `<tr><td>${esc(item.criterion)}</td><td>${esc(item.points)}</td></tr>`).join('')}<tr class="rubric-total"><td>Жалпы ұпай</td><td>${total}</td></tr></tbody></table></div>`;
  }
  function renderPracticalsCards() {
    return `<div class="practical-grid">${practicals.map((item,index) => {
      const checks = state.practicalChecks[index] || [];
      return `<article class="practical-card"><header class="practical-head"><span class="practical-number">${String(index+1).padStart(2,'0')}</span><div><h3>${esc(item.title)}</h3><p>${checks.filter(Boolean).length}/${(item.checklist || []).length} қадам орындалды</p></div></header><div class="practical-body"><h4>Мақсаты</h4><p>${esc(item.purpose)}</p><h4>Оқу нәтижелері</h4><ul>${(item.outcomes || []).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h4>Қажетті құралдар</h4><ul>${(item.tools || []).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h4>Қадамдық нұсқау</h4><ol>${(item.steps || []).map(x=>`<li>${esc(x)}</li>`).join('')}</ol><h4>Жұмыс чек-парағы</h4><div class="checklist">${(item.checklist || []).map((x,i)=>`<label class="check-item ${checks[i] ? 'done' : ''}"><input type="checkbox" data-practical-check="${index}" data-check-index="${i}" ${checks[i] ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div><h4>Күтілетін нәтиже</h4><p>${esc(item.expected)}</p><h4>Тапсыру талаптары</h4><p>${esc(item.submission)}</p><h4>Бағалау рубрикасы</h4>${renderRubricTable(item.rubric, (item.rubric || []).reduce((n,row)=>n+Number(row.points||0),0))}<h4>Рефлексия сұрақтары</h4><ul>${(item.reflection || []).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></article>`;
    }).join('')}</div>`;
  }
  function renderPracticals() {
    byId('content').innerHTML = `${pageIntro('Практикалық жұмыстар','Білімді тәжірибеде қолданыңыз','Алты тапсырма теорияны оқу материалын жобалау, бағалау, цифрлық қауіпсіздік және веб-прототип жасау дағдыларымен байланыстырады. Чек-парақтағы белгілеулер осы құрылғыда сақталады.')}${renderPracticalsCards()}<section class="final-rubric"><h2 class="section-title">Қорытынды жобаға арналған рубрика</h2><p>Жоба оқу қажеттілігін анықтап, мазмұнды, қолжетімді, қауіпсіз әрі бағалауға болатын цифрлық білім беру ресурсымен шешуі керек.</p>${renderRubricTable(finalRubric,100)}</section>`;
  }

  function renderExam() {
    byId('content').innerHTML = `${pageIntro('Қорытынды бағалау','Қорытынды емтихан','Жиырма және одан көп сұрақ арқылы оқулықтың жеті тарауындағы негізгі ұғымдар мен әдістемелік шешімдерді тексеріңіз. Әр сұрақта бір дұрыс жауап бар; жауаптан кейін түсіндірме беріледі.')}<div class="content-card"><h2>Емтиханға дайындық</h2><p>Алдымен тарауларды қарап, өзіңізге белгісіз ұғымдарды глоссарийден қайталаңыз. Емтихан нәтижесі жергілікті браузерде сақталып, бұл — оқу өзін-өзі бағалауы, ресми баға емес.</p></div><section class="quiz-panel"><div id="quiz-root"></div></section><div class="info-callout"><span class="callout-label">Бағалау туралы</span>Бұл тест өзіндік тексеруге арналған. Нәтижені курс бағасы немесе сыртқы жүйеге жіберілген баға ретінде қабылдамаңыз.</div>`;
    renderQuiz('quiz-final', finalQuiz, 'Қорытынды емтихан');
  }

  function renderGlossary() {
    byId('content').innerHTML = `${pageIntro('Қосымша бөлім','Ізделетін глоссарий','Білім беру мен цифрлық технологияға қатысты терминдердің қазақша анықтамасын іздеңіз немесе әріп бойынша сүзіңіз.')}<div class="glossary-tools"><label class="visually-hidden" for="glossary-search">Глоссарийден іздеу</label><input id="glossary-search" type="search" placeholder="Терминді не анықтаманы іздеу…" autocomplete="off"><div class="alphabet-filter" id="alphabet-filter" aria-label="Әріп бойынша сүзгі"></div></div><p class="muted small-copy" id="glossary-count"></p><div id="glossary-list" class="glossary-list"></div>`;
    const alphabet = [...new Set(glossary.map(item => (item.term || '').trim().charAt(0).toLocaleUpperCase('kk-KZ')))].sort((a,b)=>a.localeCompare(b,'kk'));
    byId('alphabet-filter').innerHTML = `<button type="button" class="active" data-letter="">Барлығы</button>${alphabet.map(letter=>`<button type="button" data-letter="${esc(letter)}">${esc(letter)}</button>`).join('')}`;
    drawGlossary();
  }
  function drawGlossary() {
    const root = byId('glossary-list'); if (!root) return;
    const query = (byId('glossary-search')?.value || '').trim().toLocaleLowerCase('kk-KZ');
    const items = glossary.filter(item => (!alphabetFilter || item.term.charAt(0).toLocaleUpperCase('kk-KZ') === alphabetFilter) && (!query || `${item.term} ${item.definition}`.toLocaleLowerCase('kk-KZ').includes(query))).sort((a,b)=>a.term.localeCompare(b.term,'kk'));
    const count = byId('glossary-count'); if (count) count.textContent = `${items.length} термин көрсетілді`;
    root.innerHTML = items.length ? items.map(item=>`<article class="glossary-entry"><h3>${highlight(esc(item.term),query)}</h3><p>${highlight(esc(item.definition),query)}</p></article>`).join('') : '<div class="empty-state"><strong>Сәйкес термин табылмады</strong>Іздеу сөзін өзгертіңіз немесе «Барлығы» сүзгісін таңдаңыз.</div>';
  }
  function highlight(text, query) {
    if (!query) return text;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { return text.replace(new RegExp(`(${escapedQuery})`, 'giu'), '<mark>$1</mark>'); } catch (_) { return text; }
  }

  const references = [
    ['Global education monitoring report, 2023: technology in education: a tool on whose terms?','UNESCO Global Education Monitoring Report Team, 2023','https://unesdoc.unesco.org/ark:/48223/pf0000385723','Технологияның білімдегі рөлі, қолжетімділік, сапа және саясат туралы халықаралық есеп.'],
    ['Digital Education','UNESCO','https://www.unesco.org/en/digital-education','UNESCO-ның цифрлық білім беру тақырыбына арналған ресми порталы.'],
    ['Guidance for Generative AI in Education and Research','UNESCO, 2023','https://unesdoc.unesco.org/ark:/48223/pf0000386693','Білім мен зерттеуде генеративті ЖИ-ді адамға бағдарланған, жауапты қолдану жөніндегі нұсқаулық.'],
    ['Moodle','Moodle','https://moodle.org/','Оқытуды басқару жүйесінің ресми сайты және құжаттамасы.'],
    ['Google Classroom','Google','https://classroom.google.com/','Google Classroom платформасының ресми беті; сервис мүмкіндігі аккаунт пен интернетке байланысты.'],
    ['Microsoft Education','Microsoft','https://www.microsoft.com/education','Microsoft Education өнімдері мен білім беру ресурстарының ресми порталы.'],
    ['Microsoft Teams for Education','Microsoft','https://www.microsoft.com/en-us/education/products/teams','Білім беру мекемелеріндегі чат, бейнекездесу, тапсырма және сынып материалдарына арналған ресми бет.'],
    ['Kahoot! for schools and teachers','Kahoot!','https://kahoot.com/schools/','Интерактивті сабақтар, викториналар және қалыптастырушы бағалауға арналған ресми платформа беті.'],
    ['Wayground (бұрынғы Quizizz)','Wayground / Quizizz Inc.','https://wayground.com/home/from-quizizz-to-wayground','Ресми атау өзгерту беті: Quizizz өнімінің қазіргі атауы — Wayground.'],
    ['Canva for Education','Canva','https://www.canva.com/education/','Canva-ның білім беру ұсыныстары мен ресми ақпарат беті.'],
    ['H5P','H5P','https://h5p.org/','Интерактивті HTML5 оқу мазмұнын құруға арналған H5P ресми сайты.'],
    ['LearningApps','LearningApps','https://learningapps.org/','Интерактивті оқу жаттығуларының ресми платформасы.'],
    ['Creative Commons','Creative Commons','https://creativecommons.org/','Ашық лицензиялар және авторлық құқық туралы ресми ұйым ресурсы.']
  ];
  function renderReferences() {
    byId('content').innerHTML = `${pageIntro('Қосымша бөлім','Пайдаланылған әдебиеттер мен электрондық ресурстар','Оқулықтағы академиялық түсіндірмелер мен практикалық платформаларды толықтыруға арналған ресми материалдар. Сілтемелер сыртқы сайтқа апарады және интернетті қажет етуі мүмкін.')}<div class="info-callout"><span class="callout-label">Дереккөзді қолдану</span>Әдебиеттегі ресми материалды оқулықтағы түсіндірмемен салыстырып оқыңыз. Платформа қызметтері мен жазылым шарттары уақыт өте өзгеруі мүмкін; нақты функцияны ресми сайттан тексеріңіз.</div><div class="resource-list">${references.map(([title,org,url,desc])=>`<article class="resource-card"><span class="resource-icon" aria-hidden="true">↗</span><div><h3>${esc(title)}</h3><p>${esc(org)} · Ресми электрондық ресурс</p><p>${esc(desc)}</p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)} <span class="visually-hidden">(жаңа бетте ашылады)</span></a></div></article>`).join('')}</div>`;
  }
  function renderBookmarks() {
    const list = state.bookmarks;
    byId('content').innerHTML = `${pageIntro('Жеке оқу кеңістігі','Бетбелгілер','Маңызды деп сақтаған оқу бөлімдеріңіз осы браузерде тізімделеді. Бетбелгіні өшіру үшін жұлдызша батырмасын қайта таңдаңыз.')}<div class="practical-grid">${list.length ? list.map((item,index)=>`<article class="content-card"><div class="section-heading-row"><h3>${esc(item.sectionTitle || item.title || 'Оқу бөлімі')}</h3><button class="quiet-button" type="button" data-bookmark-remove="${index}" aria-label="${esc(item.sectionTitle || item.title)} бетбелгісін жою">★ Алып тастау</button></div><p>${esc(item.chapterTitle || '')}</p><button class="soft-button" type="button" data-section="${esc(item.sectionId)}" data-section-chapter="${esc(item.chapterId)}">Бөлімге өту →</button></article>`).join('') : '<div class="empty-state"><strong>Бетбелгі әлі жоқ</strong>Тараудың жоғарғы жағындағы «Бетбелгі» түймесімен бөлімді сақтаңыз.</div>'}</div>`;
  }
  function renderSettings() {
    byId('content').innerHTML = `${pageIntro('Баптаулар','Оқу баптаулары','Көріністі өзіңізге ыңғайлап, осы браузерде сақтаңыз.')}<div class="content-card"><h2>Көрініс</h2><p>Тақырып пен оқу режимін жоғарғы панельден ауыстыруға болады.</p><div class="quiz-actions"><button type="button" class="soft-button" data-setting="theme">${state.preferences.dark ? 'Ашық тақырыпты қосу' : 'Қою тақырыпты қосу'}</button><button type="button" class="soft-button" data-setting="reader">${state.preferences.reader ? 'Қалыпты көрініске қайту' : 'Оқу режимін қосу'}</button></div><h3 class="subsection-title">Қаріп өлшемі</h3><div class="reader-toolbar"><button type="button" data-font="-1" aria-label="Қаріпті кішірейту">A−</button><button type="button" data-font="0">Қалыпты</button><button type="button" data-font="1" aria-label="Қаріпті үлкейту">A+</button><span class="muted small-copy">${state.preferences.fontSize}px</span></div></div><div class="content-card"><h2>Жергілікті оқу деректері</h2><p>Бетбелгілер, прогресс, тест ұпайлары және сабақ жоспары тек осы браузердің localStorage жадында сақталады. Браузер дерегін тазаласаңыз, сақтау жазбалары өшеді.</p><button class="outline-button" type="button" data-reset-progress>Жергілікті прогресті тазарту</button></div>`;
  }

  function renderSearchResults(query) {
    const box = byId('search-results'); if (!box) return;
    const q = query.trim().toLocaleLowerCase('kk-KZ');
    if (!q) { box.innerHTML = '<div class="search-empty">Терминді немесе оқу тақырыбын жазыңыз.</div>'; return; }
    const results = [];
    chapters.forEach(ch => (ch.sections || []).forEach(section => {
      const text = stripHtml(section.content);
      const full = `${ch.title} ${section.title} ${text}`.toLocaleLowerCase('kk-KZ');
      const pos = full.indexOf(q);
      if (pos >= 0) results.push({ chapterId: ch.id, sectionId: section.id, title: section.title, location: ch.shortTitle || ch.title, snippet: text.slice(Math.max(0,pos-55),Math.min(text.length,pos+145)) });
    }));
    glossary.forEach(item => { if (`${item.term} ${item.definition}`.toLocaleLowerCase('kk-KZ').includes(q)) results.push({ view:'glossary', title:item.term, location:'Глоссарий', snippet:item.definition }); });
    box.innerHTML = results.length ? results.slice(0,10).map((item,index)=>`<button class="search-result" type="button" data-search-result="${index}" data-search-chapter="${esc(item.chapterId || '')}" data-search-section="${esc(item.sectionId || '')}" data-search-view="${esc(item.view || '')}"><strong>${highlight(esc(item.title),q)}</strong><span>${highlight(esc(item.location),q)} · ${highlight(esc(item.snippet),q)}${results.length > 10 && index === 9 ? ' …' : ''}</span></button>`).join('') : '<div class="search-empty">Сәйкес нәтиже табылмады. Басқа терминді қолданып көріңіз.</div>';
    box._results = results;
  }

  function toggleBookmark(chapterId, sectionId) {
    const chapter = chapterById(chapterId); if (!chapter) return;
    const section = chapter.sections.find(s=>s.id===sectionId) || chapter.sections[0];
    const found = state.bookmarks.findIndex(item=>item.chapterId===chapterId && item.sectionId===section.id);
    if (found >= 0) { state.bookmarks.splice(found,1); toast('Бетбелгі алынып тасталды.'); }
    else { state.bookmarks.unshift({chapterId,sectionId:section.id,sectionTitle:section.title,chapterTitle:chapter.shortTitle || chapter.title}); toast('Бөлім бетбелгіге сақталды.'); }
    saveState(); buildSidebar();
    if (currentView === 'chapter') renderChapter(chapter);
    else if (currentView === 'bookmarks') renderBookmarks();
  }

  function activeQuizQuestions() {
    if (currentQuizId === 'quiz-final') return finalQuiz;
    const id = currentQuizId.replace(/^quiz-/, ''); return chapterById(id)?.quiz || [];
  }
  function handleQuizClick(target) {
    const root = byId('quiz-root'); if (!root) return;
    const id = root.dataset.quizId;
    const questions = id === 'quiz-final' ? finalQuiz : chapterById(id.replace(/^quiz-/, ''))?.quiz || [];
    if (!quizSession || quizSession.id !== id) quizSession = { id, title: root.dataset.quizTitle, index:0, selected:null, checked:false, score:0, answers:[], done:false };
    if (target.matches('[data-quiz-check]')) {
      if (quizSession.selected === null) { toast('Алдымен жауап нұсқасын таңдаңыз.'); return; }
      const q = questions[quizSession.index]; quizSession.checked = true;
      if (quizSession.selected === q.correct) quizSession.score++;
      quizSession.answers.push(quizSession.selected);
      root.innerHTML = `<h2>${esc(root.dataset.quizTitle || 'Білімді тексеру')}</h2><p class="quiz-intro">Әр сұрақта бір дұрыс жауап бар. Жауаптан кейін түсіндірме бірден көрсетіледі.</p>${quizProgressMarkup(quizSession, questions)}`;
    } else if (target.matches('[data-quiz-next]')) {
      if (quizSession.index < questions.length - 1) { quizSession.index++; quizSession.selected=null; quizSession.checked=false; root.innerHTML = `<h2>${esc(root.dataset.quizTitle || 'Білімді тексеру')}</h2><p class="quiz-intro">Әр сұрақта бір дұрыс жауап бар. Жауаптан кейін түсіндірме бірден көрсетіледі.</p>${quizProgressMarkup(quizSession, questions)}`; }
      else {
        quizSession.done = true;
        const score = quizSession.score, pct = Math.round(score / questions.length * 100);
        state.quizResults[id] = { score, total: questions.length, percent:pct, at:new Date().toISOString() };
        recordActivity(`${root.dataset.quizTitle || 'Тест'} аяқталды: ${score}/${questions.length} (${pct}%)`);
        renderQuizSummary(root, quizSession, questions);
      }
    } else if (target.matches('[data-quiz-restart]')) {
      quizSession = { id, title:root.dataset.quizTitle, index:0, selected:null, checked:false, score:0, answers:[], done:false };
      root.innerHTML = `<h2>${esc(root.dataset.quizTitle || 'Білімді тексеру')}</h2><p class="quiz-intro">Әр сұрақта бір дұрыс жауап бар. Жауаптан кейін түсіндірме бірден көрсетіледі.</p>${quizProgressMarkup(quizSession, questions)}`;
    } else if (target.matches('[data-quiz-review]')) showQuizReview(root, questions, quizSession);
    else if (target.matches('[data-quiz-summary]')) renderQuizSummary(root, quizSession, questions);
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('button, [role="button"]'); if (!target) return;
    if (target.dataset.view) { navigateView(target.dataset.view); return; }
    if (target.dataset.chapter) { navigateToChapter(target.dataset.chapter); return; }
    if (target.dataset.section && target.dataset.sectionChapter) { navigateToChapter(target.dataset.sectionChapter, target.dataset.section); return; }
    if (target.dataset.bookmarkToggle) { toggleBookmark(target.dataset.bookmarkToggle,target.dataset.sectionId); return; }
    if (target.dataset.bookmarkRemove !== undefined) { state.bookmarks.splice(Number(target.dataset.bookmarkRemove),1); saveState(); renderBookmarks(); buildSidebar(); toast('Бетбелгі жойылды.'); return; }
    if (target.dataset.completeChapter) {
      const id = target.dataset.completeChapter;
      if (!state.completedChapters.includes(id)) state.completedChapters.push(id);
      recordActivity(`${chapterById(id)?.shortTitle || 'Тарау'} аяқталды деп белгіленді`); renderChapter(chapterById(id)); toast('Оқу барысы сақталды.'); return;
    }
    if (target.dataset.quizCheck !== undefined || target.dataset.quizNext !== undefined || target.dataset.quizRestart !== undefined || target.dataset.quizReview !== undefined || target.dataset.quizSummary !== undefined) { handleQuizClick(target); return; }
    if (target.dataset.timeline) {
      document.querySelectorAll('.timeline-item').forEach(el=>el.classList.toggle('selected',el===target));
      const detail = byId('timeline-detail'); if (detail) detail.textContent = target.dataset.description || target.querySelector('small')?.textContent || '';
      return;
    }
    if (target.matches('[data-inline-check]')) {
      const quiz = target.closest('.inline-quiz');
      const selected = quiz?.querySelector('input[type="radio"]:checked');
      const result = quiz?.querySelector('.inline-result');
      if (!quiz || !result) return;
      if (!selected) { result.textContent = 'Алдымен жауап нұсқасын таңдаңыз.'; result.classList.remove('correct', 'incorrect'); return; }
      const correct = Number(selected.value) === Number(quiz.dataset.correct);
      result.textContent = `${correct ? 'Дұрыс жауап.' : 'Қате жауап.'} ${quiz.dataset.explanation || ''}`;
      result.classList.toggle('correct', correct); result.classList.toggle('incorrect', !correct);
      return;
    }
    if (target.dataset.case !== undefined) {
      const block = target.closest('.case-block');
      block?.querySelectorAll('[data-case]').forEach(button => {
        const selected = button === target;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const result = byId(`case-result-${target.dataset.case}`);
      if (result) result.innerHTML = `<strong>${target.dataset.correct === 'true' ? 'Орынды шешім.' : 'Бұл шешімді қайта қарастырыңыз.'}</strong> ${esc(target.dataset.feedback || '')}`;
      return;
    }
    if (target.dataset.lessonClear !== undefined) {
      state.lessonDraft = {}; saveState(); renderChapter(chapterById('ch5')); toast('Жоспар өрістері тазартылды.'); return;
    }
    if (target.dataset.setting === 'theme') { state.preferences.dark=!state.preferences.dark; saveState(); setTheme(); renderSettings(); return; }
    if (target.dataset.setting === 'reader') { state.preferences.reader=!state.preferences.reader; saveState(); setTheme(); renderSettings(); return; }
    if (target.dataset.font !== undefined) {
      const n=Number(target.dataset.font); state.preferences.fontSize=n===0?17:Math.min(22,Math.max(15,(state.preferences.fontSize||17)+n)); saveState(); setTheme(); if(currentView==='settings')renderSettings(); return;
    }
    if (target.dataset.resetProgress !== undefined) {
      if (window.confirm('Осы браузерде сақталған оқу прогресі, нәтижелер, бетбелгілер және жоспар нобайы өшіріледі. Жалғастырасыз ба?')) { state=structuredCloneSafe(defaultState); saveState(); setTheme(); navigateView('home'); toast('Жергілікті оқу деректері тазартылды.'); }
      return;
    }
    if (target.dataset.letter !== undefined) {
      alphabetFilter=target.dataset.letter; document.querySelectorAll('[data-letter]').forEach(btn=>btn.classList.toggle('active',btn===target)); drawGlossary(); return;
    }
    if (target.dataset.searchChapter !== undefined) {
      const view=target.dataset.searchView;
      if (view==='glossary') { navigateView('glossary'); if(byId('glossary-search')){byId('glossary-search').value=target.querySelector('strong')?.textContent||''; drawGlossary();} }
      else navigateToChapter(target.dataset.searchChapter,target.dataset.searchSection);
      const panel=byId('search-panel'); if(panel)panel.hidden=true; return;
    }
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('input[name="quiz-answer"]')) { if (quizSession && !quizSession.checked) quizSession.selected=Number(target.value); return; }
    if (target.matches('[data-resource-check]')) {
      const checklist = target.closest('.resource-checklist');
      const checks = checklist ? [...checklist.querySelectorAll('[data-resource-check]')] : [];
      const count = checklist?.querySelector('[data-resource-count]');
      if (count) count.textContent = `${checks.filter(item => item.checked).length}/${checks.length} өлшем орындалды`;
      return;
    }
    if (target.matches('[data-practical-check]')) {
      const i=Number(target.dataset.practicalCheck), j=Number(target.dataset.checkIndex);
      if(!state.practicalChecks[i]) state.practicalChecks[i]=[]; state.practicalChecks[i][j]=target.checked; saveState();
      const card=target.closest('.practical-card'); const p=practicals[i]; const done=state.practicalChecks[i].filter(Boolean).length; const total=p?.checklist?.length||0;
      const count=card?.querySelector('.practical-head p'); if(count)count.textContent=`${done}/${total} қадам орындалды`;
      target.closest('.check-item')?.classList.toggle('done',target.checked); recordActivity(`Практикалық жұмыс ${i+1}: чек-парақ жаңартылды`); return;
    }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'glossary-search') { drawGlossary(); return; }
    if (event.target.id === 'global-search') { renderSearchResults(event.target.value); return; }
    if (event.target.matches('[data-lesson-field]')) {
      state.lessonDraft[event.target.dataset.lessonField]=event.target.value; saveState();
      const preview=byId('lesson-preview'); if(preview){const dd=preview.querySelectorAll('dd'); lessonFields.forEach(([key],i)=>{if(dd[i])dd[i].textContent=state.lessonDraft[key]||'Әзірге толтырылмады';});}
    }
  });
  document.addEventListener('submit', event => {
    if(event.target.id==='lesson-form'){event.preventDefault();toast('Сабақ жоспары алдын ала қарауға дайын; браузерде сақталды.');recordActivity('Сабақ жоспарының нобайы сақталды');}
  });
  document.addEventListener('keydown', event => {
    const card = event.target.closest('[role="button"][data-chapter]');
    if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigateToChapter(card.dataset.chapter); }
  });

  byId('theme-toggle')?.addEventListener('click',()=>{state.preferences.dark=!state.preferences.dark;saveState();setTheme();});
  byId('reader-toggle')?.addEventListener('click',()=>{state.preferences.reader=!state.preferences.reader;saveState();setTheme();});
  byId('menu-toggle')?.addEventListener('click',event=>{const open=!byId('left-sidebar').classList.contains('open');byId('left-sidebar').classList.toggle('open',open);byId('drawer-scrim').hidden=!open;event.currentTarget.setAttribute('aria-expanded',String(open));});
  byId('drawer-scrim')?.addEventListener('click',closeDrawer);
  byId('settings-button')?.addEventListener('click',()=>navigateView('settings'));
  byId('search-toggle')?.addEventListener('click',()=>{const panel=byId('search-panel');panel.hidden=!panel.hidden;if(!panel.hidden){byId('global-search').focus();renderSearchResults('');}});
  byId('close-search')?.addEventListener('click',()=>{byId('search-panel').hidden=true;byId('search-toggle').focus();});
  byId('panel-toggle')?.addEventListener('click',event=>{const side=byId('progress-sidebar');const open=side.classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',String(open));event.currentTarget.setAttribute('aria-label',open?'Оң жақ панельді жабу':'Оң жақ панельді ашу');});
  byId('progress-toggle')?.addEventListener('click',event=>{const side=byId('progress-sidebar');const open=side.classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',String(open));event.currentTarget.setAttribute('aria-label',open?'Оқу барысы панелін жабу':'Оқу барысы панелін ашу');});

  function initialize() {
    setTheme();
    navigateView('title');
    updateDashboard();
    window.setInterval(updateDashboard, 60000);
  }
  initialize();
})();
