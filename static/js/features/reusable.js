/**
 * features/reusable.js — Reusable Artifacts Tool feature
 */
import { escapeHtml, buildAnalysisDOM } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initReusable(cfg) {
  const { loadingOverlay, navFeatureLabel } = cfg;

  const reusableModal     = document.getElementById('reusableModal');
  const reusableQuestion  = document.getElementById('reusableQuestion');
  const reusableError     = document.getElementById('reusableError');
  const reusableSubmitBtn = document.getElementById('reusableSubmitBtn');
  const reusableCancelBtn = document.getElementById('reusableCancelBtn');

  const reusableView      = document.getElementById('reusableView');
  const reusableViewTitle = document.getElementById('reusableViewTitle');
  const reusableViewMeta  = document.getElementById('reusableViewMeta');
  const reusableBody      = document.getElementById('reusableBody');
  const reusableNewBtn    = document.getElementById('reusableNewBtn');

  function openReusableModal() {
    reusableQuestion.value = '';
    reusableError.style.display = 'none';
    reusableSubmitBtn.disabled = false;
    reusableModal.classList.remove('hidden');
    setTimeout(() => reusableQuestion.focus(), 50);
  }

  function closeReusableModal() {
    reusableModal.classList.add('hidden');
  }

  reusableCancelBtn.addEventListener('click', closeReusableModal);
  reusableModal.addEventListener('click', e => { if (e.target === reusableModal) closeReusableModal(); });

  document.getElementById('btn-reusable').addEventListener('click', () => {
    navFeatureLabel.textContent = 'Reusable Artifacts Tool';
    openReusableModal();
  });

  reusableNewBtn.addEventListener('click', () => {
    hideAllViews();
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openReusableModal();
  });

  reusableSubmitBtn.addEventListener('click', async () => {
    const question = reusableQuestion.value.trim();
    if (!question) {
      reusableError.textContent = 'Please describe what you need.';
      reusableError.style.display = 'block';
      return;
    }
    reusableError.style.display = 'none';
    closeReusableModal();

    document.getElementById('loadingText').textContent = 'Searching reusable artifact catalog\u2026';
    loadingOverlay.classList.remove('hidden');
    reusableSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/reusable-artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `Server error ${res.status}`);
      }

      const data = await res.json();

      hideAllViews();
      reusableView.classList.remove('hidden');

      navFeatureLabel.textContent = 'Reusable Artifacts Tool';
      reusableViewTitle.textContent = data.question || 'Reusable Artifacts';

      reusableViewMeta.innerHTML = [
        `<span class="system-tag src">S59 RAG catalog</span>`,
        `<span class="system-tag dst">${data.rag_chunks_count} chunks matched</span>`,
        data.fetched_artifacts.length > 0
          ? `<span class="system-tag" style="background:#e8f5e9;color:#2e7d32;">${data.fetched_artifacts.filter(a => a.status === 'ok').length} sources fetched</span>`
          : '',
      ].join('');

      reusableBody.innerHTML = '';
      if (data.fetched_artifacts && data.fetched_artifacts.length > 0) {
        const fetchRows = data.fetched_artifacts.map(a => {
          const icon = a.status === 'ok' ? '\u2705' : '\u274C';
          return `<tr><td>${icon}</td><td><code>${escapeHtml(a.type)}</code></td><td><strong>${escapeHtml(a.name)}</strong></td><td style="color:#555;font-size:11px">${escapeHtml(a.status)}</td></tr>`;
        }).join('');
        const badge = document.createElement('div');
        badge.className = 'fetched-badge';
        badge.style.margin = '0 0 18px 0';
        badge.innerHTML = `
          <div class="fetched-header" style="cursor:default">
            <span class="fetched-icon">&#129302;</span>
            <span class="fetched-title">AI searched catalog on S59 &amp; fetched ${data.fetched_artifacts.length} artifact source(s) from D59</span>
          </div>
          <div class="fetched-body" style="display:block">
            <table class="fetched-table">
              <thead><tr><th></th><th>Type</th><th>Name</th><th>Status</th></tr></thead>
              <tbody>${fetchRows}</tbody>
            </table>
          </div>`;
        reusableBody.appendChild(badge);
      }

      reusableBody.appendChild(buildAnalysisDOM(data.reply));

    } catch (err) {
      const isSapError = err.message && (
        err.message.includes('Could not fetch') ||
        err.message.includes('502') ||
        err.message.includes('503') ||
        err.message.includes('catalog returned empty')
      );
      if (isSapError) {
        showErrorToast('SAP Data Fetch Failed', err.message + '\n\nThis usually means the SAP OData service is unavailable.');
      } else {
        showErrorToast('Reusable Artifacts Error', err.message || 'An unexpected error occurred.');
      }
      openReusableModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent = 'Fetching artifact & running AI analysis\u2026';
      reusableSubmitBtn.disabled = false;
    }
  });
}
