/* ============================================================
   TYMORA — editProfile.js
   Profile editing: avatar previews, removal, and form validation
   ============================================================ */

(function () {
  'use strict';

  /* ── DOM REFS ── */
  const $ = (id) => document.getElementById(id);
  
  const els = {
    avatarInput:   $('avatar-input'),
    avatarPreview: $('avatar-preview'),
    removeAvatar:  $('removeAvatar'),
    removeModal:   $('removeDpModal'),
    editForm:      $('edit-form'),
    toast:         $('toast'),
  };

  /* ============================================================
     AVATAR PREVIEW
     ============================================================ */

  if (els.avatarInput && els.avatarPreview) {
    els.avatarInput.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        els.avatarPreview.src = e.target.result;
        if (els.removeAvatar) els.removeAvatar.value = "false";
      };
      reader.readAsDataURL(file);
    });
  }

  /* ============================================================
     REMOVE PHOTO MODAL
     ============================================================ */

  window.confirmRemoveDp = function () {
    if (els.removeModal) els.removeModal.style.display = 'flex';
  };

  window.closeRemoveDpModal = function () {
    if (els.removeModal) els.removeModal.style.display = 'none';
  };

  window.removeDpConfirmed = function () {
    if (els.avatarPreview) {
      els.avatarPreview.src = "/image/useravathar.png";
    }
    if (els.removeAvatar) {
      els.removeAvatar.value = "true";
    }
    if (els.avatarInput) {
      els.avatarInput.value = ""; // Clear file selection
    }
    closeRemoveDpModal();
  };

  /* ============================================================
     TOAST HELPER
     ============================================================ */

  window.showToast = function (msg) {
    if (els.toast) {
      els.toast.innerText = msg;
      els.toast.classList.add('show');
      setTimeout(() => {
        els.toast.classList.remove('show');
      }, 3000);
    }
  };

})();
