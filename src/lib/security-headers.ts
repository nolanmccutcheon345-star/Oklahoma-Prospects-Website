/** Applied to SSR/API responses and mirrored for static assets in netlify.toml. */
export function securityHeaders(nonce: string, development = false): Record<string,string> {
  const headers: Record<string,string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
  if (!development) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://grok.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://grok.com https://*.grok.com",
      "frame-src 'self' https://grok.com https://*.grok.com",
      "frame-ancestors 'self' https://grok.com https://*.grok.com",
      "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    ].join('; ');
  }
  return headers;
}
