// Runs before the page paints so the saved theme shows without a flash.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* storage blocked: follow the system setting */ }
})();
