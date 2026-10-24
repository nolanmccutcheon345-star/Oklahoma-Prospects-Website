import type { Sql } from "../db";
import { articleDocument } from "./contracts";
import { launchAssignments } from "./launch-data";
import { secured, JournalDenied, record } from "./editorial.server";
export async function importAssignmentsFor(sql: Sql, actor: string) {
  return secured(sql, actor, async (tx, p) => {
    if (!p.owner) throw new JournalDenied();
    let created = 0;
    for (const a of launchAssignments) {
      const document = articleDocument.parse(a.document);
      const rows =
        await tx`insert into journal_articles(id,document,created_by,updated_by) values(${a.id},${JSON.stringify(document)}::jsonb,${actor},${actor}) on conflict(id) do nothing returning id`;
      if (rows.length) {
        created++;
        await tx`insert into journal_revisions(article_id,revision,document,editor_id) values(${a.id},1,${JSON.stringify(document)}::jsonb,${actor})`;
        await record(tx, actor, a.id, "launch-draft-created", { revision: 1 });
      }
    }
    return { created };
  });
}
