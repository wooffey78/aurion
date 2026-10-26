export function suggestedTtcFromCatalogTotal(total){
  const value=Math.max(0,Number(total||0))+1;
  return Math.round((value+Number.EPSILON)*100)/100;
}
