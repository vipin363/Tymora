/* ============================================================
   TYMORA — main.js
   Shared navigation logic: mobile menu, search toggle, and active states.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

window.showGlobalLoader = function () {
  const overlay = document.getElementById('global-loader-overlay');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
  }
};

window.hideGlobalLoader = function () {
  const overlay = document.getElementById('global-loader-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    document.body.style.pointerEvents = '';
  }
};

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

  /* ── PREMIUM GLOBAL SEARCH OVERLAY ── */
  const searchToggle        = document.getElementById('searchToggle');
  const mobileSearchBar     = document.getElementById('mobileSearchBar');
  const desktopSearchTrigger= document.getElementById('desktopSearchTrigger');
  const desktopNavSearch    = document.querySelector('.nav-search');
  const mobileSearchInput   = document.getElementById('mobileSearchInput');
  const searchOverlay       = document.getElementById('searchOverlay');
  const liveSearchInput     = document.getElementById('liveSearchInput');
  const closeSearchModal    = document.getElementById('closeSearchModal');
  const searchResultsContainer = document.getElementById('searchResults');

  const openSearchOverlay = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (searchOverlay) {
      searchOverlay.classList.add('active');
      setTimeout(() => { if (liveSearchInput) liveSearchInput.focus(); }, 100);
      document.body.style.overflow = 'hidden';
      // Close mobile search bar and menu if open
      if (mobileSearchBar) mobileSearchBar.classList.remove('active');
      if (navLinks) navLinks.classList.remove('active');
      if (hamburger) hamburger.classList.remove('active');
      if (menuOverlay) menuOverlay.classList.remove('active');
    }
  };

  const closeSearchOverlayAction = () => {
    if (searchOverlay) {
      searchOverlay.classList.remove('active');
      document.body.style.overflow = '';
      if (liveSearchInput) liveSearchInput.value = '';
      if (searchResultsContainer) {
        searchResultsContainer.innerHTML = '';
        searchResultsContainer.classList.remove('active');
      }
    }
  };

  // Desktop: clicking anywhere in the .nav-search div (icon or input)
  if (desktopNavSearch) desktopNavSearch.addEventListener('click', openSearchOverlay);
  // Mobile: clicking the search icon button
  if (searchToggle) searchToggle.addEventListener('click', openSearchOverlay);
  // Mobile: clicking inside the mobile search bar input
  if (mobileSearchInput) mobileSearchInput.addEventListener('click', openSearchOverlay);

  // Close handlers
  if (closeSearchModal) closeSearchModal.addEventListener('click', closeSearchOverlayAction);
  if (searchOverlay) {
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) closeSearchOverlayAction();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOverlay && searchOverlay.classList.contains('active')) {
      closeSearchOverlayAction();
    }
  });

  // Debounce & Fetch Logic
  let searchTimeout = null;
  if (liveSearchInput) {
    liveSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (!query) {
        searchResultsContainer.innerHTML = '';
        searchResultsContainer.classList.remove('active');
        return;
      }

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/user/api/search-live?q=${encodeURIComponent(query)}`);
          if (!res.ok) {
            console.error('Search API error:', res.status);
            searchResultsContainer.innerHTML = '<div class="search-no-results">Search unavailable. Please try again.</div>';
            searchResultsContainer.classList.add('active');
            return;
          }
          const data = await res.json();
          if (data.success) {
            renderSearchResults(data.products);
          }
        } catch (error) {
          console.error("Search failed", error);
          searchResultsContainer.innerHTML = '<div class="search-no-results">Search unavailable. Please try again.</div>';
          searchResultsContainer.classList.add('active');
        }
      }, 300);
    });
  }

  function renderSearchResults(products) {
    if (!products || products.length === 0) {
      searchResultsContainer.innerHTML = '<div class="search-no-results">No matching products found.</div>';
      searchResultsContainer.classList.add('active');
      return;
    }

    const formatter = new Intl.NumberFormat('en-IN');
    searchResultsContainer.innerHTML = products.map(p => {
      const img = (p.images && p.images.length > 0) ? p.images[0] : '/image/default-product.jpg';
      const brand = p.brand ? p.brand.name : '';
      const price = p.salePrice || p.price || 0;
      return `<a href="/user/product/${p._id}" class="search-result-item">
        <img src="${img}" alt="${p.name}" class="search-result-img" onerror="this.src='/image/default-product.jpg'" />
        <div class="search-result-info">
          <span class="search-result-title">${p.name}</span>
          <span class="search-result-brand">${brand}</span>
        </div>
        <span class="search-result-price">₹${formatter.format(price)}</span>
      </a>`;
    }).join('');
    searchResultsContainer.classList.add('active');
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
      const profilePaths = ['/profile', '/editProfile', '/address', '/orders', '/wallet', '/coupons'];
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
