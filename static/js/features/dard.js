/**
 * features/dard.js — AI DARD (AI Driven Artefacts Retrieval Deployment)
 */
import { escapeHtml, buildAnalysisDOM, renderMarkdown } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initDard(cfg) {
  const { loadingOverlay, navFeatureLabel } = cfg;

  // State
  let dardSearchResults = [];
  let dardFetchResult   = null;
  let dardSystems       = [];

  // View + header elements
  const dardView        = document.getElementById('dardView');
  const dardViewTitle   = document.getElementById('dardViewTitle');
  const dardViewMeta    = document.getElementById('dardViewMeta');
  const dardBody        = document.getElementById('dardBody');
  const dardNewBtn      = document.getElementById('dardNewBtn');
  const dardOptimizeBtn = document.getElementById('dardOptimizeBtn');

  // Search modal
  const dardSearchModal     = document.getElementById('dardSearchModal');
  const dardDescription     = document.getElementById('dardDescription');
  const dardSearchError     = document.getElementById('dardSearchError');
  const dardSearchCancelBtn = document.getElementById('dardSearchCancelBtn');
  const dardSearchSubmitBtn = document.getElementById('dardSearchSubmitBtn');

  // Results modal
  const dardResultsModal  = document.getElementById('dardResultsModal');
  const dardCheckboxList  = document.getElementById('dardCheckboxList');
  const dardSelectAllBtn  = document.getElementById('dardSelectAllBtn');
  const dardClearAllBtn   = document.getElementById('dardClearAllBtn');
  const dardResultsError  = document.getElementById('dardResultsError');
  const dardResultsBackBtn = document.getElementById('dardResultsBackBtn');
  const dardFetchCodeBtn  = document.getElementById('dardFetchCodeBtn');
  const dardRetrofitBtn   = document.getElementById('dardRetrofitBtn');

  // Generate modal
  const dardGenerateModal    = document.getElementById('dardGenerateModal');
  const dardGenerateSubtitle = document.getElementById('dardGenerateSubtitle');
  const dardGenerateBody     = document.getElementById('dardGenerateBody');
  const dardGenSystemWrap    = document.getElementById('dardGenSystemWrap');
  const dardGenSystemSelect  = document.getElementById('dardGenSystemSelect');
  const dardGenLoading       = document.getElementById('dardGenLoading');
  const dardGenError         = document.getElementById('dardGenError');
  const dardGenSubmitBtn     = document.getElementById('dardGenSubmitBtn');
  const dardGenerateCloseBtn = document.getElementById('dardGenerateCloseBtn');

  // Renderding functions (renderDiffTable) shared from retrofit via cfg
  const renderDiffTable = cfg._renderDiffTable;

  // Load systems on init
  (async () => {
    try {
      const res = await fetch('/api/dard/systems');
      if (res.ok) {
        const data = await res.json();
        dardSystems = data.systems || [];
      }
    } catch (_) { /* non-critical */ }
  })();

  // ── Modal helpers ──────────────────────────────────────────────────────────
  function openDardSearchModal() {
    dardDescription.value = '';
    dardSearchError.style.display = 'none';
    dardSearchSubmitBtn.disabled = false;
    dardSearchModal.classList.remove('hidden');
    setTimeout(() => dardDescription.focus(), 50);
  }

  function closeDardSearchModal() {
    dardSearchModal.classList.add('hidden');
  }

  function openDardResultsModal(matches) {
    dardSearchResults = matches;
    dardCheckboxList.innerHTML = '';
    dardResultsError.style.display = 'none';

    if (matches.length === 0) {
      dardCheckboxList.innerHTML = '<p style="padding:12px;color:#888;font-size:13px;">No artefacts found. Try a different description.</p>';
      dardFetchCodeBtn.disabled = true;
    } else {
      matches.forEach((m, i) => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;';
        row.addEventListener('mouseenter', () => row.style.background = '#f5f5f5');
        row.addEventListener('mouseleave', () => row.style.background = '');
        row.innerHTML = `
          <input type="checkbox" data-index="${i}" style="margin-top:3px;flex-shrink:0;">
          <span>
            <strong style="font-family:var(--font-mono);font-size:13px;">${escapeHtml(m.object_name)}</strong>
            <span style="font-size:11.5px;color:#888;margin-left:6px;">${escapeHtml(m.system_no)}</span><br>
            <span style="font-size:12px;color:#555;">${escapeHtml(m.description || '')}</span>
          </span>`;
        dardCheckboxList.appendChild(row);
      });
      dardFetchCodeBtn.disabled = true;
    }

    _updateFetchBtn();
    dardResultsModal.classList.remove('hidden');
  }

  function closeDardResultsModal() {
    dardResultsModal.classList.add('hidden');
  }

  function _updateFetchBtn() {
    const checked = dardCheckboxList.querySelectorAll('input[type=checkbox]:checked');
    dardFetchCodeBtn.disabled = checked.length === 0;
    dardRetrofitBtn.disabled = checked.length !== 2; // permanently disabled
  }

  dardCheckboxList.addEventListener('change', _updateFetchBtn);

  dardSelectAllBtn.addEventListener('click', () => {
    dardCheckboxList.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
    _updateFetchBtn();
  });

  dardClearAllBtn.addEventListener('click', () => {
    dardCheckboxList.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
    _updateFetchBtn();
  });

  document.getElementById('btn-dard').addEventListener('click', () => {
    navFeatureLabel.textContent = 'AI DARD';
    openDardSearchModal();
  });

  dardSearchCancelBtn.addEventListener('click', closeDardSearchModal);
  dardSearchModal.addEventListener('click', e => { if (e.target === dardSearchModal) closeDardSearchModal(); });

  dardSearchSubmitBtn.addEventListener('click', async () => {
    const desc = dardDescription.value.trim();
    if (!desc) {
      dardSearchError.textContent = 'Please describe the artefact you are looking for.';
      dardSearchError.style.display = 'block';
      return;
    }
    dardSearchError.style.display = 'none';
    dardSearchSubmitBtn.disabled = true;
    closeDardSearchModal();

    document.getElementById('loadingText').textContent = 'Searching artefact catalog\u2026';
    loadingOverlay.classList.remove('hidden');

    try {
      const res = await fetch('/api/dard/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server error ${res.status}`);
      openDardResultsModal(data.matches || []);
    } catch (err) {
      showErrorToast('AI DARD Search Error', err.message || 'Unexpected error during search.');
      openDardSearchModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      dardSearchSubmitBtn.disabled = false;
    }
  });

  dardResultsBackBtn.addEventListener('click', () => {
    closeDardResultsModal();
    openDardSearchModal();
  });

  // ── Shared fetch helper ────────────────────────────────────────────────────
  async function _doFetch(selectedItems, forceCompare) {
    dardFetchCodeBtn.disabled = true;
    dardRetrofitBtn.disabled  = true;
    closeDardResultsModal();

    document.getElementById('loadingText').textContent = forceCompare
      ? 'Fetching code & running AI comparison\u2026'
      : 'Fetching artefact source code\u2026';
    loadingOverlay.classList.remove('hidden');

    try {
      const res = await fetch('/api/dard/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_items: selectedItems, do_ai_analysis: forceCompare }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server error ${res.status}`);

      data.mode = forceCompare ? 'compare' : 'view';
      dardFetchResult = data;
      _renderDardView(data);
    } catch (err) {
      showErrorToast('AI DARD Fetch Error', err.message || 'Unexpected error while fetching code.');
      openDardResultsModal(dardSearchResults);
    } finally {
      loadingOverlay.classList.add('hidden');
      dardFetchCodeBtn.disabled = false;
      dardRetrofitBtn.disabled = false;
    }
  }

  dardFetchCodeBtn.addEventListener('click', async () => {
    const checked = dardCheckboxList.querySelectorAll('input[type=checkbox]:checked');
    const selectedItems = [];
    checked.forEach(cb => {
      const idx = parseInt(cb.dataset.index, 10);
      const m = dardSearchResults[idx];
      if (m) selectedItems.push({ system_no: m.system_no, object_name: m.object_name });
    });
    if (selectedItems.length === 0) {
      dardResultsError.textContent = 'Please select at least one artefact.';
      dardResultsError.style.display = 'block';
      return;
    }
    dardResultsError.style.display = 'none';
    await _doFetch(selectedItems, false);
  });

  dardRetrofitBtn.addEventListener('click', async () => {
    const checked = dardCheckboxList.querySelectorAll('input[type=checkbox]:checked');
    if (checked.length !== 2) {
      showErrorToast('AI DARD — Retrofit', 'Please select exactly 2 artefacts to run Retrofit.');
      return;
    }
    const selectedItems = [];
    checked.forEach(cb => {
      const idx = parseInt(cb.dataset.index, 10);
      const m = dardSearchResults[idx];
      if (m) selectedItems.push({ system_no: m.system_no, object_name: m.object_name });
    });
    dardResultsError.style.display = 'none';
    await _doFetch(selectedItems, true);
  });

  dardNewBtn.addEventListener('click', () => {
    dardView.classList.add('hidden');
    dardOptimizeBtn.classList.add('hidden');
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openDardSearchModal();
  });

  // ── Generate Code modal ────────────────────────────────────────────────────
  function _openGenerateCode(art1, art2) {
    dardGenerateSubtitle.textContent = 'Select the target system, then click Generate.';
    dardGenerateBody.innerHTML = '';
    dardGenError.style.display = 'none';
    dardGenLoading.classList.add('hidden');
    dardGenSystemWrap.style.display = '';
    dardGenSubmitBtn.disabled = false;
    dardGenSubmitBtn.style.display = '';

    dardGenSystemSelect.innerHTML = '<option value="" disabled selected>&mdash; Select system &mdash;</option>';
    const allSystems = dardSystems.length > 0
      ? dardSystems
      : [...new Set([art1.system_no, art2.system_no])];
    allSystems.forEach(sys => {
      const opt = document.createElement('option');
      opt.value = sys;
      opt.textContent = sys;
      dardGenSystemSelect.appendChild(opt);
    });

    dardGenerateModal.classList.remove('hidden');
    dardGenerateModal._art1 = art1;
    dardGenerateModal._art2 = art2;
  }

  dardGenSubmitBtn.addEventListener('click', async () => {
    const targetSystem = dardGenSystemSelect.value;
    if (!targetSystem) {
      dardGenError.textContent = 'Please select a system to generate code for.';
      dardGenError.style.display = 'block';
      return;
    }

    const art1 = dardGenerateModal._art1;
    const art2 = dardGenerateModal._art2;
    if (!art1 || !art2) return;

    const code1 = (art1.sections || []).map(s => s.code).join('\n');
    const code2 = (art2.sections || []).map(s => s.code).join('\n');

    dardGenError.style.display = 'none';
    dardGenSystemWrap.style.display = 'none';
    dardGenSubmitBtn.style.display = 'none';
    dardGenerateBody.innerHTML = '';
    dardGenLoading.classList.remove('hidden');
    dardGenerateSubtitle.textContent = `Generating optimized ABAP code for ${targetSystem}\u2026`;

    try {
      const res = await fetch('/api/dard/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifacts: [
            { system_no: art1.system_no, object_name: art1.object_name, code: code1 },
            { system_no: art2.system_no, object_name: art2.object_name, code: code2 },
          ],
          target_system: targetSystem,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server error ${res.status}`);

      dardGenerateSubtitle.textContent = `AI-optimized code for ${data.target_system || targetSystem}`;
      dardGenLoading.classList.add('hidden');
      dardGenerateBody.appendChild(buildAnalysisDOM(data.generated_code));

    } catch (err) {
      dardGenLoading.classList.add('hidden');
      dardGenSystemWrap.style.display = '';
      dardGenSubmitBtn.style.display = '';
      dardGenSubmitBtn.disabled = false;
      dardGenerateSubtitle.textContent = 'Select the target system, then click Generate.';
      dardGenError.textContent = err.message || 'AI generation failed. Please try again.';
      dardGenError.style.display = 'block';
    }
  });

  dardOptimizeBtn.addEventListener('click', () => {
    if (!dardFetchResult) return;
    const successful = (dardFetchResult.artifacts || []).filter(a => !a.error && (a.sections || []).length > 0);
    if (successful.length !== 2) {
      showErrorToast('AI DARD', 'Need exactly 2 successfully fetched artifacts to generate code.');
      return;
    }
    _openGenerateCode(successful[0], successful[1]);
  });

  dardGenerateCloseBtn.addEventListener('click', () => dardGenerateModal.classList.add('hidden'));
  dardGenerateModal.addEventListener('click', e => { if (e.target === dardGenerateModal) dardGenerateModal.classList.add('hidden'); });

  // ── renderDardView ─────────────────────────────────────────────────────────
  function _renderDardView(data) {
    hideAllViews();
    dardView.classList.remove('hidden');

    navFeatureLabel.textContent = 'AI DARD';
    dardViewTitle.textContent = 'AI DARD';

    const artifacts = data.artifacts || [];
    const summary   = data.fetch_summary || {};

    dardViewMeta.innerHTML = [
      `<span class="system-tag src">${artifacts.length} artefact(s) selected</span>`,
      summary.successful > 0 ? `<span class="system-tag dst">&#10003; ${summary.successful} fetched OK</span>` : '',
      (summary.failed && summary.failed.length > 0)
        ? `<span class="system-tag" style="background:#fff3e0;color:#e65100;">&#9888; ${summary.failed.length} failed</span>`
        : '',
    ].join(' ');

    dardBody.innerHTML = '';

    if (summary.failed && summary.failed.length > 0) {
      const errCard = document.createElement('div');
      errCard.className = 'ts-section-card';
      errCard.style.marginBottom = '16px';
      const errRows = summary.failed.map(f =>
        `<li><code>${escapeHtml(f.system_no + '/' + f.object_name)}</code>: ${escapeHtml(f.error)}</li>`
      ).join('');
      errCard.innerHTML = `
        <div class="ts-section-title" style="background:#b71c1c;">&#9888; Failed to Fetch</div>
        <div class="ts-section-content"><ul style="margin:0;padding-left:18px;">${errRows}</ul></div>`;
      dardBody.appendChild(errCard);
    }

    if (data.mode === 'compare' && artifacts.length === 2) {
      dardBody.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;overflow:hidden;padding:14px 24px 14px;';
      dardOptimizeBtn.classList.remove('hidden');
      _renderDardCompare(data);
    } else {
      dardBody.style.cssText = '';
      dardOptimizeBtn.classList.add('hidden');
      _renderDardAccordion(artifacts);
    }
  }

  // ── Client-side LCS diff ───────────────────────────────────────────────────
  function _computeDiff(lines1, lines2) {
    const L1 = lines1.slice(0, 5000);
    const L2 = lines2.slice(0, 5000);
    const m = L1.length, n = L2.length;

    const dp = new Int32Array((m + 1) * (n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const idx = i * (n + 1) + j;
        if (L1[i - 1] === L2[j - 1]) {
          dp[idx] = dp[(i - 1) * (n + 1) + (j - 1)] + 1;
        } else {
          dp[idx] = Math.max(dp[(i - 1) * (n + 1) + j], dp[i * (n + 1) + (j - 1)]);
        }
      }
    }

    const leftLines = [], rightLines = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && L1[i - 1] === L2[j - 1]) {
        leftLines.unshift({ type: 'equal',   content: L1[i - 1] });
        rightLines.unshift({ type: 'equal',  content: L2[j - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i * (n + 1) + (j - 1)] >= dp[(i - 1) * (n + 1) + j])) {
        leftLines.unshift({ type: 'empty',   content: '' });
        rightLines.unshift({ type: 'added',  content: L2[j - 1] });
        j--;
      } else {
        leftLines.unshift({ type: 'removed', content: L1[i - 1] });
        rightLines.unshift({ type: 'empty',  content: '' });
        i--;
      }
    }
    return { leftLines, rightLines };
  }

  // ── Compare mode (Retrofit-style) ──────────────────────────────────────────
  function _renderDardCompare(data) {
    const [a1, a2] = data.artifacts;
    const code1Lines = (a1.sections || []).flatMap(s => (s.code || '').split('\n'));
    const code2Lines = (a2.sections || []).flatMap(s => (s.code || '').split('\n'));
    const { leftLines, rightLines } = _computeDiff(code1Lines, code2Lines);

    const header = document.createElement('div');
    header.className = 'compare-header';
    header.style.flexShrink = '0';
    header.innerHTML = `
      <h3 style="margin:0;font-size:15px;font-weight:600;">${escapeHtml(a1.object_name)}</h3>
      <div class="compare-meta">
        <span class="meta-badge src">${escapeHtml(a1.system_no)}</span>
        <span class="meta-badge dst">${escapeHtml(a2.system_no)}</span>
      </div>
      <div class="spacer"></div>
      <div class="diff-legend">
        <span class="diff-legend-item"><span class="legend-dot added"></span> Added</span>
        <span class="diff-legend-item"><span class="legend-dot removed"></span> Removed</span>
        <span class="diff-legend-item"><span class="legend-dot changed"></span> Changed</span>
      </div>`;
    dardBody.appendChild(header);

    const row = document.createElement('div');
    row.className = 'code-blocks-row';

    const srcPanel = document.createElement('div');
    srcPanel.className = 'code-block';
    srcPanel.innerHTML = `
      <div class="code-block-header">
        <span>${escapeHtml(a1.object_name)}</span>
        <span class="system-tag src">${escapeHtml(a1.system_no)}</span>
      </div>
      <div class="code-block-body" id="dardSrcBody">
        <table class="diff-table" id="dardSrcTable"></table>
      </div>`;

    const dstPanel = document.createElement('div');
    dstPanel.className = 'code-block';
    dstPanel.innerHTML = `
      <div class="code-block-header">
        <span>${escapeHtml(a2.object_name)}</span>
        <span class="system-tag dst">${escapeHtml(a2.system_no)}</span>
      </div>
      <div class="code-block-body" id="dardDstBody">
        <table class="diff-table" id="dardDstTable"></table>
      </div>`;

    row.appendChild(srcPanel);
    row.appendChild(dstPanel);
    dardBody.appendChild(row);

    renderDiffTable(document.getElementById('dardSrcTable'), leftLines, true);
    renderDiffTable(document.getElementById('dardDstTable'), rightLines, false);
    _syncDardScroll();

    if (data.ai_analysis) {
      const aiSection = document.createElement('div');
      aiSection.className = 'ai-block';
      aiSection.innerHTML = `
        <div class="ai-block-header"><span class="ai-badge">AI</span> Difference Analysis</div>
        <div class="ai-block-body">${renderMarkdown(data.ai_analysis)}</div>`;
      dardBody.appendChild(aiSection);
    }
  }

  function _syncDardScroll() {
    const srcBody = document.getElementById('dardSrcBody');
    const dstBody = document.getElementById('dardDstBody');
    if (!srcBody || !dstBody) return;
    let syncing = false;
    srcBody.addEventListener('scroll', () => {
      if (syncing) return; syncing = true; dstBody.scrollTop = srcBody.scrollTop; syncing = false;
    });
    dstBody.addEventListener('scroll', () => {
      if (syncing) return; syncing = true; srcBody.scrollTop = dstBody.scrollTop; syncing = false;
    });
  }

  // ── View mode (accordion cards) ────────────────────────────────────────────
  function _renderDardAccordion(artifacts) {
    artifacts.forEach(art => {
      const card = document.createElement('div');
      card.className = 'ts-section-card';
      card.style.marginBottom = '16px';

      const titleEl = document.createElement('div');
      titleEl.className = 'ts-section-title';
      titleEl.style.cssText = 'background:linear-gradient(135deg,#FFF9C4 0%,#FFF176 100%);display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;border-radius:8px 8px 0 0;padding:10px 16px;box-shadow:0 2px 4px rgba(0,0,0,0.08);';
      titleEl.innerHTML = `
        <span style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:700;font-size:13.5px;color:#1a1a1a;font-family:var(--font-mono);">${escapeHtml(art.object_name)}</span>
          <span style="font-size:11px;background:#1a1a1a;color:#FFF9C4;padding:2px 9px;border-radius:20px;font-weight:700;letter-spacing:0.5px;">${escapeHtml(art.system_no)}</span>
        </span>
        <button class="btn" style="background:#fff;border:none;color:#333;font-size:11.5px;padding:4px 12px;min-width:0;font-weight:600;border-radius:20px;box-shadow:0 1px 3px rgba(0,0,0,0.15);" title="Toggle sections">&#9658; Show</button>`;

      const body = document.createElement('div');
      body.className = 'ts-section-content';
      body.style.cssText = 'background:#fff;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;padding:8px 12px 12px;';

      if (art.error) {
        body.innerHTML = `<p style="color:#c62828;">&#9888; ${escapeHtml(art.error)}</p>`;
      } else {
        const sections = art.sections || [];
        if (sections.length === 0) {
          body.innerHTML = '<p style="color:#888;">No source code sections available.</p>';
        } else {
          sections.forEach(sec => {
            const snippetBar = document.createElement('div');
            snippetBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#f6f8fa;border:1px solid #e0e0e0;border-left:4px solid #FFF176;border-radius:6px;padding:8px 12px;margin-top:8px;';

            const snippetLabel = document.createElement('span');
            snippetLabel.style.cssText = 'font-weight:600;font-size:12px;color:#24292e;font-family:var(--font-mono);';
            snippetLabel.textContent = art.object_name + (sec.is_main ? '' : ' — ' + sec.label);

            const snippetActions = document.createElement('div');
            snippetActions.style.cssText = 'display:flex;gap:6px;align-items:center;';

            const copyBtn = document.createElement('button');
            copyBtn.style.cssText = 'background:#24292e;border:none;color:#fff;font-size:11px;padding:4px 12px;border-radius:20px;cursor:pointer;font-family:var(--font-ui);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.2);';
            copyBtn.innerHTML = '&#128203; Copy';
            copyBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(sec.code || '').then(() => {
                copyBtn.innerHTML = '&#10003; Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => { copyBtn.innerHTML = '&#128203; Copy'; copyBtn.classList.remove('copied'); }, 2000);
              }).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = sec.code || '';
                document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                copyBtn.innerHTML = '&#10003; Copied!';
                setTimeout(() => { copyBtn.innerHTML = '&#128203; Copy'; }, 2000);
              });
            });

            const snipToggle = document.createElement('button');
            snipToggle.style.cssText = 'background:#FFF9C4;border:1px solid #f0e060;color:#1a1a1a;font-size:11px;padding:4px 12px;border-radius:20px;cursor:pointer;font-family:var(--font-ui);font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.1);';
            snipToggle.innerHTML = '&#9658; Show';

            snippetActions.appendChild(copyBtn);
            snippetActions.appendChild(snipToggle);
            snippetBar.appendChild(snippetLabel);
            snippetBar.appendChild(snippetActions);

            const pre = document.createElement('pre');
            pre.style.cssText = 'display:none;margin:0;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 6px 6px;background:#fff;color:#24292e;font-size:12px;overflow:auto;max-height:420px;white-space:pre;font-family:var(--font-mono);padding:0;line-height:1.6;';

            const table = document.createElement('table');
            table.style.cssText = 'width:100%;border-collapse:collapse;';
            const lines = (sec.code || '(empty)').split('\n');
            const tbody = document.createDocumentFragment();
            lines.forEach((line, idx) => {
              const tr = document.createElement('tr');
              tr.style.cssText = 'background:#fff;';
              tr.addEventListener('mouseenter', () => tr.style.background = '#f6f8fa');
              tr.addEventListener('mouseleave', () => tr.style.background = '#fff');
              const tdLn = document.createElement('td');
              tdLn.style.cssText = 'width:44px;min-width:44px;text-align:right;padding:0 10px 0 0;color:#aaa;user-select:none;border-right:1px solid #eee;background:#f6f8fa;font-size:11px;vertical-align:top;';
              tdLn.textContent = idx + 1;
              const tdCode = document.createElement('td');
              tdCode.style.cssText = 'padding:0 12px;white-space:pre;color:#24292e;font-size:12px;';
              tdCode.textContent = line;
              tr.appendChild(tdLn);
              tr.appendChild(tdCode);
              tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            pre.appendChild(table);

            snipToggle.addEventListener('click', () => {
              const isHidden = pre.style.display === 'none';
              pre.style.display = isHidden ? '' : 'none';
              snipToggle.innerHTML = isHidden ? '&#9660; Hide' : '&#9658; Show';
            });

            body.appendChild(snippetBar);
            body.appendChild(pre);
          });
        }
      }

      const toggleBtn = titleEl.querySelector('button');
      toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? '' : 'none';
        toggleBtn.innerHTML = isHidden ? '&#9660; Hide' : '&#9658; Show';
      });
      titleEl.addEventListener('click', () => toggleBtn.click());

      card.appendChild(titleEl);
      card.appendChild(body);
      dardBody.appendChild(card);
    });
  }
}
