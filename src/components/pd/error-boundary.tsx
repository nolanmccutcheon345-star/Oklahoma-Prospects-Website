import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PD_OS } from "@/lib/pd";

type Props = {
  section: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
  copied: boolean;
};

function detailsText(section: string, error: Error) {
  return [
    `${PD_OS.businessName} · Player development`,
    `Section: ${section}`,
    `Message: ${error.message || "Unknown error"}`,
    `Time: ${new Date().toISOString()}`,
    "",
    error.stack || "(no stack)",
  ].join("\n");
}

export class PdErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PD OS] ${this.props.section}`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.section !== this.props.section && this.state.error) {
      this.setState({ error: null, copied: false });
    }
  }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    const section = this.props.section;

    return (
      <section
        role="alert"
        className="overflow-hidden rounded-2xl bg-ink text-fg-inverse shadow-border"
      >
        <div className="h-1.5 bg-maroon" />
        <div className="pd-card p-5">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-powder uppercase">
            <TriangleAlert className="size-4 shrink-0" strokeWidth={2.4} />
            Train tab crashed
          </p>
          <h2 className="mt-3 text-3xl italic normal-case">
            {section}
            <span className="mt-1 block text-powder not-italic">broke.</span>
          </h2>
          <p className="mt-3 text-sm text-fg-soft">
            This desk failed in place. The rest of the club — header, tabs, Book,
            Teams — is still up. Copy the details for Steve or Nolan, then try
            again.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-navy px-4 py-3 font-sans text-sm break-words whitespace-pre-wrap text-powder-strong">
            {error.message || "Unknown error"}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => this.setState({ error: null, copied: false })}
            >
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
                this.setState({ copied: true });
              }}
            >
              {copied ? "Copied" : "Copy details"}
            </Button>
          </div>
        </div>
      </section>
    );
  }
}
