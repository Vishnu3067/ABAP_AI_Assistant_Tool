/**
 * main.js — Application entry point
 * Imports all feature modules, wires sidebar, keyboard handler.
 */
import { initRetrofit }        from './features/retrofit.js';
import { initCodeReview }      from './features/code_review.js';
import { initTrSequencing }    from './features/tr_sequencing.js';
import { initTsFinalization }  from './features/ts_finalization.js';
import { initAnalysis }        from './features/analysis.js';
import { initReusable }        from './features/reusable.js';
import { initImpact }          from './features/impact.js';
import { initDard }            from './features/dard.js';
import { initNamingConv }      from './features/naming_conv.js';
import { initTsCreation }      from './features/ts_creation.js';

const {
  validSystems,
  artifactTypes,
  codeReviewArtifactTypes,
  trValidSystems,
  analysisArtifactTypes,
  impactArtifactTypes,
} = window.APP_CONFIG;

const systemDescriptions = {
  D59: 'D59 — Development',
  K59: 'K59 — US Dev System',
  S59: 'S59 — Sandbox',
  L59: 'L59 — Business',
  A59: 'A59 — Quality System',
  P59: 'P59 — Production',
};

const loadingOverlay  = document.getElementById('loadingOverlay');
const navFeatureLabel = document.getElementById('navFeatureLabel');
const welcomePanel    = document.getElementById('welcomePanel');

// ── Shared config object (features add modal close handlers into it) ────────
const cfg = {
  loadingOverlay,
  navFeatureLabel,
  validSystems,
  artifactTypes,
  codeReviewArtifactTypes,
  trValidSystems,
  analysisArtifactTypes,
  impactArtifactTypes,
  systemDescriptions,
};

// ── Initialise all features ────────────────────────────────────────────────
initRetrofit(cfg);       // also stores cfg._renderDiffTable + cfg._syncCodeBlockScroll
initCodeReview(cfg);
initTrSequencing(cfg);
initTsFinalization(cfg);
initAnalysis(cfg);
initReusable(cfg);
initImpact(cfg);
initDard(cfg);           // uses cfg._renderDiffTable set by initRetrofit
initNamingConv(cfg);
initTsCreation(cfg);

// ── Sidebar hover-only (no persistent active state needed) ─────────────────
document.querySelectorAll('.sidebar-btn:not(.disabled)').forEach(btn => {
  btn.addEventListener('click', () => { /* hover-only, no active state */ });
});

// ── Escape closes any open modal ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // Close modals by checking if they are visible
  [
    'retrofitModal', 'reviewModal', 'trModal', 'tsModal',
    'analysisModal', 'reusableModal', 'impactModal',
    'dardSearchModal', 'dardResultsModal', 'dardGenerateModal',
    'namingConvModal', 'tsCreationModal', 'tsRegenModal',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      el.classList.add('hidden');
    }
  });
});
