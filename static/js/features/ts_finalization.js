/**
 * features/ts_finalization.js — TS Finalization Tool feature
 */
import { escapeHtml } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initTsFinalization(cfg) {
  const { loadingOverlay, navFeatureLabel, codeReviewArtifactTypes, validSystems, systemDescriptions } = cfg;

  const tsModal           = document.getElementById('tsModal');
  const tsArtifactNameEl  = document.getElementById('tsArtifactName');
  const tsArtifactTypeEl  = document.getElementById('tsArtifactType');
  const tsFgGroup         = document.getElementById('tsFgGroup');
  const tsFunctionGroupEl = document.getElementById('tsFunctionGroup');
  const tsSystemEl        = document.getElementById('tsSystem');
  const tsError           = document.getElementById('tsError');
  const tsSubmitBtn       = document.getElementById('tsSubmitBtn');
  const tsCancelBtn       = document.getElementById('tsCancelBtn');

  const tsView       = document.getElementById('tsView');
  const tsViewTitle  = document.getElementById('tsViewTitle');
  const tsViewMeta   = document.getElementById('tsViewMeta');
  const tsBody       = document.getElementById('tsBody');
  const tsNewBtn     = document.getElementById('tsNewBtn');
  const tsCopyAllBtn = document.getElementById('tsCopyAllBtn');

  // Populate dropdowns
  codeReviewArtifactTypes.forEach(t => tsArtifactTypeEl.appendChild(new Option(t, t)));
  validSystems.forEach(s => tsSystemEl.appendChild(new Option(systemDescriptions[s] || s, s)));

  tsArtifactTypeEl.addEventListener('change', () => {
    if (tsArtifactTypeEl.value === 'Function Module') {
      tsFgGroup.classList.remove('hidden');
    } else {
      tsFgGroup.classList.add('hidden');
      tsFunctionGroupEl.value = '';
    }
  });

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
  tsModal.addEventListener('click', e => { if (e.target === tsModal) closeTsModal(); });

  document.getElementById('btn-ts').addEventListener('click', () => {
    navFeatureLabel.textContent = 'TS Finalization Tool';
    openTsModal();
  });

  tsNewBtn.addEventListener('click', () => {
    hideAllViews();
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openTsModal();
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

  tsSubmitBtn.addEventListener('click', async () => {
    tsError.style.display = 'none';

    const artifactName  = tsArtifactNameEl.value.trim();
    const artifactType  = tsArtifactTypeEl.value;
    const functionGroup = tsFunctionGroupEl.value.trim();
    const system        = tsSystemEl.value;

    const showTsError = msg => { tsError.textContent = msg; tsError.style.display = 'block'; };

    if (!artifactName) return showTsError('Please enter the artifact name.');
    if (!artifactType) return showTsError('Please select an artifact type.');
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
          system,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      _renderTsView(data);

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

  function _renderTsView(data) {
    navFeatureLabel.textContent = 'TS Finalization Tool';
    tsViewTitle.textContent = `TS: ${data.artifact_name}`;
    tsViewMeta.innerHTML = `
      <span class="meta-badge src">${data.system}</span>
      <span class="meta-badge" style="background:#eaf2ff;color:#1a4a8a;">${data.artifact_type}</span>
    `;

    tsBody.innerHTML = '';
    tsBody.appendChild(_buildTsDom(data.ts_content));

    hideAllViews();
    tsView.classList.remove('hidden');
  }

  function _buildTsDom(text) {
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
          setTimeout(() => { copyBtn.innerHTML = '&#128203; Copy'; copyBtn.classList.remove('copied'); }, 2000);
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = plainText;
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          copyBtn.innerHTML = '&#10003; Copied!';
          setTimeout(() => { copyBtn.innerHTML = '&#128203; Copy'; }, 2000);
        });
      });

      cardHeader.appendChild(titleEl);
      cardHeader.appendChild(copyBtn);
      card.appendChild(cardHeader);

      const contentEl = document.createElement('div');
      contentEl.className = 'ts-section-content';
      contentEl.innerHTML = _renderTsBody(body);
      card.appendChild(contentEl);

      frag.appendChild(card);
    });

    return frag;
  }

  function _renderTsBody(text) {
    if (!text) return '';

    const lines   = text.split('\n');
    const output  = [];
    let inTable   = false;
    let tableRows = [];

    const flushTable = () => {
      if (!tableRows.length) return;
      let html = '<table class="ts-md-table">';
      tableRows.forEach((row, idx) => {
        const cells = row.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
        if (idx === 1 && cells.every(c => /^[-: ]+$/.test(c))) return;
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

    return output.join('\n').replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  }

  cfg._openTsModal  = openTsModal;
  cfg._closeTsModal = closeTsModal;
}
