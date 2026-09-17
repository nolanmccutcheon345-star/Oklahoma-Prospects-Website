/** Applied to SSR/API responses and mirrored for static assets in netlify.toml. */
export function securityHeaders(nonce: string, development = false): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
  if (!development) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    headers["Content-Security-Policy"] = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://grok.com https://web.squarecdn.com https://sandbox.web.squarecdn.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com",
      "font-src 'self' https://fonts.gstatic.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://grok.com https://*.grok.com https://web.squarecdn.com https://sandbox.web.squarecdn.com https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://o160250.ingest.sentry.io",
      "frame-src 'self' https://grok.com https://*.grok.com https://web.squarecdn.com https://sandbox.web.squarecdn.com",
      "frame-ancestors 'self' https://grok.com https://*.grok.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
  }
  return headers;
}
