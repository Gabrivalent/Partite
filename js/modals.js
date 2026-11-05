// ==========================================================================
// FALLBACK LOCALE HAPTIC FEEDBACK (Risolve crash riga 1212)
// ==========================================================================
const triggerHaptic = (function() {
  return function() {
    try {
      if (typeof window !== 'undefined' && typeof window.triggerHaptic === 'function') {
        window.triggerHaptic();
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch (e) {
      // Ignora silenziosamente se l'hardware non supporta la vibrazione
    }
  };
})();
