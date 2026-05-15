/* ============================================================
   TYMORA — shop.js
   All interactivity: search, sort, filter, pagination, carousel
   Reads seed data from window.SHOP_DATA (injected by HBS)
   ============================================================ */

(function () {
  'use strict';

  /* ── DATA ── */
  const DATA = window.SHOP_DATA || { products: [], featured: [] };

  /* ── STATE ── */
  const state = {
    query:    '',
    sort:     '',
    cat:      '',
    brand:    '',
    style:    '',
    avail:    '',
    priceMin: null,
    priceMax: null,
    page:     1,
    perPage:  8,
    filtered: [...DATA.products],
    carouselIdx: 0,
  };

  /* ── DOM REFS ── */
  const $  = (id) => document.getElementById(id);
  const els = {
    searchInput:  $('searchInput'),
    clearBtn:     $('clearBtn'),
    searchBtn:    $('searchBtn'),
    sortSelect:   $('sortSelect'),
    filterToggle: $('filterToggle'),
    filterPanel:  $('filterPanel'),
    catFilter:    $('catFilter'),
    brandFilter:  $('brandFilter'),
    priceMin:     $('priceMin'),
    priceMax:     $('priceMax'),
    styleFilter:  $('styleFilter'),
    availFilter:  $('availFilter'),
    btnApply:     $('btnApply'),
    btnReset:     $('btnReset'),
    activeTags:   $('activeTags'),
    productsGrid: $('productsGrid'),
    noResults:    $('noResults'),
    countDisplay: $('countDisplay'),
    totalDisplay: $('totalDisplay'),
    paginationWrap: $('paginationWrap'),
    featuredTrack:  $('featuredTrack'),
    carouselPrev:   $('carouselPrev'),
    carouselNext:   $('carouselNext'),
    carouselDots:   $('carouselDots'),
  };

  /* ============================================================
     HELPERS
     ============================================================ */

  function stars(rating) {
    const full  = Math.round(rating);
    const empty = 5 - full;
    return '★'.repeat(full) + '☆'.repeat(empty);
  }

  function fmt(n) {
    return '₹' + n.toLocaleString('en-IN');
  }

  function cardHTML(p, isFeatured = false) {
    const cls = isFeatured ? 'featured-card' : 'prod-card';
    // Lowercase for CSS class matching if needed, or just use as is if CSS handles it
    const badgeClass = p.badge ? `badge-${p.badge.toLowerCase()}` : '';
    
    return `
      <div class="${cls}">
        <div class="prod-img-wrap">
          ${p.badge ? `<span class="prod-badge ${badgeClass}">${p.badge}</span>` : ''}
          <div class="card-wish" data-wished="false" title="Add to Wishlist">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
                       a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
                       1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <img src="${p.img}" alt="${p.name}" loading="lazy">
          <div class="prod-img-overlay"></div>
          <button class="quick-add">+ Add to Bag</button>
        </div>
        <div class="prod-info">
          <div class="prod-atelier">${p.brand}</div>
          <div class="prod-rating">★ ${p.rating} ${p.reviews !== undefined ? `<span class="rating-count">(${p.reviews})</span>` : ''}</div>
          <div class="prod-name">${p.name}</div>
          <div class="prod-price">
            ${fmt(p.price)}
            ${p.oldPrice ? `<span class="prod-price-old">${fmt(p.oldPrice)}</span>` : ''}
          </div>
          <button class="prod-btn">View Details</button>
        </div>
      </div>`;
  }

  /* ============================================================
     SEARCH
     ============================================================ */

  if (els.searchInput) {
    els.searchInput.addEventListener('input', function () {
      els.clearBtn.classList.toggle('visible', this.value.length > 0);
    });

    els.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  }

  if (els.searchBtn) els.searchBtn.addEventListener('click', doSearch);
  if (els.clearBtn)  els.clearBtn.addEventListener('click', clearSearch);

  function doSearch() {
    state.query = els.searchInput.value.trim().toLowerCase();
    state.page  = 1;
    applyFilters();
  }

  function clearSearch() {
    els.searchInput.value = '';
    els.clearBtn.classList.remove('visible');
    state.query = '';
    state.page  = 1;
    applyFilters();
  }

  /* ============================================================
     FILTER PANEL TOGGLE
     ============================================================ */

  if (els.filterToggle) {
    els.filterToggle.addEventListener('click', () => {
      els.filterPanel.classList.toggle('open');
      els.filterToggle.classList.toggle('active');
    });
  }

  /* ============================================================
     APPLY / RESET FILTERS
     ============================================================ */

  if (els.sortSelect)  els.sortSelect.addEventListener('change',  applyFilters);
  if (els.catFilter)   els.catFilter.addEventListener('change',   applyFilters);
  if (els.brandFilter) els.brandFilter.addEventListener('change', applyFilters);
  if (els.styleFilter) els.styleFilter.addEventListener('change', applyFilters);
  if (els.availFilter) els.availFilter.addEventListener('change', applyFilters);
  if (els.priceMin)    els.priceMin.addEventListener('input',     applyFilters);
  if (els.priceMax)    els.priceMax.addEventListener('input',     applyFilters);
  if (els.btnApply)    els.btnApply.addEventListener('click',     applyFilters);
  if (els.btnReset)    els.btnReset.addEventListener('click',     resetFilters);

  function applyFilters() {
    state.query    = els.searchInput ? els.searchInput.value.trim().toLowerCase() : '';
    state.sort     = els.sortSelect ? els.sortSelect.value : '';
    state.cat      = els.catFilter ? els.catFilter.value : '';
    state.brand    = els.brandFilter ? els.brandFilter.value : '';
    state.style    = els.styleFilter ? els.styleFilter.value : '';
    state.avail    = els.availFilter ? els.availFilter.value : '';
    state.priceMin = els.priceMin ? (parseFloat(els.priceMin.value) || null) : null;
    state.priceMax = els.priceMax ? (parseFloat(els.priceMax.value) || null) : null;

    let result = DATA.products.filter((p) => {
      if (state.query && !p.name.toLowerCase().includes(state.query) &&
                         !p.brand.toLowerCase().includes(state.query)) return false;
      if (state.cat   && p.cat   !== state.cat)                return false;
      if (state.brand && p.brand.toLowerCase() !== state.brand) return false;
      if (state.style && p.style !== state.style)              return false;
      if (state.avail === 'instock' && p.avail !== 'instock')  return false;
      if (state.avail === 'sale'    && p.avail !== 'sale')     return false;
      if (state.avail === 'new'     && p.badge !== 'new')      return false;
      if (state.priceMin !== null   && p.price < state.priceMin) return false;
      if (state.priceMax !== null   && p.price > state.priceMax) return false;
      return true;
    });

    const sortMap = {
      'price-asc':  (a, b) => a.price  - b.price,
      'price-desc': (a, b) => b.price  - a.price,
      'az':         (a, b) => a.name.localeCompare(b.name),
      'za':         (a, b) => b.name.localeCompare(a.name),
      'rating':     (a, b) => b.rating - a.rating,
      'newest':     (a, b) => b.id     - a.id,
    };
    if (sortMap[state.sort]) result.sort(sortMap[state.sort]);

    state.filtered = result;
    state.page = 1;

    renderActiveTags();
    renderPage();
  }

  function resetFilters() {
    if (els.catFilter)   els.catFilter.value    = '';
    if (els.brandFilter) els.brandFilter.value  = '';
    if (els.styleFilter) els.styleFilter.value  = '';
    if (els.availFilter) els.availFilter.value  = '';
    if (els.sortSelect)  els.sortSelect.value   = '';
    if (els.priceMin)    els.priceMin.value     = '';
    if (els.priceMax)    els.priceMax.value     = '';
    clearSearch();
  }

  /* ============================================================
     ACTIVE FILTER TAGS
     ============================================================ */

  function renderActiveTags() {
    if (!els.activeTags) return;
    els.activeTags.innerHTML = '';

    const tags = [];
    if (state.query)    tags.push({ label: `"${state.query}"`,   clear: clearSearch });
    if (state.cat)      tags.push({ label: state.cat,    clear: () => { if(els.catFilter) els.catFilter.value = ''; applyFilters(); } });
    if (state.brand)    tags.push({ label: state.brand,  clear: () => { if(els.brandFilter) els.brandFilter.value = ''; applyFilters(); } });
    if (state.style)    tags.push({ label: state.style,  clear: () => { if(els.styleFilter) els.styleFilter.value = ''; applyFilters(); } });
    if (state.avail)    tags.push({ label: state.avail,  clear: () => { if(els.availFilter) els.availFilter.value = ''; applyFilters(); } });
    if (state.priceMin || state.priceMax) {
      tags.push({
        label: `₹${state.priceMin || 0} – ₹${state.priceMax || '∞'}`,
        clear: () => { if(els.priceMin) els.priceMin.value = ''; if(els.priceMax) els.priceMax.value = ''; applyFilters(); },
      });
    }

    if (!tags.length) return;

    const lbl = document.createElement('span');
    lbl.className   = 'active-filters-label';
    lbl.textContent = 'Active:';
    els.activeTags.appendChild(lbl);

    tags.forEach((t) => {
      const tag = document.createElement('div');
      tag.className = 'filter-tag';
      tag.innerHTML = `${t.label} <span>✕</span>`;
      tag.addEventListener('click', t.clear);
      els.activeTags.appendChild(tag);
    });
  }

  /* ============================================================
     RENDER PRODUCTS PAGE
     ============================================================ */

  function renderPage() {
    if (!els.productsGrid) return;
    const { filtered, page, perPage } = state;
    const start     = (page - 1) * perPage;
    const end       = start + perPage;
    const pageItems = filtered.slice(start, end);

    const shown = Math.min(end, filtered.length) - start;
    if (els.countDisplay) els.countDisplay.textContent = Math.max(0, shown);
    if (els.totalDisplay) els.totalDisplay.textContent = filtered.length;

    if (!filtered.length) {
      els.productsGrid.innerHTML = '';
      if (els.noResults) els.noResults.classList.add('visible');
    } else {
      if (els.noResults) els.noResults.classList.remove('visible');
      els.productsGrid.innerHTML = pageItems
        .map((p, i) => {
          const html = cardHTML(p);
          return html.replace('class="prod-card"',
            `class="prod-card" style="animation-delay:${i * 0.06}s"`);
        })
        .join('');

      /* wishlist listeners */
      els.productsGrid.querySelectorAll('.card-wish').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          btn.classList.toggle('wished');
        });
      });
    }

    renderPagination();
  }

  /* ============================================================
     PAGINATION
     ============================================================ */

  function renderPagination() {
    if (!els.paginationWrap) return;
    const total = Math.ceil(state.filtered.length / state.perPage);
    const cur   = state.page;

    if (total <= 1) { els.paginationWrap.innerHTML = ''; return; }

    const range  = getPageRange(cur, total);
    let   html   = '';

    html += `<button class="page-btn" ${cur === 1 ? 'disabled' : ''} data-page="${cur - 1}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                 <polyline points="15 18 9 12 15 6"/>
               </svg>
             </button>`;

    range.forEach((p) => {
      if (p === '...') {
        html += `<span class="page-dots">···</span>`;
      } else {
        html += `<button class="page-btn ${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }
    });

    html += `<button class="page-btn" ${cur === total ? 'disabled' : ''} data-page="${cur + 1}">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
                 <polyline points="9 18 15 12 9 6"/>
               </svg>
             </button>`;

    els.paginationWrap.innerHTML = html;

    els.paginationWrap.querySelectorAll('.page-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.page = parseInt(btn.dataset.page, 10);
        renderPage();
        document.querySelector('.products-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function getPageRange(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (cur <= 4)        return [1, 2, 3, 4, 5, '...', total];
    if (cur >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', cur - 1, cur, cur + 1, '...', total];
  }

  /* ============================================================
     FEATURED CAROUSEL
     ============================================================ */

  function renderFeatured() {
    if (!els.featuredTrack) return;
    els.featuredTrack.innerHTML = DATA.featured
      .map((p) => cardHTML(p, true))
      .join('');

    els.featuredTrack.querySelectorAll('.card-wish').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.toggle('wished');
      });
    });

    if (els.carouselPrev) els.carouselPrev.addEventListener('click', () => moveCarousel(-1));
    if (els.carouselNext) els.carouselNext.addEventListener('click', () => moveCarousel(1));

    renderCarouselDots();
    updateCarousel();
  }

  function getVisibleCards() {
    const outer = document.querySelector('.featured-track-outer');
    const w = outer ? outer.offsetWidth : 800;
    if (w < 560) return 1;
    if (w < 900) return 2;
    return 4;
  }

  function moveCarousel(dir) {
    const visible = getVisibleCards();
    const max     = Math.max(0, DATA.featured.length - visible);
    state.carouselIdx = Math.max(0, Math.min(max, state.carouselIdx + dir));
    updateCarousel();
    renderCarouselDots();
  }

  function updateCarousel() {
    if (!els.featuredTrack) return;
    const cards = els.featuredTrack.querySelectorAll('.featured-card');
    if (!cards.length) return;

    const cardW = cards[0].offsetWidth + 24;
    els.featuredTrack.style.transform = `translateX(-${state.carouselIdx * cardW}px)`;

    const visible = getVisibleCards();
    const max     = Math.max(0, DATA.featured.length - visible);

    if (els.carouselPrev) {
      els.carouselPrev.disabled = state.carouselIdx === 0;
      els.carouselPrev.style.opacity = state.carouselIdx === 0 ? '0.35' : '1';
    }
    if (els.carouselNext) {
      els.carouselNext.disabled = state.carouselIdx >= max;
      els.carouselNext.style.opacity = state.carouselIdx >= max ? '0.35' : '1';
    }
  }

  function renderCarouselDots() {
    if (!els.carouselDots) return;
    const visible   = getVisibleCards();
    const totalDots = Math.max(0, DATA.featured.length - visible + 1);

    els.carouselDots.innerHTML = Array.from({ length: totalDots }, (_, i) => {
      const active = i === state.carouselIdx ? 'active' : '';
      return `<div class="cdot ${active}" data-idx="${i}"></div>`;
    }).join('');

    els.carouselDots.querySelectorAll('.cdot').forEach((dot) => {
      dot.addEventListener('click', () => {
        state.carouselIdx = parseInt(dot.dataset.idx, 10);
        updateCarousel();
        renderCarouselDots();
      });
    });
  }

  /* ── touch / swipe ── */
  let touchStartX = 0;
  const trackWrap = document.querySelector('.featured-track-wrap');
  if (trackWrap) {
    trackWrap.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    trackWrap.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) moveCarousel(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  window.addEventListener('resize', () => {
    updateCarousel();
    renderCarouselDots();
  });

  /* ============================================================
     INIT
     ============================================================ */
  applyFilters();
  renderFeatured();

})();
