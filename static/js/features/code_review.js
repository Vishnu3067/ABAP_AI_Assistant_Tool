/**
 * features/code_review.js — Code Review / Optimization feature
 */
import { buildAnalysisDOM } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initCodeReview(cfg) {
  const { loadingOverlay, navFeatureLabel, codeReviewArtifactTypes, validSystems, systemDescriptions } = cfg;

  const reviewModal           = document.getElementById('reviewModal');
  const reviewArtifactNameEl  = document.getElementById('reviewArtifactName');
  const reviewArtifactTypeEl  = document.getElementById('reviewArtifactType');
  const reviewFgGroup         = document.getElementById('reviewFgGroup');
  const reviewFunctionGroupEl = document.getElementById('reviewFunctionGroup');
  const reviewSystemEl        = document.getElementById('reviewSystem');
  const reviewError           = document.getElementById('reviewError');
  const reviewSubmitBtn       = document.getElementById('reviewSubmitBtn');
  const reviewCancelBtn       = document.getElementById('reviewCancelBtn');

  const reviewView   = document.getElementById('reviewView');
  const reviewTitle  = document.getElementById('reviewTitle');
  const reviewMeta   = document.getElementById('reviewMeta');
  const reviewBody   = document.getElementById('reviewBody');
  const reviewNewBtn = document.getElementById('reviewNewBtn');

  // Populate dropdowns
  codeReviewArtifactTypes.forEach(t => reviewArtifactTypeEl.appendChild(new Option(t, t)));
  validSystems.forEach(s => reviewSystemEl.appendChild(new Option(systemDescriptions[s] || s, s)));

  reviewArtifactTypeEl.addEventListener('change', () => {
    if (reviewArtifactTypeEl.value === 'Function Module') {
      reviewFgGroup.classList.remove('hidden');
    } else {
      reviewFgGroup.classList.add('hidden');
      reviewFunctionGroupEl.value = '';
    }
  });

  function openReviewModal() {
    resetReviewModal();
    reviewModal.classList.remove('hidden');
    reviewArtifactNameEl.focus();
  }

  function closeReviewModal() {
    reviewModal.classList.add('hidden');
    if (reviewView.classList.contains('hidden')) navFeatureLabel.textContent = '';
  }

  function resetReviewModal() {
    reviewArtifactNameEl.value = '';
    reviewArtifactTypeEl.value = '';
    reviewFunctionGroupEl.value = '';
    reviewSystemEl.value = '';
    reviewFgGroup.classList.add('hidden');
    reviewError.textContent = '';
    reviewError.style.display = 'none';
    reviewSubmitBtn.disabled = false;
  }

  reviewCancelBtn.addEventListener('click', closeReviewModal);
  reviewModal.addEventListener('click', e => { if (e.target === reviewModal) closeReviewModal(); });

  document.getElementById('btn-code-review').addEventListener('click', () => {
    navFeatureLabel.textContent = 'Code Review / Optimization';
    openReviewModal();
  });

  reviewNewBtn.addEventListener('click', () => {
    hideAllViews();
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openReviewModal();
  });

  reviewSubmitBtn.addEventListener('click', async () => {
    reviewError.style.display = 'none';

    const artifactName  = reviewArtifactNameEl.value.trim();
    const artifactType  = reviewArtifactTypeEl.value;
    const functionGroup = reviewFunctionGroupEl.value.trim();
    const system        = reviewSystemEl.value;

    const showReviewError = msg => { reviewError.textContent = msg; reviewError.style.display = 'block'; };

    if (!artifactName) return showReviewError('Please enter the artifact name.');
    if (!artifactType) return showReviewError('Please select an artifact type.');
    if (artifactType === 'Function Module' && !functionGroup)
      return showReviewError('Please enter the function group.');
    if (!system) return showReviewError('Please select the system.');

    closeReviewModal();
    loadingOverlay.classList.remove('hidden');
    reviewSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/code-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact_name: artifactName,
          artifact_type: artifactType,
          function_group: functionGroup || null,
          system,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      _renderCodeReviewView(data);

    } catch (err) {
      openReviewModal();
      reviewError.textContent = err.message || 'Unexpected error. Please try again.';
      reviewError.style.display = 'block';
      if (err.message && (err.message.includes('502') || err.message.includes('503') || err.message.includes('Could not fetch'))) {
        showErrorToast('SAP Fetch Failed', err.message);
      }
    } finally {
      loadingOverlay.classList.add('hidden');
      reviewSubmitBtn.disabled = false;
    }
  });

  function _renderCodeReviewView(data) {
    navFeatureLabel.textContent = 'Code Review / Optimization';
    reviewTitle.textContent = `${data.artifact_type}: ${data.artifact_name}`;
    reviewMeta.innerHTML = `
      <span class="meta-badge src">${data.system}</span>
      <span class="meta-badge" style="background:#e8f0fe;color:#1a5276;">&#128269; Code Review</span>
    `;

    reviewBody.innerHTML = '';
    reviewBody.appendChild(buildAnalysisDOM(data.analysis));

    hideAllViews();
    reviewView.classList.remove('hidden');
  }

  // expose openReviewModal for Escape handler in main.js
  cfg._openReviewModal  = openReviewModal;
  cfg._closeReviewModal = closeReviewModal;
}
