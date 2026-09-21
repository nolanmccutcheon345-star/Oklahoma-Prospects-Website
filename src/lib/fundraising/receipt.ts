import { body, json, fail, AppError, rateLimit, paymentReady } from "./server";
import { syncContribution } from "./square";
export async function POST(req: Request) {
  try {
    const b = await body(req);
    if (typeof b.id !== "string" || !/^[a-f0-9-]{36}$/.test(b.id))
      throw new AppError("Sponsorship not found.", 404);
    if (!paymentReady()) throw new AppError("Payment confirmation is not available yet.", 503);
    await rateLimit("receipt:" + b.id, 20, 60);
    const result = await syncContribution(b.id);
    if (!result) throw new AppError("Sponsorship not found.", 404);
    return json(result);
  } catch (e) {
    return fail(e);
  }
}
