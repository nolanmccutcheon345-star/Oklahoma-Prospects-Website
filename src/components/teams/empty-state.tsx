import { Button } from "@/components/ui/button";

export function TeamsEmpty({
  title,
  copy,
  action,
  onAction,
}: {
  title: string;
  copy: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div
      data-teams-empty="true"
      className="rounded-2xl bg-paper-2 px-5 py-8 text-center shadow-border"
    >
      <p className="text-xs font-semibold tracking-[0.16em] text-maroon uppercase">
        Nothing here yet
      </p>
      <h3 className="mt-2 text-3xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-teams-muted">{copy}</p>
      {action && onAction ? (
        <Button type="button" className="mt-5" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}
