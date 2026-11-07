'use strict';
// Keyboard/orientation sizing only. Never resize or recreate the signature buffer.
(function () {
  const root = document.documentElement;
  function updateViewport() {
    const viewport = window.visualViewport;
    root.style.setProperty('--visible-viewport-height', `${Math.round(viewport ? viewport.height : window.innerHeight)}px`);
    root.style.setProperty('--visible-viewport-top', `${Math.round(viewport ? viewport.offsetTop : 0)}px`);
  }
  window.addEventListener('resize', updateViewport, {passive: true});
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewport, {passive: true});
    window.visualViewport.addEventListener('scroll', updateViewport, {passive: true});
  }
  updateViewport();
})();
