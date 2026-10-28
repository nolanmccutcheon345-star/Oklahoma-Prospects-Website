import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

test("service lifecycle endpoints enforce distinct auth, exact metadata contracts and server identity", async () => {
  const folder = await mkdtemp("scripts/.services-api-");
  const out = resolve(folder, "api.mjs");
  const calls = [];
  globalThis.serviceApiFixture = calls;
  const built = await build({
    entryPoints: ["src/lib/coordinator/organization-services-api.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    external: ["zod"],
    plugins: [
      {
        name: "fixture",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^@tanstack\/react-start$|auth\/middleware$|^\.\.\/db$|organization-services\.server$/,
            },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            loader: "js",
            contents: path.includes("middleware")
              ? "export const authMiddleware = {ownerAuthenticated:true}; export const operationalAuthMiddleware = {operationalAuthenticated:true};"
              : path.endsWith("/db")
                ? "export const getSql = async () => 'fixture-sql';"
                : path.endsWith(".server")
                  ? [
                      "organizationServices",
                      "createOrganizationServiceDraft",
                      "saveOrganizationService",
                      "setOrganizationServiceStatus",
                      "ownerServiceDrafts",
                    ]
                      .map(
                        (name) =>
                          `export const ${name} = async (...args) => {globalThis.serviceApiFixture.push({name:'${name}',args});return [];};`,
                      )
                      .join("\n")
                  : "export const createServerFn = (options) => ({options,middleware(auth){this.auth=auth;return this},validator(schema){this.schema=schema;return this},handler(run){this.run=run;return this}});",
          }));
        },
      },
    ],
  });
  await writeFile(out, built.outputFiles[0].text);
  try {
    const api = await import(pathToFileURL(out).href);
    const metadata = {
      kind: "lesson",
      name: "Synthetic lesson",
      discipline: "Pitching",
      purpose: "Public purpose",
      detail: "Public description",
      featured: false,
      sortOrder: 2,
    };
    const save = {
      id: "synthetic-service",
      revision: 1,
      sourceRevision: 4,
      name: metadata.name,
      purpose: metadata.purpose,
      detail: metadata.detail,
      featured: false,
      sortOrder: 2,
    };
    const status = {
      id: save.id,
      revision: 1,
      sourceRevision: 4,
      status: "archived",
      reason: "Season finished.",
    };
    for (const [name, server, method, input] of [
      ["getOrganizationServices", "organizationServices", "GET"],
      ["createOrganizationServiceDraft", "createOrganizationServiceDraft", "POST", metadata],
      ["saveOrganizationService", "saveOrganizationService", "POST", save],
      ["setOrganizationServiceStatus", "setOrganizationServiceStatus", "POST", status],
      ["getOwnerServiceDrafts", "ownerServiceDrafts", "GET"],
    ]) {
      const endpoint = api[name];
      assert.equal(endpoint.options.method, method);
      assert.deepEqual(endpoint.auth, [
        name === "getOwnerServiceDrafts"
          ? { ownerAuthenticated: true }
          : { operationalAuthenticated: true },
      ]);
      const data = input ? endpoint.schema.parse(input) : undefined;
      await endpoint.run({ context: { userId: "verified-user" }, data });
      assert.deepEqual(calls.at(-1), {
        name: server,
        args: input ? ["fixture-sql", "verified-user", data] : ["fixture-sql", "verified-user"],
      });
      if (input)
        for (const field of [
          "price",
          "priceCents",
          "credits",
          "minutes",
          "hours",
          "profit_split",
          "entry",
          "requires_assessment",
          "active",
          "userId",
          "basisVersion",
          "operationalDraftConfirmed",
          "payload",
        ]) {
          assert.equal(
            endpoint.schema.safeParse({ ...input, [field]: 100 }).success,
            false,
            `${name} rejects ${field}`,
          );
        }
    }
    for (const kind of ["lesson", "package", "membership", "cage", "cage_plan", "fee", "team_plan"])
      assert.equal(
        api.createOrganizationServiceDraft.schema.safeParse({ ...metadata, kind }).success,
        true,
      );
    assert.equal(
      api.createOrganizationServiceDraft.schema.safeParse({ ...metadata, kind: "investment" })
        .success,
      false,
    );
    assert.equal(
      api.createOrganizationServiceDraft.schema.safeParse({ ...metadata, id: "source-id" }).success,
      false,
      "copy is a fresh metadata draft",
    );
    for (const input of [
      { ...save, revision: -1 },
      { ...save, sourceRevision: undefined },
      { ...save, sourceRevision: -1 },
      { ...save, kind: "fee" },
      { ...save, discipline: "Other" },
    ])
      assert.equal(api.saveOrganizationService.schema.safeParse(input).success, false);
    assert.equal(
      api.saveOrganizationService.schema.safeParse({ ...save, sourceRevision: null }).success,
      true,
    );
    for (const input of [
      { ...status, status: "draft" },
      { ...status, reason: "" },
      { ...status, sourceRevision: undefined },
    ])
      assert.equal(api.setOrganizationServiceStatus.schema.safeParse(input).success, false);
  } finally {
    delete globalThis.serviceApiFixture;
    await rm(folder, { recursive: true, force: true });
  }
});
