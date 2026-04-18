/**
 * features/ts_creation.js — TS Creation Tool feature
 *
 * Flow:
 *   1. User opens Upload FS modal from sidebar
 *   2. User picks a .docx FS file and clicks "Generate TS"
 *   3. POST /api/ts-creation/generate (multipart) → preview_html + doc_id
 *   4. Preview is rendered in ts-creation-view with Download / Regenerate buttons
 *   5. Download  → GET /api/ts-creation/download/{doc_id}
 *   6. Regenerate → opens feedback modal → POST /api/ts-creation/regenerate → refreshes preview
 */
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initTsCreation(cfg) {
  const { loadingOverlay, navFeatureLabel } = cfg;

  // ── DOM refs — upload modal ──────────────────────────────────────────
  const tsCreationModal    = document.getElementById('tsCreationModal');
  const tsCreationFileInput = document.getElementById('tsCreationFileInput');
  const tsCreationFileName  = document.getElementById('tsCreationFileName');
  const tsCreationError     = document.getElementById('tsCreationError');
  const tsCreationSubmitBtn = document.getElementById('tsCreationSubmitBtn');
  const tsCreationCancelBtn = document.getElementById('tsCreationCancelBtn');

  // ── DOM refs — view ──────────────────────────────────────────────────
  const tsCreationView         = document.getElementById('tsCreationView');
  const tsCreationTitle        = document.getElementById('tsCreationTitle');
  const tsCreationMeta         = document.getElementById('tsCreationMeta');
  const tsCreationBody         = document.getElementById('tsCreationBody');
  const tsCreationDownloadBtn  = document.getElementById('tsCreationDownloadBtn');
  const tsCreationRegenerateBtn = document.getElementById('tsCreationRegenerateBtn');

  // ── DOM refs — regenerate modal ──────────────────────────────────────
  const tsRegenModal    = document.getElementById('tsRegenModal');
  const tsRegenFeedback = document.getElementById('tsRegenFeedback');
  const tsRegenError    = document.getElementById('tsRegenError');
  const tsRegenSubmitBtn = document.getElementById('tsRegenSubmitBtn');
  const tsRegenCancelBtn = document.getElementById('tsRegenCancelBtn');

  // ── State ────────────────────────────────────────────────────────────
  let currentDocId = null;

  // ── Upload modal helpers ─────────────────────────────────────────────
  function openUploadModal() {
    tsCreationFileInput.value = '';
    tsCreationFileName.textContent = 'No file selected';
    tsCreationError.style.display = 'none';
    tsCreationError.textContent = '';
    tsCreationSubmitBtn.disabled = false;
    tsCreationModal.classList.remove('hidden');
  }

  function closeUploadModal() {
    tsCreationModal.classList.add('hidden');
  }

  // ── File selection feedback ───────────────────────────────────────────
  tsCreationFileInput.addEventListener('change', () => {
    const file = tsCreationFileInput.files[0];
    if (file) {
      tsCreationFileName.textContent = file.name;
      tsCreationFileName.style.color = '#1a1a2e';
      tsCreationFileName.style.fontStyle = 'normal';
    } else {
      tsCreationFileName.textContent = 'No file selected';
      tsCreationFileName.style.color = '#555';
      tsCreationFileName.style.fontStyle = 'italic';
    }
  });

  // ── Sidebar button ────────────────────────────────────────────────────
  document.getElementById('btn-ts-creation').addEventListener('click', () => {
    navFeatureLabel.textContent = 'TS Creation Tool';
    openUploadModal();
  });

  // ── Modal close handlers ──────────────────────────────────────────────
  tsCreationCancelBtn.addEventListener('click', closeUploadModal);
  tsCreationModal.addEventListener('click', e => {
    if (e.target === tsCreationModal) closeUploadModal();
  });

  // ── Generate TS ───────────────────────────────────────────────────────
  tsCreationSubmitBtn.addEventListener('click', async () => {
    const file = tsCreationFileInput.files[0];
    if (!file) {
      tsCreationError.textContent = 'Please select a .docx file.';
      tsCreationError.style.display = 'block';
      return;
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      tsCreationError.textContent = 'Only .docx files are accepted.';
      tsCreationError.style.display = 'block';
      return;
    }

    tsCreationError.style.display = 'none';
    closeUploadModal();

    document.getElementById('loadingText').textContent =
      'Reading Functional Specification and generating TS\u2026';
    loadingOverlay.classList.remove('hidden');
    tsCreationSubmitBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('fs_file', file);

      const res = await fetch('/api/ts-creation/generate', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      currentDocId = data.doc_id;
      renderPreview(data, file.name);

    } catch (err) {
      showErrorToast('TS Generation Failed', err.message || 'An unexpected error occurred.');
      openUploadModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent =
        'Fetching artifact & running AI analysis\u2026';
      tsCreationSubmitBtn.disabled = false;
    }
  });

  // ── Render the preview into the view ─────────────────────────────────
  function renderPreview(data, filename) {
    hideAllViews();
    tsCreationView.classList.remove('hidden');
    navFeatureLabel.textContent = 'TS Creation Tool';

    const displayName = (filename || 'FS Document').replace('.docx', '');
    tsCreationTitle.textContent = `TS — ${displayName}`;

    // Show only the FS ID (part before first ' - ') in the badge to keep it short
    const fsId = displayName.split(' - ')[0] || displayName.slice(0, 30);
    tsCreationMeta.innerHTML = [
      `<span class="system-tag src" title="${escapeHtml(displayName)}">FS: ${escapeHtml(fsId)}</span>`,
      `<span class="system-tag dst">${data.placeholder_count} placeholders filled</span>`,
    ].join('');

    tsCreationBody.innerHTML = data.preview_html || '<p>Preview unavailable.</p>';
    tsCreationBody.scrollTop = 0;
  }

  // ── Download TS ───────────────────────────────────────────────────────
  tsCreationDownloadBtn.addEventListener('click', () => {
    if (!currentDocId) {
      showErrorToast('Nothing to Download', 'Please generate a TS first.');
      return;
    }
    // Trigger browser download via a temporary anchor
    const a = document.createElement('a');
    a.href = `/api/ts-creation/download/${currentDocId}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  // ── Regenerate modal helpers ─────────────────────────────────────────
  function openRegenModal() {
    tsRegenFeedback.value = '';
    tsRegenError.style.display = 'none';
    tsRegenError.textContent = '';
    tsRegenSubmitBtn.disabled = false;
    tsRegenModal.classList.remove('hidden');
    setTimeout(() => tsRegenFeedback.focus(), 50);
  }

  function closeRegenModal() {
    tsRegenModal.classList.add('hidden');
  }

  tsCreationRegenerateBtn.addEventListener('click', () => {
    if (!currentDocId) {
      showErrorToast('Nothing to Regenerate', 'Please generate a TS first.');
      return;
    }
    openRegenModal();
  });

  tsRegenCancelBtn.addEventListener('click', closeRegenModal);
  tsRegenModal.addEventListener('click', e => {
    if (e.target === tsRegenModal) closeRegenModal();
  });

  // ── Submit regeneration ───────────────────────────────────────────────
  tsRegenSubmitBtn.addEventListener('click', async () => {
    const feedback = tsRegenFeedback.value.trim();
    if (!feedback) {
      tsRegenError.textContent = 'Please describe what needs to be corrected.';
      tsRegenError.style.display = 'block';
      return;
    }

    tsRegenError.style.display = 'none';
    closeRegenModal();

    document.getElementById('loadingText').textContent =
      'Updating TS based on your feedback\u2026';
    loadingOverlay.classList.remove('hidden');
    tsRegenSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/ts-creation/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_id: currentDocId, feedback }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      currentDocId = data.doc_id;

      // Refresh preview in place
      tsCreationBody.innerHTML = data.preview_html || '<p>Preview unavailable.</p>';
      tsCreationBody.scrollTop = 0;

      // Update meta to show regeneration happened
      const existing = tsCreationMeta.innerHTML;
      if (!existing.includes('regenerated')) {
        tsCreationMeta.innerHTML +=
          `<span class="system-tag" style="background:#fff3e0;color:#e65100;">regenerated</span>`;
      }

    } catch (err) {
      if (err.message && err.message.includes('Session expired')) {
        showErrorToast('Session Expired', 'Please upload the FS again to start a new session.');
        openUploadModal();
      } else {
        showErrorToast('Regeneration Failed', err.message || 'An unexpected error occurred.');
        openRegenModal();
      }
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent =
        'Fetching artifact & running AI analysis\u2026';
      tsRegenSubmitBtn.disabled = false;
    }
  });

  // ── Utility ──────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
