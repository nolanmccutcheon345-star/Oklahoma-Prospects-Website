import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import { gameEventInput } from "./games-contracts";

export const getPublicGames = createServerFn({method:"GET"}).handler(async()=>{
 const {getSql}=await import("./db");
 const {publicGamesFor}=await import("./games.server");
 return publicGamesFor(await getSql());
});
export const getAdminGames = createServerFn({method:"GET"})
 .middleware([authMiddleware])
 .handler(async({context})=>{
  const {getSql}=await import("./db");
  const {adminGamesFor}=await import("./games.server");
  return adminGamesFor(await getSql(),context.userId);
 });
export const saveGame = createServerFn({method:"POST"})
 .middleware([authMiddleware])
 .validator(gameEventInput)
 .handler(async({context,data})=>{
  const {getSql}=await import("./db");
  const {saveGameFor}=await import("./games.server");
  return saveGameFor(await getSql(),context.userId,data);
 });
