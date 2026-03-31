/**
 * shared/toast.js — Global error toast
 * Exports: showErrorToast, hideErrorToast
 */

const errorToast        = document.getElementById('errorToast');
const errorToastTitle   = document.getElementById('errorToastTitle');
const errorToastMessage = document.getElementById('errorToastMessage');
const errorToastClose   = document.getElementById('errorToastClose');
let   errorToastTimer   = null;

export function showErrorToast(title, message) {
  errorToastTitle.textContent   = title;
  errorToastMessage.textContent = message;
  errorToast.classList.remove('hidden');
  clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(hideErrorToast, 12000);
}

export function hideErrorToast() {
  errorToast.classList.add('hidden');
  clearTimeout(errorToastTimer);
}

errorToastClose.addEventListener('click', hideErrorToast);
