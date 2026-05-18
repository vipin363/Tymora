
'use strict';


window.__cartState     = window.__cartState     || {};   
window.__wishlistState = window.__wishlistState || {};  


let ALL_VARIANTS  = [];
let activeVariant = null;


const PRODUCT_ID = window.PD_DATA?.productId;


async function checkProductActive() {
  if (!PRODUCT_ID) return true;
  try {
    const res  = await fetch(`/user/api/product-status/${PRODUCT_ID}`);
    const data = await res.json();
    if (!data.active) {
      showInactiveOverlay();
      return false;
    }
    return true;
  } catch {
    
    return true;
  }
}


function showInactiveOverlay() {
  
  document.getElementById('pd-inactive-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pd-inactive-overlay';
  Object.assign(overlay.style, {
    position:        'fixed',
    inset:           '0',
    background:      'rgba(0,0,0,0.85)',
    zIndex:          '999999',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             '16px',
    fontFamily:      "'Montserrat', sans-serif",
    color:           '#fff',
  });

  overlay.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
         stroke="var(--gold, #d4af37)" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <div style="font-size:18px;font-weight:700;letter-spacing:2px;color:var(--gold,#d4af37)">
      PRODUCT UNAVAILABLE
    </div>
    <div style="font-size:13px;color:#aaa;letter-spacing:1px;text-align:center;max-width:300px">
      This product is no longer available.<br>Redirecting you to the shop…
    </div>
    <div style="width:200px;height:2px;background:#333;border-radius:2px;margin-top:8px;overflow:hidden">
      <div id="pd-redirect-bar" style="height:100%;width:0%;background:var(--gold,#d4af37);
           transition:width 2s linear;border-radius:2px;"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  
  requestAnimationFrame(() => {
    document.getElementById('pd-redirect-bar').style.width = '100%';
  });

 
  setTimeout(() => {
    window.location.href = '/user/shop';
  }, 2000);
}


async function guardedAction(fn) {
  const active = await checkProductActive();
  if (!active) return;
  await fn();
}

document.addEventListener('DOMContentLoaded', () => {
  ALL_VARIANTS  = window.PD_DATA?.variants || [];
  activeVariant = ALL_VARIANTS.find(v => v.isDefault) || ALL_VARIANTS[0] || null;

  
  if (window.PD_DATA?.productId) {
    window.__wishlistState[window.PD_DATA.productId] = !!window.PD_DATA.wished;
  }

  
  ALL_VARIANTS.forEach(v => {
    if (v.inCart) window.__cartState[v.id] = true;
  });

  
  document.querySelectorAll('#pdRelatedGrid .prod-card').forEach(card => {
    const pid = card.dataset.id;
    const wishBtn = card.querySelector('.card-wish[data-id]');
    const cartBtn = card.querySelector('.quick-add[data-variant-id]');

    if (pid && wishBtn?.classList.contains('wished')) {
      window.__wishlistState[pid] = true;
    }
    if (cartBtn?.dataset.variantId && cartBtn?.dataset.inCart === 'true') {
      window.__cartState[cartBtn.dataset.variantId] = true;
    }
  });


  initGallery();
  initVariantPicker();
  initAccordion();
  initWishlist();
  initShare();
  initFadeIn();
  initAddToCart();
  initRelated();
});


function setCartState(variantId, inCart) {
  if (inCart) {
    window.__cartState[variantId] = true;
  } else {
    delete window.__cartState[variantId];
  }
 
  const v = ALL_VARIANTS.find(v => v.id === variantId);
  if (v) v.inCart = inCart;

  
  syncQuickAddButtons(variantId, inCart);
}


function syncQuickAddButtons(variantId, inCart) {
  document.querySelectorAll(`.quick-add[data-variant-id="${variantId}"]`).forEach(btn => {
    applyQuickAddState(btn, inCart);
  });
}


function applyQuickAddState(btn, inCart) {
  if (inCart) {
    btn.textContent       = 'View in Cart';
    btn.dataset.inCart    = 'true';
    btn.style.background  = 'transparent';
    btn.style.color       = 'var(--gold)';
    btn.style.border      = '1px solid var(--gold)';
  } else {
    btn.textContent       = '+ Add to Bag';
    btn.dataset.inCart    = '';
    btn.style.background  = '';
    btn.style.color       = '';
    btn.style.border      = '';
  }
}


async function handleQuickAdd(btn) {
  const pid = btn.dataset.id;
  const vid = btn.dataset.variantId;
  if (!pid || !vid) return;

  
  if (btn.dataset.inCart === 'true' || window.__cartState[vid]) {
    window.location.href = '/user/cart';
    return;
  }

  
  const active = await checkProductActive();
  if (!active) return;

  try {
    const res  = await fetch('/user/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: pid, variantId: vid, quantity: 1 }),
    });
    const data = await res.json();

    if (data.redirect) { window.location.href = data.redirect; return; }
    if (!data.success) return showToast(data.message || 'Cannot add to cart', 'muted');

    
    setCartState(vid, true);

    
    updateCartCountBadge(data.cartCount);

    showToast('Added to cart!', 'gold');
  } catch {
    showToast('Something went wrong', 'muted');
  }
}

function updateCartCountBadge(count) {
  document.querySelectorAll('.cart-count-badge, #cartCount, [data-cart-count]').forEach(el => {
    el.textContent   = count;
    el.style.display = count > 0 ? '' : 'none';
  });
}


function initVariantPicker() {
  if (!ALL_VARIANTS.length) return;
  renderVariantPicker();
}

function getUniqueAttrs(variants) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  return {
    strapColors:    uniq(variants.map(v => v.strapColor)),
    dialColors:     uniq(variants.map(v => v.dialColor)),
    caseColors:     uniq(variants.map(v => v.caseColor)),
    strapMaterials: uniq(variants.map(v => v.strapMaterial)),
    caseMaterials:  uniq(variants.map(v => v.caseMaterial)),
    sizes:          uniq(variants.map(v => v.size)),
  };
}

function filterVariants(selections) {
  return ALL_VARIANTS.filter(v => {
    for (const [key, val] of Object.entries(selections)) {
      if (val && v[key] !== val) return false;
    }
    return true;
  });
}

function renderVariantPicker() {
  const picker = document.getElementById('pdVariantPicker');
  if (!picker) return;

  const attrs = getUniqueAttrs(ALL_VARIANTS);
  const sel = {
    strapColor:    activeVariant?.strapColor    || '',
    dialColor:     activeVariant?.dialColor     || '',
    caseColor:     activeVariant?.caseColor     || '',
    strapMaterial: activeVariant?.strapMaterial || '',
    caseMaterial:  activeVariant?.caseMaterial  || '',
    size:          activeVariant?.size          || '',
  };

  let html = '';
  if (attrs.strapColors.length)    html += buildColorGroup('STRAP COLOR',    'strapColor',    attrs.strapColors,    sel.strapColor,    sel);
  if (attrs.dialColors.length)     html += buildColorGroup('DIAL COLOR',     'dialColor',     attrs.dialColors,     sel.dialColor,     sel);
  if (attrs.caseColors.length)     html += buildColorGroup('CASE COLOR',     'caseColor',     attrs.caseColors,     sel.caseColor,     sel);
  if (attrs.strapMaterials.length) html += buildPillGroup ('STRAP MATERIAL', 'strapMaterial', attrs.strapMaterials, sel.strapMaterial, sel);
  if (attrs.caseMaterials.length)  html += buildPillGroup ('CASE MATERIAL',  'caseMaterial',  attrs.caseMaterials,  sel.caseMaterial,  sel);
  if (attrs.sizes.length)          html += buildPillGroup ('CASE SIZE',      'size',          attrs.sizes,          sel.size,          sel);

  picker.innerHTML = html;

 picker.querySelectorAll('.pd-swatch[data-attr]').forEach(el => {
    el.addEventListener('click', () => guardedAction(() => onAttrSelect(el.dataset.attr, el.dataset.val)));
  });
  picker.querySelectorAll('.pd-pill[data-attr]').forEach(el => {
    if (!el.classList.contains('disabled')) {
      el.addEventListener('click', () => guardedAction(() => onAttrSelect(el.dataset.attr, el.dataset.val)));
    }
  });
}

function buildColorGroup(label, attr, values, currentVal, currentSel) {
  const selWithout = { ...currentSel, [attr]: '' };
  const swatches = values.map(val => {
    const compatible = filterVariants({ ...selWithout, [attr]: val }).length > 0;
    const isActive   = val === currentVal;
    const hex        = colorToHex(val);
    const cls        = `pd-swatch${isActive ? ' active' : ''}${!compatible ? ' disabled' : ''}`;
    return `<div class="${cls}" data-attr="${attr}" data-val="${val}" style="background:${hex}" title="${val}"></div>`;
  }).join('');
  return `
    <div class="pd-variant-group">
      <div class="pd-variant-label">${label} — <span class="pd-variant-selected">${currentVal || '—'}</span></div>
      <div class="pd-swatches pd-swatch-group">${swatches}</div>
    </div>`;
}

function buildPillGroup(label, attr, values, currentVal, currentSel) {
  const selWithout = { ...currentSel, [attr]: '' };
  const pills = values.map(val => {
    const compatible = filterVariants({ ...selWithout, [attr]: val }).length > 0;
    const isActive   = val === currentVal;
    const cls        = `pd-pill${isActive ? ' active' : ''}${!compatible ? ' disabled' : ''}`;
    return `<div class="${cls}" data-attr="${attr}" data-val="${val}">${val}</div>`;
  }).join('');
  return `
    <div class="pd-variant-group">
      <div class="pd-variant-label">${label} — <span class="pd-variant-selected">${currentVal || '—'}</span></div>
      <div class="pd-pills pd-pill-group">${pills}</div>
    </div>`;
}

function onAttrSelect(attr, val) {
  const newSel = {
    strapColor:    activeVariant?.strapColor    || '',
    dialColor:     activeVariant?.dialColor     || '',
    caseColor:     activeVariant?.caseColor     || '',
    strapMaterial: activeVariant?.strapMaterial || '',
    caseMaterial:  activeVariant?.caseMaterial  || '',
    size:          activeVariant?.size          || '',
    [attr]: val,
  };

  let matches = filterVariants(newSel);
  if (!matches.length) matches = filterVariants({ [attr]: val });

  if (matches.length) {
    activeVariant =
      matches.find(v => v.stock > 0 && v.isDefault) ||
      matches.find(v => v.stock > 0) ||
      matches[0];
  }

  renderVariantPicker();
  applyVariantToPage(activeVariant);
}


function applyVariantToPage(v) {
  if (!v) return;

  window.PD_DATA.variantId = v.id;

  const priceEl  = document.getElementById('pdPrice');
  const oldEl    = document.getElementById('pdOldPrice');
  const discEl   = document.getElementById('pdDiscountPill');
  const badgeEl  = document.getElementById('pdDiscountBadge');
  const stickyEl = document.getElementById('pdStickyPrice');

  if (priceEl)  priceEl.textContent  = '₹' + fmt(v.salePrice);
  if (stickyEl) stickyEl.textContent = '₹' + fmt(v.salePrice);

  if (oldEl && discEl) {
    if (v.originalPrice > v.salePrice) {
      oldEl.textContent  = '₹' + fmt(v.originalPrice);
      discEl.textContent = v.discountPct + '% OFF';
      oldEl.style.display  = '';
      discEl.style.display = '';
    } else {
      oldEl.style.display  = 'none';
      discEl.style.display = 'none';
    }
  }
  if (badgeEl) {
    badgeEl.textContent   = v.discountPct > 0 ? `-${v.discountPct}% OFF` : '';
    badgeEl.style.display = v.discountPct > 0 ? '' : 'none';
  }

  const skuEl = document.getElementById('pdSku');
  if (skuEl) skuEl.textContent = v.sku || v.id.slice(-8).toUpperCase();

  const availEl = document.getElementById('pdAvailText');
  const stockEl = document.getElementById('pdStockNote');
  const inStock = v.stock > 0;
  if (availEl) {
    availEl.textContent = inStock ? '● In Stock' : '● Out of Stock';
    availEl.className   = 'pd-meta-val ' + (inStock ? 'instock' : 'outofstock');
  }
  if (stockEl) {
    stockEl.textContent = (inStock && v.stock <= 10) ? `Only ${v.stock} left in stock` : '';
  }

  updateGallery(v.images);
  updateSpecTable(v);
  updateCartBtn(v);
}

function updateGallery(images) {
  if (!images?.length) return;
  const mainImg    = document.getElementById('pdMainImg');
  const thumbsWrap = document.getElementById('pdThumbs');
  if (mainImg) {
    mainImg.style.opacity = '0';
    setTimeout(() => { mainImg.src = images[0]; mainImg.style.opacity = '1'; }, 180);
  }
  if (thumbsWrap) {
    thumbsWrap.innerHTML = images.map((src, i) => `
      <div class="pd-thumb ${i === 0 ? 'active' : ''}" data-src="${src}">
        <img src="${src}" alt="View ${i}" loading="lazy">
      </div>`).join('');
    thumbsWrap.querySelectorAll('.pd-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const src = thumb.dataset.src;
        if (!src || !mainImg) return;
        mainImg.style.opacity = '0';
        setTimeout(() => { mainImg.src = src; mainImg.style.opacity = '1'; }, 180);
        thumbsWrap.querySelectorAll('.pd-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }
}

function updateSpecTable(v) {
  const tbl = document.getElementById('pdSpecTable');
  if (!tbl) return;
  const rows = [
    ['SKU',            v.sku],
    ['Size',           v.size],
    ['Strap Color',    v.strapColor],
    ['Dial Color',     v.dialColor],
    ['Case Color',     v.caseColor],
    ['Strap Material', v.strapMaterial],
    ['Case Material',  v.caseMaterial],
    ['Availability',   v.stock > 0 ? `In Stock (${v.stock} units)` : 'Out of Stock'],
  ].filter(([, val]) => val);
  tbl.innerHTML = rows.map(([k, val]) => `<tr><td>${k}</td><td>${val}</td></tr>`).join('');
}


function updateCartBtn(v) {
  const label   = document.getElementById('pdCartBtnLabel');
  const cartBtn = document.getElementById('pdAddToCart');
  if (!label || !cartBtn) return;

  const inCart = !!window.__cartState[v.id];

  if (v.stock <= 0) {
    label.textContent     = 'Out of Stock';
    cartBtn.disabled      = true;
    cartBtn.style.opacity = '0.5';
    cartBtn.style.cursor  = 'not-allowed';
  } else if (inCart) {
    label.textContent     = 'View in Cart';
    cartBtn.disabled      = false;
    cartBtn.style.opacity = '';
    cartBtn.style.cursor  = '';
  } else {
    label.textContent     = 'Add to Cart';
    cartBtn.disabled      = false;
    cartBtn.style.opacity = '';
    cartBtn.style.cursor  = '';
  }
}

function colorToHex(color) {
  if (!color) return '#888';
  if (color.startsWith('#')) return color;
  const map = {
    black:'#111', white:'#f5f5f5', brown:'#4a3728', gold:'#d4af37',
    silver:'#c0c0c0', blue:'#1b3a6b', navy:'#1b3a6b', green:'#2c4a2e',
    red:'#c0392b', pink:'#e91e8c', grey:'#777', gray:'#777',
    rose:'#b76e79', bronze:'#cd7f32', copper:'#b87333', titanium:'#878681',
  };
  return map[color.toLowerCase().split(' ')[0]] || '#888';
}

function fmt(n) { return Number(n).toLocaleString('en-IN'); }


function initGallery() {
  const mainWrap = document.querySelector('.pd-main-img-wrap');
  const mainImg  = document.getElementById('pdMainImg');
  if (!mainImg) return;

  mainImg.style.transition = 'opacity 0.18s ease';

 document.querySelectorAll('.pd-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => guardedAction(async () => {
      const src = thumb.dataset.src;
      if (!src) return;
      mainImg.style.opacity = '0';
      setTimeout(() => { mainImg.src = src; mainImg.style.opacity = '1'; }, 180);
      document.querySelectorAll('.pd-thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    }));
  });

  if (mainWrap) {
    mainWrap.addEventListener('mousemove', (e) => {
      const rect = mainWrap.getBoundingClientRect();
      mainWrap.style.setProperty('--zoom-x', ((e.clientX - rect.left) / rect.width  * 100).toFixed(2) + '%');
      mainWrap.style.setProperty('--zoom-y', ((e.clientY - rect.top)  / rect.height * 100).toFixed(2) + '%');
    });
    mainWrap.addEventListener('mouseenter', () => mainWrap.classList.add('zoom-active'));
    mainWrap.addEventListener('mouseleave', () => mainWrap.classList.remove('zoom-active'));
    mainWrap.addEventListener('click', () => openLightbox(mainImg.src));
  }

  if (activeVariant) applyVariantToPage(activeVariant);
}


function initAddToCart() {
  const cartBtn = document.getElementById('pdAddToCart');
  const buyBtn  = document.getElementById('pdBuyNow');

  async function doAddToCart(redirectAfter) {
    const productId = window.PD_DATA?.productId;
    const variantId = window.PD_DATA?.variantId;
    if (!productId || !variantId) return showToast('Variant not found', 'muted');

    
    if (window.__cartState[variantId] && !redirectAfter) {
      window.location.href = '/user/cart';
      return;
    }

   
    const active = await checkProductActive();
    if (!active) return;

    try {
      const res  = await fetch('/user/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, variantId, quantity: 1 }),
      });
      const data = await res.json();

      if (data.redirect) { window.location.href = data.redirect; return; }
      if (!data.success) return showToast(data.message || 'Cannot add to cart', 'muted');

    
      setCartState(variantId, true);
      updateCartBtn(activeVariant);
      updateCartCountBadge(data.cartCount);

      showToast('Added to cart!', 'gold');
      if (redirectAfter) setTimeout(() => window.location.href = '/user/cart', 500);

    } catch (e) {
      console.error(e);
      showToast('Something went wrong', 'muted');
    }
  }

  cartBtn?.addEventListener('click', () => doAddToCart(false));
  buyBtn?.addEventListener('click',  () => doAddToCart(true));
}


function syncAllHearts(productId, wished) {
  window.__wishlistState[productId] = wished;


  document.querySelectorAll(`.card-wish[data-id="${productId}"]`).forEach(btn => {
    btn.classList.toggle('wished', wished);
    btn.title = wished ? 'Remove from Wishlist' : 'Add to Wishlist';
    const svg = btn.querySelector('svg path');
    if (svg) svg.setAttribute('fill', wished ? 'currentColor' : 'none');
  });


  const pdBtn = document.getElementById('pdWishBtn');
  if (pdBtn && pdBtn.dataset.id === productId) {
    pdBtn.classList.toggle('wished', wished);
    pdBtn.title             = wished ? 'Remove from Wishlist' : 'Add to Wishlist';
    pdBtn.style.background  = wished ? '#e05252' : '';
    pdBtn.style.borderColor = wished ? '#e05252' : '';
    const path = pdBtn.querySelector('svg path');
    if (path) path.setAttribute('fill', wished ? '#fff' : 'none');
  }
}

function initWishlist() {
  const btn = document.getElementById('pdWishBtn');
  if (!btn) return;
  const productId = btn.dataset.id;

  
  syncAllHearts(productId, window.__wishlistState[productId] ?? window.PD_DATA?.wished ?? false);


  btn.addEventListener('click', async () => { await guardedAction(() => toggleWish(productId)); });

 
  document.querySelectorAll('.card-wish[data-id]').forEach(cardBtn => {
    cardBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleWish(cardBtn.dataset.id);
    });
  });
}

async function toggleWish(pid) {
  const was = window.__wishlistState[pid] || false;

 
  if (pid === PRODUCT_ID) {
    const active = await checkProductActive();
    if (!active) return;
  }

  try {
    const res  = await fetch('/user/wishlist/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: pid }),
    });
    const data = await res.json();

    if (!data.success) {
      if (data.redirect) { window.location.href = data.redirect; return; }
      return;
    }

    const nowWished = data.status === 'added';
    syncAllHearts(pid, nowWished);
    showToast(nowWished ? 'Added to wishlist ♡' : 'Removed from wishlist', nowWished ? 'gold' : 'muted');
  } catch {
    syncAllHearts(pid, was); 
  }
}


async function initRelated() {
  const grid      = document.getElementById('pdRelatedGrid');
  const productId = window.PD_DATA?.productId;
  if (!grid || !productId) return;

  const serverCount = parseInt(grid.dataset.serverCount || '0', 10);
  if (serverCount > 0) {
    syncRelatedWishlist();
    syncRelatedCart();
    attachRelatedHandlers(grid);
    return;
  }

  const loadingEl = document.getElementById('pdRelatedLoading');
  try {
    const res  = await fetch(`/user/api/related/${productId}`);
    const data = await res.json();

    if (!data.success || !data.products?.length) {
      if (loadingEl) {
        loadingEl.innerHTML       = 'No similar products found.';
        loadingEl.style.animation = 'none';
      }
      return;
    }

   
    data.products.forEach(p => {
      if (p.wished && p.id) {
        window.__wishlistState[p.id] = true;
      }
      if (p.inCart && p.variantId) {
        window.__cartState[p.variantId] = true;
      }
    });

   
    grid.innerHTML = data.products.map(p => buildRelatedCard(p)).join('');

    
    attachRelatedHandlers(grid);

  } catch (err) {
    console.error('initRelated error:', err);
    if (loadingEl) loadingEl.innerHTML = 'Could not load recommendations.';
  }
}


function syncRelatedWishlist() {
  document.querySelectorAll('.card-wish[data-id]').forEach(btn => {
    const wished = !!window.__wishlistState[btn.dataset.id];
    btn.classList.toggle('wished', wished);
    const svg = btn.querySelector('svg path');
    if (svg) svg.setAttribute('fill', wished ? 'currentColor' : 'none');
  });
}


function syncRelatedCart() {
  document.querySelectorAll('.quick-add[data-variant-id]').forEach(btn => {
    const inCart = !!window.__cartState[btn.dataset.variantId];
    applyQuickAddState(btn, inCart);
  });
}


function attachRelatedHandlers(container) {
  container.querySelectorAll('.card-wish[data-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleWish(btn.dataset.id);
    });
  });

  container.querySelectorAll('.quick-add:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleQuickAdd(btn);
    });
  });
}

function buildRelatedCard(p) {
  
  const wished       = !!window.__wishlistState[p.id];
  const inCart       = !!(p.variantId && window.__cartState[p.variantId]);
  const isOutOfStock = p.avail !== 'instock';

  const quickAddLabel = isOutOfStock ? 'Out of Stock'
                      : inCart       ? 'View in Cart'
                      :                '+ Add to Bag';

  const quickAddStyle = inCart
    ? 'background:transparent;color:var(--gold);border:1px solid var(--gold);'
    : '';

  return `
    <div class="prod-card" data-id="${p.id}">
      <div class="prod-img-wrap">

        ${p.badgeLabel
          ? `<span class="prod-badge badge-${p.badge || 'default'}">${p.badgeLabel}</span>`
          : ''}

        <div class="card-wish ${wished ? 'wished' : ''}"
             data-id="${p.id}"
             title="${wished ? 'Remove from Wishlist' : 'Add to Wishlist'}">
          <svg viewBox="0 0 24 24"
               fill="${wished ? 'currentColor' : 'none'}"
               stroke="currentColor" stroke-width="1.8">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
                     a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
                     1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </div>

        <img src="${p.img || '/images/placeholder.jpg'}"
             alt="${p.name}" loading="lazy"
             style="cursor:pointer"
             onerror="this.src='/images/placeholder.jpg'"
             onclick="window.location.href='/user/product/${p.id}'">
        <div class="prod-img-overlay"></div>

        ${isOutOfStock
          ? `<button class="quick-add disabled" disabled>Out of Stock</button>`
          : `<button class="quick-add"
               style="${quickAddStyle}"
               data-id="${p.id}"
               data-variant-id="${p.variantId || ''}"
               data-in-cart="${inCart ? 'true' : ''}"
             >${quickAddLabel}</button>`
        }

      </div>
      <div class="prod-info">
        <div class="prod-atelier">${p.brand}</div>
        <div class="prod-rating">★ ${p.rating}
          ${p.reviews ? `<span class="rating-count">(${p.reviews})</span>` : ''}
        </div>
        <div class="prod-name">${p.name}</div>
        <div class="prod-price-wrap">
          <span class="prod-price">₹${fmt(p.price)}</span>
          ${p.oldPrice ? `<span class="prod-price-old">₹${fmt(p.oldPrice)}</span>` : ''}
          ${p.discountPct > 0
            ? `<span class="prod-discount-pill">${p.discountPct}% OFF</span>`
            : ''}
        </div>
        <button class="prod-btn"
                onclick="window.location.href='/user/product/${p.id}'">
          View Details
        </button>
      </div>
    </div>`;
}


function openLightbox(src) {
  const lb      = document.getElementById('pdLightbox');
  const lbImg   = document.getElementById('pdLbImg');
  const lbWrap  = document.getElementById('pdLbImgWrap');
  const lbClose = document.getElementById('pdLbClose');
  if (!lb || !lbImg) return;
  lbImg.src = src;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  lbWrap.classList.remove('zoomed');
  lbWrap.addEventListener('click', lbZoomHandler);
  lbClose.onclick = closeLightbox;
  lb.addEventListener('click', lbBackdropHandler);
  document.addEventListener('keydown', lbKeyHandler);
}
function lbZoomHandler(e) {
  const wrap = document.getElementById('pdLbImgWrap');
  if (!wrap) return;
  if (wrap.classList.contains('zoomed')) { wrap.classList.remove('zoomed'); return; }
  const rect = wrap.getBoundingClientRect();
  wrap.style.setProperty('--lb-ox', (((e.clientX - rect.left) / rect.width)  * 100).toFixed(2) + '%');
  wrap.style.setProperty('--lb-oy', (((e.clientY - rect.top)  / rect.height) * 100).toFixed(2) + '%');
  wrap.classList.add('zoomed');
  e.stopPropagation();
}
function lbBackdropHandler(e) { if (e.target === document.getElementById('pdLightbox')) closeLightbox(); }
function lbKeyHandler(e) { if (e.key === 'Escape') closeLightbox(); }
function closeLightbox() {
  const lb     = document.getElementById('pdLightbox');
  const lbWrap = document.getElementById('pdLbImgWrap');
  if (!lb) return;
  lb.classList.remove('open');
  lbWrap?.classList.remove('zoomed');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', lbKeyHandler);
  lb.removeEventListener('click', lbBackdropHandler);
  lbWrap?.removeEventListener('click', lbZoomHandler);
}


function initAccordion() {
  document.querySelectorAll('.pd-accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item   = header.closest('.pd-accordion-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.pd-accordion-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
  const first = document.querySelector('.pd-accordion-item');
  if (first) first.classList.add('open');
}


function initShare() {
  const btn = document.getElementById('pdShareBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const title = document.querySelector('.pd-name')?.textContent || 'TYMORA';
    const url   = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch (_) {}
    } else {
      try { await navigator.clipboard.writeText(url); showToast('Link copied!', 'gold'); }
      catch (_) { showToast('Copy: ' + url, 'muted'); }
    }
  });
}

function initFadeIn() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.pd-fade').forEach(el => obs.observe(el));
}


function showToast(msg, type = 'gold') {
  document.getElementById('pd-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'pd-toast';
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '100px', left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: type === 'gold' ? 'var(--gold)' : 'var(--dark-3)',
    color:      type === 'gold' ? '#000'        : 'var(--white)',
    padding: '12px 28px', borderRadius: '50px', fontSize: '13px',
    fontWeight: '700', fontFamily: "'Montserrat',sans-serif",
    zIndex: '99999', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    opacity: '0', transition: 'all 0.3s ease', whiteSpace: 'nowrap', pointerEvents: 'none',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 350);
  }, 2800);
}