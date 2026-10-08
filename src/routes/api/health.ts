import { createFileRoute } from "@tanstack/react-router";
import { configuredDatabaseUrl } from "@/lib/database-config";
import {
  databaseDestinationFingerprint,
  missingPersistentFingerprint,
} from "@/lib/database-fingerprint";

/**
 * Anonymous, GET-only preflight. No query/transaction, no database mutations
 * and no connection identifiers or credentials in the response.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        const destination = configuredDatabaseUrl(process.env);
        const result = destination
          ? databaseDestinationFingerprint(destination)
          : missingPersistentFingerprint;
        return Response.json(
          {
            status: result.fingerprint ? "configured" : "unverified",
            databaseSource: result.source,
            databaseFingerprint: result.fingerprint,
          },
          {
            status: result.fingerprint ? 200 : 503,
            headers: {
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      },
    },
  },
});
