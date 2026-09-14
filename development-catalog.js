(async()=>{
 const host=document.getElementById('developmentMemberships');if(!host)return;
 try{
  const response=await fetch('https://app.prospectsbaseball.club/api/portal/catalog',{credentials:'omit',cache:'no-store'});if(!response.ok)throw new Error('Catalog unavailable');const {catalog}=await response.json();host.replaceChildren();
  const money=n=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Number.isInteger(n)?0:2});
  for(const plan of catalog.memberships.filter(p=>p.cagePlan||p.delivery==='remote')){
   const card=document.createElement('article'),h=document.createElement('h2'),price=document.createElement('strong'),detail=document.createElement('p'),intro=document.createElement('p'),link=document.createElement('a');
   h.textContent=plan.name;price.textContent=money(plan.price)+'/month';
   detail.textContent=plan.cagePlan?`${plan.lessons} × ${plan.minutes}-minute lessons + ${plan.cageVisits} × 60-minute cage rentals. ${money(plan.lessonPrice)} development + ${money(plan.cagePrice)} cage membership.`:`Fully remote: ${plan.remote} video reviews and a personalized 30-day skill and strength program each month.`;
   intro.textContent=`New player: ${money(plan.price+50)} first month with ${plan.delivery==='remote'?'remote ':''}assessment/setup; ${money(plan.price)}/month thereafter.`;
   link.textContent='Choose this plan';link.className='bookBtn';link.href='/development/?kind=memberships&productId='+encodeURIComponent(plan.id);card.append(h,price,detail,intro,link);host.append(card);
  }
 }catch{host.textContent='Current plans could not load. Use the comparison link below to view the catalog.';}
})();
