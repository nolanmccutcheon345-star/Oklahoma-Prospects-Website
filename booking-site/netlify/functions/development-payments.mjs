const UPSTREAM = 'https://6aa5d2ce06b9dd2c17b76a56--oklahoma-prospects-booking.netlify.app';
export default async (req) => {
  const incoming = new URL(req.url);
  const target = `${UPSTREAM}/.netlify/functions/development-payments${incoming.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  const init = { method: req.method, headers };
  if (!["GET", "HEAD"].includes(req.method)) init.body = await req.arrayBuffer();
  const res = await fetch(target, init);
  const body = await res.arrayBuffer();
  const out = new Headers(res.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(body, { status: res.status, headers: out });
};
