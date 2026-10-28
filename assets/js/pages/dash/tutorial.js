const STEPS = [
  {
    title: "Votre espace de travail",
    description: "Aurion organise les informations selon votre entreprise et l’activité active. Le tableau de bord résume les informations importantes et les actions à surveiller.",
    tip: "Si vous gérez plusieurs activités, vérifiez toujours l’activité sélectionnée avant de créer ou modifier un élément."
  },
  {
    title: "Clients et relations",
    description: "La section Clients rassemble les fiches et les coordonnées utiles. Une fiche client peut servir de point de départ à un devis et retrouver les documents qui lui sont associés.",
    tip: "Commencez par vérifier les informations proposées automatiquement ; vous gardez la possibilité de les corriger."
  },
  {
    title: "Catalogue et fournisseurs",
    description: "Le Catalogue métier contient les pièces, fournitures, prestations et références pertinentes pour votre activité. Les Fournisseurs permettent de conserver les prix d’achat associés.",
    tip: "Le catalogue est configurable : une entreprise de services n’a pas besoin d’activer toutes les fonctions orientées pièces ou stock."
  },
  {
    title: "Devis, factures et paiements",
    description: "Cette section permet de créer et modifier les documents commerciaux, préparer leur rendu, les envoyer selon la configuration et suivre leurs statuts, règlements et relances.",
    tip: "Avant un envoi ou un règlement, contrôlez les montants, les informations du client et le statut affiché."
  },
  {
    title: "Agenda et temps",
    description: "L’Agenda rassemble les rendez-vous et leurs liens métier. Les outils de suivi du temps peuvent aider à comparer le temps réellement passé avec l’estimation manuelle.",
    tip: "Les synchronisations externes, notamment la messagerie ou le calendrier, dépendent de leur configuration."
  },
  {
    title: "Comptabilité et trésorerie",
    description: "Les vues comptables et de trésorerie aident à suivre les encaissements, dépenses enregistrées, soldes et prévisions disponibles dans Aurion.",
    tip: "Une prévision reste une estimation et ne vaut pas confirmation d’un paiement, d’une déclaration ou d’une écriture officielle."
  },
  {
    title: "Paramètres, compte et aide",
    description: "Les Paramètres servent à configurer les activités, les règles et les intégrations. Compte & sécurité permet de gérer le mot de passe, les clés d’accès compatibles et l’export des données.",
    tip: "Vous pourrez rouvrir cette visite depuis le tableau de bord. Pour les actions importantes, Aurion prépare ou présente l’opération ; vérifiez toujours son résultat."
  }
];

export function openAurionTutorial() {
  if (document.getElementById("aurion-guided-tour")) return;
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const root = document.createElement("div");
  root.id = "aurion-guided-tour";
  root.className = "modal-backdrop aurion-tour-backdrop";
  root.innerHTML = `
    <section class="modal glass aurion-tour-dialog" role="dialog" aria-modal="true" aria-labelledby="aurion-tour-title" aria-describedby="aurion-tour-copy" tabindex="-1">
      <div class="section-title">
        <div><span class="eyebrow">VISITE GUIDÉE</span><h2 id="aurion-tour-title">Découvrir Aurion</h2></div>
        <button type="button" class="icon-btn" id="aurion-tour-close" aria-label="Fermer la visite guidée">×</button>
      </div>
      <div class="aurion-tour-progress">
        <span id="aurion-tour-step-label" class="aurion-tour-progress-label" role="status" aria-live="polite"></span>
        <div class="aurion-tour-track" id="aurion-tour-track" role="progressbar" aria-label="Progression du tutoriel" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="1"><span class="aurion-tour-fill"></span></div>
      </div>
      <article class="aurion-tour-content" id="aurion-tour-copy"></article>
      <div class="aurion-tour-footer">
        <button type="button" class="btn secondary" id="aurion-tour-skip">Passer le tutoriel</button>
        <div class="button-row">
          <button type="button" class="btn secondary" id="aurion-tour-previous">Précédent</button>
          <button type="button" class="btn primary" id="aurion-tour-next">Suivant</button>
        </div>
      </div>
    </section>`;
  document.body.append(root);
  const dialog = root.querySelector(".aurion-tour-dialog");
  const label = root.querySelector("#aurion-tour-step-label");
  const track = root.querySelector("#aurion-tour-track");
  const fill = root.querySelector(".aurion-tour-fill");
  const content = root.querySelector("#aurion-tour-copy");
  const previous = root.querySelector("#aurion-tour-previous");
  const next = root.querySelector("#aurion-tour-next");
  const skip = root.querySelector("#aurion-tour-skip");
  let current = 0;

  const close = (completed = false) => {
    if (completed) {
      try { localStorage.setItem("aurion.tutorial.completed.v1", "true"); } catch { /* Stockage local facultatif. */ }
    }
    root.remove();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  };
  const showStep = (focusHeading = true) => {
    const step = STEPS[current];
    label.textContent = `Étape ${current + 1} sur ${STEPS.length}`;
    track.setAttribute("aria-valuenow", String(current + 1));
    fill.style.width = `${((current + 1) / STEPS.length) * 100}%`;
    const heading = document.createElement("h3");
    heading.tabIndex = -1;
    heading.textContent = step.title;
    const description = document.createElement("p");
    description.textContent = step.description;
    const tip = document.createElement("p");
    tip.className = "aurion-tour-tip";
    tip.textContent = step.tip;
    content.replaceChildren(heading, description, tip);
    previous.disabled = current === 0;
    next.textContent = current === STEPS.length - 1 ? "Terminer" : "Suivant";
    skip.textContent = current === STEPS.length - 1 ? "Fermer" : "Passer le tutoriel";
    if (focusHeading) heading.focus({ preventScroll: true });
  };

  const closeButton = root.querySelector("#aurion-tour-close");
  closeButton.addEventListener("click", () => close());
  skip.addEventListener("click", () => close());
  previous.addEventListener("click", () => { if (current > 0) { current -= 1; showStep(); } });
  next.addEventListener("click", () => {
    if (current < STEPS.length - 1) { current += 1; showStep(); }
    else close(true);
  });
  root.addEventListener("click", event => { if (event.target === root) close(); });
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => element.getClientRects().length > 0);
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (document.activeElement === dialog || document.activeElement === content.querySelector("h3")) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  showStep(false);
  closeButton.focus({ preventScroll: true });
}
