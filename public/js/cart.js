'use strict';

const MAX_QTY_CAP = 7;

document.addEventListener('DOMContentLoaded', () => {
  initRemoveModal();
  initQuantityButtons();
  updateCheckoutState();
});

function getMaxQty(card) {
  const stock = parseInt(card.dataset.stock, 10) || 0;
  return Math.min(stock, MAX_QTY_CAP);
}

function refreshPlusBtn(card) {
  const input  = card.querySelector('.qty-input');
  const plusBtn = card.querySelector('.plus-btn');
  const current = parseInt(input.value, 10);
  const maxQty  = getMaxQty(card);
  if (plusBtn) {
    plusBtn.disabled = current >= maxQty;
    plusBtn.style.opacity = current >= maxQty ? '0.4' : '';
    plusBtn.style.cursor  = current >= maxQty ? 'not-allowed' : '';
  }
}

function refreshMinusBtn(card) {
  const input   = card.querySelector('.qty-input');
  const minusBtn = card.querySelector('.minus-btn');
  const current  = parseInt(input.value, 10);
  if (minusBtn) {
    minusBtn.disabled = current <= 1;
    minusBtn.style.opacity = current <= 1 ? '0.4' : '';
    minusBtn.style.cursor  = current <= 1 ? 'not-allowed' : '';
  }
}

function initRemoveModal() {
  const modal         = document.getElementById('remove-modal');
  const confirmBtn    = document.getElementById('confirmRemoveBtn');
  let   pendingItemId = null;

  window.openRemoveModal = (itemId) => {
    pendingItemId = itemId;
    modal?.classList.add('show');
  };
  window.hideRemoveModal = () => {
    pendingItemId = null;
    modal?.classList.remove('show');
  };

  confirmBtn?.addEventListener('click', async () => {
    if (!pendingItemId) return;
    const itemId = pendingItemId;
    hideRemoveModal();

    try {
      const res  = await fetch('/user/cart/remove', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (!data.success) return showToast(data.message || 'Error removing item', 'error');

     const card = document.querySelector(`.cart-item-card[data-id="${itemId}"]`);
      if (card) {
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity    = '0';
        card.style.transform  = 'scale(0.95)';
        setTimeout(() => {
          card.remove();
         
          const summaryRow = document.querySelector(`.summary-item-row[data-summary-id="${itemId}"]`);
          if (summaryRow) summaryRow.remove();
          updateSummaryTotal();
          updateNavCartCount(data.cartCount);
          updateCheckoutState();
          if (data.isEmpty) window.location.reload();
        }, 300);
      }
    } catch (err) {
      console.error(err);
      showToast('Something went wrong', 'error');
    }
  });
}

function updateCheckoutState() {
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (!checkoutBtn) return;

  const hasOos = document.querySelectorAll('.cart-item-card[data-oos="true"]').length > 0;

  checkoutBtn.disabled = hasOos;
  checkoutBtn.classList.toggle('blocked', hasOos);

  let msg = document.querySelector('.checkout-blocked-msg');
  if (hasOos && !msg) {
    msg = document.createElement('div');
    msg.className = 'checkout-blocked-msg';
    msg.textContent = 'Remove unavailable items to continue checkout.';
    checkoutBtn.insertAdjacentElement('afterend', msg);
  } else if (!hasOos && msg) {
    msg.remove();
  }
}

function initQuantityButtons() {
  document.querySelectorAll('.cart-item-card').forEach(card => {
    
    if (card.dataset.oos === 'true') {
      card.querySelectorAll('.qty-btn').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.35';
        btn.style.cursor = 'not-allowed';
      });
      return;
    }

   
    refreshPlusBtn(card);
    refreshMinusBtn(card);
    const itemId   = card.dataset.id;
    const minusBtn = card.querySelector('.minus-btn');
    const plusBtn  = card.querySelector('.plus-btn');
    const input    = card.querySelector('.qty-input');

    minusBtn?.addEventListener('click', () => {
      if (minusBtn.disabled) return;
      changeQty(itemId, input, -1, card);
    });
    plusBtn?.addEventListener('click', () => {
      if (plusBtn.disabled) return;
      const current = parseInt(input.value, 10);
      const maxQty  = getMaxQty(card);
      if (current >= maxQty) {
        showToast('Maximum quantity reached', 'error');
        return;
      }
      changeQty(itemId, input, 1, card);
    });
  });
}

async function changeQty(itemId, input, delta, card) {
  const current = parseInt(input.value, 10);
  const newQty  = current + delta;
  const maxQty  = getMaxQty(card);

  if (newQty < 1)       return;
  if (newQty > maxQty) {
    showToast('Maximum quantity reached', 'error');
    return;
  }

  try {
    const res  = await fetch('/user/cart/update', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ itemId, quantity: newQty }),
    });
    const data = await res.json();
    if (!data.success) return showToast(data.message || 'Cannot update', 'error');

    
    input.value = newQty;

    
    const totalEl = card.querySelector('.ci-total');
    if (totalEl) totalEl.textContent = '₹' + data.newTotal.toLocaleString('en-IN');

    // Update order summary row 
    const summaryRow = document.querySelector(`.summary-item-row[data-summary-id="${itemId}"]`);
    if (summaryRow) {
      const qtySpan   = summaryRow.querySelector('.summary-item-qty');
      const priceSpan = summaryRow.querySelector('.summary-item-price');
      if (qtySpan)   qtySpan.textContent   = `×${newQty}`;
      if (priceSpan) priceSpan.textContent = '₹' + data.newTotal.toLocaleString('en-IN');
    }

    // Refresh button states
    refreshPlusBtn(card);
    refreshMinusBtn(card);

    // Update grand total and nav badge
    updateSummaryTotal(data.subtotal);
    updateNavCartCount(data.cartCount);
  } catch (err) {
    console.error(err);
  }
}

function updateSummaryTotal(subtotal) {
  
  let total = subtotal;
  if (total === undefined) {
    total = 0;
    document.querySelectorAll('.summary-item-row .summary-item-price').forEach(el => {
      const val = parseFloat(el.textContent.replace(/[^\d.]/g, '')) || 0;
      total += val;
    });
  }
  const totalEl = document.querySelector('.total-amount');
  if (totalEl && total !== undefined) {
    totalEl.textContent = '₹' + total.toLocaleString('en-IN');
  }
}

function updateNavCartCount(count) {
  if (typeof window.updateCartBadge === 'function') {
    window.updateCartBadge(count);
  }
}

function showToast(msg, type = 'gold') {
  const existing = document.getElementById('cart-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id    = 'cart-toast';
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