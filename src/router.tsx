import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn, getGlobalStartContext } from "@tanstack/react-start";
import {NotFound} from "@/components/not-found";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

const getNonce = createIsomorphicFn()
  .server(() => (getGlobalStartContext() as {nonce?:string} | undefined)?.nonce)
  .client(() => document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.content);

export function getRouter() {
  return createRouter({ routeTree, ssr: {nonce:getNonce()}, defaultErrorComponent: AppErrorComponent, defaultNotFoundComponent:NotFound });
}
