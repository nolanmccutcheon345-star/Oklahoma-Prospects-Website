import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
const actors = new AsyncLocalStorage<{ userId: string; correlationId: string }>();
export function withAuditActor<T>(userId: string, work: () => Promise<T>) {
  const existing = actors.getStore();
  return actors.run(
    existing?.userId === userId ? existing : { userId, correlationId: randomUUID() },
    work,
  );
}
export function currentAuditActor() {
  return actors.getStore()?.userId;
}
export function currentAuditCorrelation() {
  return actors.getStore()?.correlationId;
}
