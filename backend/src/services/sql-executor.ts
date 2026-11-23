// Type partagé : exécuteur SQL (client de transaction ou pool tenant). Défini ici pour que
// les services (stock, achats, workflows…) n'aient plus à dépendre d'un type local de route.
export type SqlExecutor = { query: (text: string, values?: unknown[]) => Promise<any> };
