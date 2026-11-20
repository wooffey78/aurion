import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
test("le journal de bord reste une fonctionnalité générale hors de l’ancien parcours", () => {
 const route=read("../src/routes/dashboard-journal.ts"), app=read("../src/app.ts"), home=read("../../assets/js/pages/dash/other.js"), api=read("../../assets/js/core/api.js");
 assert.ok(route.includes("app.get(\'/journal/events\'")); assert.ok(route.includes("app.patch(\'/journal/events/:id\'"));
 assert.ok(route.includes("dashboard_journal_events")); assert.ok(app.includes("dashboardJournalRoutes"));
 assert.ok(home.includes("api.updateJournalEvent(")); assert.ok(api.includes("updateJournalEvent")); assert.ok(!app.includes("journeyRoutes"));
});
test("les adresses d’intervention des clients restent disponibles dans une route indépendante", () => {
 const route=read("../src/routes/client-addresses.ts"), app=read("../src/app.ts"), api=read("../../assets/js/core/api.js");
 for(const term of ["app.get(", "app.post(", "app.patch(", "app.delete("]) assert.ok(route.includes(term));
 assert.ok(route.includes("client_intervention_addresses")); assert.ok(app.includes("clientAddressRoutes")); assert.ok(api.includes("interventionAddresses:id=>"));
});
test("l’inscription ne crée plus de parcours administratif",()=>{assert.ok(!read("../src/routes/auth.ts").includes("insert into onboarding_journeys"))});