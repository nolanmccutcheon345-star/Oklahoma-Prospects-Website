import { useState, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TEAMS_OS } from "@/lib/teams/os";

type Props = {
  section: string;
  children: ReactNode;
};

function detailsText(section: string, error: Error) {
  return [
    `${TEAMS_OS.orgName} · Team management`,
    `Section: ${section}`,
    `Message: ${error.message || "Unknown error"}`,
    `Time: ${new Date().toISOString()}`,
    "",
    error.stack || "(no stack)",
  ].join("\n");
}

function TeamsErrorBox({
  section,
  error,
  onRetry,
}: {
  section: string;
  error: Error;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <section
      role="alert"
      data-teams-error={section}
      className="overflow-hidden rounded-2xl bg-midnight text-fg-inverse shadow-border"
    >
      <div className="h-1.5 bg-ok-maroon" />
      <div className="teams-card">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-columbia uppercase">
          <TriangleAlert className="size-4 shrink-0" strokeWidth={2.4} />
          Teams tab crashed
        </p>
        <h2 className="mt-3 text-3xl italic normal-case">
          {section}
          <span className="mt-1 block text-columbia not-italic">broke.</span>
        </h2>
        <p className="mt-3 text-sm text-fg-soft">
          This desk failed in place. The club header and bottom tabs are still
          up. Copy the details for Steve or Nolan, then try again.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-ink px-4 py-3 font-sans text-sm break-words whitespace-pre-wrap text-powder-strong">
          {error.message || "Unknown error"}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const text = detailsText(section, error);
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                window.prompt("Copy these details", text);
              }
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy details"}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function TeamsErrorBoundary({ section, children }: Props) {
  return (
    <ErrorBoundary
      resetKeys={[section]}
      onError={(error, info) => {
        console.error(`[Teams OS] ${section}`, error, info.componentStack);
      }}
      fallbackRender={({ error, resetErrorBoundary }) => (
        <TeamsErrorBox
          section={section}
          error={error instanceof Error ? error : new Error(String(error))}
          onRetry={() => {
            resetErrorBoundary();
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
