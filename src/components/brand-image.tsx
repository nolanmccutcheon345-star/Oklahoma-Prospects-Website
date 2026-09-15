import type {ComponentProps} from 'react';
export function BrandImage({src,priority=false,...props}:ComponentProps<'img'>&{src:string;priority?:boolean}){
 const family=src.match(/^\/brand\/(team|facility|training)\.jpg$/)?.[1];
 if(!family)return <img src={src} {...props}/>;
 const source=(type:string)=>[480,768,1024,1536].map(w=>`/brand/${family}-${w}.${type} ${w}w`).join(', ');
 return <picture><source type="image/avif" srcSet={source('avif')} sizes="(max-width: 768px) 100vw, 768px"/><source type="image/webp" srcSet={source('webp')} sizes="(max-width: 768px) 100vw, 768px"/><img {...props} src={src} width={1536} height={1152} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async"/></picture>;
}
