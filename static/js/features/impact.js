/**
 * features/impact.js — Impact Analysis (Where-used) feature
 */
import { escapeHtml, buildAnalysisDOM } from '../shared/utils.js';
import { showErrorToast } from '../shared/toast.js';
import { hideAllViews } from '../shared/nav.js';

export function initImpact(cfg) {
  const { loadingOverlay, navFeatureLabel, impactArtifactTypes, validSystems, systemDescriptions } = cfg;

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

  const impactView      = document.getElementById('impactView');
  const impactViewTitle = document.getElementById('impactViewTitle');
  const impactViewMeta  = document.getElementById('impactViewMeta');
  const impactBody      = document.getElementById('impactBody');
  const impactNewBtn    = document.getElementById('impactNewBtn');

  // Populate dropdowns
  (impactArtifactTypes || []).forEach(t => impactArtifactTypeEl.appendChild(new Option(t, t)));
  validSystems.forEach(s => impactSystemEl.appendChild(new Option(systemDescriptions[s] || s, s)));

  impactArtifactTypeEl.addEventListener('change', () => {
    if (impactArtifactTypeEl.value === 'Function Module') {
      impactFgGroup.classList.remove('hidden');
    } else {
      impactFgGroup.classList.add('hidden');
      impactFunctionGroupEl.value = '';
    }
  });

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
  impactModal.addEventListener('click', e => { if (e.target === impactModal) closeImpactModal(); });

  document.getElementById('btn-impact').addEventListener('click', () => {
    navFeatureLabel.textContent = 'Impact Analysis';
    openImpactModal();
  });

  impactNewBtn.addEventListener('click', () => {
    hideAllViews();
    document.getElementById('welcomePanel').classList.remove('hidden');
    navFeatureLabel.textContent = '';
    openImpactModal();
  });

  impactSubmitBtn.addEventListener('click', async () => {
    const artifactName  = impactArtifactNameEl.value.trim();
    const artifactType  = impactArtifactTypeEl.value;
    const functionGroup = impactFunctionGroupEl.value.trim() || null;
    const system        = impactSystemEl.value;
    const plannedChange = impactPlannedChangeEl.value.trim();

    if (!artifactName)  { impactError.textContent = 'Please enter the artifact name.';    impactError.style.display = 'block'; return; }
    if (!artifactType)  { impactError.textContent = 'Please select an artifact type.';    impactError.style.display = 'block'; return; }
    if (!system)        { impactError.textContent = 'Please select a system.';             impactError.style.display = 'block'; return; }
    if (!plannedChange) { impactError.textContent = 'Please describe your planned change.'; impactError.style.display = 'block'; return; }
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

      hideAllViews();
      impactView.classList.remove('hidden');

      navFeatureLabel.textContent = 'Impact Analysis';
      impactViewTitle.textContent = `Impact: ${data.artifact_name}`;

      const wuCountStyle = data.where_used_count === 0
        ? 'background:#e8f5e9;color:#2e7d32;' : 'background:#fff3e0;color:#e65100;';
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

      impactBody.innerHTML = '';

      const changeCard = document.createElement('div');
      changeCard.className = 'ts-section-card';
      changeCard.style.marginBottom = '16px';
      changeCard.innerHTML = `
        <div class="ts-section-title" style="background:#1a1a2e;">&#9998; Planned Change</div>
        <div class="ts-section-content" style="font-style:italic;color:#444;">"${escapeHtml(data.planned_change)}"</div>`;
      impactBody.appendChild(changeCard);

      if (data.where_used_count === 0) {
        const noImpactCard = document.createElement('div');
        noImpactCard.className = 'ts-section-card';
        noImpactCard.innerHTML = `
          <div class="ts-section-title" style="background:#1b5e20;">&#10003; No Impact Found &mdash; Safe to Proceed</div>
          <div class="ts-section-content">
            <p style="margin:0 0 10px 0;">No where-used entries found for <strong>${escapeHtml(data.artifact_name)}</strong> in S59.</p>
            <p style="margin:0 0 10px 0;">Your planned change has <strong>zero impact</strong> on other objects &mdash; you can proceed safely.</p>
            <p style="margin:0;padding:8px 10px;background:#f1f8e9;border-left:3px solid #558b2f;border-radius:4px;font-size:12px;color:#33691e;">
              &#8505; The where-used catalog is maintained on <strong>S59</strong>.
            </p>
          </div>`;
        impactBody.appendChild(noImpactCard);
        return;
      }

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
            <span class="fetched-title">AI fetched source of ${data.deep_fetched.length} dependent object(s)</span>
          </div>
          <div class="fetched-body" style="display:block">
            <table class="fetched-table">
              <thead><tr><th></th><th>Type</th><th>Name</th><th>Status</th></tr></thead>
              <tbody>${fetchRows}</tbody>
            </table>
          </div>`;
        impactBody.appendChild(badge);
      }

      impactBody.appendChild(buildAnalysisDOM(data.reply));

    } catch (err) {
      showErrorToast('Impact Analysis Error', err.message || 'An unexpected error occurred.');
      openImpactModal();
    } finally {
      loadingOverlay.classList.add('hidden');
      document.getElementById('loadingText').textContent = 'Fetching artifact & running AI analysis\u2026';
      impactSubmitBtn.disabled = false;
    }
  });
}
