/* Pure financial engine. All amounts are in 10,000 KRW in the current client. */
const GameEngine = {
 simulate({initial:start, changes:ms=[], rateChanges:rs=[], monthlySaving:sv=70, annualRate:rt=3, months=120}) {
let cash=start.cash,saved=start.saved,unpaid=0,out=[{cash,saved,unpaid,total:cash+saved,income:start.income,expense:start.expense,short:0}];for(let m=1;m<=months;m++){let inc=start.income,exp=start.expense,sav=sv,r=rt,once=0;for(const x of ms)if(m>=x.m&&(x.end==null||m<=x.end)){if(x.type==='saving')sav=x.v;if(x.type==='expense')exp+=x.v;if(x.type==='income')inc+=x.v;if(x.type==='once'&&m===x.m)once+=x.v;}for(const x of rs)if(m>=x.m)r=x.v;saved*=Math.pow(1+r/100,1/12);const before=cash+inc-exp-once,short=Math.max(0,-before);unpaid+=short;cash=Math.max(0,before);let transfer=Math.min(sav,cash);cash-=transfer;saved+=transfer;out.push({cash,saved,unpaid,total:cash+saved-unpaid,income:inc,expense:exp+once,short});}return out;
 }
};
if(typeof module!=="undefined")module.exports=GameEngine;
