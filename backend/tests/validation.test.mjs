import test from "node:test";
import assert from "node:assert/strict";

function luhn(value){
  let sum=0, parity=value.length%2;
  for(let i=0;i<value.length;i++){let d=Number(value[i]);if(i%2===parity){d*=2;if(d>9)d-=9;}sum+=d}
  return sum%10===0;
}
test("Luhn validates a known SIRET-shaped number",()=>assert.equal(luhn("73282932000074"),true));
test("invalid checksum rejected",()=>assert.equal(luhn("73282932000075"),false));
