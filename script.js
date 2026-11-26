/* ==========================================================================
   HCC — Hongs Control Center · Home page logic
   Sections: 1 Config · 2 Storage · 3 State · 4 Helpers · 5 Rendering
             6 Drag & drop · 7 Right-click menu · 8 Search · 9 App dialog
             10 Settings · 11 Clock · 12 Init
   ========================================================================== */
(() => {
  'use strict';

  /* 1. Config -------------------------------------------------------------- */

  // localStorage keys. The ".v1" suffix lets us migrate data later if the shape changes.
  const KEYS = { apps: 'hcc.apps.v1', settings: 'hcc.settings.v1', categories: 'hcc.categories.v1' };

  const DEFAULT_SETTINGS = { name: 'Hongs', theme: 'dark', accent: '#3da9ff', newTab: true };

  const ACCENTS = ['#3da9ff', '#22d3ee', '#2dd4bf', '#34d399', '#a78bfa', '#f472b6', '#fb7185', '#fbbf24'];

  // Starter apps. Each app: { id, name, url, icon (emoji, optional), category, favorite }
  const DEFAULT_APPS = [
    { id: 'd-east-smp', name: 'East SMP',  url: 'https://hongs4447mc.github.io/Offical-East-SMP-Website/src/index.html', icon: '', category: 'My apps', favorite: true },
    { id: 'd-gmail',    name: 'Gmail',     url: 'https://mail.google.com',    icon: '✉️', category: 'Productivity', favorite: true },
    { id: 'd-drive',    name: 'Drive',     url: 'https://drive.google.com',   icon: '📁', category: 'Productivity', favorite: false },
    { id: 'd-cal',      name: 'Calendar',  url: 'https://calendar.google.com',icon: '📅', category: 'Productivity', favorite: false },
    { id: 'd-claude',   name: 'Claude',    url: 'https://claude.ai/',         icon: '', category: 'AI',           favorite: false },
    { id: 'd-github',   name: 'GitHub',    url: 'https://github.com/',        icon: '', category: 'Dev',          favorite: true },
    { id: 'd-youtube',  name: 'YouTube',   url: 'https://youtube.com',        icon: '▶️', category: 'Media',        favorite: true },
    { id: 'd-spotify',  name: 'Spotify',   url: 'https://open.spotify.com',   icon: '🎧', category: 'Media',        favorite: false },
    { id: 'd-maps',     name: 'Maps',      url: 'https://maps.google.com',    icon: '🗺️', category: 'Tools',        favorite: false },
    { id: 'd-chatgpt',  name: 'chatgpt',   url: 'https://chatgpt.com/',       icon: '', category: 'AI',           favorite: false },
  ];
  const DEFAULT_CATEGORY_ORDER = [...new Set(DEFAULT_APPS.map((app) => app.category))];

  /* 2. Storage -------------------------------------------------------------
     Everything is wrapped in try/catch: localStorage can throw in private
     windows or when site data is blocked, and HCC should still load. */

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage unavailable; changes just won't persist */ }
  }

  /* 3. State --------------------------------------------------------------- */

  const clone = (x) => JSON.parse(JSON.stringify(x));

  let settings = { ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) };
  let apps = sanitizeApps(load(KEYS.apps, null)) || clone(DEFAULT_APPS);
  let categoryOrder = sanitizeCategoryOrder(load(KEYS.categories, DEFAULT_CATEGORY_ORDER));
  let query = '';
  let activeCategory = 'All';
  let editingId = null; // id of the app open in the dialog, or null when adding
  let dragId = null;    // id of the app currently being dragged, or null
  let dragCategory = null;
  let cloudClient = null;
  let cloudUser = null;
  let cloudReady = false;
  let cloudSaveTimer = null;
  let cloudLoadPromise = null;
  let cloudLoadingUserId = null;

  // Guards against corrupted or hand-edited storage.
  function sanitizeApps(list) {
    if (!Array.isArray(list)) return null;
    return list
      .filter((a) => a && typeof a.name === 'string' && typeof a.url === 'string')
      .map((a) => ({
        id: String(a.id || uid()),
        name: a.name,
        url: a.url,
        icon: typeof a.icon === 'string' ? a.icon : '',
        category: typeof a.category === 'string' && a.category.trim() ? a.category.trim() : 'General',
        favorite: Boolean(a.favorite),
      }));
  }

  function sanitizeCategoryOrder(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.filter((category) => typeof category === 'string' && category.trim()).map((category) => category.trim()))];
  }

  function sanitizeSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      name: typeof source.name === 'string' ? source.name : DEFAULT_SETTINGS.name,
      theme: source.theme === 'light' || source.theme === 'dark' ? source.theme : DEFAULT_SETTINGS.theme,
      accent: typeof source.accent === 'string' ? normalizeAccent(source.accent) || DEFAULT_SETTINGS.accent : DEFAULT_SETTINGS.accent,
      newTab: typeof source.newTab === 'boolean' ? source.newTab : DEFAULT_SETTINGS.newTab,
    };
  }

  /* 4. Helpers ------------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);

  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  // Accepts "youtube.com" or "https://youtube.com"; only allows http(s).
  // Returns a clean URL string, or null if it isn't a usable web address.
  function normalizeUrl(input) {
    let value = input.trim();
    if (!value) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }

  function normalizeAccent(input) {
    const value = input.trim();
    const hex = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
      return '#' + digits.toLowerCase();
    }

    const rgb = value.match(/^rgb\(\s*(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})(?:\s*,\s*|\s+)(\d{1,3})\s*\)$/i);
    if (!rgb) return null;
    const channels = rgb.slice(1).map(Number);
    if (channels.some((channel) => channel > 255)) return null;
    return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('');
  }

  // Small helper to build elements without innerHTML (so app names can't inject HTML).
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    }
    [].concat(children).forEach((c) => c && node.append(c));
    return node;
  }

  const ICONS = {
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  };
  function svg(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name]; // static, trusted strings only
    return s;
  }

  function persistApps() {
    save(KEYS.apps, apps);
    const present = new Set(apps.map((app) => app.category));
    categoryOrder = categoryOrder.filter((category) => present.has(category));
    persistCategoryOrder();
  }
  function persistCategoryOrder() {
    save(KEYS.categories, categoryOrder);
    scheduleCloudSave();
  }
  function persistSettings() {
    save(KEYS.settings, settings);
    scheduleCloudSave();
  }

  /* 5. Rendering ----------------------------------------------------------- */

  function matches(app) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [app.name, app.url, app.category].some((s) => s.toLowerCase().includes(q));
  }

  function visibleApps() {
    return apps.filter((a) => matches(a) && (activeCategory === 'All' || a.category === activeCategory));
  }

  function categoriesInOrder() {
    const present = [...new Set(apps.map((a) => a.category))];
    return [...categoryOrder.filter((category) => present.includes(category)),
      ...present.filter((category) => !categoryOrder.includes(category))];
  }

  // sectionKey says which section a card lives in: "fav" or "cat:<name>".
  // It is null while searching, and dragging is switched off then.
  function buildCard(app, index, sectionKey) {
    const iconText = app.icon.trim() || app.name.trim().charAt(0).toUpperCase() || '?';

    const link = el('a', {
      class: 'card-link glass',
      href: app.url,
      title: app.name + ' — ' + hostOf(app.url),
      rel: 'noopener noreferrer',
      draggable: false, // lets the whole card be dragged instead of the link
    }, [
      el('span', { class: 'app-icon', text: iconText }),
      el('span', { class: 'app-name', text: app.name }),
      el('span', { class: 'app-host', text: hostOf(app.url) }),
    ]);
    link.target = settings.newTab ? '_blank' : '_self';

    const favBtn = el('button', {
      class: 'mini-btn' + (app.favorite ? ' is-fav' : ''),
      type: 'button',
      title: app.favorite ? 'Remove from favorites' : 'Add to favorites',
    }, svg('star'));
    favBtn.setAttribute('aria-label', (app.favorite ? 'Unfavorite ' : 'Favorite ') + app.name);
    favBtn.setAttribute('aria-pressed', String(app.favorite));
    favBtn.addEventListener('click', () => toggleFavorite(app.id));

    const editBtn = el('button', { class: 'mini-btn', type: 'button', title: 'Edit' }, svg('edit'));
    editBtn.setAttribute('aria-label', 'Edit ' + app.name);
    editBtn.addEventListener('click', () => openAppDialog(app.id));

    const card = el('div', { class: 'card', style: '--i:' + Math.min(index, 20) }, [
      link,
      el('div', { class: 'card-actions' }, [favBtn, editBtn]),
    ]);

    card.addEventListener('contextmenu', (e) => openMenu(e, app));
    if (sectionKey) wireCardDrag(card, app, sectionKey);
    return card;
  }

  function buildSection(title, list, opts = {}) {
    const head = el('div', { class: 'section-head' }, [
      opts.star ? el('span', { class: 'star', text: '★' }) : null,
      el('h2', { text: title }),
      el('span', { class: 'count', text: String(list.length) }),
    ]);
    if (opts.key?.startsWith('cat:')) wireCategoryDrag(head, opts.key.slice(4));
    const grid = el('div', { class: 'grid' }, list.map((a, i) => buildCard(a, i, opts.key || null)));
    const section = el('section', { class: 'section' }, [head, grid]);
    if (opts.key) wireSectionDrop(section, opts.key);
    return section;
  }

  function renderChips() {
    const cats = categoriesInOrder();
    if (activeCategory !== 'All' && !cats.includes(activeCategory)) activeCategory = 'All';

    const chips = $('chips');
    chips.replaceChildren(
      ...['All', ...cats].map((name) => {
        const b = el('button', { class: 'chip', type: 'button', text: name });
        b.setAttribute('aria-pressed', String(name === activeCategory));
        b.addEventListener('click', () => { activeCategory = name; render(true); });
        return b;
      })
    );
    chips.hidden = cats.length < 2;
  }

  // animate = true plays the "rise" entrance (first load, category switch).
  // Everything else (search, drag, favorite) re-renders quietly.
  function render(animate = false) {
    renderChips();

    const sections = $('sections');
    sections.classList.toggle('no-anim', !animate);

    const list = visibleApps();
    const nodes = [];

    if (query.trim()) {
      // While searching: one flat results list (no dragging here)
      if (list.length) nodes.push(buildSection('Results', list));
    } else {
      const favs = list.filter((a) => a.favorite);
      if (favs.length) nodes.push(buildSection('Favorites', favs, { star: true, key: 'fav' }));
      categoriesInOrder().forEach((cat) => {
        const inCat = list.filter((a) => a.category === cat);
        if (inCat.length) nodes.push(buildSection(cat, inCat, { key: 'cat:' + cat }));
      });
    }

    sections.replaceChildren(...nodes);

    // Empty states
    const empty = $('empty');
    const isEmpty = nodes.length === 0;
    empty.hidden = !isEmpty;
    if (isEmpty) {
      const noApps = apps.length === 0;
      $('emptyTitle').textContent = noApps ? 'Nothing here yet' : 'No matches';
      $('emptyText').textContent = noApps
        ? 'Add your first app to get started.'
        : 'Nothing matches “' + query.trim() + '”. Try a different search.';
      $('emptyAddBtn').hidden = !noApps;
    }

    // Keep the category suggestions in the dialog up to date
    $('categoryList').replaceChildren(...categoriesInOrder().map((c) => el('option', { value: c })));
  }

  function toggleFavorite(id) {
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    app.favorite = !app.favorite;
    persistApps();
    render();
  }

  function deleteApp(id) {
    const app = apps.find((a) => a.id === id);
    if (app && confirm('Delete “' + app.name + '”?')) {
      apps = apps.filter((a) => a.id !== id);
      persistApps();
      render();
      return true;
    }
    return false;
  }

  /* 6. Drag & drop ---------------------------------------------------------
     Uses the browser's built-in HTML5 drag and drop (mouse / trackpad).
     - Drop on a card      → the app goes before/after it (left or right half).
     - Drop on a section   → the app goes to the end of that section.
     - Drag a category heading → reorder the category sections.
     - Dropping into "Favorites" favorites the app; dropping into a category
       moves the app to that category.
     App order follows the `apps` array; category order is stored separately. */

  const inSection = (app, key) => key === 'fav' ? app.favorite : app.category === key.slice(4);

  function assignSection(app, key) {
    if (key === 'fav') app.favorite = true;
    else app.category = key.slice(4);
  }

  function clearDrag() {
    dragId = null;
    document.querySelectorAll('.dragging, .drop-before, .drop-after, .drop-target')
      .forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop-after', 'drop-target'));
  }

  function isAfter(e, card) {
    const r = card.getBoundingClientRect();
    return e.clientX > r.left + r.width / 2;
  }

  function moveApp(id, targetId, after, key) {
    const app = apps.find((a) => a.id === id);
    if (!app || id === targetId) return;
    apps = apps.filter((a) => a !== app);
    const to = apps.findIndex((a) => a.id === targetId);
    apps.splice(to < 0 ? apps.length : (after ? to + 1 : to), 0, app);
    assignSection(app, key);
    persistApps();
    render();
  }

  function moveToSection(id, key) {
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    assignSection(app, key);
    apps = apps.filter((a) => a !== app);
    let last = -1;
    apps.forEach((a, i) => { if (inSection(a, key)) last = i; });
    apps.splice(last < 0 ? apps.length : last + 1, 0, app);
    persistApps();
    render();
  }

  function moveCategory(category, target, after) {
    if (category === target) return;
    const order = categoriesInOrder().filter((item) => item !== category);
    const targetIndex = order.indexOf(target);
    if (targetIndex < 0) return;
    order.splice(targetIndex + (after ? 1 : 0), 0, category);
    categoryOrder = order;
    persistCategoryOrder();
    render();
  }

  function clearCategoryDrag() {
    dragCategory = null;
    document.querySelectorAll('.category-dragging, .category-drop-before, .category-drop-after')
      .forEach((head) => head.classList.remove('category-dragging', 'category-drop-before', 'category-drop-after'));
  }

  function wireCategoryDrag(head, category) {
    head.draggable = true;

    head.addEventListener('dragstart', (e) => {
      dragCategory = category;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', category);
      head.classList.add('category-dragging');
    });

    head.addEventListener('dragend', clearCategoryDrag);

    head.addEventListener('dragover', (e) => {
      if (!dragCategory || dragCategory === category) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.category-drop-before, .category-drop-after')
        .forEach((item) => item.classList.remove('category-drop-before', 'category-drop-after'));
      const rect = head.getBoundingClientRect();
      head.classList.add(e.clientY > rect.top + rect.height / 2 ? 'category-drop-after' : 'category-drop-before');
    });

    head.addEventListener('dragleave', (e) => {
      if (!head.contains(e.relatedTarget)) head.classList.remove('category-drop-before', 'category-drop-after');
    });

    head.addEventListener('drop', (e) => {
      if (!dragCategory) return;
      e.preventDefault();
      e.stopPropagation();
      const draggedCategory = dragCategory;
      const rect = head.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      clearCategoryDrag();
      moveCategory(draggedCategory, category, after);
    });
  }

  function wireCardDrag(card, app, key) {
    card.draggable = true;

    card.addEventListener('dragstart', (e) => {
      closeMenu();
      dragId = app.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', app.name);
      // Add the "dragging" look one frame later so the drag image isn't faded
      requestAnimationFrame(() => card.classList.add('dragging'));
    });

    card.addEventListener('dragend', clearDrag);

    card.addEventListener('dragover', (e) => {
      if (!dragId || dragId === app.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.drop-before, .drop-after')
        .forEach((n) => n.classList.remove('drop-before', 'drop-after'));
      card.classList.add(isAfter(e, card) ? 'drop-after' : 'drop-before');
    });

    card.addEventListener('dragleave', (e) => {
      if (!card.contains(e.relatedTarget)) card.classList.remove('drop-before', 'drop-after');
    });

    card.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      e.stopPropagation(); // don't also trigger the section's drop
      const id = dragId;
      const after = isAfter(e, card);
      clearDrag();
      moveApp(id, app.id, after, key);
    });
  }

  function wireSectionDrop(section, key) {
    section.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      section.classList.add('drop-target');
    });
    section.addEventListener('dragleave', (e) => {
      if (!section.contains(e.relatedTarget)) section.classList.remove('drop-target');
    });
    section.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const id = dragId;
      clearDrag();
      moveToSection(id, key);
    });
  }

  /* 7. Right-click menu ----------------------------------------------------
     Right-click any app card for: favorite / open / edit / delete. */

  const menu = el('div', { class: 'ctx glass', role: 'menu' });
  menu.hidden = true;
  document.body.append(menu);

  function menuItem(icon, label, onClick, danger = false) {
    const b = el('button', { class: 'ctx-item' + (danger ? ' danger' : ''), type: 'button', role: 'menuitem' }, [
      el('span', { class: 'ctx-ico', text: icon }),
      el('span', { text: label }),
    ]);
    b.addEventListener('click', () => { closeMenu(); onClick(); });
    return b;
  }

  function openMenu(e, app) {
    e.preventDefault();
    menu.replaceChildren(
      menuItem(app.favorite ? '★' : '☆', app.favorite ? 'Remove from favorites' : 'Add to favorites', () => toggleFavorite(app.id)),
      menuItem('↗', 'Open in new tab', () => window.open(app.url, '_blank', 'noopener')),
      menuItem('✎', 'Edit…', () => openAppDialog(app.id)),
      el('div', { class: 'ctx-sep' }),
      menuItem('🗑', 'Delete…', () => deleteApp(app.id), true)
    );
    menu.hidden = false;

    // Place at the cursor, but keep it fully on screen
    const r = menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - r.width - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - r.height - 8));
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    menu.querySelector('.ctx-item').focus({ preventScroll: true });
  }

  function closeMenu() { menu.hidden = true; }

  function initContextMenu() {
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('contextmenu', (e) => { if (!menu.hidden && !e.target.closest('.card')) closeMenu(); });
    document.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('blur', closeMenu);

    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('.ctx-item')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
    });
  }

  /* 8. Search & filters ---------------------------------------------------- */

  function initSearch() {
    const input = $('searchInput');

    input.addEventListener('input', () => { query = input.value; render(); });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // Enter opens the first result, like a launcher
        const first = visibleApps()[0];
        if (first && query.trim()) {
          e.preventDefault();
          window.open(first.url, settings.newTab ? '_blank' : '_self', 'noopener');
        }
      } else if (e.key === 'Escape') {
        input.value = ''; query = ''; render(); input.blur();
      }
    });

    // Press "/" anywhere to jump to search (unless already typing somewhere)
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      const dialogOpen = document.querySelector('dialog[open]');
      if (e.key === '/' && !typing && !dialogOpen && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  /* 9. App dialog (add / edit / delete) ------------------------------------ */

  function openAppDialog(id = null) {
    editingId = id;
    const app = id ? apps.find((a) => a.id === id) : null;

    $('appDialogTitle').textContent = app ? 'Edit app' : 'Add app';
    $('appName').value = app ? app.name : '';
    $('appUrl').value = app ? app.url : '';
    $('appCategory').value = app ? app.category : (activeCategory !== 'All' ? activeCategory : '');
    $('appIcon').value = app ? app.icon : '';
    $('deleteAppBtn').hidden = !app;
    $('appError').hidden = true;

    $('appDialog').showModal();
    $('appName').focus();
  }

  function initAppDialog() {
    const dialog = $('appDialog');

    $('appForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('appName').value.trim();
      const url = normalizeUrl($('appUrl').value);
      const category = $('appCategory').value.trim() || 'General';
      const icon = $('appIcon').value.trim();

      if (!name) return showError('Please enter a name.');
      if (!url) return showError('That link doesn’t look right. Try something like youtube.com');

      if (editingId) {
        const app = apps.find((a) => a.id === editingId);
        Object.assign(app, { name, url, category, icon });
      } else {
        apps.push({ id: uid(), name, url, category, icon, favorite: false });
      }
      persistApps();
      dialog.close();
      render();
    });

    $('deleteAppBtn').addEventListener('click', () => {
      if (deleteApp(editingId)) dialog.close();
    });

    function showError(msg) {
      const err = $('appError');
      err.textContent = msg;
      err.hidden = false;
    }

    ['addBtn', 'addBtnTop', 'emptyAddBtn'].forEach((id) => $(id).addEventListener('click', () => openAppDialog()));
  }

  /* 10. Settings ----------------------------------------------------------- */

  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--accent', settings.accent);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = settings.theme === 'light' ? '#e9f1ff' : '#0a1020';

    $('heroName').textContent = settings.name.trim() ? ', ' + settings.name.trim() : '';
  }

  function syncSettingsControls() {
    $('setName').value = settings.name;
    $('setNewTab').checked = settings.newTab;
    $('setAccent').value = settings.accent;
    $('setAccentCode').value = settings.accent;
    $('setAccentCode').setAttribute('aria-invalid', 'false');
    $('accentCodeError').hidden = true;

    document.querySelectorAll('#themeSeg button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.themeValue === settings.theme)));
    document.querySelectorAll('#swatches .swatch').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.color === settings.accent.toLowerCase())));
  }

  function updateSettings(patch) {
    settings = { ...settings, ...patch };
    persistSettings();
    applySettings();
    syncSettingsControls();
    if ('newTab' in patch) render(); // link targets change
  }

  function setCloudStatus(message, isError = false) {
    const status = $('cloudStatus');
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function setCloudAccount(user) {
    $('cloudAuthForm').hidden = Boolean(user);
    $('cloudAccount').hidden = !user;
    $('cloudUserEmail').textContent = user?.email || 'your account';
  }

  function setCloudAuthBusy(busy) {
    ['cloudEmail', 'cloudPassword', 'cloudSignIn', 'cloudSignUp'].forEach((id) => {
      $(id).disabled = busy;
    });
  }

  function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
      const script = el('script', { src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2' });
      script.async = true;
      script.onload = () => {
        if (window.supabase?.createClient) resolve(window.supabase);
        else reject(new Error('The Supabase client library did not initialize.'));
      };
      script.onerror = () => reject(new Error('Could not load the Supabase client library.'));
      document.head.append(script);
    });
  }

  async function saveCloudConfig(userId) {
    const config = {
      apps: clone(apps),
      settings: clone(settings),
      categories: categoriesInOrder(),
    };
    try {
      const { error } = await cloudClient
        .from('hcc_configs')
        .upsert({ user_id: userId, config, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      if (cloudUser?.id === userId) setCloudStatus('Synced to your account.');
    } catch (error) {
      if (cloudUser?.id === userId) setCloudStatus('Cloud sync failed: ' + error.message, true);
    }
  }

  function scheduleCloudSave() {
    if (!cloudReady || !cloudClient || !cloudUser) return;
    clearTimeout(cloudSaveTimer);
    const userId = cloudUser.id;
    cloudSaveTimer = setTimeout(() => {
      cloudSaveTimer = null;
      void saveCloudConfig(userId);
    }, 500);
  }

  async function activateCloudUser(user) {
    if (cloudReady && cloudUser?.id === user.id) {
      setCloudAccount(user);
      return;
    }
    if (cloudLoadingUserId === user.id && cloudLoadPromise) return cloudLoadPromise;

    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
    cloudUser = user;
    cloudReady = false;
    cloudLoadingUserId = user.id;
    setCloudAccount(user);
    setCloudStatus('Loading your cloud configuration…');

    const loadPromise = (async () => {
      try {
        const { data, error } = await cloudClient
          .from('hcc_configs')
          .select('config')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (cloudUser?.id !== user.id) return;

        if (data) {
          const remoteApps = sanitizeApps(data.config?.apps);
          if (!remoteApps) throw new Error('The cloud configuration is invalid; local settings were left unchanged.');
          apps = remoteApps;
          settings = sanitizeSettings(data.config.settings);
          categoryOrder = sanitizeCategoryOrder(data.config.categories);
          save(KEYS.apps, apps);
          save(KEYS.settings, settings);
          save(KEYS.categories, categoryOrder);
          applySettings();
          syncSettingsControls();
          render(true);
          cloudReady = true;
          setCloudStatus('Cloud configuration loaded. Changes sync automatically.');
        } else {
          cloudReady = true;
          setCloudStatus('No cloud configuration yet. Uploading this device’s configuration…');
          scheduleCloudSave();
        }
      } catch (error) {
        cloudReady = false;
        setCloudStatus('Could not load cloud configuration: ' + error.message, true);
      }
    })();

    cloudLoadPromise = loadPromise;
    await loadPromise;
    if (cloudLoadPromise === loadPromise) {
      cloudLoadPromise = null;
      cloudLoadingUserId = null;
    }
  }

  async function submitCloudAuth(mode) {
    if (!cloudClient) return;
    if (!$('cloudAuthForm').reportValidity()) return;
    const email = $('cloudEmail').value.trim();
    const password = $('cloudPassword').value;
    setCloudAuthBusy(true);
    try {
      const result = mode === 'signup'
        ? await cloudClient.auth.signUp({ email, password })
        : await cloudClient.auth.signInWithPassword({ email, password });
      if (result.error) {
        setCloudStatus('Authentication failed: ' + result.error.message, true);
      } else if (mode === 'signup' && !result.data.session) {
        setCloudStatus('Check your email to confirm your account, then sign in.');
      } else if (result.data.user) {
        $('cloudPassword').value = '';
        await activateCloudUser(result.data.user);
      }
    } catch (error) {
      setCloudStatus('Authentication failed: ' + error.message, true);
    } finally {
      setCloudAuthBusy(false);
    }
  }

  async function initCloudSync() {
    const url = typeof window.HCC_SUPABASE_URL === 'string' ? window.HCC_SUPABASE_URL.trim() : '';
    const key = typeof window.HCC_SUPABASE_ANON_KEY === 'string' ? window.HCC_SUPABASE_ANON_KEY.trim() : '';
    if (!url || !key) {
      setCloudAuthBusy(true);
      setCloudStatus('Add your Supabase project URL and public anon key to supabase-config.js. Local storage is still active.');
      return;
    }

    try {
      const library = await loadSupabaseLibrary();
      cloudClient = library.createClient(url, key);
      setCloudAuthBusy(false);
      cloudClient.auth.onAuthStateChange((event, session) => {
        setTimeout(() => {
          if (event === 'SIGNED_OUT') {
            clearTimeout(cloudSaveTimer);
            cloudSaveTimer = null;
            cloudUser = null;
            cloudReady = false;
            cloudLoadPromise = null;
            cloudLoadingUserId = null;
            setCloudAccount(null);
            setCloudStatus('Signed out. This device keeps its local copy.');
          } else if (session?.user) {
            void activateCloudUser(session.user);
          }
        }, 0);
      });

      const { data, error } = await cloudClient.auth.getSession();
      if (error) throw error;
      if (data.session?.user) await activateCloudUser(data.session.user);
      else setCloudStatus('Sign in to sync your configuration across devices.');
    } catch (error) {
      setCloudAuthBusy(true);
      setCloudStatus('Cloud sync could not start: ' + error.message, true);
    }
  }

  function initSettings() {
    const dialog = $('settingsDialog');
    const accentCode = $('setAccentCode');
    const accentCodeError = $('accentCodeError');

    function applyAccentCode() {
      const accent = normalizeAccent(accentCode.value);
      if (!accent) {
        accentCode.setAttribute('aria-invalid', 'true');
        accentCodeError.textContent = 'Enter a 3- or 6-digit hex code, or rgb() values from 0 to 255.';
        accentCodeError.hidden = false;
        return;
      }
      updateSettings({ accent });
    }

    $('swatches').replaceChildren(
      ...ACCENTS.map((c) => {
        const b = el('button', { class: 'swatch', type: 'button', title: c, style: '--c:' + c });
        b.dataset.color = c;
        b.setAttribute('aria-label', 'Accent ' + c);
        b.addEventListener('click', () => updateSettings({ accent: c }));
        return b;
      })
    );

    $('settingsBtn').addEventListener('click', () => { syncSettingsControls(); dialog.showModal(); });

    $('cloudAuthForm').addEventListener('submit', (e) => {
      e.preventDefault();
      void submitCloudAuth('signin');
    });
    $('cloudSignUp').addEventListener('click', () => { void submitCloudAuth('signup'); });
    $('cloudSignOut').addEventListener('click', async () => {
      if (!cloudClient) return;
      try {
        const { error } = await cloudClient.auth.signOut();
        if (error) setCloudStatus('Could not sign out: ' + error.message, true);
      } catch (error) {
        setCloudStatus('Could not sign out: ' + error.message, true);
      }
    });

    $('setName').addEventListener('input', (e) => updateSettings({ name: e.target.value }));
    $('setAccent').addEventListener('input', (e) => updateSettings({ accent: e.target.value }));
    accentCode.addEventListener('input', () => {
      accentCode.setAttribute('aria-invalid', 'false');
      accentCodeError.hidden = true;
    });
    accentCode.addEventListener('change', applyAccentCode);
    accentCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyAccentCode();
      }
    });
    $('setNewTab').addEventListener('change', (e) => updateSettings({ newTab: e.target.checked }));
    document.querySelectorAll('#themeSeg button').forEach((b) =>
      b.addEventListener('click', () => updateSettings({ theme: b.dataset.themeValue })));

    $('resetAppsBtn').addEventListener('click', () => {
      if (confirm('Replace your apps with the default set? Your current apps will be removed.')) {
        apps = clone(DEFAULT_APPS);
        categoryOrder = [...DEFAULT_CATEGORY_ORDER];
        persistApps();
        render(true);
      }
    });

    $('resetAllBtn').addEventListener('click', () => {
      if (confirm('Reset all apps and settings to defaults?')) {
        apps = clone(DEFAULT_APPS);
        categoryOrder = [...DEFAULT_CATEGORY_ORDER];
        settings = { ...DEFAULT_SETTINGS };
        persistApps(); persistSettings();
        applySettings(); syncSettingsControls(); render(true);
      }
    });
  }

  // Shared dialog behavior: [data-close] buttons and clicking the backdrop close it
  function initDialogs() {
    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
      dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) dialog.close(); });
    });
  }

  /* 11. Clock & greeting --------------------------------------------------- */

  function updateClock() {
    const now = new Date();
    const h = now.getHours();
    $('greeting').textContent = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('heroDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('heroTime').textContent = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /* 12. Init --------------------------------------------------------------- */

  applySettings();
  updateClock();
  setInterval(updateClock, 15000);
  initSearch();
  initAppDialog();
  initSettings();
  initDialogs();
  initContextMenu();
  syncSettingsControls();
  render(true);
  void initCloudSync();
})();