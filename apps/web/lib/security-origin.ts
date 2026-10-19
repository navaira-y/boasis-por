export function sameOriginSecurityRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  try {
    const parsed = new URL(origin);
    // Use the actual Host, never an arbitrary forwarded-host override. The
    // reverse proxy supplies the public protocol; Origin is mandatory.
    const host = request.headers.get('host') ?? new URL(request.url).host;
    const protocol =
      request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
    return parsed.origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}
