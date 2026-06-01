(function () {
  'use strict';

  const DATA = window.SHOP_DATA || { featured: [] };

  
  window.__wishlistState = window.__wishlistState || {};
  window.__cartState     = window.__cartState     || {};


  document.querySelectorAll('.card-wish[data-id]').forEach(btn => {
    if (btn.classList.contains('wished')) {
      window.__wishlistState[btn.dataset.id] = true;
    }
  });


  document.querySelectorAll('.quick-add[data-variant-id]').forEach(btn => {
    if (btn.dataset.inCart === 'true') {
      window.__cartState[btn.dataset.variantId] = true;
    }
  });

 
  function syncAllHearts(productId, wished) {
    window.__wishlistState[productId] = wished;
    document.querySelectorAll(`.card-wish[data-id="${productId}"]`).forEach(btn => {
      btn.classList.toggle('wished', wished);
      btn.title = wished ? 'Remove from Wishlist' : 'Add to Wishlist';
      const svg = btn.querySelector('svg path');
      if (svg) svg.setAttribute('fill', wished ? 'currentColor' : 'none');
    });
  }

 async function toggleWishlist(productId) {
    if (!window.SHOP_USER_LOGGED_IN) {
      window.location.href = '/user/login';
      return;
    }
    const currentlyWished = window.__wishlistState[productId] || false;
   
    syncAllHearts(productId, !currentlyWished);

    try {
      const res  = await fetch('/user/wishlist/toggle', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productId }),
      });
      const data = await res.json();

      if (!data.success) {
        syncAllHearts(productId, currentlyWished); // revert
        if (data.redirect) window.location.href = data.redirect;
        return;
      }
      const finalState = data.status === 'added';
      syncAllHearts(productId, finalState);

      // ── Update wishlist badge instantly ──
      if (typeof window.updateWishlistBadge === 'function') {
        fetch('/user/wishlist/ids')
          .then(r => r.json())
          .then(d => window.updateWishlistBadge(d.ids ? d.ids.length : 0))
          .catch(() => {});
      }

      showShopToast(
        finalState ? 'Added to wishlist ♡' : 'Removed from wishlist',
        finalState ? 'gold' : 'muted'
      );
    } catch (err) {
      syncAllHearts(productId, currentlyWished); 
      console.error('Wishlist error:', err);
    }
  }


  function applyQuickAddState(btn, inCart) {
    if (inCart) {
      btn.textContent      = 'View in Cart';
      btn.dataset.inCart   = 'true';
      btn.style.background = 'transparent';
      btn.style.color      = 'var(--gold)';
      btn.style.border     = '1px solid var(--gold)';
    } else {
      btn.textContent      = '+ Add to Bag';
      btn.dataset.inCart   = '';
      btn.style.background = '';
      btn.style.color      = '';
      btn.style.border     = '';
    }
  }

  function setCartState(variantId, inCart) {
    if (inCart) {
      window.__cartState[variantId] = true;
    } else {
      delete window.__cartState[variantId];
    }
    
    document.querySelectorAll(`.quick-add[data-variant-id="${variantId}"]`).forEach(btn => {
      applyQuickAddState(btn, inCart);
    });
  }

 function updateCartCountBadge(count) {
    if (typeof window.updateCartBadge === 'function') {
      window.updateCartBadge(count);
    }
  }


  function attachWishlistListeners(container) {
    container.querySelectorAll('.card-wish[data-id]').forEach(btn => {
      const pid    = btn.dataset.id;
      const wished = !!window.__wishlistState[pid];

      
      btn.classList.toggle('wished', wished);
      btn.title = wished ? 'Remove from Wishlist' : 'Add to Wishlist';
      const svg = btn.querySelector('svg path');
      if (svg) svg.setAttribute('fill', wished ? 'currentColor' : 'none');

     
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);

      fresh.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWishlist(fresh.dataset.id);
      });
    });
  }

  function attachCartListeners(container) {
    container.querySelectorAll('.quick-add[data-variant-id]').forEach(btn => {
      const variantId = btn.dataset.variantId;
      const inCart    = !!window.__cartState[variantId];

      
      applyQuickAddState(btn, inCart);

      
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);

      
      applyQuickAddState(fresh, !!window.__cartState[variantId]);

      fresh.addEventListener('click', async (e) => {
        e.stopPropagation();

       
        if (fresh.dataset.adding === 'true') return;

        const productId      = fresh.dataset.id;
        const freshVariantId = fresh.dataset.variantId;

        if (!window.SHOP_USER_LOGGED_IN) {
          window.location.href = '/user/login';
          return;
        }

        if (!freshVariantId) {
          showShopToast('Variant not found', 'muted');
          return;
        }

        
        if (window.__cartState[freshVariantId]) {
          window.location.href = '/user/cart';
          return;
        }

       
        fresh.dataset.adding = 'true';
        fresh.textContent    = 'Adding…';
        fresh.disabled       = true;

        try {
          const res  = await fetch('/user/cart/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ productId, variantId: freshVariantId, quantity: 1 }),
          });
          const data = await res.json();

          if (data.redirect) {
            window.location.href = data.redirect;
            return;
          }

          if (!data.success) {
            showShopToast(data.message || 'Cannot add to cart', 'muted');
            
            fresh.textContent    = '+ Add to Bag';
            fresh.disabled       = false;
            fresh.dataset.adding = '';
         } else {
           
            setCartState(freshVariantId, true);
            updateCartCountBadge(data.cartCount);
            showShopToast('Added to cart!', 'gold');
            
            fresh.dataset.adding = '';
            fresh.disabled = false;
          }
        } catch (err) {
          console.error('Cart error:', err);
          showShopToast('Something went wrong', 'muted');
          fresh.textContent    = '+ Add to Bag';
          fresh.disabled       = false;
          fresh.dataset.adding = '';
        }
      });
    });
  }

 
  const filterToggle = document.getElementById('filterToggle');
  const filterPanel  = document.getElementById('filterPanel');
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', () => {
      filterPanel.classList.toggle('open');
      filterToggle.classList.toggle('active');
    });
  }

  const searchInput = document.getElementById('searchInput');
  const clearBtn    = document.getElementById('clearBtn');
  if (searchInput && clearBtn) {
    searchInput.addEventListener('input', function () {
      clearBtn.classList.toggle('visible', this.value.length > 0);
    });
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.remove('visible');
      searchInput.focus();
    });
  }

  document.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const key    = btn.dataset.key;
      const params = new URLSearchParams(window.location.search);
      if (key === 'price') { params.delete('priceMin'); params.delete('priceMax'); }
      else                 { params.delete(key); }
      params.delete('page');
      window.location.search = params.toString();
    });
  });


  const productsGrid = document.getElementById('productsGrid');
  if (productsGrid) {
    attachWishlistListeners(productsGrid);
    attachCartListeners(productsGrid);
  }

 
  function fmt(n) { return '₹' + n.toLocaleString('en-IN'); }

  function cardHTML(p) {
    const outofstock = p.avail === 'outofstock';
    const wished     = !!window.__wishlistState[p.id];
    const inCart     = !!(p.variantId && window.__cartState[p.variantId]);

    const quickAddLabel = inCart ? 'View in Cart' : '+ Add to Bag';
    const quickAddStyle = inCart
      ? 'background:transparent;color:var(--gold);border:1px solid var(--gold);'
      : '';

    const badgeHtml = p.badgeLabel
      ? `<span class="prod-badge badge-${p.badge || 'default'}">${p.badgeLabel}</span>`
      : '';

    const priceHtml = p.oldPrice
      ? `<span class="prod-price">${fmt(p.price)}</span>
         <span class="prod-price-old">${fmt(p.oldPrice)}</span>
         ${p.discountPct ? `<span class="prod-discount-pill">${p.discountPct}% OFF</span>` : ''}`
      : `<span class="prod-price">${fmt(p.price)}</span>`;

    return `
      <div class="featured-card" data-id="${p.id}" data-variant-id="${p.variantId || ''}" data-avail="${p.avail || ''}">
        <div class="prod-img-wrap">
          ${badgeHtml}
          <div class="card-wish ${wished ? 'wished' : ''}" data-id="${p.id}"
               title="${wished ? 'Remove from Wishlist' : 'Add to Wishlist'}">
            <svg viewBox="0 0 24 24"
                 fill="${wished ? 'currentColor' : 'none'}"
                 stroke="currentColor" stroke-width="1.8">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
                       a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
                       1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <img src="${p.img}" alt="${p.name}" loading="lazy" style="cursor:pointer"
               onclick="window.location.href='/user/product/${p.id}'">
          <div class="prod-img-overlay"></div>
          ${outofstock
            ? `<button class="quick-add disabled" disabled title="Out of Stock">Out of Stock</button>`
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
          <div class="prod-rating">★ ${p.rating} <span class="rating-count">(${p.reviews})</span></div>
          <div class="prod-name">${p.name}</div>
          <div class="prod-price-wrap">${priceHtml}</div>
          <button class="prod-btn" onclick="window.location.href='/user/product/${p.id}'">View Details</button>
        </div>
      </div>`;
  }

 
  const state         = { carouselIdx: 0 };
  const featuredTrack = document.getElementById('featuredTrack');
  const carouselPrev  = document.getElementById('carouselPrev');
  const carouselNext  = document.getElementById('carouselNext');
  const carouselDots  = document.getElementById('carouselDots');

  function renderFeatured() {
    if (!featuredTrack) return;
    featuredTrack.innerHTML = DATA.featured.map(cardHTML).join('');
    attachWishlistListeners(featuredTrack);
    attachCartListeners(featuredTrack);
    if (carouselPrev) carouselPrev.addEventListener('click', () => moveCarousel(-1));
    if (carouselNext) carouselNext.addEventListener('click', () => moveCarousel(1));
    renderCarouselDots();
    updateCarousel();
  }

  function getVisibleCards() {
    const outer = document.querySelector('.featured-track-outer');
    const w     = outer ? outer.offsetWidth : 800;
    if (w < 560) return 1;
    if (w < 900) return 2;
    return 4;
  }

  function moveCarousel(dir) {
    const visible     = getVisibleCards();
    const max         = Math.max(0, DATA.featured.length - visible);
    state.carouselIdx = Math.max(0, Math.min(max, state.carouselIdx + dir));
    updateCarousel();
    renderCarouselDots();
  }

  function updateCarousel() {
    if (!featuredTrack) return;
    const cards = featuredTrack.querySelectorAll('.featured-card');
    if (!cards.length) return;
    const cardW = cards[0].offsetWidth + 24;
    featuredTrack.style.transform = `translateX(-${state.carouselIdx * cardW}px)`;
    const visible = getVisibleCards();
    const max     = Math.max(0, DATA.featured.length - visible);
    if (carouselPrev) {
      carouselPrev.disabled      = state.carouselIdx === 0;
      carouselPrev.style.opacity = state.carouselIdx === 0 ? '0.35' : '1';
    }
    if (carouselNext) {
      carouselNext.disabled      = state.carouselIdx >= max;
      carouselNext.style.opacity = state.carouselIdx >= max ? '0.35' : '1';
    }
  }

  function renderCarouselDots() {
    if (!carouselDots) return;
    const visible   = getVisibleCards();
    const totalDots = Math.max(0, DATA.featured.length - visible + 1);
    carouselDots.innerHTML = Array.from({ length: totalDots }, (_, i) =>
      `<div class="cdot ${i === state.carouselIdx ? 'active' : ''}" data-idx="${i}"></div>`
    ).join('');
    carouselDots.querySelectorAll('.cdot').forEach(dot => {
      dot.addEventListener('click', () => {
        state.carouselIdx = parseInt(dot.dataset.idx, 10);
        updateCarousel();
        renderCarouselDots();
      });
    });
  }

  let touchStartX = 0;
  const trackWrap = document.querySelector('.featured-track-wrap');
  if (trackWrap) {
    trackWrap.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    trackWrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) moveCarousel(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  window.addEventListener('resize', () => {
    updateCarousel();
    renderCarouselDots();
  });

  renderFeatured();

  
  function showShopToast(msg, type) {
    const existing = document.getElementById('shop-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'shop-toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position:   'fixed',
      bottom:     '100px',
      left:       '50%',
      transform:  'translateX(-50%) translateY(20px)',
      background: type === 'gold' ? 'var(--gold, #d4af37)' : 'rgba(30,30,30,0.95)',
      color:      type === 'gold' ? '#000' : '#fff',
      padding:    '12px 28px',
      borderRadius: '50px',
      fontSize:   '13px',
      fontWeight: '700',
      fontFamily: "'Montserrat', sans-serif",
      zIndex:     '99999',
      boxShadow:  '0 8px 24px rgba(0,0,0,0.4)',
      opacity:    '0',
      transition: 'all 0.3s ease',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
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
    }, 2500);
  }

})();