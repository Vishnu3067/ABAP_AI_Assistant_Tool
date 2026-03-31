/**
 * features/tr_sequencing.js — TR Sequencing Analyser feature
 */
import { escapeHtml, renderMarkdown } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initTrSequencing(cfg) {
  const { loadingOverlay, navFeatureLabel, trValidSystems, systemDescriptions } = cfg;

  const trModal        = document.getElementById('trModal');
  const trNumberEl     = document.getElementById('trNumber');
  const trDestSystemEl = document.getElementById('trDestSystem');
  const trError        = document.getElementById('trError');
  const trSubmitBtn    = document.getElementById('trSubmitBtn');
  const trCancelBtn    = document.getElementById('trCancelBtn');

  const trView         = document.getElementById('trView');
  const trViewTitle    = document.getElementById('trViewTitle');
  const trViewMeta     = document.getElementById('trViewMeta');
  const trDepTableBody = document.getElementById('trDepTableBody');
  const trAiBody       = document.getElementById('trAiBody');
  const trNewBtn       = document.getElementById('trNewBtn');

  // Populate system dropdown
  trValidSystems.forEach(s => trDestSystemEl.appendChild(new Option(systemDescriptions[s] || s, s)));

  function openTrModal() {
    resetTrModal();
    trModal.classList.remove('hidden');
    trNumberEl.focus();
  }

  function closeTrModal() {
    trModal.classList.add('hidden');
    if (trView.classList.contains('hidden')) navFeatureLabel.textContent = '';
  }

  function resetTrModal() {
    trNumberEl.value = '';
    trDestSystemEl.value = '';
    trError.textContent = '';
    trError.style.display = 'none';
    trSubmitBtn.disabled = false;
  }

  trCancelBtn.addEventListener('click', closeTrModal);
  trModal.addEventListener('click', e => { if (e.target === trModal) closeTrModal(); });

  document.getElementById('btn-tr-sequencing').addEventListener('click', () => {
    navFeatureLabel.textContent = 'TR Sequencing Analyser';
    openTrModal();
  });

  trNewBtn.addEventListener('click', () => {
    hideAllViews();
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openTrModal();
  });

  trSubmitBtn.addEventListener('click', async () => {
    trError.style.display = 'none';

    const trNumber   = trNumberEl.value.trim().toUpperCase();
    const destSystem = trDestSystemEl.value;

    const showTrError = msg => { trError.textContent = msg; trError.style.display = 'block'; };

    if (!trNumber)   return showTrError('Please enter the TR number.');
    if (!destSystem) return showTrError('Please select the destination system.');

    closeTrModal();
    document.getElementById('loadingText').textContent = 'Fetching TR dependencies & running AI analysis\u2026';
    loadingOverlay.classList.remove('hidden');
    trSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/tr-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tr_number: trNumber, destination_system: destSystem }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      _renderTrView(data);

    } catch (err) {
      openTrModal();
      trError.textContent = err.message || 'Unexpected error. Please try again.';
      trError.style.display = 'block';
      if (err.message && (err.message.includes('502') || err.message.includes('503') || err.message.includes('Could not fetch'))) {
        showErrorToast('SAP Fetch Failed', err.message);
      }
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent = 'Fetching artifact & running AI analysis\u2026';
      trSubmitBtn.disabled = false;
    }
  });

  function _renderTrView(data) {
    navFeatureLabel.textContent = 'TR Sequencing Analyser';
    trViewTitle.textContent = `TR Analysis: ${data.tr_number}`;
    trViewMeta.innerHTML = `
      <span class="meta-badge src">${data.tr_number}</span>
      <span class="meta-badge dst">&#8594; ${data.destination_system}</span>
      <span class="meta-badge" style="background:#eaf6fb;color:#1a5276;">${data.items.length} records</span>
    `;

    trDepTableBody.innerHTML = '';
    const frag = document.createDocumentFragment();
    data.items.forEach((item, idx) => {
      const tr = document.createElement('tr');
      const statusInfo = _trStatusInfo(item.ref_obj_req_status || '');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td class="tr-obj-name">${escapeHtml(item.obj_name || '')}</td>
        <td><span class="obj-type-badge">${escapeHtml(item.obj_type || '')}</span></td>
        <td>${escapeHtml(item.request || '')}</td>
        <td>${escapeHtml(item.request_text || '\u2014')}</td>
        <td>${escapeHtml(item.request_owner || '\u2014')}</td>
        <td>${escapeHtml(item.request_status || '\u2014')}</td>
        <td>${escapeHtml(item.ref_obj_name || '\u2014')}</td>
        <td><span class="obj-type-badge">${escapeHtml(item.ref_obj_type || '')}</span></td>
        <td><strong>${escapeHtml(item.ref_obj_request || '')}</strong></td>
        <td>${escapeHtml(item.ref_obj_req_owner || '\u2014')}</td>
        <td><span class="tr-status-badge ${statusInfo.cls}">${statusInfo.icon} ${statusInfo.label}</span></td>
        <td>${escapeHtml(item.ref_obj_req_type || '\u2014')}</td>
        <td>${escapeHtml(item.ref_obj_parent_req || '\u2014')}</td>
        <td class="tr-short-text">${escapeHtml(item.short_text || '')}</td>
      `;
      frag.appendChild(tr);
    });
    trDepTableBody.appendChild(frag);

    trAiBody.innerHTML = renderMarkdown(data.analysis);

    hideAllViews();
    trView.classList.remove('hidden');
  }

  function _trStatusInfo(code) {
    switch ((code || '').toUpperCase()) {
      case 'D': return { cls: 'released', icon: '\u2705', label: 'Released' };
      case 'O': return { cls: 'pending',  icon: '\u23f3', label: 'Open' };
      default:  return { cls: 'missing',  icon: '\u274c', label: code || 'Unknown' };
    }
  }

  cfg._openTrModal  = openTrModal;
  cfg._closeTrModal = closeTrModal;
}
