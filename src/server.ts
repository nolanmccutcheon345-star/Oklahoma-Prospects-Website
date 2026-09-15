import {randomBytes} from 'node:crypto';
import {createStartHandler,defaultStreamHandler} from '@tanstack/react-start/server';
import type {RequestHandler} from '@tanstack/react-start/server';
import type {Register} from '@tanstack/react-router';
import {securityHeaders} from './lib/security-headers';

const handler=createStartHandler(defaultStreamHandler);
const fetch:RequestHandler<Register>=async(request,options)=>{
  const nonce=randomBytes(24).toString('base64');
  const response=await handler(request,{...options,context:{...options?.context,nonce}});
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(securityHeaders(nonce,process.env.NODE_ENV!=='production')))headers.set(key,value);
  // HTML contains a per-response nonce; all authenticated responses stay private.
  if(headers.get('content-type')?.includes('text/html')||request.headers.has('cookie')||new URL(request.url).pathname.startsWith('/api/'))headers.set('Cache-Control','private, no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};
export default {fetch};
