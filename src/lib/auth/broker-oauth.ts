import { genericOAuth } from "better-auth/plugins";

/** Preserve registered broker callbacks and existing account keys on Better Auth 1.7. */
export function brokerOAuth(options: Parameters<typeof genericOAuth>[0]) {
  const plugin = genericOAuth({
    ...options,
    config: options.config.map((config) => ({
      ...config,
      // 1.6 selected id, then sub, from this broker's raw profile. Do not
      // derive identity from email or mapped local-user fields during upgrade.
      accountSubject: ({ profile }) => {
        const valid = (value: unknown): value is string | number =>
          (typeof value === "string" && value.trim().length > 0) ||
          (typeof value === "number" && Number.isFinite(value));
        if (valid(profile.id)) return profile.id;
        if (valid(profile.sub)) return profile.sub;
        throw new Error("Broker profile has no account identifier");
      },
    })),
  });
  const ids = new Set(options.config.map((config) => config.providerId));
  const registeredCallback = (uri: string) => {
    const url = new URL(uri);
    const match = /^\/api\/auth\/callback\/([^/]+)$/.exec(url.pathname);
    if (match && ids.has(match[1])) url.pathname = `/api/auth/oauth2/callback/${match[1]}`;
    return url.href;
  };
  return {
    ...plugin,
    async init(ctx: Parameters<typeof plugin.init>[0]) {
      const result = await plugin.init(ctx);
      return {
        ...result,
        context: {
          ...result.context,
          socialProviders: result.context.socialProviders.map((provider) => {
            if (!ids.has(provider.id)) return provider;
            return {
              ...provider,
              createAuthorizationURL: (data: Parameters<typeof provider.createAuthorizationURL>[0]) =>
                provider.createAuthorizationURL({ ...data, redirectURI: registeredCallback(data.redirectURI) }),
              validateAuthorizationCode: (data: Parameters<typeof provider.validateAuthorizationCode>[0]) =>
                provider.validateAuthorizationCode({ ...data, redirectURI: registeredCallback(data.redirectURI) }),
            };
          }),
        },
      };
    },
    async onRequest(request: Request) {
      const url = new URL(request.url);
      const match = /^\/api\/auth\/oauth2\/callback\/([^/]+)$/.exec(url.pathname);
      if (!match || !ids.has(match[1])) return;
      // Internal alias only: keep query/body/cookies and all core state, PKCE,
      // origin and callback validation; never redirect an authorization code.
      url.pathname = `/api/auth/callback/${match[1]}`;
      return { request: new Request(url, request) };
    },
  };
}
