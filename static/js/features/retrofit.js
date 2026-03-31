/**
 * features/retrofit.js — Retro Fit Tool
 */
import { escapeHtml, renderMarkdown } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initRetrofit(cfg) {
  const { loadingOverlay, navFeatureLabel, validSystems, artifactTypes } = cfg;

  const systemDescriptions = cfg.systemDescriptions;

  // Modal elements
  const retrofitModal     = document.getElementById('retrofitModal');
  const artifactNameEl    = document.getElementById('artifactName');
  const artifactTypeEl    = document.getElementById('artifactType');
  const fgGroup           = document.getElementById('fgGroup');
  const functionGroupEl   = document.getElementById('functionGroup');
  const sourceSystemEl    = document.getElementById('sourceSystem');
  const destSystemEl      = document.getElementById('destSystem');
  const retrofitError     = document.getElementById('retrofitError');
  const retrofitSubmitBtn = document.getElementById('retrofitSubmitBtn');
  const retrofitCancelBtn = document.getElementById('retrofitCancelBtn');

  // Compare view elements
  const compareView    = document.getElementById('compareView');
  const compareTitle   = document.getElementById('compareTitle');
  const compareMeta    = document.getElementById('compareMeta');
  const srcTag         = document.getElementById('srcTag');
  const dstTag         = document.getElementById('dstTag');
  const aiAnalysisBody = document.getElementById('aiAnalysisBody');

  // Populate dropdowns
  artifactTypes.forEach(t => artifactTypeEl.appendChild(new Option(t, t)));
  validSystems.forEach(s => {
    const label = systemDescriptions[s] || s;
    sourceSystemEl.appendChild(new Option(label, s));
    destSystemEl.appendChild(new Option(label, s));
  });

  // Show/hide function group
  artifactTypeEl.addEventListener('change', () => {
    if (artifactTypeEl.value === 'Function Module') {
      fgGroup.classList.remove('hidden');
    } else {
      fgGroup.classList.add('hidden');
      functionGroupEl.value = '';
    }
  });

  function showError(msg) {
    retrofitError.textContent = msg;
    retrofitError.style.display = 'block';
  }

  function hideError() {
    retrofitError.textContent = '';
    retrofitError.style.display = 'none';
  }

  function openRetrofitModal() {
    resetModal();
    retrofitModal.classList.remove('hidden');
    artifactNameEl.focus();
  }

  function closeRetrofitModal() {
    retrofitModal.classList.add('hidden');
    if (compareView.classList.contains('hidden')) {
      navFeatureLabel.textContent = '';
    }
  }

  function resetModal() {
    artifactNameEl.value = '';
    artifactTypeEl.value = '';
    functionGroupEl.value = '';
    sourceSystemEl.value = '';
    destSystemEl.value = '';
    fgGroup.classList.add('hidden');
    hideError();
    retrofitSubmitBtn.disabled = false;
  }

  retrofitCancelBtn.addEventListener('click', closeRetrofitModal);
  retrofitModal.addEventListener('click', e => { if (e.target === retrofitModal) closeRetrofitModal(); });

  document.getElementById('btn-retrofit').addEventListener('click', () => {
    navFeatureLabel.textContent = 'Retro Fit Tool';
    openRetrofitModal();
  });

  retrofitSubmitBtn.addEventListener('click', async () => {
    hideError();

    const artifactName  = artifactNameEl.value.trim();
    const artifactType  = artifactTypeEl.value;
    const functionGroup = functionGroupEl.value.trim();
    const sourceSystem  = sourceSystemEl.value;
    const destSystem    = destSystemEl.value;

    if (!artifactName)  return showError('Please enter the artifact name.');
    if (!artifactType)  return showError('Please select an artifact type.');
    if (artifactType === 'Function Module' && !functionGroup)
      return showError('Please enter the function group.');
    if (!sourceSystem)  return showError('Please select the source system.');
    if (!destSystem)    return showError('Please select the destination system.');
    if (sourceSystem === destSystem)
      return showError('Source and destination systems must be different.');

    closeRetrofitModal();
    loadingOverlay.classList.remove('hidden');
    retrofitSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/retrofit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact_name: artifactName,
          artifact_type: artifactType,
          function_group: functionGroup || null,
          source_system: sourceSystem,
          destination_system: destSystem,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      renderCompareView(data);

    } catch (err) {
      openRetrofitModal();
      showError(err.message || 'Unexpected error. Please try again.');
      if (err.message && (err.message.includes('502') || err.message.includes('503') || err.message.includes('Could not fetch'))) {
        showErrorToast('SAP Fetch Failed', err.message);
      }
    } finally {
      loadingOverlay.classList.add('hidden');
      retrofitSubmitBtn.disabled = false;
    }
  });

  function renderCompareView(data) {
    navFeatureLabel.textContent = 'Retro Fit Tool';
    compareTitle.textContent = `${data.artifact_type}: ${data.artifact_name}`;
    compareMeta.innerHTML = `
      <span class="meta-badge src">Source: ${data.source_system}</span>
      <span class="meta-badge dst">Destination: ${data.destination_system}</span>
    `;
    srcTag.textContent = data.source_system;
    dstTag.textContent = data.destination_system;

    syncCodeBlockScroll();

    renderDiffTable(document.getElementById('srcDiffTable'), data.left_lines, true);
    renderDiffTable(document.getElementById('dstDiffTable'), data.right_lines, false);

    aiAnalysisBody.innerHTML = renderMarkdown(data.ai_analysis);

    hideAllViews();
    compareView.classList.remove('hidden');
  }

  document.getElementById('reviewNewBtn') && null; // handled by code_review.js

  // expose for DARD reuse
  cfg._renderDiffTable = renderDiffTable;

  function renderDiffTable(tableEl, lines, _isSource) {
    tableEl.innerHTML = '';
    const tbody = document.createDocumentFragment();
    let lineNo = 1;

    lines.forEach(line => {
      const tr = document.createElement('tr');
      tr.className = diffTypeClass(line.type);

      const tdLn = document.createElement('td');
      tdLn.className = 'ln';
      tdLn.textContent = (line.type === 'empty' || line.content === '') ? '' : lineNo;

      const tdCode = document.createElement('td');
      tdCode.textContent = line.content;

      tr.appendChild(tdLn);
      tr.appendChild(tdCode);
      tbody.appendChild(tr);

      if (line.type !== 'empty' && line.content !== '') lineNo++;
    });

    tableEl.appendChild(tbody);
  }

  function diffTypeClass(type) {
    switch (type) {
      case 'added':   return 'diff-line-added';
      case 'removed': return 'diff-line-removed';
      case 'changed': return 'diff-line-changed';
      case 'empty':   return 'diff-line-empty';
      default:        return 'diff-line-equal';
    }
  }

  function syncCodeBlockScroll() {
    const srcBody = document.getElementById('srcCodeBody');
    const dstBody = document.getElementById('dstCodeBody');

    const newSrc = srcBody.cloneNode(true);
    const newDst = dstBody.cloneNode(true);
    const newSrcTable = newSrc.querySelector('.diff-table');
    const newDstTable = newDst.querySelector('.diff-table');
    if (newSrcTable) newSrcTable.id = 'srcDiffTable';
    if (newDstTable) newDstTable.id = 'dstDiffTable';
    srcBody.parentNode.replaceChild(newSrc, srcBody);
    dstBody.parentNode.replaceChild(newDst, dstBody);

    let isSyncing = false;
    newSrc.addEventListener('scroll', () => {
      if (isSyncing) return; isSyncing = true;
      newDst.scrollTop = newSrc.scrollTop; isSyncing = false;
    });
    newDst.addEventListener('scroll', () => {
      if (isSyncing) return; isSyncing = true;
      newSrc.scrollTop = newDst.scrollTop; isSyncing = false;
    });
  }

  // expose syncCodeBlockScroll for DARD
  cfg._syncCodeBlockScroll = syncCodeBlockScroll;
}
