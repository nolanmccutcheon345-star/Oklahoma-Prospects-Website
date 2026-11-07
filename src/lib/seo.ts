import { CLUB } from "./club";
/** Retired public names (Oklahoma Prospects, Top Prospects) never render in page titles or descriptions. */
export function retireBrand(text:string){
 return text.replace(/\b(?:Oklahoma Prospects(?: Academy)?|Top Prospects)\b/gi,CLUB.name);
}
const ORIGIN='https://prospectssports.club';
export function pageHead(path:string,title:string,description:string,privatePage=false){
 description=retireBrand(description); title=retireBrand(title);
 const url=ORIGIN+(path==='/'?'/':path);
 return {meta:[{title:`${title} | ${CLUB.name}`},{name:'description',content:description},
  {property:'og:title',content:`${title} | ${CLUB.name}`},{property:'og:description',content:description},
  {property:'og:type',content:'website'},{property:'og:url',content:url},{property:'og:image',content:ORIGIN+'/og.jpg'},
  {name:'twitter:card',content:'summary_large_image'},...(privatePage?[{name:'robots',content:'noindex, nofollow'}]:[])],
  links:[{rel:'canonical',href:url}]};
}
