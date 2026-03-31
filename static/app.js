/* ============================================================
   ABAP AI Assistant Tool — Frontend Logic
   ============================================================ */

(function () {
  'use strict';

  const { validSystems, artifactTypes, codeReviewArtifactTypes, trValidSystems, analysisArtifactTypes, impactArtifactTypes } = window.APP_CONFIG;

  // ----------------------------------------------------------------
  // DOM references
  // ----------------------------------------------------------------
  const navFeatureLabel   = document.getElementById('navFeatureLabel');
  const welcomePanel      = document.getElementById('welcomePanel');
  const compareView       = document.getElementById('compareView');
  const loadingOverlay    = document.getElementById('loadingOverlay');

  // ----------------------------------------------------------------
  // Global error toast — call showErrorToast(title, message) from anywhere
  // ----------------------------------------------------------------
  const errorToast        = document.getElementById('errorToast');
  const errorToastTitle   = document.getElementById('errorToastTitle');
  const errorToastMessage = document.getElementById('errorToastMessage');
  const errorToastClose   = document.getElementById('errorToastClose');
  let   errorToastTimer   = null;

  function showErrorToast(title, message) {
    errorToastTitle.textContent   = title;
    errorToastMessage.textContent = message;
    errorToast.classList.remove('hidden');
    // Auto-dismiss after 12 seconds
    clearTimeout(errorToastTimer);
    errorToastTimer = setTimeout(hideErrorToast, 12000);
  }

  function hideErrorToast() {
    errorToast.classList.add('hidden');
    clearTimeout(errorToastTimer);
  }

  errorToastClose.addEventListener('click', hideErrorToast);

  // Sidebar
  const btnRetrofit       = document.getElementById('btn-retrofit');
  const btnCodeReview     = document.getElementById('btn-code-review');
  const btnTrSequencing   = document.getElementById('btn-tr-sequencing');
  const btnTs             = document.getElementById('btn-ts');
  const btnAnalysis       = document.getElementById('btn-analysis');
  const btnReusable       = document.getElementById('btn-reusable');
  const btnImpact         = document.getElementById('btn-impact');
  const sidebarBtns       = document.querySelectorAll('.sidebar-btn:not(.disabled)');

  // Retrofit modal
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

  // Compare view
  const compareTitle      = document.getElementById('compareTitle');
  const compareMeta       = document.getElementById('compareMeta');
  const srcTag            = document.getElementById('srcTag');
  const dstTag            = document.getElementById('dstTag');
  const srcDiffTable      = document.getElementById('srcDiffTable');
  const dstDiffTable      = document.getElementById('dstDiffTable');
  const aiAnalysisBody    = document.getElementById('aiAnalysisBody');

  // Code Review modal
  const reviewModal       = document.getElementById('reviewModal');
  const reviewArtifactNameEl = document.getElementById('reviewArtifactName');
  const reviewArtifactTypeEl = document.getElementById('reviewArtifactType');
  const reviewFgGroup     = document.getElementById('reviewFgGroup');
  const reviewFunctionGroupEl = document.getElementById('reviewFunctionGroup');
  const reviewSystemEl    = document.getElementById('reviewSystem');
  const reviewError       = document.getElementById('reviewError');
  const reviewSubmitBtn   = document.getElementById('reviewSubmitBtn');
  const reviewCancelBtn   = document.getElementById('reviewCancelBtn');

  // Code Review results view
  const reviewView        = document.getElementById('reviewView');
  const reviewTitle       = document.getElementById('reviewTitle');
  const reviewMeta        = document.getElementById('reviewMeta');
  const reviewBody        = document.getElementById('reviewBody');
  const reviewNewBtn      = document.getElementById('reviewNewBtn');

  // TR Sequencing modal
  const trModal           = document.getElementById('trModal');
  const trNumberEl        = document.getElementById('trNumber');
  const trDestSystemEl    = document.getElementById('trDestSystem');
  const trError           = document.getElementById('trError');
  const trSubmitBtn       = document.getElementById('trSubmitBtn');
  const trCancelBtn       = document.getElementById('trCancelBtn');

  // TR Sequencing results view
  const trView            = document.getElementById('trView');
  const trViewTitle       = document.getElementById('trViewTitle');
  const trViewMeta        = document.getElementById('trViewMeta');
  const trDepTableBody    = document.getElementById('trDepTableBody');
  const trAiBody          = document.getElementById('trAiBody');
  const trNewBtn          = document.getElementById('trNewBtn');

  // TS Finalization modal
  const tsModal           = document.getElementById('tsModal');
  const tsArtifactNameEl  = document.getElementById('tsArtifactName');
  const tsArtifactTypeEl  = document.getElementById('tsArtifactType');
  const tsFgGroup         = document.getElementById('tsFgGroup');
  const tsFunctionGroupEl = document.getElementById('tsFunctionGroup');
  const tsSystemEl        = document.getElementById('tsSystem');
  const tsError           = document.getElementById('tsError');
  const tsSubmitBtn       = document.getElementById('tsSubmitBtn');
  const tsCancelBtn       = document.getElementById('tsCancelBtn');

  // TS Finalization results view
  const tsView            = document.getElementById('tsView');
  const tsViewTitle       = document.getElementById('tsViewTitle');
  const tsViewMeta        = document.getElementById('tsViewMeta');
  const tsBody            = document.getElementById('tsBody');
  const tsNewBtn          = document.getElementById('tsNewBtn');
  const tsCopyAllBtn      = document.getElementById('tsCopyAllBtn');

  // Reusable Artifacts modal + view
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

  // Impact Analysis modal + view
  const impactModal          = document.getElementById('impactModal');
  const impactArtifactNameEl = document.getElementById('impactArtifactName');
  const impactArtifactTypeEl = document.getElementById('impactArtifactType');
  const impactFgGroup        = document.getElementById('impactFgGroup');
  const impactFunctionGroupEl = document.getElementById('impactFunctionGroup');
  const impactSystemEl       = document.getElementById('impactSystem');
  const impactPlannedChangeEl = document.getElementById('impactPlannedChange');
  const impactError          = document.getElementById('impactError');
  const impactSubmitBtn      = document.getElementById('impactSubmitBtn');
  const impactCancelBtn      = document.getElementById('impactCancelBtn');
  const impactView           = document.getElementById('impactView');
  const impactViewTitle      = document.getElementById('impactViewTitle');
  const impactViewMeta       = document.getElementById('impactViewMeta');
  const impactBody           = document.getElementById('impactBody');
  const impactNewBtn         = document.getElementById('impactNewBtn');

  // Analysis / Summarization modal
  const analysisModal           = document.getElementById('analysisModal');
  const analysisArtifactNameEl  = document.getElementById('analysisArtifactName');
  const analysisArtifactTypeEl  = document.getElementById('analysisArtifactType');
  const analysisFgGroup         = document.getElementById('analysisFgGroup');
  const analysisFunctionGroupEl = document.getElementById('analysisFunctionGroup');
  const analysisTcodeGroup      = document.getElementById('analysisTcodeGroup');
  const analysisTcodeEl         = document.getElementById('analysisTcode');
  const analysisSystemEl        = document.getElementById('analysisSystem');
  const analysisQuestionEl      = document.getElementById('analysisQuestion');
  const analysisError           = document.getElementById('analysisError');
  const analysisSubmitBtn       = document.getElementById('analysisSubmitBtn');
  const analysisCancelBtn       = document.getElementById('analysisCancelBtn');

  // Chat view
  const chatView          = document.getElementById('chatView');
  const chatArtifactTitle = document.getElementById('chatArtifactTitle');
  const chatArtifactMeta  = document.getElementById('chatArtifactMeta');
  const chatMessages      = document.getElementById('chatMessages');
  const chatInput         = document.getElementById('chatInput');
  const chatSendBtn       = document.getElementById('chatSendBtn');
  const chatNewBtn        = document.getElementById('chatNewBtn');

  // ----------------------------------------------------------------
  // Chat conversation state (persists between follow-up messages)
  // ----------------------------------------------------------------
  let chatState = {
    artifactName: '', artifactType: '', functionGroup: null,
    system: '', tcode: null, sourceCode: null, messages: [],
  };

  // ----------------------------------------------------------------
  // Populate Retrofit artifact type dropdowns
  artifactTypes.forEach(t => {
    const opt = new Option(t, t);
    artifactTypeEl.appendChild(opt);
  });

  // Populate Code Review artifact type dropdown
  codeReviewArtifactTypes.forEach(t => {
    reviewArtifactTypeEl.appendChild(new Option(t, t));
  });

  const systemDescriptions = {
    D59: 'D59 — Development',
    K59: 'K59 — US Dev System',
    S59: 'S59 — Sandbox',
    L59: 'L59 — Business',
    A59: 'A59 — Quality System',
    P59: 'P59 — Production',
  };

  validSystems.forEach(s => {
    const label = systemDescriptions[s] || s;
    sourceSystemEl.appendChild(new Option(label, s));
    destSystemEl.appendChild(new Option(label, s));
    reviewSystemEl.appendChild(new Option(label, s));
  });

  // Populate TR destination system dropdown
  trValidSystems.forEach(s => {
    const label = systemDescriptions[s] || s;
    trDestSystemEl.appendChild(new Option(label, s));
  });

  // Populate TS artifact type and system dropdowns
  codeReviewArtifactTypes.forEach(t => {
    tsArtifactTypeEl.appendChild(new Option(t, t));
  });
  validSystems.forEach(s => {
    tsSystemEl.appendChild(new Option(systemDescriptions[s] || s, s));
  });

  // Populate Analysis artifact type and system dropdowns
  analysisArtifactTypes.forEach(t => {
    analysisArtifactTypeEl.appendChild(new Option(t, t));
  });
  validSystems.forEach(s => {
    analysisSystemEl.appendChild(new Option(systemDescriptions[s] || s, s));
  });

  // Populate Impact Analysis artifact type and system dropdowns
  (impactArtifactTypes || []).forEach(t => {
    impactArtifactTypeEl.appendChild(new Option(t, t));
  });
  validSystems.forEach(s => {
    impactSystemEl.appendChild(new Option(systemDescriptions[s] || s, s));
  });

  // ----------------------------------------------------------------
  // Show/hide Function Group for Retrofit
  artifactTypeEl.addEventListener('change', () => {
    if (artifactTypeEl.value === 'Function Module') {
      fgGroup.classList.remove('hidden');
    } else {
      fgGroup.classList.add('hidden');
      functionGroupEl.value = '';
    }
  });

  // Show/hide Function Group for Code Review
  reviewArtifactTypeEl.addEventListener('change', () => {
    if (reviewArtifactTypeEl.value === 'Function Module') {
      reviewFgGroup.classList.remove('hidden');
    } else {
      reviewFgGroup.classList.add('hidden');
      reviewFunctionGroupEl.value = '';
    }
  });

  // Show/hide Function Group for TS
  tsArtifactTypeEl.addEventListener('change', () => {
    if (tsArtifactTypeEl.value === 'Function Module') {
      tsFgGroup.classList.remove('hidden');
    } else {
      tsFgGroup.classList.add('hidden');
      tsFunctionGroupEl.value = '';
    }
  });

  // Show/hide Function Group and TCode context for Analysis
  analysisArtifactTypeEl.addEventListener('change', () => {
    const type = analysisArtifactTypeEl.value;
    if (type === 'Function Module') {
      analysisFgGroup.classList.remove('hidden');
    } else {
      analysisFgGroup.classList.add('hidden');
      analysisFunctionGroupEl.value = '';
    }
    // TCode Context field is only relevant when artifact type is Transaction (TCode)
    if (type === 'Transaction (TCode)') {
      analysisTcodeGroup.classList.remove('hidden');
    } else {
      analysisTcodeGroup.classList.add('hidden');
      analysisTcodeEl.value = '';
    }
  });

  // Show/hide Function Group for Impact Analysis
  impactArtifactTypeEl.addEventListener('change', () => {
    if (impactArtifactTypeEl.value === 'Function Module') {
      impactFgGroup.classList.remove('hidden');
    } else {
      impactFgGroup.classList.add('hidden');
      impactFunctionGroupEl.value = '';
    }
  });

  // ----------------------------------------------------------------
  // Sidebar button logic
  // ----------------------------------------------------------------
  sidebarBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // no persistent active state — highlight is hover-only
    });
  });

  btnRetrofit.addEventListener('click', () => {
    openRetrofitModal();
  });

  btnCodeReview.addEventListener('click', () => {
    openReviewModal();
  });

  btnTrSequencing.addEventListener('click', () => {
    openTrModal();
  });

  btnTs.addEventListener('click', () => {
    openTsModal();
  });

  btnAnalysis.addEventListener('click', () => {
    openAnalysisModal();
  });

  btnReusable.addEventListener('click', () => {
    openReusableModal();
  });

  btnImpact.addEventListener('click', () => {
    openImpactModal();
  });

  reusableNewBtn.addEventListener('click', () => {
    reusableView.classList.add('hidden');
    welcomePanel.classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openReusableModal();
  });

  impactNewBtn.addEventListener('click', () => {
    impactView.classList.add('hidden');
    welcomePanel.classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openImpactModal();
  });

  reviewNewBtn.addEventListener('click', () => {
    reviewView.classList.add('hidden');
    welcomePanel.classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openReviewModal();
  });

  trNewBtn.addEventListener('click', () => {
    trView.classList.add('hidden');
    welcomePanel.classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openTrModal();
  });

  tsNewBtn.addEventListener('click', () => {
    tsView.classList.add('hidden');
    welcomePanel.classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openTsModal();
  });

  chatNewBtn.addEventListener('click', () => {
    chatView.classList.add('hidden');
    welcomePanel.classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openAnalysisModal();
  });

  tsCopyAllBtn.addEventListener('click', () => {
    const allText = Array.from(tsBody.querySelectorAll('.ts-section-card'))
      .map(card => {
        const title = card.querySelector('.ts-section-title')?.textContent || '';
        const body  = card.querySelector('.ts-section-content')?.innerText || '';
        return `## ${title}\n${body}`;
      })
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(allText).then(() => {
      tsCopyAllBtn.innerHTML = '&#10003; Copied!';
      setTimeout(() => { tsCopyAllBtn.innerHTML = '&#128203; Copy All'; }, 2500);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = allText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      tsCopyAllBtn.innerHTML = '&#10003; Copied!';
      setTimeout(() => { tsCopyAllBtn.innerHTML = '&#128203; Copy All'; }, 2500);
    });
  });

  // ----------------------------------------------------------------
  // Modal helpers
  // ----------------------------------------------------------------
  function openRetrofitModal() {
    resetModal();
    retrofitModal.classList.remove('hidden');
    artifactNameEl.focus();
  }

  function closeRetrofitModal() {
    retrofitModal.classList.add('hidden');
    // Only clear the label if compare view hasn't been shown yet
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

  // ----------------------------------------------------------------
  // Code Review modal helpers
  // ----------------------------------------------------------------
  function openReviewModal() {
    resetReviewModal();
    reviewModal.classList.remove('hidden');
    reviewArtifactNameEl.focus();
  }

  function closeReviewModal() {
    reviewModal.classList.add('hidden');
    if (reviewView.classList.contains('hidden')) {
      navFeatureLabel.textContent = '';
    }
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
  reviewModal.addEventListener('click', (e) => {
    if (e.target === reviewModal) closeReviewModal();
  });

  // ----------------------------------------------------------------
  // TR Sequencing modal helpers
  // ----------------------------------------------------------------
  function openTrModal() {
    resetTrModal();
    trModal.classList.remove('hidden');
    trNumberEl.focus();
  }

  function closeTrModal() {
    trModal.classList.add('hidden');
    if (trView.classList.contains('hidden')) {
      navFeatureLabel.textContent = '';
    }
  }

  function resetTrModal() {
    trNumberEl.value = '';
    trDestSystemEl.value = '';
    trError.textContent = '';
    trError.style.display = 'none';
    trSubmitBtn.disabled = false;
  }

  trCancelBtn.addEventListener('click', closeTrModal);
  trModal.addEventListener('click', (e) => {
    if (e.target === trModal) closeTrModal();
  });

  // ----------------------------------------------------------------
  // TS Finalization modal helpers
  // ----------------------------------------------------------------
  function openTsModal() {
    resetTsModal();
    tsModal.classList.remove('hidden');
    tsArtifactNameEl.focus();
  }

  function closeTsModal() {
    tsModal.classList.add('hidden');
    if (tsView.classList.contains('hidden')) navFeatureLabel.textContent = '';
  }

  function resetTsModal() {
    tsArtifactNameEl.value = '';
    tsArtifactTypeEl.value = '';
    tsFunctionGroupEl.value = '';
    tsSystemEl.value = '';
    tsFgGroup.classList.add('hidden');
    tsError.textContent = '';
    tsError.style.display = 'none';
    tsSubmitBtn.disabled = false;
  }

  tsCancelBtn.addEventListener('click', closeTsModal);
  tsModal.addEventListener('click', (e) => {
    if (e.target === tsModal) closeTsModal();
  });

  // ----------------------------------------------------------------
  // Analysis / Summarization modal helpers
  // ----------------------------------------------------------------
  function openAnalysisModal() {
    resetAnalysisModal();
    analysisModal.classList.remove('hidden');
    analysisArtifactNameEl.focus();
  }

  function closeAnalysisModal() {
    analysisModal.classList.add('hidden');
    if (chatView.classList.contains('hidden')) navFeatureLabel.textContent = '';
  }

  function resetAnalysisModal() {
    analysisArtifactNameEl.value = '';
    analysisArtifactTypeEl.value = '';
    analysisFunctionGroupEl.value = '';
    analysisTcodeEl.value = '';
    analysisQuestionEl.value = '';
    analysisFgGroup.classList.add('hidden');
    analysisTcodeGroup.classList.add('hidden');
    analysisError.textContent = '';
    analysisError.style.display = 'none';
    analysisSubmitBtn.disabled = false;
  }

  analysisCancelBtn.addEventListener('click', closeAnalysisModal);
  analysisModal.addEventListener('click', (e) => {
    if (e.target === analysisModal) closeAnalysisModal();
  });

  // ================================================================
  // REUSABLE ARTIFACTS — modal open/close + submit
  // ================================================================
  function openReusableModal() {
    reusableQuestion.value = '';
    reusableError.style.display = 'none';
    reusableModal.classList.remove('hidden');
    setTimeout(() => reusableQuestion.focus(), 50);
  }
  function closeReusableModal() {
    reusableModal.classList.add('hidden');
  }
  reusableCancelBtn.addEventListener('click', closeReusableModal);
  reusableModal.addEventListener('click', (e) => {
    if (e.target === reusableModal) closeReusableModal();
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

      // Hide all views, show result view
      welcomePanel.classList.add('hidden');
      compareView.classList.add('hidden');
      document.getElementById('reviewView').classList.add('hidden');
      document.getElementById('tsView').classList.add('hidden');
      document.getElementById('chatView').classList.add('hidden');
      document.getElementById('trView').classList.add('hidden');
      impactView.classList.add('hidden');
      document.getElementById('dardView').classList.add('hidden');
      document.getElementById('namingConvView').classList.add('hidden');
      reusableView.classList.remove('hidden');

      navFeatureLabel.textContent = 'Reusable Artifacts Tool';
      reusableViewTitle.textContent = data.question || 'Reusable Artifacts';

      // Build meta pills
      reusableViewMeta.innerHTML = [
        `<span class="system-tag src">S59 RAG catalog</span>`,
        `<span class="system-tag dst">${data.rag_chunks_count} chunks matched</span>`,
        data.fetched_artifacts.length > 0
          ? `<span class="system-tag" style="background:#e8f5e9;color:#2e7d32;">${data.fetched_artifacts.filter(a=>a.status==='ok').length} sources fetched</span>`
          : '',
      ].join('');

      // Show fetched artifacts badge
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

      // Render AI reply — use buildAnalysisDOM so ## sections render as styled cards
      const aiFragment = buildAnalysisDOM(data.reply);
      reusableBody.appendChild(aiFragment);

    } catch (err) {
      const isSapError = err.message && (
        err.message.includes('Could not fetch') ||
        err.message.includes('502') ||
        err.message.includes('503') ||
        err.message.includes('catalog returned empty')
      );
      if (isSapError) {
        showErrorToast(
          'SAP Data Fetch Failed',
          err.message + '\n\nThis usually means the SAP OData service is unavailable or the system is unreachable. Please check the connection and try again.'
        );
      } else {
        showErrorToast('Reusable Artifacts Error', err.message || 'An unexpected error occurred.');
      }
      openReusableModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent = 'Fetching artifact &amp; running AI analysis\u2026';
      reusableSubmitBtn.disabled = false;
    }
  });

  // Close on backdrop click
  retrofitModal.addEventListener('click', (e) => {
    if (e.target === retrofitModal) closeRetrofitModal();
  });

  // ----------------------------------------------------------------
  // Impact Analysis modal helpers + submit
  // ----------------------------------------------------------------
  function openImpactModal() {
    impactArtifactNameEl.value  = '';
    impactArtifactTypeEl.value  = '';
    impactFunctionGroupEl.value = '';
    impactSystemEl.value        = '';
    impactPlannedChangeEl.value = '';
    impactFgGroup.classList.add('hidden');
    impactError.style.display   = 'none';
    impactSubmitBtn.disabled    = false;
    impactModal.classList.remove('hidden');
    setTimeout(() => impactArtifactNameEl.focus(), 50);
  }
  function closeImpactModal() {
    impactModal.classList.add('hidden');
    if (impactView.classList.contains('hidden')) navFeatureLabel.textContent = '';
  }
  impactCancelBtn.addEventListener('click', closeImpactModal);
  impactModal.addEventListener('click', (e) => {
    if (e.target === impactModal) closeImpactModal();
  });

  impactSubmitBtn.addEventListener('click', async () => {
    const artifactName   = impactArtifactNameEl.value.trim();
    const artifactType   = impactArtifactTypeEl.value;
    const functionGroup  = impactFunctionGroupEl.value.trim() || null;
    const system         = impactSystemEl.value;
    const plannedChange  = impactPlannedChangeEl.value.trim();

    if (!artifactName) {
      impactError.textContent = 'Please enter the artifact name.';
      impactError.style.display = 'block'; return;
    }
    if (!artifactType) {
      impactError.textContent = 'Please select an artifact type.';
      impactError.style.display = 'block'; return;
    }
    if (!system) {
      impactError.textContent = 'Please select a system.';
      impactError.style.display = 'block'; return;
    }
    if (!plannedChange) {
      impactError.textContent = 'Please describe your planned change.';
      impactError.style.display = 'block'; return;
    }
    if (artifactType === 'Function Module' && !functionGroup) {
      impactError.textContent = 'Function Group is required for Function Module.';
      impactError.style.display = 'block'; return;
    }

    impactError.style.display = 'none';
    closeImpactModal();

    document.getElementById('loadingText').textContent = 'Fetching where-used list & running AI impact analysis\u2026';
    loadingOverlay.classList.remove('hidden');
    impactSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/impact-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_name: artifactName, artifact_type: artifactType,
                               function_group: functionGroup, system, planned_change: plannedChange }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail || `Server error ${res.status}`);
      }

      const data = await res.json();

      // Hide all other views
      welcomePanel.classList.add('hidden');
      compareView.classList.add('hidden');
      document.getElementById('reviewView').classList.add('hidden');
      document.getElementById('tsView').classList.add('hidden');
      document.getElementById('chatView').classList.add('hidden');
      document.getElementById('trView').classList.add('hidden');
      reusableView.classList.add('hidden');
      document.getElementById('dardView').classList.add('hidden');
      document.getElementById('namingConvView').classList.add('hidden');
      impactView.classList.remove('hidden');

      navFeatureLabel.textContent = 'Impact Analysis';
      impactViewTitle.textContent = `Impact: ${data.artifact_name}`;

      // Meta pills — use green for zero (safe), orange for 1+ (has dependents)
      const wuCountStyle = data.where_used_count === 0
        ? 'background:#e8f5e9;color:#2e7d32;'
        : 'background:#fff3e0;color:#e65100;';
      const wuCountIcon = data.where_used_count === 0 ? '\u2705' : '\uD83D\uDD17';
      impactViewMeta.innerHTML = [
        `<span class="system-tag src">${escapeHtml(data.artifact_type)}</span>`,
        `<span class="system-tag" style="background:#e3f2fd;color:#1565c0;">Where-used: S59</span>`,
        `<span class="system-tag dst">Source: ${escapeHtml(data.system)}</span>`,
        `<span class="system-tag" style="${wuCountStyle}">${wuCountIcon} ${data.where_used_count} where-used entries</span>`,
        data.where_used_count > 0
          ? `<span class="system-tag" style="background:#e8f5e9;color:#2e7d32;">${data.unique_deps_count} unique objects</span>`
          : '',
      ].join(' ');

      // Build result body
      impactBody.innerHTML = '';

      // Planned change info card
      const changeCard = document.createElement('div');
      changeCard.className = 'ts-section-card';
      changeCard.style.marginBottom = '16px';
      changeCard.innerHTML = `
        <div class="ts-section-title" style="background:#1a1a2e;">&#9998; Planned Change</div>
        <div class="ts-section-content" style="font-style:italic;color:#444;">"${escapeHtml(data.planned_change)}"</div>`;
      impactBody.appendChild(changeCard);

      // ── Zero where-used: show a clear "safe to proceed" card ──────────────
      if (data.where_used_count === 0) {
        const noImpactCard = document.createElement('div');
        noImpactCard.className = 'ts-section-card';
        noImpactCard.innerHTML = `
          <div class="ts-section-title" style="background:#1b5e20;">&#10003; No Impact Found &mdash; Safe to Proceed</div>
          <div class="ts-section-content">
            <p style="margin:0 0 10px 0;">
              No where-used entries found for <strong>${escapeHtml(data.artifact_name)}</strong> in S59.
            </p>
            <p style="margin:0 0 10px 0;">
              No other ABAP object in the catalog references this artifact.
              Your planned change has <strong>zero impact</strong> on other objects &mdash; you can proceed safely.
            </p>
            <p style="margin:0;padding:8px 10px;background:#f1f8e9;border-left:3px solid #558b2f;border-radius:4px;font-size:12px;color:#33691e;">
              &#8505; The where-used catalog is maintained on <strong>S59</strong>.
              Once the same API is deployed on other systems, results from those systems will also appear here.
            </p>
          </div>`;
        impactBody.appendChild(noImpactCard);
        return; // nothing more to render
      }

      // Fetched sources table
      if (data.deep_fetched && data.deep_fetched.length > 0) {
        const fetchRows = data.deep_fetched.map(a => {
          const icon = a.status === 'ok' ? '\u2705' : '\u274C';
          return `<tr><td>${icon}</td><td><code>${escapeHtml(a.type)}</code></td><td><strong>${escapeHtml(a.name)}</strong></td><td style="color:#555;font-size:11px">${escapeHtml(a.status)}</td></tr>`;
        }).join('');
        const badge = document.createElement('div');
        badge.className = 'fetched-badge';
        badge.style.margin = '0 0 18px 0';
        badge.innerHTML = `
          <div class="fetched-header" style="cursor:default">
            <span class="fetched-icon">&#129302;</span>
            <span class="fetched-title">AI fetched source of ${data.deep_fetched.length} dependent object(s) for deep analysis</span>
          </div>
          <div class="fetched-body" style="display:block">
            <table class="fetched-table">
              <thead><tr><th></th><th>Type</th><th>Name</th><th>Status</th></tr></thead>
              <tbody>${fetchRows}</tbody>
            </table>
          </div>`;
        impactBody.appendChild(badge);
      }

      // AI analysis rendered as section cards
      const aiFragment = buildAnalysisDOM(data.reply);
      impactBody.appendChild(aiFragment);

    } catch (err) {
      showErrorToast('Impact Analysis Error', err.message || 'An unexpected error occurred.');
      openImpactModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent = 'Fetching artifact &amp; running AI analysis\u2026';
      impactSubmitBtn.disabled = false;
    }
  });

  // Escape key closes either open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRetrofitModal();
      closeReviewModal();
      closeTrModal();
      closeTsModal();
      closeAnalysisModal();
    }
  });

  // ----------------------------------------------------------------
  // Error helpers
  // ----------------------------------------------------------------
  function showError(msg) {
    retrofitError.textContent = msg;
    retrofitError.style.display = 'block';
  }

  function hideError() {
    retrofitError.textContent = '';
    retrofitError.style.display = 'none';
  }

  // ----------------------------------------------------------------
  // Code Review submit handler
  // ----------------------------------------------------------------
  reviewSubmitBtn.addEventListener('click', async () => {
    reviewError.style.display = 'none';

    const artifactName  = reviewArtifactNameEl.value.trim();
    const artifactType  = reviewArtifactTypeEl.value;
    const functionGroup = reviewFunctionGroupEl.value.trim();
    const system        = reviewSystemEl.value;

    const showReviewError = (msg) => {
      reviewError.textContent = msg;
      reviewError.style.display = 'block';
    };

    if (!artifactName) return showReviewError('Please enter the artifact name.');
    if (!artifactType) return showReviewError('Please select an artifact type.');
    if (artifactType === 'Function Module' && !functionGroup)
      return showReviewError('Please enter the function group.');
    if (!system) return showReviewError('Please select the system.');

    closeReviewModal();
    loadingOverlay.classList.remove('hidden');
    reviewSubmitBtn.disabled = true;

    try {
      const payload = {
        artifact_name: artifactName,
        artifact_type: artifactType,
        function_group: functionGroup || null,
        system: system,
      };

      const res = await fetch('/api/code-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      renderCodeReviewView(data);

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

  // ----------------------------------------------------------------
  // Render Code Review results view
  // ----------------------------------------------------------------
  function renderCodeReviewView(data) {
    navFeatureLabel.textContent = 'Code Review / Optimization';
    reviewTitle.textContent = `${data.artifact_type}: ${data.artifact_name}`;
    reviewMeta.innerHTML = `
      <span class="meta-badge src">${data.system}</span>
      <span class="meta-badge" style="background:#e8f0fe;color:#1a5276;">&#128269; Code Review</span>
    `;

    // Clear and render analysis sections
    reviewBody.innerHTML = '';
    const fragment = buildAnalysisDOM(data.analysis);
    reviewBody.appendChild(fragment);

    // Show review view, hide others
    welcomePanel.classList.add('hidden');
    compareView.classList.add('hidden');
    trView.classList.add('hidden');
    tsView.classList.add('hidden');
    chatView.classList.add('hidden');
    reusableView.classList.add('hidden');
    impactView.classList.add('hidden');
    document.getElementById('dardView').classList.add('hidden');
    document.getElementById('namingConvView').classList.add('hidden');
    reviewView.classList.remove('hidden');
  }

  // Build analysis DOM from AI text (split by ## sections)
  function buildAnalysisDOM(text) {
    const fragment = document.createDocumentFragment();
    if (!text) {
      const p = document.createElement('p');
      p.textContent = 'No analysis available.';
      fragment.appendChild(p);
      return fragment;
    }

    // Split into sections at each ## heading
    const rawSections = text.split(/(?=^## )/m);

    rawSections.forEach(section => {
      const trimmed = section.trim();
      if (!trimmed) return;

      const lines = trimmed.split('\n');
      const heading = lines[0].replace(/^## /, '').trim();
      const rest = lines.slice(1).join('\n').trim();

      const card = document.createElement('div');
      card.className = 'review-card';

      // Title row
      const titleRow = document.createElement('div');
      titleRow.className = 'review-card-title';

      const titleSpan = document.createElement('span');
      titleSpan.textContent = heading;
      titleRow.appendChild(titleSpan);

      // Status badge
      const statusMatch = rest.match(/^Status:\s*(PASS|FAIL)/im);
      if (statusMatch) {
        const badge = document.createElement('span');
        const isPass = statusMatch[1].toUpperCase() === 'PASS';
        badge.className = isPass ? 'status-badge pass' : 'status-badge fail';
        badge.textContent = isPass ? '\u2705 PASS' : '\u274C FAIL';
        titleRow.appendChild(badge);
      }

      card.appendChild(titleRow);

      // Card body — strip leading Status line from body text
      const bodyText = rest.replace(/^Status:\s*(PASS|FAIL)\n?/im, '').trim();
      const bodyEl = document.createElement('div');
      bodyEl.className = 'review-card-body';
      renderBodyContent(bodyEl, bodyText);
      card.appendChild(bodyEl);

      fragment.appendChild(card);
    });

    return fragment;
  }

  // Render body text handling ```abap code blocks
  function renderBodyContent(el, text) {
    const codeBlockRegex = /```(?:abap)?\n?([\s\S]*?)(?:```|$)/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const div = document.createElement('div');
        div.innerHTML = renderMarkdownText(text.slice(lastIndex, match.index));
        el.appendChild(div);
      }
      el.appendChild(createCodeBlock(match[1].trim()));
      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      const div = document.createElement('div');
      div.innerHTML = renderMarkdownText(text.slice(lastIndex));
      el.appendChild(div);
    }
  }

  // Inline markdown text renderer (no code blocks)
  function renderMarkdownText(text) {
    let html = escapeHtml(text);

    // Pipe tables → <table class="ai-table"> (must run before \n → <br>)
    html = html.replace(
      /^\|(.+)\|\n\|([-: |]+)\|\n((?:\|.+\|(?:\n|$))+)/gm,
      (match, headerRow, _sep, bodyRows) => {
        const ths = headerRow.split('|').map(h => h.trim()).filter(Boolean)
          .map(h => `<th>${h}</th>`).join('');
        const trs = bodyRows.trim().split('\n').map(row => {
          const tds = row.split('|').map(c => c.trim()).filter(Boolean)
            .map(c => `<td>${c}</td>`).join('');
          return tds ? `<tr>${tds}</tr>` : '';
        }).filter(Boolean).join('');
        return `<table class="ai-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>\n`;
      }
    );

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/<\/ul><\/p>/g, '</ul>');
    html = html.replace(/<p>(<table)/g, '$1');
    html = html.replace(/<\/table><\/p>/g, '</table>');
    return html;
  }

  // Create a code block element with a copy button
  function createCodeBlock(code) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-box';

    const header = document.createElement('div');
    header.className = 'code-box-header';

    const langLabel = document.createElement('span');
    langLabel.className = 'code-lang-label';
    langLabel.textContent = 'ABAP';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = '&#128203; Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        copyBtn.innerHTML = '&#10003; Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '&#128203; Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copyBtn.innerHTML = '&#10003; Copied!';
        setTimeout(() => { copyBtn.innerHTML = '&#128203; Copy'; }, 2000);
      });
    });

    header.appendChild(langLabel);
    header.appendChild(copyBtn);

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.textContent = code;
    pre.appendChild(codeEl);

    wrapper.appendChild(header);
    wrapper.appendChild(pre);
    return wrapper;
  }

  // ----------------------------------------------------------------
  // TS Finalization submit handler
  // ----------------------------------------------------------------
  tsSubmitBtn.addEventListener('click', async () => {
    tsError.style.display = 'none';

    const artifactName  = tsArtifactNameEl.value.trim();
    const artifactType  = tsArtifactTypeEl.value;
    const functionGroup = tsFunctionGroupEl.value.trim();
    const system        = tsSystemEl.value;

    const showTsError = (msg) => {
      tsError.textContent = msg;
      tsError.style.display = 'block';
    };

    if (!artifactName)  return showTsError('Please enter the artifact name.');
    if (!artifactType)  return showTsError('Please select an artifact type.');
    if (artifactType === 'Function Module' && !functionGroup)
      return showTsError('Please enter the function group.');
    if (!system) return showTsError('Please select the system.');

    closeTsModal();
    document.getElementById('loadingText').textContent = 'Fetching artifact & generating Technical Specification\u2026';
    loadingOverlay.classList.remove('hidden');
    tsSubmitBtn.disabled = true;

    try {
      const res = await fetch('/api/ts-finalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact_name: artifactName,
          artifact_type: artifactType,
          function_group: functionGroup || null,
          system: system,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      renderTsView(data);

    } catch (err) {
      openTsModal();
      tsError.textContent = err.message || 'Unexpected error. Please try again.';
      tsError.style.display = 'block';
      if (err.message && (err.message.includes('502') || err.message.includes('503') || err.message.includes('Could not fetch'))) {
        showErrorToast('SAP Fetch Failed', err.message);
      }
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent = 'Fetching artifact & running AI analysis\u2026';
      tsSubmitBtn.disabled = false;
    }
  });

  // ----------------------------------------------------------------
  // Render TS Finalization results view
  // ----------------------------------------------------------------
  function renderTsView(data) {
    navFeatureLabel.textContent = 'TS Finalization Tool';
    tsViewTitle.textContent = `TS: ${data.artifact_name}`;
    tsViewMeta.innerHTML = `
      <span class="meta-badge src">${data.system}</span>
      <span class="meta-badge" style="background:#eaf2ff;color:#1a4a8a;">${data.artifact_type}</span>
    `;

    tsBody.innerHTML = '';
    tsBody.appendChild(buildTsDom(data.ts_content));

    welcomePanel.classList.add('hidden');
    compareView.classList.add('hidden');
    reviewView.classList.add('hidden');
    trView.classList.add('hidden');
    chatView.classList.add('hidden');
    reusableView.classList.add('hidden');
    impactView.classList.add('hidden');
    document.getElementById('dardView').classList.add('hidden');
    document.getElementById('namingConvView').classList.add('hidden');
    tsView.classList.remove('hidden');
  }

  function buildTsDom(text) {
    const frag = document.createDocumentFragment();
    if (!text) return frag;

    const sections = text.split(/(?=^## )/m);
    sections.forEach(section => {
      const trimmed = section.trim();
      if (!trimmed) return;

      const lines   = trimmed.split('\n');
      const heading = lines[0].replace(/^## /, '').trim();
      const body    = lines.slice(1).join('\n').trim();

      const card = document.createElement('div');
      card.className = 'ts-section-card';

      // Card header: title + copy button
      const cardHeader = document.createElement('div');
      cardHeader.className = 'ts-section-header';

      const titleEl = document.createElement('span');
      titleEl.className = 'ts-section-title';
      titleEl.textContent = heading;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'ts-copy-btn';
      copyBtn.innerHTML = '&#128203; Copy';
      copyBtn.addEventListener('click', () => {
        const contentEl = card.querySelector('.ts-section-content');
        const plainText = `## ${heading}\n${contentEl ? contentEl.innerText : body}`;
        navigator.clipboard.writeText(plainText).then(() => {
          copyBtn.innerHTML = '&#10003; Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerHTML = '&#128203; Copy';
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = plainText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          copyBtn.innerHTML = '&#10003; Copied!';
          setTimeout(() => { copyBtn.innerHTML = '&#128203; Copy'; }, 2000);
        });
      });

      cardHeader.appendChild(titleEl);
      cardHeader.appendChild(copyBtn);
      card.appendChild(cardHeader);

      // Card content
      const contentEl = document.createElement('div');
      contentEl.className = 'ts-section-content';
      contentEl.innerHTML = renderTsBody(body);
      card.appendChild(contentEl);

      frag.appendChild(card);
    });

    return frag;
  }

  // Render TS section body — supports markdown tables, bold, bullets, headings
  function renderTsBody(text) {
    if (!text) return '';

    // Split into lines to handle tables block by block
    const lines   = text.split('\n');
    const output  = [];
    let inTable   = false;
    let tableRows = [];

    const flushTable = () => {
      if (!tableRows.length) return;
      let html = '<table class="ts-md-table">';
      tableRows.forEach((row, idx) => {
        const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (idx === 1 && cells.every(c => /^[-: ]+$/.test(c))) return; // separator row
        const tag = idx === 0 ? 'th' : 'td';
        html += '<tr>' + cells.map(c => `<${tag}>${escapeHtml(c.trim())}</${tag}>`).join('') + '</tr>';
      });
      html += '</table>';
      output.push(html);
      tableRows = [];
      inTable = false;
    };

    lines.forEach(line => {
      if (line.trim().startsWith('|')) {
        inTable = true;
        tableRows.push(line);
      } else {
        if (inTable) flushTable();
        // Transform markdown inline
        let l = escapeHtml(line);
        l = l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        l = l.replace(/^### (.+)$/, '<h4>$1</h4>');
        l = l.replace(/^## (.+)$/,  '<h3>$1</h3>');
        l = l.replace(/^- (.+)$/,   '<li>$1</li>');
        l = l.replace(/^\d+\. (.+)$/, '<li>$1</li>');
        if (l === '') {
          output.push('<br>');
        } else if (!l.startsWith('<h') && !l.startsWith('<li') && !l.startsWith('<br')) {
          output.push(`<p>${l}</p>`);
        } else {
          output.push(l);
        }
      }
    });
    if (inTable) flushTable();

    // Wrap consecutive <li> in <ul>
    return output.join('\n').replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  }

  // ----------------------------------------------------------------
  // TR Sequencing submit handler
  // ----------------------------------------------------------------
  trSubmitBtn.addEventListener('click', async () => {
    trError.style.display = 'none';

    const trNumber      = trNumberEl.value.trim().toUpperCase();
    const destSystem    = trDestSystemEl.value;

    const showTrError = (msg) => {
      trError.textContent = msg;
      trError.style.display = 'block';
    };

    if (!trNumber)    return showTrError('Please enter the TR number.');
    if (!destSystem)  return showTrError('Please select the destination system.');

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
      renderTrView(data);

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

  // ----------------------------------------------------------------
  // Render TR Sequencing results view
  // ----------------------------------------------------------------
  function renderTrView(data) {
    navFeatureLabel.textContent = 'TR Sequencing Analyser';
    trViewTitle.textContent = `TR Analysis: ${data.tr_number}`;
    trViewMeta.innerHTML = `
      <span class="meta-badge src">${data.tr_number}</span>
      <span class="meta-badge dst">&#8594; ${data.destination_system}</span>
      <span class="meta-badge" style="background:#eaf6fb;color:#1a5276;">${data.items.length} records</span>
    `;

    // Build dependency table
    trDepTableBody.innerHTML = '';
    const frag = document.createDocumentFragment();
    data.items.forEach((item, idx) => {
      const tr   = document.createElement('tr');
      const statusCode  = item.ref_obj_req_status || '';
      const statusInfo  = trStatusInfo(statusCode);

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

    // Render AI analysis
    trAiBody.innerHTML = renderMarkdown(data.analysis);

    // Show TR view, hide others
    welcomePanel.classList.add('hidden');
    compareView.classList.add('hidden');
    reviewView.classList.add('hidden');
    tsView.classList.add('hidden');
    chatView.classList.add('hidden');
    reusableView.classList.add('hidden');
    impactView.classList.add('hidden');
    document.getElementById('dardView').classList.add('hidden');
    document.getElementById('namingConvView').classList.add('hidden');
    trView.classList.remove('hidden');
  }

  function trStatusInfo(code) {
    switch ((code || '').toUpperCase()) {
      case 'D': return { cls: 'released', icon: '\u2705', label: 'Released' };
      case 'O': return { cls: 'pending',  icon: '\u23f3', label: 'Open' };
      default:  return { cls: 'missing',  icon: '\u274c', label: code || 'Unknown' };
    }
  }

  // ----------------------------------------------------------------
  // Submit handler
  // ----------------------------------------------------------------
  retrofitSubmitBtn.addEventListener('click', async () => {
    hideError();

    const artifactName  = artifactNameEl.value.trim();
    const artifactType  = artifactTypeEl.value;
    const functionGroup = functionGroupEl.value.trim();
    const sourceSystem  = sourceSystemEl.value;
    const destSystem    = destSystemEl.value;

    // Validation
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
      const payload = {
        artifact_name: artifactName,
        artifact_type: artifactType,
        function_group: functionGroup || null,
        source_system: sourceSystem,
        destination_system: destSystem,
      };

      const res = await fetch('/api/retrofit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  // ----------------------------------------------------------------
  // Render the compare view
  // ----------------------------------------------------------------
  function renderCompareView(data) {
    // Update navbar label now that results are shown
    navFeatureLabel.textContent = 'Retro Fit Tool';

    // Update header
    compareTitle.textContent = `${data.artifact_type}: ${data.artifact_name}`;

    compareMeta.innerHTML = `
      <span class="meta-badge src">Source: ${data.source_system}</span>
      <span class="meta-badge dst">Destination: ${data.destination_system}</span>
    `;

    srcTag.textContent   = data.source_system;
    dstTag.textContent   = data.destination_system;

    // Re-wire scroll sync first (clones nodes, must happen before renderDiffTable)
    syncCodeBlockScroll();

    // Render diff tables into the freshly cloned nodes
    renderDiffTable(document.getElementById('srcDiffTable'), data.left_lines, true);
    renderDiffTable(document.getElementById('dstDiffTable'), data.right_lines, false);

    // Render AI analysis
    aiAnalysisBody.innerHTML = renderMarkdown(data.ai_analysis);

    // Show compare view, hide welcome
    welcomePanel.classList.add('hidden');
    reviewView.classList.add('hidden');
    trView.classList.add('hidden');
    tsView.classList.add('hidden');
    chatView.classList.add('hidden');
    reusableView.classList.add('hidden');
    impactView.classList.add('hidden');
    document.getElementById('dardView').classList.add('hidden');
    document.getElementById('namingConvView').classList.add('hidden');
    compareView.classList.remove('hidden');
  }

  // ----------------------------------------------------------------
  // Diff table renderer
  // ----------------------------------------------------------------
  function renderDiffTable(tableEl, lines, isSource) {
    tableEl.innerHTML = '';
    const tbody = document.createDocumentFragment();
    let lineNo = 1;

    lines.forEach(line => {
      const tr = document.createElement('tr');
      const cssClass = diffTypeClass(line.type);
      tr.className = cssClass;

      // Line number cell
      const tdLn = document.createElement('td');
      tdLn.className = 'ln';
      tdLn.textContent = (line.type === 'empty' || line.content === '') ? '' : lineNo;

      // Content cell
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

  // ----------------------------------------------------------------
  // Sync scrolling between source and dest code blocks
  // ----------------------------------------------------------------
  function syncCodeBlockScroll() {
    const srcBody = document.getElementById('srcCodeBody');
    const dstBody = document.getElementById('dstCodeBody');

    // Remove old listeners by cloning nodes
    const newSrc = srcBody.cloneNode(true);
    const newDst = dstBody.cloneNode(true);
    // Re-assign diff tables inside cloned nodes
    const newSrcTable = newSrc.querySelector('.diff-table');
    const newDstTable = newDst.querySelector('.diff-table');
    if (newSrcTable) newSrcTable.id = 'srcDiffTable';
    if (newDstTable) newDstTable.id = 'dstDiffTable';
    srcBody.parentNode.replaceChild(newSrc, srcBody);
    dstBody.parentNode.replaceChild(newDst, dstBody);

    let isSyncing = false;
    newSrc.addEventListener('scroll', () => {
      if (isSyncing) return;
      isSyncing = true;
      newDst.scrollTop = newSrc.scrollTop;
      isSyncing = false;
    });
    newDst.addEventListener('scroll', () => {
      if (isSyncing) return;
      isSyncing = true;
      newSrc.scrollTop = newDst.scrollTop;
      isSyncing = false;
    });
  }

  // ----------------------------------------------------------------
  // Simple markdown renderer for AI output
  // ----------------------------------------------------------------
  function renderMarkdown(text) {
    if (!text) return '<p style="color:#888;font-style:italic;">No analysis available.</p>';

    let html = escapeHtml(text);

    // Pipe tables → <table class="ai-table"> (must run before \n → <br>)
    html = html.replace(
      /^\|(.+)\|\n\|([-: |]+)\|\n((?:\|.+\|(?:\n|$))+)/gm,
      (match, headerRow, _sep, bodyRows) => {
        const ths = headerRow.split('|').map(h => h.trim()).filter(Boolean)
          .map(h => `<th>${h}</th>`).join('');
        const trs = bodyRows.trim().split('\n').map(row => {
          const tds = row.split('|').map(c => c.trim()).filter(Boolean)
            .map(c => `<td>${c}</td>`).join('');
          return tds ? `<tr>${tds}</tr>` : '';
        }).filter(Boolean).join('');
        return `<table class="ai-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>\n`;
      }
    );

    // ## headings → <h2>
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

    // **bold**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // - bullet items
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    // wrap consecutive <li> in <ul>
    html = html.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Blank lines → paragraph breaks
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<h2>)/g, '$1');
    html = html.replace(/<\/h2><\/p>/g, '</h2>');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/<\/ul><\/p>/g, '</ul>');
    html = html.replace(/<p>(<table)/g, '$1');
    html = html.replace(/<\/table><\/p>/g, '</table>');

    return html;
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ================================================================
  // ANALYSIS / SUMMARIZATION — Submit handler
  // ================================================================
  analysisSubmitBtn.addEventListener('click', async () => {
    analysisError.style.display = 'none';

    const artifactName  = analysisArtifactNameEl.value.trim();
    const artifactType  = analysisArtifactTypeEl.value;
    const functionGroup = analysisFunctionGroupEl.value.trim();
    const tcode         = analysisTcodeEl.value.trim();
    const system        = analysisSystemEl.value;
    const question      = analysisQuestionEl.value.trim();

    const showErr = (msg) => { analysisError.textContent = msg; analysisError.style.display = 'block'; };

    if (!artifactName) return showErr('Please enter the artifact name.');
    if (!artifactType) return showErr('Please select an artifact type.');
    if (artifactType === 'Function Module' && !functionGroup)
      return showErr('Please enter the function group.');
    if (!system)   return showErr('Please select the system.');
    if (!question) return showErr('Please enter your initial question.');

    chatState = {
      artifactName, artifactType,
      functionGroup: functionGroup || null,
      system,
      tcode: tcode || null,
      sourceCode: null,
      messages: [{ role: 'user', content: question }],
    };

    closeAnalysisModal();

    // Open chat view immediately — user sees their message right away
    openChatViewEmpty();
    addChatMessage('user', question);
    const typingEl = addTypingIndicator();

    document.getElementById('loadingText').textContent = 'Fetching artifact from SAP\u2026';
    loadingOverlay.classList.remove('hidden');
    analysisSubmitBtn.disabled = true;

    const initController = new AbortController();
    const initTimeout = setTimeout(() => initController.abort(), 180000);

    try {
      const res = await fetch('/api/chat-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: initController.signal,
        body: JSON.stringify({
          artifact_name: chatState.artifactName,
          artifact_type: chatState.artifactType,
          function_group: chatState.functionGroup,
          system: chatState.system,
          tcode: chatState.tcode,
          source_code: null,
          messages: chatState.messages,
        }),
      });

      let replyText;
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        replyText = `\u26a0\ufe0f **Could not fetch artifact from SAP:** ${e.detail || 'Server error ' + res.status}`;
      } else {
        const data = await res.json();
        chatState.sourceCode = data.source_code;
        addContextCard(chatState, data.source_code);
        if (data.fetched_artifacts && data.fetched_artifacts.length > 0) {
          addFetchedBadge(data.fetched_artifacts);
        }
        replyText = data.reply;
      }

      typingEl.remove();
      chatState.messages.push({ role: 'assistant', content: replyText });
      addChatMessage('ai', replyText);

    } catch (err) {
      typingEl.remove();
      const errMsg = err.name === 'AbortError'
        ? '\u26a0\ufe0f **Request timed out.** The AI took too long to respond. Please try again.'
        : `\u26a0\ufe0f **Connection error:** ${err.message || 'Unexpected error'}`;
      chatState.messages.push({ role: 'assistant', content: errMsg });
      addChatMessage('ai', errMsg);
    } finally {
      clearTimeout(initTimeout);
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent = 'Fetching artifact & running AI analysis\u2026';
      analysisSubmitBtn.disabled = false;
      chatInput.focus();
    }
  });

  // ----------------------------------------------------------------
  // Context card — shows exactly what was sent to OpenAI
  // Displayed once after the first artifact fetch
  // ----------------------------------------------------------------
  function addContextCard(state, sourceCode) {
    const lines = (sourceCode || '').split('\n');
    const lineCount = lines.length;
    const charCount = (sourceCode || '').length;
    const preview = lines.slice(0, 12).join('\n');
    const hasMore = lineCount > 12;

    const card = document.createElement('div');
    card.className = 'ctx-card';

    // Build system prompt text exactly as the backend builds it
    const tcodeRow = state.tcode ? `\nTransaction Code (TCode): ${state.tcode}` : '';
    const systemPrompt =
      `You are an expert SAP ABAP developer and analyst acting as an AI assistant.\n` +
      `Analysing: ${state.artifactType} — ${state.artifactName}\n` +
      `System: ${state.system}${tcodeRow}\n\n` +
      `Source code loaded: ${lineCount} lines, ${charCount} characters`;

    card.innerHTML = `
      <div class="ctx-header" id="ctx-toggle-${Date.now()}">
        <span class="ctx-icon">&#128196;</span>
        <span class="ctx-title">Context sent to AI</span>
        <div class="ctx-pills">
          <span class="ctx-pill blue">${escapeHtml(state.artifactType)}</span>
          <span class="ctx-pill green">${escapeHtml(state.system)}</span>
          <span class="ctx-pill gray">${lineCount} lines fetched</span>
          ${state.tcode ? `<span class="ctx-pill orange">TCode: ${escapeHtml(state.tcode)}</span>` : ''}
        </div>
        <span class="ctx-chevron">&#9660;</span>
      </div>
      <div class="ctx-body">
        <div class="ctx-section">
          <div class="ctx-section-label">&#129302; System Prompt sent to OpenAI</div>
          <pre class="ctx-pre">${escapeHtml(systemPrompt)}</pre>
        </div>
        <div class="ctx-section">
          <div class="ctx-section-label">&#128196; Artifact Source Code — ${escapeHtml(state.artifactName)}</div>
          <pre class="ctx-pre ctx-code" id="ctx-code-preview">${escapeHtml(preview)}${hasMore ? '\n<span class="ctx-fade">… (' + (lineCount - 12) + ' more lines hidden)</span>' : ''}</pre>
          ${hasMore ? `<button class="ctx-expand-btn" data-expanded="false">&#9654; Show all ${lineCount} lines</button>` : ''}
        </div>
        <div class="ctx-section">
          <div class="ctx-section-label">&#128172; Messages in this request</div>
          <pre class="ctx-pre">${escapeHtml(JSON.stringify(
            state.messages.map(m => ({ role: m.role, content: m.content.slice(0, 120) + (m.content.length > 120 ? '…' : '') })),
            null, 2
          ))}</pre>
        </div>
      </div>
    `;

    // Toggle collapse on header click
    const header = card.querySelector('.ctx-header');
    const body   = card.querySelector('.ctx-body');
    const chev   = card.querySelector('.ctx-chevron');
    body.classList.add('collapsed');
    chev.textContent = '\u25B6';  // right arrow when collapsed
    header.addEventListener('click', () => {
      const isOpen = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', isOpen);
      chev.textContent = isOpen ? '\u25B6' : '\u25BC';
    });

    // Expand full source
    const expandBtn = card.querySelector('.ctx-expand-btn');
    if (expandBtn) {
      const preEl = card.querySelector('#ctx-code-preview');
      expandBtn.addEventListener('click', () => {
        const expanded = expandBtn.dataset.expanded === 'true';
        if (expanded) {
          preEl.innerHTML = escapeHtml(preview) + (hasMore ? `\n<span class="ctx-fade">\u2026 (${lineCount - 12} more lines hidden)</span>` : '');
          expandBtn.textContent = `\u25B6 Show all ${lineCount} lines`;
          expandBtn.dataset.expanded = 'false';
        } else {
          preEl.textContent = sourceCode;
          expandBtn.textContent = '\u25BC Collapse';
          expandBtn.dataset.expanded = 'true';
        }
      });
    }

    chatMessages.appendChild(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ----------------------------------------------------------------
  // Open chat view shell (header populated, messages cleared)
  // Messages are added separately via addChatMessage()
  // ----------------------------------------------------------------
  function openChatViewEmpty() {
    navFeatureLabel.textContent = 'Analysis / Summarization';
    chatArtifactTitle.textContent = `${chatState.artifactType}: ${chatState.artifactName}`;
    chatArtifactMeta.innerHTML = `
      <span class="meta-badge src">${chatState.system}</span>
      ${chatState.tcode ? `<span class="meta-badge" style="background:#e8f0fe;color:#1a5276;">TCode: ${escapeHtml(chatState.tcode)}</span>` : ''}
      <span class="meta-badge" style="background:#f0f4e8;color:#2d6a1f;">&#128202; Analysis</span>
    `;
    chatMessages.innerHTML = '';

    welcomePanel.classList.add('hidden');
    compareView.classList.add('hidden');
    reviewView.classList.add('hidden');
    trView.classList.add('hidden');
    tsView.classList.add('hidden');
    reusableView.classList.add('hidden');
    impactView.classList.add('hidden');
    document.getElementById('dardView').classList.add('hidden');
    document.getElementById('namingConvView').classList.add('hidden');
    chatView.classList.remove('hidden');
  }

  // ----------------------------------------------------------------
  // Add a chat message bubble to the view
  // ----------------------------------------------------------------
  function addChatMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${role}`;

    const avatar = document.createElement('div');
    avatar.className = `chat-avatar ${role === 'ai' ? 'ai-avatar' : 'user-avatar'}`;
    avatar.textContent = role === 'ai' ? 'AI' : '\u{1F464}';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    if (role === 'ai') {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'chat-bubble-content';
      renderBodyContent(contentDiv, content);
      bubble.appendChild(contentDiv);
    } else {
      bubble.textContent = content;
    }

    if (role === 'user') {
      msgDiv.appendChild(bubble);
      msgDiv.appendChild(avatar);
    } else {
      msgDiv.appendChild(avatar);
      msgDiv.appendChild(bubble);
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  // ----------------------------------------------------------------
  // Fetched-artifacts badge — shown whenever AI auto-fetches code
  // ----------------------------------------------------------------
  function addFetchedBadge(artifacts) {
    const badge = document.createElement('div');
    badge.className = 'fetched-badge';

    const okCount      = artifacts.filter(a => a.status === 'ok').length;
    const skippedCount = artifacts.filter(a => a.status.startsWith('duplicate') || a.status.startsWith('skipped')).length;
    const errorCount   = artifacts.filter(a => a.status !== 'ok' && !a.status.startsWith('duplicate') && !a.status.startsWith('skipped')).length;

    const rows = artifacts.map(a => {
      const icon = a.status === 'ok' ? '\u2705' : (a.status.startsWith('duplicate') || a.status.startsWith('skipped')) ? '\u23ED\uFE0F' : '\u274C';
      return `<tr><td>${icon}</td><td><code>${escapeHtml(a.type)}</code></td><td><strong>${escapeHtml(a.name)}</strong></td><td class="fetch-status">${escapeHtml(a.status)}</td></tr>`;
    }).join('');

    badge.innerHTML = `
      <div class="fetched-header" >
        <span class="fetched-icon">&#129302;</span>
        <span class="fetched-title">AI auto-fetched ${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}</span>
        <span class="fetched-pills">
          ${okCount      > 0 ? `<span class="fetch-pill ok">${okCount} fetched</span>` : ''}
          ${skippedCount > 0 ? `<span class="fetch-pill skip">${skippedCount} skipped</span>` : ''}
          ${errorCount   > 0 ? `<span class="fetch-pill err">${errorCount} failed</span>` : ''}
        </span>
        <span class="fetched-chevron">&#9654;</span>
      </div>
      <div class="fetched-body collapsed">
        <table class="fetched-table">
          <thead><tr><th></th><th>Type</th><th>Name</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    const header  = badge.querySelector('.fetched-header');
    const body    = badge.querySelector('.fetched-body');
    const chev    = badge.querySelector('.fetched-chevron');
    header.addEventListener('click', () => {
      const open = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', open);
      chev.innerHTML = open ? '&#9654;' : '&#9660;';
    });

    chatMessages.appendChild(badge);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ----------------------------------------------------------------
  // Typing indicator (three bouncing dots)
  // ----------------------------------------------------------------
  function addTypingIndicator() {
    const msg = document.createElement('div');
    msg.className = 'chat-msg ai';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar ai-avatar';
    avatar.textContent = 'AI';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble typing-indicator';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'typing-dot';
      bubble.appendChild(dot);
    }

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
  }

  // ----------------------------------------------------------------
  // Send follow-up chat message
  // ----------------------------------------------------------------
  async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text || chatSendBtn.disabled) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSendBtn.disabled = true;

    addChatMessage('user', text);
    chatState.messages.push({ role: 'user', content: text });

    const typingEl = addTypingIndicator();

    const followupController = new AbortController();
    const followupTimeout = setTimeout(() => followupController.abort(), 180000);

    try {
      const res = await fetch('/api/chat-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: followupController.signal,
        body: JSON.stringify({
          artifact_name: chatState.artifactName,
          artifact_type: chatState.artifactType,
          function_group: chatState.functionGroup,
          system: chatState.system,
          tcode: chatState.tcode,
          source_code: chatState.sourceCode,
          messages: chatState.messages,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || `Server error ${res.status}`); }
      const data = await res.json();
      typingEl.remove();
      if (data.fetched_artifacts && data.fetched_artifacts.length > 0) {
        addFetchedBadge(data.fetched_artifacts);
      }
      chatState.messages.push({ role: 'assistant', content: data.reply });
      addChatMessage('ai', data.reply);
    } catch (err) {
      typingEl.remove();
      const msg = err.name === 'AbortError'
        ? '\u26a0\ufe0f **Request timed out.** The AI took too long to respond. Please try again.'
        : `\u26a0\ufe0f Error: ${err.message || 'Unexpected error'}`;
      addChatMessage('ai', msg);
    } finally {
      clearTimeout(followupTimeout);
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  // Enter (without Shift) sends the message
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Auto-resize chat textarea as user types
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  chatSendBtn.addEventListener('click', sendChatMessage);

  // ================================================================
  // AI DARD — Artefact Search & Code Fetch
  // ================================================================

  // State
  let dardSearchResults = [];
  let dardFetchResult   = null;
  let dardSystems       = [];   // cached from /api/dard/systems

  const dardView           = document.getElementById('dardView');
  const dardViewTitle      = document.getElementById('dardViewTitle');
  const dardViewMeta       = document.getElementById('dardViewMeta');
  const dardBody           = document.getElementById('dardBody');
  const dardNewBtn         = document.getElementById('dardNewBtn');
  const dardOptimizeBtn    = document.getElementById('dardOptimizeBtn');

  const dardSearchModal    = document.getElementById('dardSearchModal');
  const dardDescription    = document.getElementById('dardDescription');
  const dardSearchError    = document.getElementById('dardSearchError');
  const dardSearchCancelBtn  = document.getElementById('dardSearchCancelBtn');
  const dardSearchSubmitBtn  = document.getElementById('dardSearchSubmitBtn');

  const dardResultsModal   = document.getElementById('dardResultsModal');
  const dardCheckboxList   = document.getElementById('dardCheckboxList');
  const dardResultsError   = document.getElementById('dardResultsError');
  const dardResultsBackBtn = document.getElementById('dardResultsBackBtn');
  const dardFetchCodeBtn   = document.getElementById('dardFetchCodeBtn');
  const dardRetrofitBtn    = document.getElementById('dardRetrofitBtn');
  const dardSelectAllBtn   = document.getElementById('dardSelectAllBtn');
  const dardClearAllBtn    = document.getElementById('dardClearAllBtn');

  const dardGenerateModal     = document.getElementById('dardGenerateModal');
  const dardGenerateSubtitle  = document.getElementById('dardGenerateSubtitle');
  const dardGenerateBody      = document.getElementById('dardGenerateBody');
  const dardGenerateCloseBtn  = document.getElementById('dardGenerateCloseBtn');
  const dardGenSystemWrap     = document.getElementById('dardGenSystemWrap');
  const dardGenSystemSelect   = document.getElementById('dardGenSystemSelect');
  const dardGenError          = document.getElementById('dardGenError');
  const dardGenLoading        = document.getElementById('dardGenLoading');
  const dardGenSubmitBtn      = document.getElementById('dardGenSubmitBtn');

  // Fetch available systems once and cache (called on first search modal open)
  async function _loadDardSystems() {
    if (dardSystems.length > 0) return;
    try {
      const res = await fetch('/api/dard/systems');
      if (res.ok) {
        const data = await res.json();
        dardSystems = data.systems || [];
      }
    } catch (_) { /* silently ignore — dropdown will be empty */ }
  }

  function openDardSearchModal() {
    dardDescription.value = '';
    dardSearchError.style.display = 'none';
    dardSearchSubmitBtn.disabled = false;
    dardSearchModal.classList.remove('hidden');
    setTimeout(() => dardDescription.focus(), 50);
    _loadDardSystems(); // kick off systems fetch in background
  }

  function closeDardSearchModal() {
    dardSearchModal.classList.add('hidden');
  }

  function openDardResultsModal(matches) {
    dardSearchResults = matches;
    dardResultsError.style.display = 'none';

    // Build checkbox list
    dardCheckboxList.innerHTML = '';
    if (matches.length === 0) {
      dardCheckboxList.innerHTML = '<p style="padding:16px;color:#888;text-align:center;">No matching artefacts found. Try different keywords.</p>';
      dardFetchCodeBtn.disabled = true;
    } else {
      matches.forEach((m, idx) => {
        const row = document.createElement('label');
        row.className = 'dard-checkbox-row';
        row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f0f0;';
        row.innerHTML = `
          <input type="checkbox" data-index="${idx}" style="margin-top:3px;flex-shrink:0;" />
          <div>
            <span class="system-tag src" style="font-size:11px;">${escapeHtml(m.system_no)}</span>
            <span style="font-weight:500;margin-left:6px;font-size:13px;">${escapeHtml(m.object_name)}</span>
            <div style="color:#555;font-size:12px;margin-top:3px;">${escapeHtml(m.description)}</div>
          </div>`;
        dardCheckboxList.appendChild(row);
      });
      dardFetchCodeBtn.disabled = true;
    }

    dardResultsModal.classList.remove('hidden');
    _updateFetchBtn();
  }

  function closeDardResultsModal() {
    dardResultsModal.classList.add('hidden');
  }

  function _updateFetchBtn() {
    const checked = dardCheckboxList.querySelectorAll('input[type=checkbox]:checked');
    const count = checked.length;
    dardFetchCodeBtn.disabled = count === 0;
    // dardRetrofitBtn.disabled  = count !== 2;
    dardRetrofitBtn.disabled  = true;
    dardFetchCodeBtn.textContent = count > 0
      ? `\uD83D\uDCE5 Fetch Code (${count} selected)`
      : '\uD83D\uDCE5 Fetch Code';
  }

  dardCheckboxList.addEventListener('change', _updateFetchBtn);

  dardSelectAllBtn.addEventListener('click', () => {
    dardCheckboxList.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
    _updateFetchBtn();
  });

  dardClearAllBtn.addEventListener('click', () => {
    dardCheckboxList.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
    _updateFetchBtn();
  });

  // Sidebar button
  document.getElementById('btn-dard').addEventListener('click', () => {
    navFeatureLabel.textContent = 'AI DARD';
    openDardSearchModal();
  });

  dardSearchCancelBtn.addEventListener('click', closeDardSearchModal);
  dardSearchModal.addEventListener('click', e => { if (e.target === dardSearchModal) closeDardSearchModal(); });

  // Submit search
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

      if (!res.ok) {
        throw new Error(data.detail || `Server error ${res.status}`);
      }

      openDardResultsModal(data.matches || []);
    } catch (err) {
      showErrorToast('AI DARD Search Error', err.message || 'Unexpected error during search.');
      openDardSearchModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      dardSearchSubmitBtn.disabled = false;
    }
  });

  // Back button returns to search modal
  dardResultsBackBtn.addEventListener('click', () => {
    closeDardResultsModal();
    openDardSearchModal();
  });

  // ---- shared fetch helper ----
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

      // Fetch Code always shows view/accordion mode.
      // Retrofit (forceCompare=true) overrides to compare mode.
      if (forceCompare) {
        data.mode = 'compare';
      } else {
        data.mode = 'view';
      }

      dardFetchResult = data;
      renderDardView(data);
    } catch (err) {
      showErrorToast('AI DARD Fetch Error', err.message || 'Unexpected error while fetching code.');
      openDardResultsModal(dardSearchResults);
    } finally {
      loadingOverlay.classList.add('hidden');
      dardFetchCodeBtn.disabled = false;
      // dardRetrofitBtn.disabled  = false;
      dardRetrofitBtn.disabled = true;

    }
  }

  // Fetch Code button — works for any selection count
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

  // Retrofit button — only valid for exactly 2; warns otherwise
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
    welcomePanel.classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openDardSearchModal();
  });

  // ----------------------------------------------------------------
  // Generate Code — two-step flow: pick system → AI generates
  // ----------------------------------------------------------------
  function _openGenerateCode(art1, art2) {
    // Reset modal to initial state
    dardGenerateSubtitle.textContent = 'Select the target system, then click Generate.';
    dardGenerateBody.innerHTML = '';
    dardGenError.style.display = 'none';
    dardGenLoading.classList.add('hidden');
    dardGenSystemWrap.style.display = '';
    dardGenSubmitBtn.disabled = false;
    dardGenSubmitBtn.style.display = '';

    // Populate system dropdown from cached dardSystems
    dardGenSystemSelect.innerHTML = '<option value="" disabled selected>&mdash; Select system &mdash;</option>';
    const allSystems = dardSystems.length > 0
      ? dardSystems
      : [...new Set([art1.system_no, art2.system_no])]; // fallback to fetched artifact systems
    allSystems.forEach(sys => {
      const opt = document.createElement('option');
      opt.value = sys;
      opt.textContent = sys;
      dardGenSystemSelect.appendChild(opt);
    });

    dardGenerateModal.classList.remove('hidden');

    // Store references for the submit handler
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

    // Transition to loading state
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
      const frag = buildAnalysisDOM(data.generated_code);
      dardGenerateBody.appendChild(frag);

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

  // Optimized Code button in the dardView header (compare mode only)
  dardOptimizeBtn.addEventListener('click', () => {
    if (!dardFetchResult) return;
    const successful = (dardFetchResult.artifacts || []).filter(a => !a.error && (a.sections || []).length > 0);
    if (successful.length !== 2) {
      showErrorToast('AI DARD', 'Need exactly 2 successfully fetched artifacts to generate code.');
      return;
    }
    _openGenerateCode(successful[0], successful[1]);
  });

  dardGenerateCloseBtn.addEventListener('click', () => {
    dardGenerateModal.classList.add('hidden');
  });
  dardGenerateModal.addEventListener('click', e => {
    if (e.target === dardGenerateModal) dardGenerateModal.classList.add('hidden');
  });

  function renderDardView(data) {
    // Hide all other views
    welcomePanel.classList.add('hidden');
    compareView.classList.add('hidden');
    document.getElementById('reviewView').classList.add('hidden');
    document.getElementById('tsView').classList.add('hidden');
    document.getElementById('chatView').classList.add('hidden');
    document.getElementById('trView').classList.add('hidden');
    reusableView.classList.add('hidden');
    impactView.classList.add('hidden');
    document.getElementById('namingConvView').classList.add('hidden');
    dardView.classList.remove('hidden');

    navFeatureLabel.textContent = 'AI DARD';
    dardViewTitle.textContent = 'AI DARD';

    const artifacts = data.artifacts || [];
    const summary = data.fetch_summary || {};

    dardViewMeta.innerHTML = [
      `<span class="system-tag src">${artifacts.length} artefact(s) selected</span>`,
      summary.successful > 0 ? `<span class="system-tag dst">&#10003; ${summary.successful} fetched OK</span>` : '',
      (summary.failed && summary.failed.length > 0) ? `<span class="system-tag" style="background:#fff3e0;color:#e65100;">&#9888; ${summary.failed.length} failed</span>` : '',
    ].join(' ');

    dardBody.innerHTML = '';

    // Show fetch failures as an info card
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
      // Switch body to flex column (no scroll) so code+AI panels fill the viewport like Retrofit
      dardBody.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;overflow:hidden;padding:14px 24px 14px;';
      // Show Optimized Code button in header
      dardOptimizeBtn.classList.remove('hidden');
      _renderDardCompare(data);
    } else {
      // Restore normal scrollable body
      dardBody.style.cssText = '';
      dardOptimizeBtn.classList.add('hidden');
      _renderDardView(artifacts);
    }
  }

  // ----------------------------------------------------------------
  // Client-side LCS diff — produces {type,content}[] arrays for
  // renderDiffTable (same format as the Retrofit backend).
  // ----------------------------------------------------------------
  function _computeDiff(lines1, lines2) {
    const L1 = lines1.slice(0, 5000);
    const L2 = lines2.slice(0, 5000);
    const m = L1.length, n = L2.length;

    // Flat Int32Array DP table
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

    // Backtrack
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

  // ----------------------------------------------------------------
  // Compare mode — Retrofit-style side-by-side diff + AI analysis
  // ----------------------------------------------------------------
  function _renderDardCompare(data) {
    const [a1, a2] = data.artifacts;

    // Flatten sections into line arrays
    const code1Lines = (a1.sections || []).flatMap(s => (s.code || '').split('\n'));
    const code2Lines = (a2.sections || []).flatMap(s => (s.code || '').split('\n'));
    const { leftLines, rightLines } = _computeDiff(code1Lines, code2Lines);

    // ── Header row ──────────────────────────────────────────────
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

    // ── Code panels (flex-driven height, synced scroll) ────────────
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

    // Render diff tables using the existing Retrofit renderDiffTable fn
    renderDiffTable(document.getElementById('dardSrcTable'), leftLines, true);
    renderDiffTable(document.getElementById('dardDstTable'), rightLines, false);

    // Sync scroll between both panels
    _syncDardScroll();

    // ── AI Difference Analysis ───────────────────────────────────
    if (data.ai_analysis) {
      const aiSection = document.createElement('div');
      aiSection.className = 'ai-block';
      aiSection.innerHTML = `
        <div class="ai-block-header">
          <span class="ai-badge">AI</span> Difference Analysis
        </div>
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
      if (syncing) return; syncing = true;
      dstBody.scrollTop = srcBody.scrollTop; syncing = false;
    });
    dstBody.addEventListener('scroll', () => {
      if (syncing) return; syncing = true;
      srcBody.scrollTop = dstBody.scrollTop; syncing = false;
    });
  }

  // ----------------------------------------------------------------
  // View mode — accordion cards with minimize / maximize toggle
  // ----------------------------------------------------------------
  function _renderDardView(artifacts) {
    artifacts.forEach(art => {
      const card = document.createElement('div');
      card.className = 'ts-section-card';
      card.style.marginBottom = '16px';

      // Title bar with toggle button on the right
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
            // Snippet header bar: artifact name + hide/show + copy
            const snippetBar = document.createElement('div');
            snippetBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#f6f8fa;border:1px solid #e0e0e0;border-left:4px solid #FFF176;border-radius:6px;padding:8px 12px;margin-top:8px;';

            const snippetLabel = document.createElement('span');
            snippetLabel.style.cssText = 'font-weight:600;font-size:12px;color:#24292e;font-family:var(--font-mono);';
            snippetLabel.textContent = art.object_name + (sec.is_main ? '' : ' — ' + sec.label);

            const snippetActions = document.createElement('div');
            snippetActions.style.cssText = 'display:flex;gap:6px;align-items:center;';

            // Copy button
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
                copyBtn.innerHTML = '&#10003; Copied!'; setTimeout(() => { copyBtn.innerHTML = '&#128203; Copy'; }, 2000);
              });
            });

            // Toggle button for this individual snippet
            const snipToggle = document.createElement('button');
            snipToggle.style.cssText = 'background:#FFF9C4;border:1px solid #f0e060;color:#1a1a1a;font-size:11px;padding:4px 12px;border-radius:20px;cursor:pointer;font-family:var(--font-ui);font-weight:700;box-shadow:0 1px 3px rgba(0,0,0,0.1);';
            snipToggle.innerHTML = '&#9658; Show';

            snippetActions.appendChild(copyBtn);
            snippetActions.appendChild(snipToggle);
            snippetBar.appendChild(snippetLabel);
            snippetBar.appendChild(snippetActions);

            // Code pre (hidden by default) — light theme with line numbers
            const pre = document.createElement('pre');
            pre.style.cssText = 'display:none;margin:0;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 6px 6px;background:#fff;color:#24292e;font-size:12px;overflow:auto;max-height:420px;white-space:pre;font-family:var(--font-mono);padding:0;line-height:1.6;';

            // Build line-numbered table like Retrofit view
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

      // Start collapsed — body hidden, toggle shows 'Show'
      // body is VISIBLE by default; only inner code blocks are hidden

      // Toggle logic
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

  // ================================================================
  // Naming Convention Assistant
  // ================================================================

  const namingConvView        = document.getElementById('namingConvView');
  const namingConvViewTitle   = document.getElementById('namingConvViewTitle');
  const namingConvViewMeta    = document.getElementById('namingConvViewMeta');
  const namingConvBody        = document.getElementById('namingConvBody');
  const namingConvNewBtn      = document.getElementById('namingConvNewBtn');

  const namingConvModal       = document.getElementById('namingConvModal');
  const namingConvSystem      = document.getElementById('namingConvSystem');
  const namingConvQuestion    = document.getElementById('namingConvQuestion');
  const namingConvError       = document.getElementById('namingConvError');
  const namingConvCancelBtn   = document.getElementById('namingConvCancelBtn');
  const namingConvSubmitBtn   = document.getElementById('namingConvSubmitBtn');

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

  document.getElementById('btn-naming-conv').addEventListener('click', () => {
    navFeatureLabel.textContent = 'Naming Convention Assistant';
    openNamingConvModal();
  });

  namingConvCancelBtn.addEventListener('click', closeNamingConvModal);
  namingConvModal.addEventListener('click', e => { if (e.target === namingConvModal) closeNamingConvModal(); });

  namingConvNewBtn.addEventListener('click', () => {
    namingConvView.classList.add('hidden');
    welcomePanel.classList.remove('hidden');
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

      renderNamingConvView(data);

    } catch (err) {
      showErrorToast('Naming Convention Error', err.message || 'Unexpected error.');
      openNamingConvModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      namingConvSubmitBtn.disabled = false;
    }
  });

  function renderNamingConvView(data) {
    // Hide all other views
    welcomePanel.classList.add('hidden');
    compareView.classList.add('hidden');
    document.getElementById('reviewView').classList.add('hidden');
    document.getElementById('tsView').classList.add('hidden');
    document.getElementById('chatView').classList.add('hidden');
    document.getElementById('trView').classList.add('hidden');
    reusableView.classList.add('hidden');
    impactView.classList.add('hidden');
    document.getElementById('dardView').classList.add('hidden');
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

    // Question card
    const qCard = document.createElement('div');
    qCard.className = 'ts-section-card';
    qCard.style.marginBottom = '16px';
    qCard.innerHTML = `
      <div class="ts-section-title" style="background:#1a1a2e;">&#10067; Your Question</div>
      <div class="ts-section-content" style="font-style:italic;color:#444;">"${escapeHtml(data.question)}"</div>`;
    namingConvBody.appendChild(qCard);

    // Answer card
    const aCard = document.createElement('div');
    aCard.className = 'ts-section-card';
    aCard.innerHTML = `
      <div class="ts-section-title" style="background:#1b5e20;">&#128271; AI Answer</div>
      <div class="ts-section-content" id="namingConvAnswerBody"></div>`;
    namingConvBody.appendChild(aCard);
    document.getElementById('namingConvAnswerBody').innerHTML = renderMarkdown(data.answer || 'No answer available.');
  }

})();
