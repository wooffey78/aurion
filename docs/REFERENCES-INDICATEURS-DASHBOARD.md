# Référentiel des indicateurs du dashboard (prompt 12 — bloc 19 §11)

Chaque indicateur porte sa définition, sa formule, sa période, sa source de vérité et son
rachat d'actualisation. Le dashboard est une PROJECTION : aucun calcul parallèle, aucun montant
inventé. Le même montant est identique au module source et au dashboard.

| Indicateur | Endpoint | Définition / formule | Période | Source de vérité | Actualisation |
|---|---|---|---|---|---|
| Tickets ouverts | `/dashboard/summary` (`tickets`) | Nombre de tickets support dont le statut n'est pas `resolved`/`duplicate`/`closed` | instantané | `support_tickets` | à chaque chargement + throttle 30 s |
| Factures en attente | `unpaidCount` / `unpaidTotal` | Factures non payées, non annulées ; total = Σ max(0, TTC − payé) | instantané | `quotes` (document_type=invoice) | idem |
| Relance urgente | `fourthReminderCount` | Factures non payées à 3 relances déjà envoyées | instantané | `quotes.reminder_count` | idem |
| Rendez-vous à venir | `upcomingAppointments` | RDV futurs non annulés (total, pas d'échantillon) | instantané | `appointments` | idem |
| Devis ouverts (potentiel) | `forecast` via `documentForecastEntries` | Devis actifs TTC (annulés/refusés exclus) + SAV financiers | instantané | `quotes`, `sav_cases` | idem |
| Prévision d'activité | `forecast.months3/months6/year` | Moyenne HT historique des encaissements + devis ouverts HT + SAV HT ; méthode affichée dans `forecast.method` | fenêtre configurable (6 mois par défaut) | `invoice_payments` + `quotes` | à chaque chargement |
| Encaissements HT du mois | `/accounting/summary` (`months[].revenue`) | Comptabilité de trésorerie : base HT d'abord, majorations ensuite, par mois d'encaissement | mois/exercice | `invoice_payments` + `quotes` (moteur `monthlyAccounting`) | throttle 30 s |
| TVA encaissée / déductible | idem (`vat`, `purchaseVat`) | Part de TVA des encaissements et des coûts, prorata du réglé | mois/exercice | idem + `expense_reports` | idem |
| Achats / dépenses | idem (`purchases`, `expenseReports`) | Écritures d'achat + SAV + notes de frais HT du mois ; les écritures annulées (`voided_at`) sont exclues | mois/exercice | `accounting_entries`, `expense_reports` | idem |
| Trésorerie (potentiel/engagé/sorties) | `/treasury/summary` | POTENTIEL = devis ouverts TTC ; ENGAGÉ = reste dû des factures (TTC + majorations − payé) ; SORTIES = coûts des documents ouverts + notes de frais à rembourser | instantané | `quotes`, `invoice_reminders`, `expense_reports` | idem |
| Stocks sous seuil | `lowStockCount` | Articles dont DISPONIBLE (physique − réservations actives) < seuil | instantané | `parts`, `part_reservations` | idem |
| Tâches ouvertes | `tasksOpenCount` | Tâches au statut `todo` | instantané | `tasks` | idem |
| Demandes comptable ouvertes | `accountantOpenRequests` | Demandes d'état `open` ou `answered` | instantané | `accountant_requests` | idem |
| Alertes et erreurs de synchronisation | journal de bord (`/journal/events`) | Événements persistants non résolus (seuils stock, configuration, cloud, URSSAF) ; l'état hors connexion est signalé en UI (`data-freshness`, pill dédiée) | instantané | `dashboard_journal_events` | à chaque chargement |

Règles transversales : distinction réel/prévisionnel explicite en UI (« scénario indicatif ») ;
aucun indicateur sans formule documentée ici ; toute carte actionnable ouvre le contexte source ;
les replis hors connexion conservent la dernière donnée valide datée et le marquent.
