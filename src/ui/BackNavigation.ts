const actions = new WeakMap<HTMLElement, () => void>();
const MARKER = '__pawhavenBack';
let changed: (() => void) | undefined;

/** Associate an existing close/back action without retaining detached UI roots. */
export function backAction(element: HTMLElement, action: () => void): void {
  actions.set(element, action); changed?.();
}

/** One same-URL history guard, shared by every screen and modal. */
export function installBackNavigation(host: HTMLElement): () => void {
  const root = host.ownerDocument.body;
  let armed = window.history.state?.[MARKER] === true;
  let disposed = false;
  let cleaning = false;
  const top = () => Array.from(root.querySelectorAll<HTMLElement>('*')).reverse().find(element => actions.has(element) && !element.closest('[hidden]'));
  const arm = () => {
    if (disposed || armed || cleaning) return;
    try {
      const state = window.history.state;
      window.history.pushState({ ...(state && typeof state === 'object' ? state : {}), [MARKER]: true }, '', window.location.href);
      armed = true;
    } catch { /* Unsupported history keeps the existing on-screen controls usable. */ }
  };
  const sync = () => {
    if (disposed || cleaning) return;
    if (top()) arm();
    else if (armed) {
      cleaning = true;
      window.history.back();
    }
  };
  const pop = () => {
    if (disposed) return;
    if (cleaning) { cleaning = false; armed = window.history.state?.[MARKER] === true; sync(); return; }
    if (window.history.state?.[MARKER] === true) { armed = true; sync(); return; }
    if (!armed) return;
    armed = false;
    const target = top();
    if (target) {
      // Rearm before async closing or confirmation, without adding a modal per entry.
      arm();
      try { if (!target.closest('[inert]')) actions.get(target)?.(); } finally { sync(); }
    } else {
      // Skip only our same-page guard; the next Back from the lobby stays native.
      window.history.back();
    }
  };
  changed = sync;
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) sync();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('popstate', pop); sync();
  return () => { disposed = true; observer.disconnect(); window.removeEventListener('popstate', pop); if (changed === sync) changed = undefined; };
}
