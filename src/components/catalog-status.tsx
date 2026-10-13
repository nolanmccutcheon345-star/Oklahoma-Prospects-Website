export function CatalogStatus({
  error,
  label,
  retry,
}: {
  error: boolean;
  label: string;
  retry: () => void;
}) {
  return (
    <div role={error ? "alert" : "status"} className="rounded-xl border border-current/25 p-5">
      <p>
        {error
          ? `We couldn’t load ${label}. Try again, or contact the front desk.`
          : `Loading ${label}…`}
      </p>
      {error && (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-current px-4 font-semibold"
            onClick={retry}
          >
            Try again
          </button>
          <a href="/contact" className="inline-flex min-h-11 items-center underline">
            Contact the front desk
          </a>
        </div>
      )}
    </div>
  );
}
