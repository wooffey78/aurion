// Définition unique de la navigation de la coquille : libellés, icônes et règles de visibilité.
export const NAV_ITEMS=[
  {id:'home',label:'Tableau de bord',icon:'⌂'},
  {id:'clients',label:'Clients',icon:'♙'},
  {id:'catalog',label:'Catalogue métier',icon:'◈'},
  {id:'suppliers',label:'Fournisseurs',icon:'▱'},
  {id:'invoices',label:'Devis & factures',icon:'▧'},
  {id:'agenda',label:'Agenda',icon:'◷'},
  {id:'accounting',label:'Comptabilité & trésorerie',icon:'∑'},
  {id:'support',label:'Support Aurion',icon:'?'},
  {id:'settings',label:'Paramètres',icon:'⚙'},
  {id:'admin',label:'Administration',icon:'⚙',admin:true},
];

// Ces règles ne concernent que le menu : une vue masquée reste accessible par les cartes
// d'action et les liens directs (devis, trésorerie, compte).
export function hiddenViews(questionnaire={},modules=[]){
  const hidden=new Set();
  if(questionnaire.support==='Non')hidden.add('support');
  if(questionnaire.agenda==='Non')hidden.add('agenda');
  if(questionnaire.accounting==='Non')hidden.add('accounting');
  if(questionnaire.parts==='Non'&&questionnaire.stock==='Non')hidden.add('catalog');
  const views=modules.map(x=>String(x).toLowerCase());
  if(views.length&&!views.some(x=>x.includes('agenda'))&&questionnaire.agenda!=='Oui')hidden.add('agenda');
  return hidden;
}

export function navigationItems({questionnaire={},modules=[],isAdmin=false}={}){
  const hidden=hiddenViews(questionnaire,modules);
  return NAV_ITEMS.filter(item=>item.admin?isAdmin:!hidden.has(item.id));
}
