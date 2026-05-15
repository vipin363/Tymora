/* ============================================================
   TYMORA — main.js
   Shared navigation logic: mobile menu, search toggle, and active states.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ── MOBILE MENU ── */
  const hamburger    = document.getElementById('hamburgerBtn');
  const navLinks     = document.querySelector('.nav-links');
  const menuOverlay  = document.getElementById('menuOverlay');
  const dropdownToggle = document.querySelector('.nav-dropdown-toggle');
  const dropdownLi     = document.querySelector('.nav-dropdown-li');

  if (hamburger && navLinks && menuOverlay) {
    const toggleMenu = () => {
      const isOpen = navLinks.classList.toggle('active');
      hamburger.classList.toggle('active');
      menuOverlay.classList.toggle('active');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    };

    const closeMenu = () => {
      navLinks.classList.remove('active');
      hamburger.classList.remove('active');
      menuOverlay.classList.remove('active');
      document.body.style.overflow = '';
    };

    hamburger.addEventListener('click', toggleMenu);
    menuOverlay.addEventListener('click', closeMenu);

    // Close menu on link click
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', (e) => {
        if (!link.classList.contains('nav-dropdown-toggle')) {
          closeMenu();
        }
      });
    });
    
    // Mobile Dropdown Toggle
    if (dropdownToggle && dropdownLi) {
      dropdownToggle.addEventListener('click', (e) => {
        if (window.innerWidth <= 900) {
          e.preventDefault();
          dropdownLi.classList.toggle('active');
        }
      });
    }
  }

  /* ── MOBILE SEARCH ── */
  const searchToggle      = document.getElementById('searchToggle');
  const mobileSearchBar   = document.getElementById('mobileSearchBar');
  const mobileSearchInput = document.getElementById('mobileSearchInput');

  if (searchToggle && mobileSearchBar && mobileSearchInput) {
    searchToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileSearchBar.classList.toggle('active');
      if (isOpen) {
        mobileSearchInput.focus();
        // Ensure menu is closed when search opens
        if (typeof closeMenu === 'function') closeMenu();
      }
    });

    // Close search on outside click
    document.addEventListener('click', (e) => {
      if (!searchToggle.contains(e.target) && !mobileSearchBar.contains(e.target)) {
        mobileSearchBar.classList.remove('active');
      }
    });
  }

  /* ── ACTIVE STATES ── */
  const updateActiveStates = () => {
    const path = window.location.pathname;
    const homePaths = ['/user/home', '/user', '/user/', '/', '/home'];

    // Nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href');
      
      const isHomePath = homePaths.includes(path) && href === '/user/home';
      const isExactMatch = href === path;

      if (isHomePath || isExactMatch) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Account icon highlight for all profile-related sub-pages
    const accountBtn = document.querySelector('a.nav-icon-btn[href="/user/profile"]');
    if (accountBtn) {
      const profilePaths = ['/profile', '/editProfile', '/address', '/orders', '/wishlist', '/wallet', '/coupons'];
      const isProfilePage = profilePaths.some(p => path.includes(p));
      
      const svg = accountBtn.querySelector('svg');
      if (svg) {
        svg.style.stroke = isProfilePage ? '#C9A84C' : '';
      }
    }
  };

  updateActiveStates();

  // Watch for window resize to fix body scroll if menu was open
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      if (navLinks) navLinks.classList.remove('active');
      if (hamburger) hamburger.classList.remove('active');
      if (menuOverlay) menuOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
});
