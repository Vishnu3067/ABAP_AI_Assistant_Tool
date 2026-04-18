/**
 * shared/nav.js — View management helpers
 * Exports: showView, hideAllViews
 */

const ALL_VIEW_IDS = [
  'compareView', 'reviewView', 'trView', 'tsView', 'chatView',
  'reusableView', 'impactView', 'dardView', 'namingConvView', 'tsCreationView',
];

export function hideAllViews() {
  document.getElementById('welcomePanel').classList.add('hidden');
  ALL_VIEW_IDS.forEach(id => document.getElementById(id)?.classList.add('hidden'));
}

export function showView(id) {
  hideAllViews();
  document.getElementById(id)?.classList.remove('hidden');
}
