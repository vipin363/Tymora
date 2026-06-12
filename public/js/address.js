

(function () {
  'use strict';

  let editAddressId = null;
  const $ = (id) => document.getElementById(id);

 

  window.showModal = function (id) {
    const modal = $(id);
    if (!modal) return;

    const form = modal.querySelector("form");
    if (form) form.reset();

    const errorBox = modal.querySelector("#address-error");
    if (errorBox) errorBox.innerText = "";

    editAddressId = null;
    const submitBtn = modal.querySelector(".modal-btn-red");
    if (submitBtn && id === 'add-address-modal') {
      submitBtn.innerText = "Save Address";
    }

    modal.style.display = "flex";
  };

  window.hideModal = function (id) {
    const modal = $(id);
    if (!modal) return;

    const form = modal.querySelector("form");
    if (form) form.reset();

    const errorBox = modal.querySelector("#address-error");
    if (errorBox) errorBox.innerText = "";

    editAddressId = null;
    modal.style.display = "none";
  };

  
  window.openDeleteAddressModal = function (id) {
    const form = $("deleteAddressForm");
    if (form) {
      form.action = `/user/deleteAddress/${id}`;
      showModal("delete-address-modal");
    }
  };

 

  window.openEditModal = async function (id) {
    try {
      const res = await fetch(`/user/getAddress/${id}`);
      const data = await res.json();

      if (!data.success) {
        alert("Failed to load address");
        return;
      }

      const addr = data.address;
      $("fullName").value = addr.fullName;
      $("phone").value = addr.phone;
      $("street").value = addr.street;
      $("city").value = addr.city;
      $("state").value = addr.state;
      $("pincode").value = addr.pincode;
      $("type").value = addr.type;
      $("isDefault").checked = addr.isDefault;

      editAddressId = id;
      const submitBtn = document.querySelector("#add-address-modal .modal-btn-red");
      if (submitBtn) submitBtn.innerText = "Update Address";

      document.getElementById("add-address-modal").style.display = "flex";
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  

  document.addEventListener("DOMContentLoaded", function () {
    const form = $("addressForm");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const fullName = $("fullName").value.trim();
      const phone    = $("phone").value.trim();
      const street   = $("street").value.trim();
      const city     = $("city").value.trim();
      const state    = $("state").value.trim();
      const pincode  = $("pincode").value.trim();
      const type     = $("type").value;
      const isDefault = $("isDefault").checked;

      const errorBox = $("address-error");
      if (errorBox) errorBox.innerText = "";

      // Validation
      if (!fullName) { if (errorBox) errorBox.innerText = "Full name is required"; return; }
      if (!phone) { if (errorBox) errorBox.innerText = "Phone number is required"; return; }
      if (!street) { if (errorBox) errorBox.innerText = "House name is required"; return; }
      if (!city) { if (errorBox) errorBox.innerText = "City is required"; return; }
      if (!state) { if (errorBox) errorBox.innerText = "State is required"; return; }
      if (!pincode) { if (errorBox) errorBox.innerText = "Pincode is required"; return; }

      const nameRegex = /^[A-Za-z\s]+$/;
      if (!nameRegex.test(fullName)) {
        if (errorBox) errorBox.innerText = "Name must contain only letters";
        return;
      }

      if (!/^[0-9]{10}$/.test(phone)) {
        if (errorBox) errorBox.innerText = "Phone must be 10 digits";
        return;
      }

      if (!/^[0-9]{6}$/.test(pincode)) {
        if (errorBox) errorBox.innerText = "Pincode must be 6 digits";
        return;
      }

      showGlobalLoader();
      try {
        const url = editAddressId
          ? `/user/updateAddress/${editAddressId}`
          : `/user/addAddress`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            fullName, phone, street, city, state, pincode, type, isDefault
          })
        });

        const data = await res.json();
        if (!data.success) {
          if (errorBox) errorBox.innerText = data.message;
          hideGlobalLoader();
          return;
        }

        location.reload();
      } catch (err) {
        if (errorBox) errorBox.innerText = "Something went wrong";
        hideGlobalLoader();
      }
    });
    
    const delForm = $("deleteAddressForm");
    if (delForm) {
      delForm.addEventListener("submit", function() {
        showGlobalLoader();
      });
    }
    
    const defaultForm = $("setDefaultAddressForm");
    if (defaultForm) {
      defaultForm.addEventListener("submit", function() {
        showGlobalLoader();
      });
    }
  });

})();
