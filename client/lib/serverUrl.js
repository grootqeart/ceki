// Resolves the Socket.IO backend URL.
//
// Local/LAN hosts (localhost, 127.0.0.1, or a plain IPv4 like 192.168.x.x)
// ALWAYS talk to :4000 on that same host. This is deliberate: it means local
// and LAN play never depend on any tunnel being up -- creating a room from
// localhost keeps working even if a cloudflared tunnel has died.
//
// Only when the page itself is served from some other host (e.g. a public
// *.trycloudflare.com tunnel, where the frontend and backend live at different
// public hostnames) do we fall back to NEXT_PUBLIC_SERVER_URL, which should
// point at the backend's public URL.
export function getServerUrl() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalOrLan =
      host === 'localhost' || host === '127.0.0.1' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    if (isLocalOrLan) return `http://${host}:4000`;
  }
  return process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
}
