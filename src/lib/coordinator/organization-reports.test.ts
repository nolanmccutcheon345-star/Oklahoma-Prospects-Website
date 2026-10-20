import test from "node:test";
import assert from "node:assert/strict";
import { operationalCsv, type OperationalReportKind } from "./organization-reports.server";
test("operational CSV has explicit field columns, excludes unknown/nested finances and escapes formulas", () => {
  const workspace = {
    teams: [
      {
        name: "Synthetic Team",
        sport: "baseball",
        balance: 67890,
        roster: [
          {
            name: "=FINANCE()",
            number: "4",
            positions: ["P"],
            school: "School",
            gradYear: "2030",
            withdrawn: false,
            payments: [{ amount: 67890 }],
            parents: [{ bank: "PRIVATE" }],
          },
        ],
      },
    ],
    registrations: [
      {
        player: "Test",
        sport: "baseball",
        age: "13U",
        season: "Spring",
        parent: "Guardian",
        email: "test@example.invalid",
        phone: "555",
        status: "open",
        workflow: { status: "new" },
        payments: { amount: 67890 },
      },
    ],
    activities: [
      {
        teamId: "t",
        kind: "practice",
        title: "Practice",
        date: "2099-01-01",
        startTime: "12:00",
        endTime: "13:00",
        location: "Facility",
        status: "scheduled",
        fee: 67890,
      },
    ],
    evaluations: [
      {
        playerName: "Player",
        sport: "baseball",
        evaluationDate: "2099-01-01",
        status: "draft",
        recommendation: "undecided",
        reviewed: false,
        ratings: {
          contact: 4,
          approach: 4,
          fielding: 4,
          throwing: 4,
          movement: 4,
          knowledge: 4,
          coachability: 4,
        },
        narrative: "PRIVATE salary 67890",
      },
    ],
  } as unknown as Parameters<typeof operationalCsv>[0];
  for (const kind of [
    "rosters",
    "registrations",
    "schedules",
    "evaluations",
  ] as OperationalReportKind[]) {
    const csv = operationalCsv(workspace, kind);
    assert.doesNotMatch(csv, /67890|PRIVATE|salary|payments|balance/);
    assert.ok(csv.endsWith("\r\n"));
  }
  assert.match(operationalCsv(workspace, "rosters"), /"'=FINANCE\(\)"/);
  assert.throws(() => operationalCsv(workspace, "finance" as OperationalReportKind));
});
