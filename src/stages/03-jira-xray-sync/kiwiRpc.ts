import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

/**
 * Minimal JSON-RPC client for Kiwi TCMS (endpoint `/json-rpc/`).
 *
 * Auth is Django session based: `Auth.login(username, password)` returns a
 * session id which every subsequent call sends back as a `sessionid` cookie.
 *
 * TLS is handled per-request via a scoped https.Agent — a self-signed local
 * Kiwi needs `tlsInsecure: true`, but that never leaks into the process-global
 * TLS settings (so Anthropic/Xray HTTPS calls stay fully verified).
 */
export class KiwiRpc {
  private sessionId?: string;
  private readonly rpcUrl: URL;
  private readonly agent: http.Agent | https.Agent;
  private readonly isHttps: boolean;
  private nextId = 0;

  constructor(
    baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    tlsInsecure: boolean,
  ) {
    this.rpcUrl = new URL('/json-rpc/', baseUrl.replace(/\/+$/, '') + '/');
    this.isHttps = this.rpcUrl.protocol === 'https:';
    this.agent = this.isHttps ? new https.Agent({ rejectUnauthorized: !tlsInsecure }) : new http.Agent();
  }

  async login(): Promise<void> {
    this.sessionId = String(await this.call('Auth.login', [this.username, this.password]));
  }

  async logout(): Promise<void> {
    if (this.sessionId) await this.call('Auth.logout', []).catch(() => {});
    this.sessionId = undefined;
  }

  /** Single JSON-RPC call. Throws on transport errors and on JSON-RPC `error` responses. */
  call<T = unknown>(method: string, params: unknown[]): Promise<T> {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: ++this.nextId });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
    };
    if (this.sessionId) headers['Cookie'] = `sessionid=${this.sessionId}`;

    const options: https.RequestOptions = {
      method: 'POST',
      hostname: this.rpcUrl.hostname,
      port: this.rpcUrl.port || (this.isHttps ? 443 : 80),
      path: this.rpcUrl.pathname,
      headers,
      agent: this.agent,
    };

    const transport = this.isHttps ? https : http;

    return new Promise<T>((resolve, reject) => {
      const req = transport.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsed: { result?: T; error?: { code: number; message: string } };
          try {
            parsed = JSON.parse(body);
          } catch {
            reject(new Error(`Kiwi ${method}: non-JSON response (HTTP ${res.statusCode}): ${body.slice(0, 200)}`));
            return;
          }
          if (parsed.error) {
            reject(new Error(`Kiwi ${method}: RPC error ${parsed.error.code} — ${parsed.error.message}`));
            return;
          }
          resolve(parsed.result as T);
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}
