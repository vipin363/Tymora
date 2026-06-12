/* ============================================================
   TYMORA — profile.js
   All profile interactions: modals, form submissions, OTP timers
   ============================================================ */

(function () {
  'use strict';

  /* ── DOM REFS ── */
  const $ = (id) => document.getElementById(id);
  
  const els = {
    changeEmailForm:    $('changeEmailForm'),
    otpForm:            $('otpForm'),
    changePasswordForm: $('changePasswordForm'),
    resendOtpBtn:       $('resendOtpBtn'),
    delInput:           $('delInput') || $('del-input'),
    delBtn:             $('delBtn') || $('del-btn'),
    otpTimer:           $('otp-timer'),
    emailError:         $('email-error'),
    otpError:           $('otp-error'),
    otpSuccess:         $('otp-success'),
    passwordError:      $('password-error'),
    passwordSuccess:    $('password-success'),
  };

  /* ── GLOBALS ── */
  let timer = 60;
  let interval;

  /* ============================================================
     MODAL HELPERS
     ============================================================ */

  window.showModal = function (id) {
    const modal = $(id);
    if (!modal) return;
    modal.style.display = 'flex';
    
    // Clear previous states if it's a form modal
    if (id === 'change-password-modal') {
      if (els.passwordError) els.passwordError.innerText = "";
      if (els.passwordSuccess) els.passwordSuccess.innerText = "";
      if (els.changePasswordForm) els.changePasswordForm.reset();
    }
  };

  window.hideModal = function (id) {
    const modal = $(id);
    if (modal) modal.style.display = 'none';
  };

  /* ============================================================
     CHANGE EMAIL
     ============================================================ */

  if (els.changeEmailForm) {
    els.changeEmailForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = $('email').value.trim();
      if (els.emailError) els.emailError.innerText = "";

      if (!email) {
        if (els.emailError) els.emailError.innerText = "Email is required";
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        if (els.emailError) els.emailError.innerText = "Enter a valid email address";
        return;
      }

      try {
        const res = await fetch("/user/changeEmail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (!data.success) {
          if (els.emailError) els.emailError.innerText = data.message;
          return;
        }

        hideModal("change-email-modal");
        showModal("otp-modal");
        if (interval) clearInterval(interval);
        timer = 60;
        startOtpTimer();
      } catch (err) {
        if (els.emailError) els.emailError.innerText = "Something went wrong";
      }
    });
  }

  /* ============================================================
     OTP VERIFICATION
     ============================================================ */

  if (els.otpForm) {
    els.otpForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const otp = Number($('otp').value.trim());
      if (els.otpError) els.otpError.innerText = "";

      if (!otp) {
        if (els.otpError) els.otpError.innerText = "OTP required";
        return;
      }

      try {
        const res = await fetch("/user/verifyEmailOtp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ otp })
        });
        const data = await res.json();

        if (!data.success) {
          if (els.otpError) els.otpError.innerText = data.message;
          return;
        }

        if (els.otpSuccess) els.otpSuccess.innerText = "Email updated successfully";
        setTimeout(() => { window.location.reload(); }, 1500);
      } catch (err) {
        if (els.otpError) els.otpError.innerText = "Something went wrong";
      }
    });
  }

  if (els.resendOtpBtn) {
    els.resendOtpBtn.addEventListener('click', async () => {
      if (els.otpSuccess) els.otpSuccess.innerText = "";
      if (els.otpError) els.otpError.innerText = "";

      try {
        const res = await fetch("/user/resendEmailOtp", {
          method: "POST",
          credentials: "include"
        });
        const data = await res.json();

        if (data.success) {
          if (els.otpSuccess) els.otpSuccess.innerText = "OTP sent successfully";
          if (interval) clearInterval(interval);
          timer = 60;
          startOtpTimer();
        } else {
          if (els.otpError) els.otpError.innerText = data.message || "Failed to resend OTP";
        }
      } catch (err) {
        if (els.otpError) els.otpError.innerText = "Something went wrong";
      }
    });
  }

  function startOtpTimer() {
    if (!els.otpTimer || !els.resendOtpBtn) return;
    els.resendOtpBtn.disabled = true;

    interval = setInterval(() => {
      timer--;
      els.otpTimer.innerText = `Resend available in ${timer}s`;
      if (timer <= 0) {
        els.otpTimer.innerText = "You can resend OTP now";
        els.resendOtpBtn.disabled = false;
        clearInterval(interval);
      }
    }, 1000);
  }

  /* ============================================================
     DELETE ACCOUNT CONFIRMATION
     ============================================================ */

  if (els.delInput && els.delBtn) {
    els.delInput.addEventListener('input', function () {
      els.delBtn.disabled = (this.value.trim() !== "DELETE");
    });
  }

  /* ============================================================
     CHANGE PASSWORD
     ============================================================ */

  if (els.changePasswordForm) {
    els.changePasswordForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const currentPasswordInput = $('currentPassword');
      const currentPassword = currentPasswordInput ? currentPasswordInput.value.trim() : null;
      const newPassword     = $('newPassword').value.trim();
      const confirmPassword = $('confirmPassword').value.trim();

      if (els.passwordError) els.passwordError.innerText = "";
      if (els.passwordSuccess) els.passwordSuccess.innerText = "";

      if (!newPassword || !confirmPassword) {
        if (els.passwordError) els.passwordError.innerText = "All fields are required";
        return;
      }
      if (currentPasswordInput && !currentPassword) {
        if (els.passwordError) els.passwordError.innerText = "Current password required";
        return;
      }
      if (newPassword !== confirmPassword) {
        if (els.passwordError) els.passwordError.innerText = "Passwords do not match";
        return;
      }
      if (currentPasswordInput && currentPassword === newPassword) {
        if (els.passwordError) els.passwordError.innerText = "New password must be different";
        return;
      }

      const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
      if (!passwordPattern.test(newPassword)) {
        if (els.passwordError) els.passwordError.innerText = "Password must be strong (8+ chars, with upper, lower, number, and special char)";
        return;
      }

      showGlobalLoader();
      try {
        const res = await fetch("/user/changePassword", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
        const data = await res.json();

        if (data.success) {
          if (els.passwordSuccess) els.passwordSuccess.innerText = "Password updated successfully";
          els.changePasswordForm.reset();
          setTimeout(() => { window.location.reload(); }, 1000);
        } else {
          if (els.passwordError) els.passwordError.innerText = data.message || "Something went wrong";
          hideGlobalLoader();
        }
      } catch (err) {
        if (els.passwordError) els.passwordError.innerText = "Something went wrong";
        hideGlobalLoader();
      }
    });
  }

})();
