/**
 * features/analysis.js — Analysis / Summarization Chat feature
 */
import { escapeHtml, renderBodyContent } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initAnalysis(cfg) {
  const { loadingOverlay, navFeatureLabel, analysisArtifactTypes, validSystems, systemDescriptions } = cfg;

  // Modal elements
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

  // Chat view elements
  const chatView          = document.getElementById('chatView');
  const chatArtifactTitle = document.getElementById('chatArtifactTitle');
  const chatArtifactMeta  = document.getElementById('chatArtifactMeta');
  const chatMessages      = document.getElementById('chatMessages');
  const chatInput         = document.getElementById('chatInput');
  const chatSendBtn       = document.getElementById('chatSendBtn');
  const chatNewBtn        = document.getElementById('chatNewBtn');

  // Populate dropdowns
  analysisArtifactTypes.forEach(t => analysisArtifactTypeEl.appendChild(new Option(t, t)));
  validSystems.forEach(s => analysisSystemEl.appendChild(new Option(systemDescriptions[s] || s, s)));

  analysisArtifactTypeEl.addEventListener('change', () => {
    const type = analysisArtifactTypeEl.value;
    if (type === 'Function Module') {
      analysisFgGroup.classList.remove('hidden');
    } else {
      analysisFgGroup.classList.add('hidden');
      analysisFunctionGroupEl.value = '';
    }
    if (type === 'Transaction (TCode)') {
      analysisTcodeGroup.classList.remove('hidden');
    } else {
      analysisTcodeGroup.classList.add('hidden');
      analysisTcodeEl.value = '';
    }
  });

  // Chat state
  let chatState = {
    artifactName: '', artifactType: '', functionGroup: null,
    system: '', tcode: null, sourceCode: null, messages: [],
  };

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
  analysisModal.addEventListener('click', e => { if (e.target === analysisModal) closeAnalysisModal(); });

  document.getElementById('btn-analysis').addEventListener('click', () => {
    navFeatureLabel.textContent = 'Analysis / Summarization';
    openAnalysisModal();
  });

  chatNewBtn.addEventListener('click', () => {
    hideAllViews();
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openAnalysisModal();
  });

  analysisSubmitBtn.addEventListener('click', async () => {
    analysisError.style.display = 'none';

    const artifactName  = analysisArtifactNameEl.value.trim();
    const artifactType  = analysisArtifactTypeEl.value;
    const functionGroup = analysisFunctionGroupEl.value.trim();
    const tcode         = analysisTcodeEl.value.trim();
    const system        = analysisSystemEl.value;
    const question      = analysisQuestionEl.value.trim();

    const showErr = msg => { analysisError.textContent = msg; analysisError.style.display = 'block'; };

    if (!artifactName) return showErr('Please enter the artifact name.');
    if (!artifactType) return showErr('Please select an artifact type.');
    if (artifactType === 'Function Module' && !functionGroup) return showErr('Please enter the function group.');
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
    _openChatViewEmpty();
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

  function _openChatViewEmpty() {
    navFeatureLabel.textContent = 'Analysis / Summarization';
    chatArtifactTitle.textContent = `${chatState.artifactType}: ${chatState.artifactName}`;
    chatArtifactMeta.innerHTML = `
      <span class="meta-badge src">${chatState.system}</span>
      ${chatState.tcode ? `<span class="meta-badge" style="background:#e8f0fe;color:#1a5276;">TCode: ${escapeHtml(chatState.tcode)}</span>` : ''}
      <span class="meta-badge" style="background:#f0f4e8;color:#2d6a1f;">&#128202; Analysis</span>
    `;
    chatMessages.innerHTML = '';
    hideAllViews();
    chatView.classList.remove('hidden');
  }

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

  function addContextCard(state, sourceCode) {
    const lines = (sourceCode || '').split('\n');
    const lineCount = lines.length;
    const charCount = (sourceCode || '').length;
    const preview = lines.slice(0, 12).join('\n');
    const hasMore = lineCount > 12;

    const card = document.createElement('div');
    card.className = 'ctx-card';

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

    const header = card.querySelector('.ctx-header');
    const body   = card.querySelector('.ctx-body');
    const chev   = card.querySelector('.ctx-chevron');
    body.classList.add('collapsed');
    chev.textContent = '\u25B6';
    header.addEventListener('click', () => {
      const isOpen = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', isOpen);
      chev.textContent = isOpen ? '\u25B6' : '\u25BC';
    });

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
      <div class="fetched-header">
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

    const header = badge.querySelector('.fetched-header');
    const body   = badge.querySelector('.fetched-body');
    const chev   = badge.querySelector('.fetched-chevron');
    header.addEventListener('click', () => {
      const open = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', open);
      chev.innerHTML = open ? '&#9654;' : '&#9660;';
    });

    chatMessages.appendChild(badge);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

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
      if (data.fetched_artifacts && data.fetched_artifacts.length > 0) addFetchedBadge(data.fetched_artifacts);
      chatState.messages.push({ role: 'assistant', content: data.reply });
      addChatMessage('ai', data.reply);
    } catch (err) {
      typingEl.remove();
      const msg = err.name === 'AbortError'
        ? '\u26a0\ufe0f **Request timed out.** Please try again.'
        : `\u26a0\ufe0f Error: ${err.message || 'Unexpected error'}`;
      addChatMessage('ai', msg);
    } finally {
      clearTimeout(followupTimeout);
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  }

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
  chatSendBtn.addEventListener('click', sendChatMessage);

  cfg._openAnalysisModal  = openAnalysisModal;
  cfg._closeAnalysisModal = closeAnalysisModal;
}
