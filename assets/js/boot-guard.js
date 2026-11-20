(() => {
  const timeout = window.setTimeout(() => {
    if (window.__aurionBooted || document.querySelector('#aurion-boot-failure')) return;
    const app = document.querySelector('#app');
    if (!app) return;
    app.innerHTML = '<main id="main" class="center"><section class="glass"><h1>Aurion n’a pas pu démarrer</h1><p>Le code de l’application ne s’est pas chargé correctement. Vérifiez votre connexion, puis rechargez la page.</p><button id="aurion-boot-retry" class="btn primary" type="button">Recharger Aurion <span>↻</span></button></section></main>';
    document.querySelector('#aurion-boot-retry')?.addEventListener('click', () => window.location.reload());
  }, 10000);
  window.addEventListener('pagehide', () => window.clearTimeout(timeout), { once: true });
})();
