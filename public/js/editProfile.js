

(function () {
  'use strict';


  const $ = (id) => document.getElementById(id);
  
  const els = {
    avatarInput:   $('avatar-input'),
    avatarPreview: $('avatar-preview'),
    removeAvatar:  $('removeAvatar'),
    removeModal:   $('removeDpModal'),
    editForm:      $('edit-form'),
    toast:         $('toast'),
  };

  // Prevent future dates from being selected in the Date of Birth calendar
  const dobInput = document.getElementById('dob');
  if (dobInput) {
    const today = new Date().toISOString().split('T')[0];
    dobInput.setAttribute('max', today);
  }
  

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
      els.avatarInput.value = ""; 
    }
    closeRemoveDpModal();
  };

 

  window.showToast = function (msg) {
    if (els.toast) {
      els.toast.innerText = msg;
      els.toast.classList.add('show');
      setTimeout(() => {
        els.toast.classList.remove('show');
      }, 3000);
    }
  };

  if (els.editForm) {
    els.editForm.addEventListener('submit', function (e) {
      const name = document.getElementById('full-name').value.trim();
      const phone = document.getElementById('phone').value.trim();
      
      let errorMsg = "";
      
      if (!name) {
        errorMsg = "Full Name is required";
      } else if (phone) {
        const phoneRegex = /^[0-9]{10}$/;
        const allSame = /^(.)\1{9}$/;
        const fakes = ["1234567890", "0123456789", "1000000000"];
        
        if (!phoneRegex.test(phone)) {
          errorMsg = "Please enter a valid 10-digit phone number.";
        } else if (allSame.test(phone) || fakes.includes(phone)) {
          errorMsg = "Please enter a valid phone number. Repeated or invalid patterns are not allowed.";
        }
      }
      let errorDiv = document.querySelector('.error-msg');

      if (errorMsg) {
        e.preventDefault();
        if (!errorDiv) {
          errorDiv = document.createElement('div');
          errorDiv.className = 'error-msg';
          els.editForm.insertBefore(errorDiv, els.editForm.querySelector('.form-grid'));
        }
        errorDiv.innerText = errorMsg;
      } else {
        if (errorDiv) {
          errorDiv.remove();
        }
        showGlobalLoader();
      }
    });
  }

})();
