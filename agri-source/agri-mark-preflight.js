/* Mark pilot browser safety shim.
   Prevents the handover presentation guard from observing the entire rendered
   portal and recursively retriggering itself on mobile browsers. Other
   MutationObservers (including Brookfield map context) continue normally. */
(function installMarkPreflight() {
  const clientId = String(new URLSearchParams(window.location.search).get('client') || '')
    .trim()
    .toLowerCase();
  if (clientId !== 'brookfield-newfield-pilot' || !window.MutationObserver) return;

  const NativeMutationObserver = window.MutationObserver;
  function MarkSafeMutationObserver(callback) {
    const observer = new NativeMutationObserver(callback);
    const nativeObserve = observer.observe.bind(observer);
    observer.observe = function safeObserve(target, options) {
      if (target?.id === 'portal') {
        console.info('Mark portal presentation observer suppressed; timed live refresh remains active.');
        return;
      }
      return nativeObserve(target, options);
    };
    return observer;
  }
  MarkSafeMutationObserver.prototype = NativeMutationObserver.prototype;
  window.MutationObserver = MarkSafeMutationObserver;
})();
