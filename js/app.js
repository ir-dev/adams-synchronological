'use strict';

class ARKRapid {
  constructor() {
    this.data = null;
    this.filtered = [];
    this.zoomLevel = 2;
    this.activeEra = 'all';
    this.activeCategories = new Set(['all']);
    this.searchQuery = '';
    this.commentCounts = {};
    this.searchDebounce = null;

    this.ZOOM_LEVELS = [
      { name: 'Bird\'s Eye', maxImportance: 1 },
      { name: 'Overview',   maxImportance: 2 },
      { name: 'Standard',   maxImportance: 3 },
      { name: 'Detailed',   maxImportance: 4 },
      { name: 'Scholar',    maxImportance: 5 },
    ];
  }

  /* ──────────── INIT ──────────── */
  async init() {
    try {
      const res = await fetch('data/timeline.json');
      if (!res.ok) throw new Error('Could not load timeline data');
      this.data = await res.json();
      this.applyFilter();
      this.renderEraNav();
      this.renderFilterPanel();
      this.renderTimeline();
      this.bindEvents();
      this.updateMinimap();
      this.updateZoomUI();
    } catch (e) {
      document.getElementById('timeline-events').innerHTML =
        `<div class="timeline-empty" style="display:block"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
    }
  }

  /* ──────────── HELPERS ──────────── */
  formatYear(year) {
    if (year === null || year === undefined) return '';
    return year < 0 ? `${Math.abs(year)} BC` : `AD ${year}`;
  }

  yearRange(event) {
    const s = this.formatYear(event.year);
    if (!event.endYear) return s;
    return `${s} – ${this.formatYear(event.endYear)}`;
  }

  eraFor(eraId) {
    return this.data.eras.find(e => e.id === eraId) || {};
  }

  categoryFor(catId) {
    return this.data.categories.find(c => c.id === catId) || { icon: '•', color: '#888' };
  }

  highlight(text) {
    if (!this.searchQuery) return this.escHtml(text);
    const q = this.searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.escHtml(text).replace(
      new RegExp(q, 'gi'),
      m => `<mark>${m}</mark>`
    );
  }

  escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  showToast(msg, duration = 2200) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
  }

  /* ──────────── FILTERING ──────────── */
  applyFilter() {
    const { zoomLevel, activeEra, activeCategories, searchQuery } = this;
    const maxImp = this.ZOOM_LEVELS[zoomLevel].maxImportance;
    const q = searchQuery.trim().toLowerCase();

    this.filtered = (this.data?.events || []).filter(ev => {
      if (ev.importance > maxImp) return false;
      if (activeEra !== 'all' && ev.era !== activeEra) return false;
      if (!activeCategories.has('all') && !activeCategories.has(ev.category)) return false;
      if (q) {
        return (
          ev.title.toLowerCase().includes(q) ||
          (ev.subtitle || '').toLowerCase().includes(q) ||
          (ev.description || '').toLowerCase().includes(q) ||
          (ev.scripture || '').toLowerCase().includes(q) ||
          (ev.concurrent || '').toLowerCase().includes(q) ||
          (ev.tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }

  /* ──────────── ERA NAV ──────────── */
  renderEraNav() {
    const inner = document.getElementById('era-nav-inner');
    inner.innerHTML = `<button class="era-btn${this.activeEra === 'all' ? ' active' : ''}" data-era="all">All Eras</button>`;
    for (const era of this.data.eras) {
      const btn = document.createElement('button');
      btn.className = 'era-btn' + (this.activeEra === era.id ? ' active' : '');
      btn.dataset.era = era.id;
      btn.textContent = `${era.icon} ${era.name}`;
      inner.appendChild(btn);
    }
  }

  /* ──────────── FILTER PANEL ──────────── */
  renderFilterPanel() {
    const inner = document.getElementById('filter-inner');
    inner.innerHTML = `<button class="cat-btn${this.activeCategories.has('all') ? ' active' : ''}" style="${this.activeCategories.has('all') ? 'background:#e3a820;border-color:#e3a820;' : ''}" data-cat="all">All Categories</button>`;
    for (const cat of this.data.categories) {
      const btn = document.createElement('button');
      const isActive = this.activeCategories.has(cat.id);
      btn.className = 'cat-btn' + (isActive ? ' active' : '');
      btn.dataset.cat = cat.id;
      btn.textContent = `${cat.icon} ${cat.name}`;
      if (isActive) {
        btn.style.background = cat.color + '33';
        btn.style.borderColor = cat.color;
        btn.style.color = cat.color;
      }
      inner.appendChild(btn);
    }
  }

  /* ──────────── TIMELINE RENDER ──────────── */
  renderTimeline() {
    const container = document.getElementById('timeline-events');
    const empty = document.getElementById('timeline-empty');
    const countEl = document.getElementById('result-count');

    if (!this.filtered.length) {
      container.innerHTML = '';
      empty.hidden = false;
      countEl.textContent = '0 events';
      return;
    }
    empty.hidden = true;
    countEl.textContent = `${this.filtered.length} event${this.filtered.length !== 1 ? 's' : ''}`;

    const frag = document.createDocumentFragment();
    let lastEraId = null;
    let lastCentury = null;

    for (let i = 0; i < this.filtered.length; i++) {
      const ev = this.filtered[i];
      const era = this.eraFor(ev.era);
      const cat = this.categoryFor(ev.category);

      // Era marker
      if (ev.era !== lastEraId) {
        lastEraId = ev.era;
        lastCentury = null;
        const marker = document.createElement('div');
        marker.className = 'era-marker';
        marker.style.setProperty('--era-color', era.color || '#888');
        marker.innerHTML = `
          <div class="era-marker-dot" style="
            position:absolute; left:${this._spineLeft()}px; top:50%;
            transform:translate(-50%,-50%);
            width:14px; height:14px; border-radius:50%;
            background:${era.color || '#888'};
            border:2px solid var(--bg);
          "></div>
          <span class="era-marker-icon">${era.icon || '📜'}</span>
          <span class="era-marker-name" style="color:${era.color || '#888'}">${era.name}</span>
          <span class="era-marker-dates">${this.formatYear(era.startYear)} – ${this.formatYear(era.endYear)}</span>`;
        frag.appendChild(marker);
      }

      // Century divider
      const century = Math.floor(ev.year / 100);
      if (century !== lastCentury && !this.searchQuery && this.activeEra === 'all') {
        lastCentury = century;
        const div = document.createElement('div');
        div.className = 'year-divider';
        div.innerHTML = `<span class="year-divider-label">— ${this.formatYear(ev.year)} —</span>`;
        frag.appendChild(div);
      }

      // Event card
      const card = document.createElement('div');
      card.className = `event-card importance-${ev.importance}`;
      card.style.borderLeftColor = era.color || 'var(--gold-dim)';
      card.dataset.id = ev.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${ev.title}, ${this.formatYear(ev.year)}`);

      const countHtml = this.commentCounts[ev.id] !== undefined
        ? `<span class="event-comment-count">💬 ${this.commentCounts[ev.id]}</span>`
        : `<span class="event-comment-count">💬 Add comment</span>`;

      card.innerHTML = `
        <div class="event-card-inner">
          <div class="event-year">
            <span class="event-category-icon">${cat.icon || '•'}</span>
            ${this.highlight(this.yearRange(ev))}
          </div>
          <div class="event-title">${this.highlight(ev.title)}</div>
          ${ev.subtitle ? `<div class="event-subtitle">${this.highlight(ev.subtitle)}</div>` : ''}
          <div class="event-desc">${this.highlight(ev.description || '')}</div>
          <div class="event-footer">
            ${ev.scripture ? `<span class="event-scripture">📖 ${this.escHtml(ev.scripture)}</span>` : ''}
            ${countHtml}
          </div>
        </div>`;

      frag.appendChild(card);
    }

    container.innerHTML = '';
    container.appendChild(frag);

    // Animate cards with stagger
    const cards = container.querySelectorAll('.event-card');
    cards.forEach((c, i) => {
      c.style.animationDelay = `${Math.min(i * 25, 300)}ms`;
    });
  }

  _spineLeft() {
    if (window.innerWidth >= 1024) return 60;
    if (window.innerWidth >= 768) return 40;
    return 28;
  }

  /* ──────────── ZOOM ──────────── */
  updateZoomUI() {
    const lbl = document.getElementById('zoom-label');
    const zIn = document.getElementById('zoom-in');
    const zOut = document.getElementById('zoom-out');
    lbl.textContent = this.ZOOM_LEVELS[this.zoomLevel].name;
    zIn.disabled = this.zoomLevel >= this.ZOOM_LEVELS.length - 1;
    zOut.disabled = this.zoomLevel <= 0;
  }

  /* ──────────── MINIMAP ──────────── */
  updateMinimap() {
    if (!this.filtered.length) return;
    const START_YEAR = -4004, END_YEAR = 2026;
    const totalRange = END_YEAR - START_YEAR;
    const firstYear = this.filtered[0].year;
    const pct = ((firstYear - START_YEAR) / totalRange) * 100;
    document.getElementById('minimap-fill').style.width = `${Math.max(pct, 2)}%`;
    document.getElementById('minimap-start').textContent = this.formatYear(firstYear);
    this.updateMinimapScroll();
  }

  updateMinimapScroll() {
    if (!this.filtered.length) return;
    const START_YEAR = -4004, END_YEAR = 2026;
    const totalRange = END_YEAR - START_YEAR;
    const main = document.getElementById('timeline-main');
    const scrollRatio = (main.scrollTop || window.scrollY) / (document.body.scrollHeight - window.innerHeight || 1);
    const idx = Math.floor(scrollRatio * (this.filtered.length - 1));
    const ev = this.filtered[Math.min(idx, this.filtered.length - 1)];
    if (!ev) return;
    const pct = ((ev.year - START_YEAR) / totalRange) * 100;
    document.getElementById('minimap-thumb').style.left = `${Math.max(0, Math.min(pct, 98))}%`;
  }

  /* ──────────── JUMP TO YEAR ──────────── */
  jumpToYear(year) {
    const n = parseInt(year, 10);
    if (isNaN(n)) { this.showToast('Please enter a valid year'); return; }

    // Find closest event
    let closest = this.filtered[0];
    let minDist = Infinity;
    for (const ev of this.filtered) {
      const d = Math.abs(ev.year - n);
      if (d < minDist) { minDist = d; closest = ev; }
    }
    if (!closest) { this.showToast('No events visible at this zoom level'); return; }

    const card = document.querySelector(`[data-id="${closest.id}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.transition = 'box-shadow 0.3s';
      card.style.boxShadow = '0 0 0 2px var(--gold)';
      setTimeout(() => { card.style.boxShadow = ''; }, 1800);
    }
    this.closeJumpDialog();
    this.showToast(`Jumped to ${this.formatYear(closest.year)} — ${closest.title}`);
  }

  /* ──────────── DIALOGS ──────────── */
  openJumpDialog() {
    document.getElementById('jump-backdrop').hidden = false;
    document.getElementById('jump-year-input').focus();
  }
  closeJumpDialog() {
    document.getElementById('jump-backdrop').hidden = true;
  }
  closeModal() {
    document.getElementById('modal-backdrop').hidden = true;
    document.getElementById('modal-body').innerHTML = '';
  }

  /* ──────────── EVENT MODAL ──────────── */
  openEventModal(eventId) {
    const ev = this.data.events.find(e => e.id === eventId);
    if (!ev) return;
    const era = this.eraFor(ev.era);
    const cat = this.categoryFor(ev.category);

    const body = document.getElementById('modal-body');
    body.innerHTML = `
      <div class="modal-era-badge" style="background:${era.color}22;color:${era.color};border:1px solid ${era.color}44">
        ${era.icon || ''} ${era.name}
      </div>
      <div class="modal-year">${this.yearRange(ev)}</div>
      <div class="modal-title">${cat.icon} ${this.escHtml(ev.title)}</div>
      ${ev.subtitle ? `<div class="modal-subtitle">${this.escHtml(ev.subtitle)}</div>` : ''}
      <div class="modal-desc">${this.escHtml(ev.description || '')}</div>
      ${ev.scripture ? `
        <div class="modal-section-title">Scripture Reference</div>
        <div class="modal-scripture">📖 ${this.escHtml(ev.scripture)}</div>` : ''}
      ${ev.concurrent ? `
        <div class="modal-section-title">🌍 Concurrent World History</div>
        <div class="modal-concurrent">${this.escHtml(ev.concurrent)}</div>` : ''}
      ${ev.tags && ev.tags.length ? `
        <div class="modal-tags">${ev.tags.map(t => `<span class="modal-tag">${this.escHtml(t)}</span>`).join('')}</div>` : ''}
      <div class="comments-section">
        <div class="modal-section-title">💬 Discussion</div>
        <div id="comment-list-${ev.id}" class="comment-list">
          <div class="comments-loading">Loading comments…</div>
        </div>
        <div class="comment-form" id="comment-form-${ev.id}">
          <div class="comment-form-title">Add your perspective</div>
          <input class="comment-field" id="cf-name-${ev.id}" type="text" placeholder="Your name (optional)">
          <div class="comment-type-row">
            <button class="comment-type-btn selected" data-type="support">✅ Support</button>
            <button class="comment-type-btn" data-type="challenge">❓ Challenge</button>
            <button class="comment-type-btn" data-type="question">🔵 Question</button>
            <button class="comment-type-btn" data-type="note">📝 Note</button>
          </div>
          <textarea class="comment-field" id="cf-text-${ev.id}" placeholder="Share your thoughts, evidence, or questions about this historical point…"></textarea>
          <div class="comment-submit-row">
            <button class="comment-submit-btn" id="cf-submit-${ev.id}">Post Comment</button>
            <span class="comment-note">Comments are stored on the server</span>
          </div>
        </div>
      </div>`;

    document.getElementById('modal-backdrop').hidden = false;

    // Comment type toggle
    const typeRow = body.querySelector('.comment-type-row');
    let selectedType = 'support';
    typeRow.addEventListener('click', e => {
      const btn = e.target.closest('.comment-type-btn');
      if (!btn) return;
      typeRow.querySelectorAll('.comment-type-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedType = btn.dataset.type;
    });

    // Submit comment
    document.getElementById(`cf-submit-${ev.id}`).addEventListener('click', () => {
      const name = document.getElementById(`cf-name-${ev.id}`).value.trim();
      const text = document.getElementById(`cf-text-${ev.id}`).value.trim();
      if (!text) { this.showToast('Please enter a comment'); return; }
      this.postComment(ev.id, name || 'Anonymous', selectedType, text);
    });

    // Load existing comments
    this.loadComments(ev.id);
  }

  async loadComments(eventId) {
    const list = document.getElementById(`comment-list-${eventId}`);
    if (!list) return;
    try {
      const res = await fetch(`api/comments.php?event_id=${encodeURIComponent(eventId)}`);
      if (!res.ok) throw new Error('API unavailable');
      const data = await res.json();
      this.renderComments(list, data.comments || []);
      this.commentCounts[eventId] = (data.comments || []).length;
    } catch {
      list.innerHTML = `<div class="comments-unavailable">
        💡 Comments require a PHP server. Open this project with a PHP-capable server (e.g. <code>php -S localhost:8080</code>) to enable discussion.
      </div>`;
    }
  }

  renderComments(listEl, comments) {
    if (!comments.length) {
      listEl.innerHTML = '<div class="comments-empty">No comments yet. Be the first to add your perspective!</div>';
      return;
    }
    listEl.innerHTML = comments.map(c => `
      <div class="comment-item">
        <div class="comment-header">
          <span class="comment-author">${this.escHtml(c.user_name || 'Anonymous')}</span>
          <span class="comment-badge badge-${c.comment_type || 'note'}">${this.commentTypeLabel(c.comment_type)}</span>
          <span class="comment-date">${this.formatDate(c.created_at)}</span>
        </div>
        <div class="comment-text">${this.escHtml(c.comment_text)}</div>
      </div>`).join('');
  }

  commentTypeLabel(type) {
    const map = { support: '✅ Support', challenge: '❓ Challenge', question: '🔵 Question', note: '📝 Note' };
    return map[type] || type;
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
    } catch { return dateStr; }
  }

  async postComment(eventId, name, type, text) {
    const btn = document.getElementById(`cf-submit-${eventId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }
    try {
      const res = await fetch('api/comments.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, user_name: name, comment_type: type, comment_text: text }),
      });
      if (!res.ok) throw new Error('Failed to post');
      const data = await res.json();
      if (data.success) {
        this.showToast('Comment posted! ✅');
        const textEl = document.getElementById(`cf-text-${eventId}`);
        const nameEl = document.getElementById(`cf-name-${eventId}`);
        if (textEl) textEl.value = '';
        if (nameEl) nameEl.value = '';
        this.loadComments(eventId);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (e) {
      this.showToast(`Could not post: ${e.message}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Post Comment'; }
    }
  }

  /* ──────────── EVENT BINDING ──────────── */
  bindEvents() {
    // Search
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    searchInput.addEventListener('input', () => {
      clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => {
        this.searchQuery = searchInput.value;
        searchClear.hidden = !searchInput.value;
        this.applyFilter();
        this.renderTimeline();
        this.updateMinimap();
      }, 220);
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.hidden = true;
      this.searchQuery = '';
      this.applyFilter();
      this.renderTimeline();
      this.updateMinimap();
      searchInput.focus();
    });

    // Zoom
    document.getElementById('zoom-in').addEventListener('click', () => {
      if (this.zoomLevel < this.ZOOM_LEVELS.length - 1) {
        this.zoomLevel++;
        this.applyFilter(); this.renderTimeline(); this.updateMinimap(); this.updateZoomUI();
      }
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
      if (this.zoomLevel > 0) {
        this.zoomLevel--;
        this.applyFilter(); this.renderTimeline(); this.updateMinimap(); this.updateZoomUI();
      }
    });

    // Era nav
    document.getElementById('era-nav-inner').addEventListener('click', e => {
      const btn = e.target.closest('.era-btn');
      if (!btn) return;
      this.activeEra = btn.dataset.era;
      document.querySelectorAll('.era-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.applyFilter(); this.renderTimeline(); this.updateMinimap();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Filter panel toggle
    document.getElementById('filter-toggle').addEventListener('click', () => {
      const panel = document.getElementById('filter-panel');
      const btn = document.getElementById('filter-toggle');
      panel.hidden = !panel.hidden;
      btn.classList.toggle('active', !panel.hidden);
    });

    // Category filter
    document.getElementById('filter-inner').addEventListener('click', e => {
      const btn = e.target.closest('.cat-btn');
      if (!btn) return;
      const cat = btn.dataset.cat;
      if (cat === 'all') {
        this.activeCategories = new Set(['all']);
      } else {
        this.activeCategories.delete('all');
        if (this.activeCategories.has(cat)) {
          this.activeCategories.delete(cat);
          if (!this.activeCategories.size) this.activeCategories.add('all');
        } else {
          this.activeCategories.add(cat);
        }
      }
      this.renderFilterPanel();
      this.applyFilter(); this.renderTimeline(); this.updateMinimap();
    });

    // Timeline card clicks (delegated)
    document.getElementById('timeline-events').addEventListener('click', e => {
      const card = e.target.closest('.event-card');
      if (card) this.openEventModal(card.dataset.id);
    });
    document.getElementById('timeline-events').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.event-card');
        if (card) { e.preventDefault(); this.openEventModal(card.dataset.id); }
      }
    });

    // Clear filters
    document.getElementById('clear-filters').addEventListener('click', () => {
      this.searchQuery = '';
      this.activeEra = 'all';
      this.activeCategories = new Set(['all']);
      this.zoomLevel = 2;
      document.getElementById('search-input').value = '';
      document.getElementById('search-clear').hidden = true;
      document.querySelectorAll('.era-btn').forEach(b => b.classList.toggle('active', b.dataset.era === 'all'));
      this.renderEraNav(); this.renderFilterPanel();
      this.applyFilter(); this.renderTimeline(); this.updateMinimap(); this.updateZoomUI();
    });

    // Jump FAB
    document.getElementById('jump-fab').addEventListener('click', () => this.openJumpDialog());
    document.getElementById('jump-close').addEventListener('click', () => this.closeJumpDialog());
    document.getElementById('jump-go').addEventListener('click', () => {
      this.jumpToYear(document.getElementById('jump-year-input').value);
    });
    document.getElementById('jump-year-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.jumpToYear(e.target.value);
    });
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => this.jumpToYear(btn.dataset.year));
    });
    document.getElementById('jump-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeJumpDialog();
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeJumpDialog();
      }
    });

    // Scroll to top
    const scrollTopBtn = document.getElementById('scroll-top');
    window.addEventListener('scroll', () => {
      scrollTopBtn.hidden = window.scrollY < 400;
      this.updateMinimapScroll();
    }, { passive: true });
    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
}

/* ──────────── BOOT ──────────── */
document.addEventListener('DOMContentLoaded', () => {
  const app = new ARKRapid();
  app.init();
  window._ark = app; // expose for debugging
});
