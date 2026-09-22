import { requireAdmin, db, fail } from "./server";
export async function GET() {
  try {
    await requireAdmin();
    const rows = await db()
      .prepare(
        "SELECT p.name AS player,p.team,c.donor,c.email,c.amount/100.0 AS amount_usd,c.refunded/100.0 AS refunded_usd,c.status,c.created,c.payment_id FROM fundraising_contributions c JOIN fundraising_players p ON p.id=c.player_id ORDER BY c.created DESC",
      )
      .all();
    const keys = [
      "player",
      "team",
      "donor",
      "email",
      "amount_usd",
      "refunded_usd",
      "status",
      "created",
      "payment_id",
    ];
    const escape = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    return new Response(
      [keys.join(","), ...rows.results.map((r) => keys.map((k) => escape(r[k])).join(","))].join(
        "\r\n",
      ),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="prospects-sponsorships.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return fail(e);
  }
}
