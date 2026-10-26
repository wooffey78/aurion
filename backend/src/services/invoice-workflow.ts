export type PenaltyMode = 'none' | 'fixed' | 'percent';

export function roundMoney(value:number){return Math.round((value+Number.EPSILON)*100)/100}

/** Calcule une nouvelle majoration sur le montant TTC de la relance précédente. */
export function calculateReminderPenalty(baseTtc:number, previousPenalties:number, mode:PenaltyMode, value:number){
  const previousTotal=Math.max(0,Number(baseTtc||0)+Number(previousPenalties||0));
  const safeValue=Math.max(0,Number(value||0));
  if(mode==='fixed') return roundMoney(safeValue);
  if(mode==='percent') return roundMoney(previousTotal*safeValue/100);
  return 0;
}

export function reminderTotal(baseTtc:number, previousPenalties:number, newPenalty:number){
  return roundMoney(Math.max(0,Number(baseTtc||0)+Number(previousPenalties||0)+Number(newPenalty||0)));
}
