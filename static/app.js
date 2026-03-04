/* ============================================================
   ABAP AI Assistant Tool — Frontend Logic
   ============================================================ */

(function () {
  'use strict';

  const { validSystems, artifactTypes, codeReviewArtifactTypes, trValidSystems, analysisArtifactTypes } = window.APP_CONFIG;

  // ----------------------------------------------------------------
  // DOM references
  // ----------------------------------------------------------------
  const navFeatureLabel   = document.getElementById('navFeatureLabel');
  const welcomePanel      = document.getElementById('welcomePanel');
  const compareView       = document.getElementById('compareView');
  const loadingOverlay    = document.getElementById('loadingOverlay');

  // Sidebar
  const btnRetrofit       = document.getElementById('btn-retrofit');
  const btnCodeReview     = document.getElementById('btn-code-review');
  const btnTrSequencing   = document.getElementById('btn-tr-sequencing');
  const btnTs             = document.getElementById('btn-ts');
  const btnAnalysis       = document.getElementById('btn-analysis');
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
    K59: 'K59 — Quality',
    S59: 'S59 — Sandbox',
    L59: 'L59 — Business',
    A59: 'A59 — Pre-production',
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
    // For Transaction(TCode) the artifact name IS the TCode, so hide the optional TCode field
    if (type === 'Transaction (TCode)') {
      analysisTcodeGroup.classList.add('hidden');
      analysisTcodeEl.value = '';
    } else {
      analysisTcodeGroup.classList.remove('hidden');
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

  // Close on backdrop click
  retrofitModal.addEventListener('click', (e) => {
    if (e.target === retrofitModal) closeRetrofitModal();
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
    const codeBlockRegex = /```(?:abap)?\n?([\s\S]*?)```/g;
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
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/<\/ul><\/p>/g, '</ul>');
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
      // Re-open modal with error
      openRetrofitModal();
      showError(err.message || 'Unexpected error. Please try again.');
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

    // Render diff tables
    renderDiffTable(srcDiffTable, data.left_lines, true);
    renderDiffTable(dstDiffTable, data.right_lines, false);

    // Sync scroll between the two code blocks
    syncCodeBlockScroll();

    // Render AI analysis
    aiAnalysisBody.innerHTML = renderMarkdown(data.ai_analysis);

    // Show compare view, hide welcome
    welcomePanel.classList.add('hidden');
    reviewView.classList.add('hidden');
    trView.classList.add('hidden');
    tsView.classList.add('hidden');
    chatView.classList.add('hidden');
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

    return html;
  }

  function escapeHtml(str) {
    return str
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

    try {
      const res = await fetch('/api/chat-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        // Show the context card so viewers understand what was sent to AI
        addContextCard(chatState, data.source_code);
        replyText = data.reply;
      }

      typingEl.remove();
      chatState.messages.push({ role: 'assistant', content: replyText });
      addChatMessage('ai', replyText);

    } catch (err) {
      typingEl.remove();
      const errMsg = `\u26a0\ufe0f **Connection error:** ${err.message || 'Unexpected error'}`;
      chatState.messages.push({ role: 'assistant', content: errMsg });
      addChatMessage('ai', errMsg);
    } finally {
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

    try {
      const res = await fetch('/api/chat-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      chatState.messages.push({ role: 'assistant', content: data.reply });
      addChatMessage('ai', data.reply);
    } catch (err) {
      typingEl.remove();
      addChatMessage('ai', `\u26a0\ufe0f Error: ${err.message || 'Unexpected error'}`);
    } finally {
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

})();
