const ORIGIN='https://prospectsbaseball.club';
export function pageHead(path:string,title:string,description:string,privatePage=false){
 const url=ORIGIN+(path==='/'?'/':path);
 return {meta:[{title:`${title} | Oklahoma Prospects`},{name:'description',content:description},
  {property:'og:title',content:`${title} | Oklahoma Prospects`},{property:'og:description',content:description},
  {property:'og:type',content:'website'},{property:'og:url',content:url},{property:'og:image',content:ORIGIN+'/og.jpg'},
  {name:'twitter:card',content:'summary_large_image'},...(privatePage?[{name:'robots',content:'noindex, nofollow'}]:[])],
  links:[{rel:'canonical',href:url}]};
}
