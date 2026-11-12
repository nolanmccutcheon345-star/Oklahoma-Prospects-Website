/** Match the exact target-account lock, independently of selected identity columns.
 * Used only by the disposable PostgreSQL concurrency harness, after SQL completed. */
export function isTargetAccountRowLock(query, parameters, targetId) {
  const normalized = query.trim().replace(/\s+/g, " ").toLowerCase();
  return (
    /^select\s/.test(normalized) &&
    /\bfrom "user" u\b/.test(normalized) &&
    /\bwhere u\.id=\$1\b/.test(normalized) &&
    /\bfor update of u$/.test(normalized) &&
    parameters[0] === targetId
  );
}
