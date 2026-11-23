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

export type InvoicePaymentState = 'partially_paid' | 'paid';
export type InvoicePaymentCalculation = { amount:number; dueTotal:number; paidAmount:number; remaining:number; status:InvoicePaymentState };

/**
 * Calculates the result of one payment from a locked invoice snapshot.
 * Callers must hold a row lock on the invoice until the payment transaction commits.
 */
export function calculateInvoicePayment(totalTtc:number, penalties:number, paidBefore:number, requestedAmount:number):InvoicePaymentCalculation{
  const values=[totalTtc,penalties,paidBefore,requestedAmount].map(Number);
  if(values.some(value=>!Number.isFinite(value))||values.some(value=>value<0))throw new Error('INVALID_PAYMENT_AMOUNT');
  const [total,penalty,alreadyPaid,amount]=values.map(roundMoney);
  if(amount<=0)throw new Error('INVALID_PAYMENT_AMOUNT');
  const dueTotal=roundMoney(total+penalty);
  const remaining=roundMoney(Math.max(0,dueTotal-alreadyPaid));
  if(remaining<=0)throw new Error('INVOICE_ALREADY_PAID');
  if(amount>remaining+0.005)throw new Error('PAYMENT_TOO_HIGH');
  const paidAmount=roundMoney(alreadyPaid+amount);
  const status:InvoicePaymentState=paidAmount+0.005>=dueTotal?'paid':'partially_paid';
  return {amount,dueTotal,paidAmount,remaining:roundMoney(Math.max(0,dueTotal-paidAmount)),status};
}

export function normalizePaymentDate(value:string|undefined, now=new Date()):Date{
  if(!value)return new Date(now);
  if(value.length<=10&&!validDateOnly(value))throw new Error('INVALID_PAYMENT_DATE');
  const date=new Date(value.length<=10?`${value}T12:00:00`:value);
  if(Number.isNaN(date.getTime())||date.getTime()>now.getTime()+86400000)throw new Error('INVALID_PAYMENT_DATE');
  return date;
}

export type InstallmentPlanRow = { number:number; dueAt:string; amount:number };
type RawInstallmentRow = { dueAt?:unknown; due_at?:unknown; amount?:unknown; amountDue?:unknown };

function validDateOnly(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
export const isValidDateOnly=validDateOnly;

/** Validates a client-provided schedule or builds an exact-cent schedule from a count. */
export function buildInstallmentPlan(totalTtc:number, input:{installments?:RawInstallmentRow[];count?:unknown;startDate?:unknown;intervalDays?:unknown}):InstallmentPlanRow[]{
  const total=Number(totalTtc);
  if(!Number.isFinite(total)||total<0)throw new Error('INVALID_INSTALLMENT_TOTAL');
  let rows:InstallmentPlanRow[];
  if(Array.isArray(input.installments)&&input.installments.length){
    if(input.installments.length>120)throw new Error('INSTALLMENT_LIMIT');
    rows=input.installments.map((row,index)=>{
      const dueAt=String(row.dueAt??row.due_at??'');
      const amount=Number(String(row.amount??row.amountDue??'').trim().replace(',','.'));
      if(!validDateOnly(dueAt)||!Number.isFinite(amount)||amount<0)throw new Error('INVALID_INSTALLMENT_PLAN');
      return {number:index+1,dueAt,amount:roundMoney(amount)};
    });
  }else{
    const count=Number(input.count??0);
    if(!Number.isInteger(count)||count<1||count>120)throw new Error('INVALID_INSTALLMENT_COUNT');
    const startDate=String(input.startDate??'').slice(0,10);
    if(!validDateOnly(startDate))throw new Error('INVALID_INSTALLMENT_DATE');
    const interval=Number(input.intervalDays??30);
    if(!Number.isInteger(interval)||interval<0||interval>3650)throw new Error('INVALID_INSTALLMENT_INTERVAL');
    const cents=Math.round(total*100),baseCents=Math.floor(cents/count);
    const [year,month,day]=startDate.split('-').map(Number);
    rows=Array.from({length:count},(_,index)=>{
      const date=new Date(Date.UTC(year,month-1,day+index*interval));
      if(!Number.isFinite(date.getTime()))throw new Error('INVALID_INSTALLMENT_DATE');
      return {number:index+1,dueAt:date.toISOString().slice(0,10),amount:(index===count-1?cents-baseCents*(count-1):baseCents)/100};
    });
  }
  const sum=roundMoney(rows.reduce((acc,row)=>acc+row.amount,0));
  if(sum!==roundMoney(total))throw new Error('INSTALLMENTS_TOTAL_MISMATCH');
  return rows;
}

/** Assigns payments oldest-installment-first when a schedule is created or replaced. */
export function allocateInstallmentPayments(rows:InstallmentPlanRow[],paidAmount:number){
  let remaining=roundMoney(Math.max(0,Number.isFinite(Number(paidAmount))?Number(paidAmount):0));
  return rows.map(row=>{
    const amountPaid=roundMoney(Math.min(row.amount,remaining));
    remaining=roundMoney(Math.max(0,remaining-amountPaid));
    const status=amountPaid+0.005>=row.amount?'paid':amountPaid>0?'partially_paid':'pending';
    return {...row,amountPaid,status};
  });
}
