//prevent right click and some hotkeys
document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function(e) {
  if (e.keyCode == 123 || // F12
      (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) || // Ctrl+Shift+I
      (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0))) { // Ctrl+U
    return false;
  }
}

// Make images and links non-draggable
document.addEventListener('DOMContentLoaded', () => {
 
  document.querySelectorAll('img, a').forEach(el => {
    try {
      el.setAttribute('draggable', 'false');
      el.draggable = false;
    } catch (e) { /* ignore */ }
  });

  // Prevent dragstart for images and links (and images inside links)
  document.addEventListener('dragstart', (e) => {
    const t = e.target;
    if (!t) return;
    const tag = (t.tagName || '').toUpperCase();
    if (tag === 'IMG' || tag === 'A' || (t.closest && t.closest('a'))) {
      e.preventDefault();
    }
  }, true);
});


// Responsive navigation and smooth scrolling
document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const menuToggle = document.getElementById('mobile-menu');
  const navLinks = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function() {
      navLinks.classList.toggle('active');
      menuToggle.classList.toggle('active');
    });
  }

  // Smooth scroll for nav links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }

      // Close mobile menu after click
      if (navLinks) navLinks.classList.remove('active');
      if (menuToggle) menuToggle.classList.remove('active');
    });
  });

  // Slider
  const viewport = document.querySelector('.slider-viewport');
  if (!viewport) return;

  const track = document.querySelector('.slider-track');
  const slides = Array.from(track ? track.querySelectorAll('.slide') : []);
  const prevBtn = document.querySelector('.slider-btn.prev');
  const nextBtn = document.querySelector('.slider-btn.next');

  let index = 0;
  let isDragging = false;
  let startX = 0;
  let currentTranslate = 0;
  let animationId = null;
  let autoplayInterval = null;

  function slidesToShow() {
    const w = window.innerWidth;
    if (w >= 1100) return 3;
    if (w >= 700) return 2;
    return 1;
  }

  function maxIndex() {
    return Math.max(0, slides.length - slidesToShow());
  }

  function updatePosition() {
    const show = slidesToShow();
    const slideWidth = viewport.clientWidth / show;
    const translateX = -index * slideWidth;
    if (track) track.style.transform = `translateX(${translateX}px)`;
  }

  function goTo(i) {
    index = Math.min(Math.max(0, i), maxIndex());
    updatePosition();
  }

  if (nextBtn) nextBtn.addEventListener('click', () => goTo(index + 1));
  if (prevBtn) prevBtn.addEventListener('click', () => goTo(index - 1));

  // Autoplay
  function startAutoplay() {
    // Autoplay is disabled — no automatic sliding
    autoplayInterval = null;
  }
  function stopAutoplay() {
    // No-op when autoplay is disabled. Keep safe clear in case it's set elsewhere.
    if (autoplayInterval) { clearInterval(autoplayInterval); autoplayInterval = null; }
  }

  // Touch / drag support
  viewport.addEventListener('pointerdown', (e) => {
    if (!track) return;
    isDragging = true;
    startX = e.clientX;
    const style = track.style.transform || '';
    currentTranslate = parseFloat(style.replace('translateX(', '').replace('px)', '')) || 0;
    viewport.setPointerCapture(e.pointerId);
    stopAutoplay();
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!isDragging || !track) return;
    const delta = e.clientX - startX;
    track.style.transform = `translateX(${currentTranslate + delta}px)`;
  });
  viewport.addEventListener('pointerup', (e) => {
    if (!isDragging || !track) return;
    isDragging = false;
    const delta = e.clientX - startX;
    const show = slidesToShow();
    const slideWidth = viewport.clientWidth / show;
    if (Math.abs(delta) > slideWidth * 0.2) {
      if (delta < 0) goTo(index + 1); else goTo(index - 1);
    } else {
      goTo(index);
    }
    startAutoplay();
  });
  viewport.addEventListener('pointercancel', () => { isDragging = false; goTo(index); startAutoplay(); });

  window.addEventListener('resize', () => {

    // Keep index in valid range when slidesToShow changes
    index = Math.min(index, maxIndex());
    updatePosition();
  });

  // init
  goTo(0);
  // startAutoplay(); // autoplay disabled

  // Pause on hover (autoplay disabled so listeners are not needed)
  // viewport.addEventListener('mouseenter', stopAutoplay);
  // viewport.addEventListener('mouseleave', startAutoplay);
});

// Auto resizing click-slider for .services-slider
document.addEventListener('DOMContentLoaded', () => {
    const track = document.querySelector('.slider-track');
    const slides = Array.from(document.querySelectorAll('.slide'));
    const prevBtn = document.querySelector('.slider-btn.prev');
    const nextBtn = document.querySelector('.slider-btn.next');
    if (!track || slides.length === 0 || !prevBtn || !nextBtn) return;

    let currentIndex = 0;

    function updateButtons() {
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= slides.length - 1;
        prevBtn.setAttribute('aria-disabled', prevBtn.disabled);
        nextBtn.setAttribute('aria-disabled', nextBtn.disabled);
    }

    function updateTrack() {
      
        // compute slide width from the first slide's computed width
        const slideRect = slides[0].getBoundingClientRect();
        const slideWidth = Math.round(slideRect.width);
        const offset = slideWidth * currentIndex;
        track.style.transform = `translateX(-${offset}px)`;
    }

    prevBtn.addEventListener('click', () => {
        currentIndex = Math.max(0, currentIndex - 1);
        updateTrack();
        updateButtons();
    });

    nextBtn.addEventListener('click', () => {
        currentIndex = Math.min(slides.length - 1, currentIndex + 1);
        updateTrack();
        updateButtons();
    });

    // Recalculate on resize so the slider auto-adjusts to screen
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // keep currentIndex
            currentIndex = Math.min(currentIndex, Math.max(0, slides.length - 1));
            updateTrack();
            updateButtons();
        }, 80);
    });

    // init
    updateTrack();
    updateButtons();
});

// Drawer menu functionality
document.addEventListener('DOMContentLoaded', function(){
  const menuButton = document.getElementById('menuButton');
  const menuDrawer = document.getElementById('menuDrawer');
  const menuOverlay = document.getElementById('menuOverlay');
  const drawerClose = document.getElementById('drawerClose');

  if (!menuButton || !menuDrawer) return;

  // collect in-drawer links 
  const links = Array.from(menuDrawer.querySelectorAll('.drawer-link, a[href^="#"]'));

  function openMenu() {
    menuButton.classList.add('open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuDrawer.setAttribute('aria-hidden', 'false');
    menuDrawer.style.display = 'block';
    const firstLink = menuDrawer.querySelector('.drawer-link, #drawer-name, a[href^="#"]');
    if (firstLink) firstLink.focus();
    menuDrawer.classList.add('open');
    if (menuOverlay) menuOverlay.style.display = 'block';
  }

  function closeMenu() {
    menuButton.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuDrawer.setAttribute('aria-hidden', 'true');
    menuDrawer.style.display = 'none';
    menuDrawer.classList.remove('open');
    if (menuOverlay) menuOverlay.style.display = 'none';
    menuButton.focus();
  }

  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.classList.contains('open');
    if (isOpen) closeMenu(); else openMenu();
  });

  if (menuOverlay) menuOverlay.addEventListener('click', closeMenu);
  if (drawerClose) drawerClose.addEventListener('click', closeMenu);

  // close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuDrawer.classList.contains('open')) closeMenu();
  });

  // smooth scroll for drawer links + close after click
  if (links && links.length) {
    links.forEach(link=>{
      link.addEventListener('click', function(e){
        const href = this.getAttribute('href');
        if(href && href.startsWith('#')){
          e.preventDefault();
          closeMenu();
          const el = document.querySelector(href);
          if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
        }
      });
    });
  }
});
