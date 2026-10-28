import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Kysely } from 'kysely';
import { betterAuth } from 'better-auth';
import { brokerOAuth } from './broker-oauth';
import { pgliteDialect } from './pglite-dialect';

test('broker upgrade preserves callback registration, PKCE, state and existing account identity', async () => {
  const db = new PGlite();
  const database = new Kysely({ dialect: pgliteDialect(() => db) });
  try {
    await db.exec(await readFile('migrations/auth/0001_auth.sql', 'utf8'));
    await db.exec(`INSERT INTO "user" (id,name,email,"emailVerified") VALUES ('existing-player-parent','Fixture','broker@example.invalid',true);
      INSERT INTO account (id,"accountId","providerId","userId","updatedAt") VALUES ('existing-account','broker-subject','grok-google','existing-player-parent',now());`);
    let exchanges = 0;
    let useId = false;
    const origin = 'http://localhost:9011';
    const callback = origin + '/api/auth/oauth2/callback/grok-google';
    const auth = betterAuth({
      baseURL: origin, secret: 'synthetic-broker-upgrade-only-secret-2026',
      database: { db: database, type: 'postgres' }, logger: { disabled: true },
      plugins: [brokerOAuth({ config: [{
        providerId: 'grok-google', clientId: 'synthetic-client', clientSecret: 'synthetic-secret',
        authorizationUrl: 'https://broker.example.invalid/authorize', scopes: ['openid', 'email'],
        getToken: async (data) => {
          exchanges++;
          assert.equal(data.redirectURI, callback);
          assert.ok(data.codeVerifier && data.codeVerifier.length >= 32);
          assert.equal(data.code, 'synthetic-code');
          return { accessToken: 'synthetic-token' };
        },
        getUserInfo: async () => ({ ...(useId ? { id: 'broker-subject' } : {}), sub: useId ? 'different-sub' : 'broker-subject', email: 'broker@example.invalid', emailVerified: true, name: 'Fixture' }),
      }] })],
    });
    for (const repeat of [false, true]) {
      useId = repeat;
      const start = await auth.handler(new Request(origin + '/api/auth/sign-in/social', {
        method: 'POST', headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ provider: 'grok-google', callbackURL: '/enrollment?playerId=fixture' }),
      }));
      assert.equal(start.status, 200);
      const target = new URL((await start.json()).url);
      assert.equal(target.searchParams.get('redirect_uri'), callback);
      assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
      assert.ok(target.searchParams.get('code_challenge'));
      const cookie = start.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
      const finish = await auth.handler(new Request(callback + '?code=synthetic-code&state=' + encodeURIComponent(target.searchParams.get('state')!), { headers: { cookie } }));
      assert.equal(finish.status, 302);
      assert.equal(new URL(finish.headers.get('location')!, origin).pathname, '/enrollment');
      const sessionCookie = finish.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
      const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) });
      assert.equal(session?.user.id, 'existing-player-parent');
      assert.equal((await db.query('SELECT id FROM account')).rows.length, 1);
    }
    const invalid = await auth.handler(new Request(callback + '?code=synthetic-code&state=forged'));
    assert.match(invalid.headers.get('location') ?? '', /error=/);
    assert.equal(exchanges, 2, 'forged state cannot reach token exchange');
    const crossOrigin = await auth.handler(new Request(origin + '/api/auth/sign-in/social', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example.invalid', cookie: 'better-auth.session_token=synthetic' },
      body: JSON.stringify({ provider: 'grok-google', callbackURL: '/enrollment' }),
    }));
    assert.equal(crossOrigin.status, 403);
  } finally { await database.destroy(); await db.close(); }
});

test('parent email verification, enrollment return path, password reset and session revocation survive upgrade', async () => {
  const db = new PGlite();
  const database = new Kysely({ dialect: pgliteDialect(() => db) });
  try {
    await db.exec(await readFile('migrations/auth/0001_auth.sql', 'utf8'));
    let verificationURL = '', resetURL = '';
    const origin = 'http://localhost:9012';
    const auth = betterAuth({
      baseURL: origin, secret: 'synthetic-parent-upgrade-only-secret-2026',
      database: { db: database, type: 'postgres' }, logger: { disabled: true },
      emailAndPassword: { enabled: true, requireEmailVerification: true, revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ url }) => { resetURL = url; } },
      emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false,
        sendVerificationEmail: async ({ url }) => { verificationURL = url; } },
    });
    const post = (path: string, body: unknown) => auth.handler(new Request(origin + '/api/auth/' + path, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    const credentials = { email: 'new-parent@example.invalid', password: 'synthetic-parent-password-2026' };
    assert.equal((await post('sign-up/email', { ...credentials, name: 'Synthetic Parent', callbackURL: '/enrollment?playerId=fixture' })).status, 200);
    assert.equal((await post('sign-in/email', credentials)).status, 403);
    // Verification sent by sign-in may choose a different return path; use the
    // same enrollment callback the application supplies.
    await post('send-verification-email', { email: credentials.email, callbackURL: '/enrollment?playerId=fixture' });
    const verified = await auth.handler(new Request(verificationURL));
    assert.equal(verified.status, 302);
    assert.equal(new URL(verified.headers.get('location')!, origin).pathname, '/enrollment');
    const signedIn = await post('sign-in/email', credentials);
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie }) }));
    await post('request-password-reset', { email: credentials.email, redirectTo: '/reset-password' });
    const token = new URL(resetURL).pathname.split('/').at(-1);
    assert.ok(token);
    const newPassword = 'new-synthetic-parent-password-2026';
    assert.equal((await post('reset-password', { token, newPassword })).status, 200);
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie }) }), null);
    assert.notEqual((await post('sign-in/email', credentials)).status, 200);
    assert.equal((await post('sign-in/email', { ...credentials, password: newPassword })).status, 200);
  } finally { await database.destroy(); await db.close(); }
});
