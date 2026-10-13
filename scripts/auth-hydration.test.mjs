import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {createElement,act} from 'react';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';

test('early client session matches pending SSR and resolves after hydration without errors',async()=>{
 const temp=await mkdtemp('scripts/.auth-hydration-');let root,dom;
 const prior={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.__hydrationSession={data:{user:{id:'synthetic',name:'Synthetic Guardian',email:'guardian@example.invalid'}},isPending:false};
 try{
  const out=temp+'/hook.mjs';
  await build({entryPoints:['src/lib/auth/use-current-user.ts'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'session',setup(b){b.onResolve({filter:/^\.\/client$/},()=>({path:'session',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const authEnabled=true;export const authClient={useSession:()=>globalThis.__hydrationSession};'}));}}]});
  const {useCurrentUserState}=await import(pathToFileURL(process.cwd()+'/'+out));
  function View(){const {user,isPending}=useCurrentUserState();return createElement('p',null,isPending?'Loading account':user?.displayName||'Signed out');}
  const html=renderToString(createElement(View));assert.match(html,/Loading account/);assert.doesNotMatch(html,/Synthetic Guardian/);
  dom=new JSDOM('<div id="root">'+html+'</div>',{url:'https://fixture.invalid'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
  const errors=[];
  await act(async()=>{root=hydrateRoot(document.getElementById('root'),createElement(View),{onRecoverableError:e=>errors.push(e.message)});});
  assert.deepEqual(errors,[]);assert.match(document.body.textContent,/Synthetic Guardian/);
  globalThis.__hydrationSession={data:null,isPending:false};
  await act(async()=>root.render(createElement(View)));assert.match(document.body.textContent,/Signed out/);
 }finally{if(root)await act(async()=>root.unmount());dom?.window.close();Object.assign(globalThis,{window:prior.window,document:prior.document,IS_REACT_ACT_ENVIRONMENT:prior.act});delete globalThis.__hydrationSession;await rm(temp,{recursive:true,force:true});}
});
