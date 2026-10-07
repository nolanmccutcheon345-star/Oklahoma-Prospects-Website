import {createHash} from "node:crypto";

/** New profiles must not share IDs because emails share a stripped/truncated prefix. */
export function newCoachId(email:string) {
  const normalized=email.trim().toLowerCase();
  if(!normalized)throw new Error("A coach email is required.");
  return "c-"+createHash("sha256").update(normalized).digest("hex").slice(0,32);
}
