/**
 * shared/utils.js — Shared rendering utilities
 * Exports: escapeHtml, renderMarkdown, renderMarkdownText,
 *          renderBodyContent, buildAnalysisDOM, createCodeBlock
 */

export function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMarkdown(text) {
  if (!text) return '<p style="color:#888;font-style:italic;">No analysis available.</p>';

  let html = escapeHtml(text);

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

  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h2>)/g, '$1');
  html = html.replace(/<\/h2><\/p>/g, '</h2>');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/<\/ul><\/p>/g, '</ul>');
  html = html.replace(/<p>(<table)/g, '$1');
  html = html.replace(/<\/table><\/p>/g, '</table>');

  return html;
}

export function renderMarkdownText(text) {
  let html = escapeHtml(text);

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

export function createCodeBlock(code) {
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

export function renderBodyContent(el, text) {
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

export function buildAnalysisDOM(text) {
  const fragment = document.createDocumentFragment();
  if (!text) {
    const p = document.createElement('p');
    p.textContent = 'No analysis available.';
    fragment.appendChild(p);
    return fragment;
  }

  const rawSections = text.split(/(?=^## )/m);

  rawSections.forEach(section => {
    const trimmed = section.trim();
    if (!trimmed) return;

    const lines = trimmed.split('\n');
    const heading = lines[0].replace(/^## /, '').trim();
    const rest = lines.slice(1).join('\n').trim();

    const card = document.createElement('div');
    card.className = 'review-card';

    const titleRow = document.createElement('div');
    titleRow.className = 'review-card-title';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = heading;
    titleRow.appendChild(titleSpan);

    const statusMatch = rest.match(/^Status:\s*(PASS|FAIL)/im);
    if (statusMatch) {
      const badge = document.createElement('span');
      const isPass = statusMatch[1].toUpperCase() === 'PASS';
      badge.className = isPass ? 'status-badge pass' : 'status-badge fail';
      badge.textContent = isPass ? '\u2705 PASS' : '\u274C FAIL';
      titleRow.appendChild(badge);
    }

    card.appendChild(titleRow);

    const bodyText = rest.replace(/^Status:\s*(PASS|FAIL)\n?/im, '').trim();
    const bodyEl = document.createElement('div');
    bodyEl.className = 'review-card-body';
    renderBodyContent(bodyEl, bodyText);
    card.appendChild(bodyEl);

    fragment.appendChild(card);
  });

  return fragment;
}
