type Environment=Record<string,string|undefined>;
/** A deploy preview must never silently inherit the production database. */
export function configuredDatabaseUrl(env:Environment):string|undefined {
  const preview=Boolean(env.CONTEXT && env.CONTEXT!=='production' && env.CONTEXT!=='dev');
  const value=preview?env.PREVIEW_DATABASE_URL:(env.DATABASE_URL||env.NETLIFY_DATABASE_URL);
  return value?.trim()||undefined;
}
