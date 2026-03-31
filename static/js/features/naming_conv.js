/**
 * features/naming_conv.js — Naming Convention Assistant feature
 */
import { escapeHtml, renderMarkdown } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initNamingConv(cfg) {
  const { loadingOverlay, navFeatureLabel } = cfg;

  const namingConvModal       = document.getElementById('namingConvModal');
  const namingConvSystem      = document.getElementById('namingConvSystem');
  const namingConvQuestion    = document.getElementById('namingConvQuestion');
  const namingConvError       = document.getElementById('namingConvError');
  const namingConvCancelBtn   = document.getElementById('namingConvCancelBtn');
  const namingConvSubmitBtn   = document.getElementById('namingConvSubmitBtn');

  const namingConvView        = document.getElementById('namingConvView');
  const namingConvViewTitle   = document.getElementById('namingConvViewTitle');
  const namingConvViewMeta    = document.getElementById('namingConvViewMeta');
  const namingConvBody        = document.getElementById('namingConvBody');
  const namingConvNewBtn      = document.getElementById('namingConvNewBtn');

  function openNamingConvModal() {
    namingConvQuestion.value = '';
    namingConvSystem.value = '';
    namingConvError.style.display = 'none';
    namingConvSubmitBtn.disabled = false;
    namingConvModal.classList.remove('hidden');
    setTimeout(() => namingConvSystem.focus(), 50);
  }

  function closeNamingConvModal() {
    namingConvModal.classList.add('hidden');
  }

  namingConvCancelBtn.addEventListener('click', closeNamingConvModal);
  namingConvModal.addEventListener('click', e => { if (e.target === namingConvModal) closeNamingConvModal(); });

  document.getElementById('btn-naming-conv').addEventListener('click', () => {
    navFeatureLabel.textContent = 'Naming Convention Assistant';
    openNamingConvModal();
  });

  namingConvNewBtn.addEventListener('click', () => {
    hideAllViews();
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openNamingConvModal();
  });

  namingConvSubmitBtn.addEventListener('click', async () => {
    const question = namingConvQuestion.value.trim();
    const system   = namingConvSystem.value;

    if (!system) {
      namingConvError.textContent = 'Please select a project (ADC or Nucleus).';
      namingConvError.style.display = 'block';
      return;
    }
    if (!question) {
      namingConvError.textContent = 'Please enter your naming convention question.';
      namingConvError.style.display = 'block';
      return;
    }

    namingConvError.style.display = 'none';
    namingConvSubmitBtn.disabled = true;
    closeNamingConvModal();

    document.getElementById('loadingText').textContent = 'Consulting naming convention standards\u2026';
    loadingOverlay.classList.remove('hidden');

    try {
      const res = await fetch('/api/naming-conv/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, system }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Server error ${res.status}`);

      _renderNamingConvView(data);

    } catch (err) {
      showErrorToast('Naming Convention Error', err.message || 'Unexpected error.');
      openNamingConvModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      namingConvSubmitBtn.disabled = false;
    }
  });

  function _renderNamingConvView(data) {
    hideAllViews();
    namingConvView.classList.remove('hidden');

    navFeatureLabel.textContent = 'Naming Convention Assistant';
    namingConvViewTitle.textContent = 'Naming Convention Assistant';

    const prefixMap = { ADC: '/SHL/', Nucleus: '/DS1/' };
    const prefix = prefixMap[data.system] || '';
    namingConvViewMeta.innerHTML = [
      `<span class="system-tag src">${escapeHtml(data.system)}</span>`,
      prefix ? `<span class="system-tag" style="background:#e8f5e9;color:#2e7d32;">Prefix: ${escapeHtml(prefix)}</span>` : '',
    ].join(' ');

    namingConvBody.innerHTML = '';

    const qCard = document.createElement('div');
    qCard.className = 'ts-section-card';
    qCard.style.marginBottom = '16px';
    qCard.innerHTML = `
      <div class="ts-section-title" style="background:#1a1a2e;">&#10067; Your Question</div>
      <div class="ts-section-content" style="font-style:italic;color:#444;">"${escapeHtml(data.question)}"</div>`;
    namingConvBody.appendChild(qCard);

    const aCard = document.createElement('div');
    aCard.className = 'ts-section-card';
    aCard.innerHTML = `
      <div class="ts-section-title" style="background:#1b5e20;">&#128271; AI Answer</div>
      <div class="ts-section-content" id="namingConvAnswerBody"></div>`;
    namingConvBody.appendChild(aCard);
    document.getElementById('namingConvAnswerBody').innerHTML = renderMarkdown(data.answer || 'No answer available.');
  }
}
