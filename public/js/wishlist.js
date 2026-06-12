'use strict';


window.__cartState     = window.__cartState     || {};
window.__wishlistState = window.__wishlistState || {};

document.addEventListener('DOMContentLoaded', () => {
  seedState();
  initWishlistCards();
  initAddAllToCart();
  initSort();
  refreshAddAllBtn();
});


function seedState() {
  document.querySelectorAll('.prod-card[data-id]').forEach(card => {
    const pid = card.dataset.id;
    const vid = card.dataset.variantId;
    
    window.__wishlistState[pid] = true;
   
    if (vid && card.dataset.inCart === 'true') {
      window.__cartState[vid] = true;
    }
  });
}


function applyCartState(card, inCart) {
  const btn = card.querySelector('.wl-cart-btn');
  if (!btn) return;
  if (inCart) {
    btn.textContent      = 'VIEW IN CART';
    btn.dataset.inCart   = 'true';
    btn.style.background = 'transparent';
    btn.style.color      = 'var(--gold, #d4af37)';
    btn.style.border     = '1px solid var(--gold, #d4af37)';
  } else {
    btn.textContent      = 'ADD TO CART';
    btn.dataset.inCart   = '';
    btn.style.background = '';
    btn.style.color      = '';
    btn.style.border     = '';
  }
}


function refreshAddAllBtn() {
  const btn = document.getElementById('addAllToCart');
  if (!btn) return;

 
  const cards = Array.from(document.querySelectorAll('.prod-card[data-id]'));
  const hasAddable = cards.some(card => {
    const vid    = card.dataset.variantId;
    const avail  = card.dataset.avail;
    const inCart = vid && (card.querySelector('.wl-cart-btn')?.dataset.inCart === 'true'
                           || !!window.__cartState[vid]);
    return avail === 'instock' && !inCart;
  });

  btn.disabled      = !hasAddable;
  btn.style.opacity = hasAddable ? '' : '0.45';
  btn.style.cursor  = hasAddable ? '' : 'not-allowed';
}


function updateNavCartCount(count) {
  if (typeof window.updateCartBadge === 'function') {
    window.updateCartBadge(count);
  }
}


function initWishlistCards() {
  document.querySelectorAll('.prod-card[data-id]').forEach(card => {
    const pid = card.dataset.id;
    const vid = card.dataset.variantId;

   
    const heartBtn = card.querySelector('.card-wish[data-id]');
    heartBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const res  = await fetch('/user/wishlist/toggle', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ productId: pid }),
        });
        const data = await res.json();
        if (!data.success) {
          if (data.redirect) { window.location.href = data.redirect; return; }
          return;
        }
 if (data.status === 'removed') {
  card.style.transition = 'opacity 0.4s, transform 0.4s';
  card.style.opacity    = '0';
  card.style.transform  = 'scale(0.9)';
  delete window.__wishlistState[pid];
  setTimeout(() => {
    card.remove();
    // Fetch real count from server after card is removed
    if (typeof window.updateWishlistBadge === 'function') {
      fetch('/user/wishlist/ids')
        .then(r => r.json())
        .then(d => window.updateWishlistBadge(d.ids ? d.ids.length : 0))
        .catch(() => {});
    }
    const grid = document.getElementById('wishlistGrid');
    if (grid && !grid.children.length) window.location.reload();
    refreshAddAllBtn();
  }, 400);
}
      } catch (err) {
        console.error(err);
      }
    });

    
    const cartBtn = card.querySelector('.wl-cart-btn');
    if (!cartBtn) return;

   
    const initialInCart = vid && !!window.__cartState[vid];
    applyCartState(card, initialInCart);

    cartBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      
      if (vid && window.__cartState[vid]) {
        window.location.href = '/user/cart';
        return;
      }

      if (!vid) { showToast('Variant not found', 'error'); return; }

     
      cartBtn.disabled    = true;
      cartBtn.textContent = 'Adding…';

      try {
        const res  = await fetch('/user/cart/add', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ productId: pid, variantId: vid, quantity: 1 }),
        });
        const data = await res.json();

        if (data.redirect) { window.location.href = data.redirect; return; }

        if (!data.success) {
          showToast(data.message || 'Cannot add to cart', 'error');
          cartBtn.disabled    = false;
          cartBtn.textContent = 'ADD TO CART';
          return;
        }

        
        window.__cartState[vid] = true;
        card.dataset.inCart     = 'true';

       
        applyCartState(card, true);
        cartBtn.disabled = false;

        updateNavCartCount(data.cartCount);
        showToast('Added to cart!', 'gold');
        refreshAddAllBtn();

      } catch (err) {
        console.error(err);
        showToast('Something went wrong', 'error');
        cartBtn.disabled    = false;
        cartBtn.textContent = 'ADD TO CART';
      }
    });
  });
}

function initAddAllToCart() {
  const btn = document.getElementById('addAllToCart');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    const originalHTML = btn.innerHTML;
    btn.textContent    = 'Adding…';
    btn.disabled       = true;

    try {
      const res  = await fetch('/user/wishlist/add-all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();

      if (!data.success) {
        if (data.redirect) { window.location.href = data.redirect; return; }
        showToast(data.message || 'Error', 'error');
      } else {
       
        if (data.addedVariants?.length) {
          data.addedVariants.forEach(vid => {
            window.__cartState[vid] = true;
          });
         
          document.querySelectorAll('.prod-card[data-id]').forEach(card => {
            const cardVid = card.dataset.variantId;
            if (cardVid && window.__cartState[cardVid]) {
              applyCartState(card, true);
            }
          });
        }
        updateNavCartCount(data.cartCount);
        const msg = data.added > 0
          ? `${data.added} item(s) added to cart!`
          : 'All items already in cart or unavailable';
        showToast(msg, data.added > 0 ? 'gold' : 'error');
        refreshAddAllBtn();
      }
    } catch (err) {
      console.error(err);
      showToast('Something went wrong', 'error');
    } finally {
      btn.innerHTML = originalHTML;
      btn.disabled  = false;
      refreshAddAllBtn(); 
    }
  });
}


function initSort() {
  const select = document.getElementById('sortWishlist');
  const grid   = document.getElementById('wishlistGrid');
  if (!select || !grid) return;

  select.addEventListener('change', () => {
    const cards = Array.from(grid.children);
    cards.sort((a, b) => {
      const price = el => parseFloat(el.querySelector('.prod-price')?.textContent.replace(/[^\d.]/g, '') || '0');
      const name  = el => el.querySelector('.prod-name')?.textContent.toLowerCase() || '';
      switch (select.value) {
        case 'price-asc':  return price(a) - price(b);
        case 'price-desc': return price(b) - price(a);
        case 'az':         return name(a).localeCompare(name(b));
        case 'za':         return name(b).localeCompare(name(a));
        default:           return 0;
      }
    });
    cards.forEach(c => grid.appendChild(c));
  });
}


function showToast(msg, type = 'gold') {
  const existing = document.getElementById('wl-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id    = 'wl-toast';
  toast.textContent = msg;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '100px', left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    background: type === 'error' ? '#e05252' : 'var(--gold, #d4af37)',
    color: type === 'error' ? '#fff' : '#000',
    padding: '12px 28px', borderRadius: '50px',
    fontSize: '13px', fontWeight: '700',
    fontFamily: "'Montserrat', sans-serif",
    zIndex: '99999', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    opacity: '0', transition: 'all 0.3s ease',
    whiteSpace: 'nowrap', pointerEvents: 'none',
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

