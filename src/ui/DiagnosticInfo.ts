import { connectionDiagnostics } from '../account/ConnectionDiagnostics';
import { bindText } from '../settings/i18n';

export function diagnosticInfo(signal: AbortSignal): HTMLElement {
  const root = document.createElement('div'); root.className = 'diagnostic-info';
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'commerce-primary'; bindText(copy, 'diagnosticCopy');
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const manual = document.createElement('textarea'); manual.readOnly = true; manual.hidden = true;
  manual.setAttribute('aria-label', 'PawHaven diagnostics');
  copy.addEventListener('click', () => {
    if (copy.disabled) return;
    const report = connectionDiagnostics.report(); copy.disabled = true;
    void (async () => {
      try {
        await navigator.clipboard.writeText(report);
        if (!signal.aborted) { manual.hidden = true; bindText(status, 'diagnosticCopied'); }
      } catch {
        if (!signal.aborted) { manual.value = report; manual.hidden = false; bindText(status, 'diagnosticManual'); manual.focus(); manual.select(); }
      } finally { if (!signal.aborted) copy.disabled = false; }
    })();
  }, { signal });
  root.append(copy, status, manual); return root;
}
