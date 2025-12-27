(function(){
  // for reduced motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('img[src$=".gif"]').forEach(img => {
    try {
      img.loading = 'eager';
      const src = img.currentSrc || img.src;
      if (!src) return;
      // reload the resource and (re)start animation
      if (!src.includes('_gifreload=')) {
        img.src = src + (src.includes('?') ? '&' : '?') + '_gifreload=' + Date.now();
      } else {
        img.src = src;
      }
    } catch (e) { /* ignore */ }
  });

  // Targets elements with data attributes for GIFs
  document.querySelectorAll('[data-bg-gif], [style*=".gif"]').forEach(el => {
    try {
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
      if (!m) return;
      const url = m[1];
      if (!url || !url.toLowerCase().endsWith('.gif')) return;

      
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'eager';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      
      el.style.backgroundImage = 'none';
      
      el.appendChild(img);
    } catch (e) { /* ignore */ }
  });
})();
(function(){
  // for reduced motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  
  document.querySelectorAll('img[src$=".gif"]').forEach(img => {
    try {
      img.loading = 'eager';
      const src = img.currentSrc || img.src;
      if (!src) return;
      
      if (!src.includes('_gifreload=')) {
        img.src = src + (src.includes('?') ? '&' : '?') + '_gifreload=' + Date.now();
      } else {
        img.src = src;
      }
    } catch (e) { /* ignore */ }
  });

  // data attributes for GIFs
  document.querySelectorAll('[data-bg-gif], [style*=".gif"]').forEach(el => {
    try {
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
      if (!m) return;
      const url = m[1];
      if (!url || !url.toLowerCase().endsWith('.gif')) return;

      //element to ensure animation plays
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'eager';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      
      el.style.backgroundImage = 'none';
      
      el.appendChild(img);
    } catch (e) { /* ignore */ }
  });
})();


//respects prefers-reduced-motion.
(function(){
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ICON_SELECTOR = '[data-gif], [data-gif-bg], .gif-icon';

  function isImg(el) { return el.tagName && el.tagName.toLowerCase() === 'img'; }

  function setImgToGif(imgEl, gifUrl) {
    if (!gifUrl) return;
    // store original src once
    if (!imgEl.dataset._origSrc) imgEl.dataset._origSrc = imgEl.src || '';
    // force reload to restart animation
    imgEl.src = gifUrl + (gifUrl.includes('?') ? '&' : '?') + '_gifhover=' + Date.now();
    imgEl.loading = 'eager';
  }

  function restoreImg(imgEl) {
    if (imgEl.dataset._origSrc !== undefined) {
      imgEl.src = imgEl.dataset._origSrc;
    }
  }

  function setBgToGif(el, gifUrl) {
    if (!gifUrl) return;
    if (!el.dataset._origBg) el.dataset._origBg = el.style.backgroundImage || getComputedStyle(el).backgroundImage || '';
    el.style.backgroundImage = `url("${gifUrl}")`;
    el.style.backgroundSize = el.dataset._origBgSize || (el.style.backgroundSize || 'cover');
  }

  function restoreBg(el) {
    if (el.dataset._origBg !== undefined) {
      el.style.backgroundImage = el.dataset._origBg;
    }
  }

  document.querySelectorAll(ICON_SELECTOR).forEach(el => {
    // determine gif and static urls
    const gif = el.dataset.gif || el.dataset.gifBg || el.getAttribute('data-gif') || el.getAttribute('data-gif-bg');
    const staticSrc = el.dataset.static || el.dataset.staticBg;

    //for mouse/touch, and focus/blur for keyboard
    el.addEventListener('pointerenter', () => {
      if (isImg(el)) {
        
        if (gif) setImgToGif(el, gif);
      } else {
        // background element
        if (gif) setBgToGif(el, gif);
        // if element had a background image gif replaced before, restart its animation
        const childGifImg = el.querySelector('img');
        if (childGifImg && childGifImg.src && childGifImg.src.toLowerCase().endsWith('.gif')) {
          // reload to restart animation
          childGifImg.src = childGifImg.src.split('_gifhover=')[0] + (childGifImg.src.includes('?') ? '&' : '?') + '_gifhover=' + Date.now();
        }
      }
    }, { passive: true });

    el.addEventListener('pointerleave', () => {
      if (isImg(el)) {
        if (staticSrc) {
          el.src = staticSrc;
        } else {
          restoreImg(el);
        }
      } else {
        if (staticSrc) {
          el.style.backgroundImage = `url("${staticSrc}")`;
        } else {
          restoreBg(el);
        }
      }
    }, { passive: true });

    // keyboard accessibility
    el.addEventListener('focus', () => {
      if (isImg(el)) {
        if (gif) setImgToGif(el, gif);
      } else {
        if (gif) setBgToGif(el, gif);
      }
    });
    el.addEventListener('blur', () => {
      if (isImg(el)) {
        if (staticSrc) el.src = staticSrc; else restoreImg(el);
      } else {
        if (staticSrc) el.style.backgroundImage = `url("${staticSrc}")`; else restoreBg(el);
      }
    });
  });
})();