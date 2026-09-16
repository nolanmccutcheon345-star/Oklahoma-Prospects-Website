import { AsyncLocalStorage } from 'node:async_hooks';
const actors = new AsyncLocalStorage<string>();
export function withAuditActor<T>(userId:string, work:()=>Promise<T>) { return actors.run(userId,work); }
export function currentAuditActor() { return actors.getStore(); }
