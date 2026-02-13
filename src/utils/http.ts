import { RequestPacer } from "./pacer";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

type RequestOptions = {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
  resolvedUrl?: string;
};

export class HttpClient {
  private readonly pacer: RequestPacer;
  private readonly cookieJar: Map<string, string> = new Map();
  private readonly userAgent: string;

  constructor(pacer: RequestPacer, userAgent: string) {
    this.pacer = pacer;
    this.userAgent = userAgent;
  }

  clearCookies(): void {
    this.cookieJar.clear();
  }

  async request(options: RequestOptions): Promise<HttpResponse> {
    return this.pacer.run(async () => {
      const headers: Record<string, string> = {
        "User-Agent": this.userAgent,
        ...options.headers,
      };

      const cookieHeader = this.buildCookieHeader();
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }

      const response = await fetch(options.url, {
        method: options.method,
        headers,
        body: options.body,
        redirect: "manual",
      });

      this.captureCookies(response);

      const text = await response.text();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      return {
        status: response.status,
        headers: responseHeaders,
        text,
      };
    });
  }

  private captureCookies(response: Response): void {
    const cookies = this.getSetCookieValues(response);
    if (cookies.length === 0) {
      return;
    }

    for (const cookieString of cookies) {
      const parts = cookieString.split(";");
      const nameValue = parts[0] ?? "";
      const equalsIndex = nameValue.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }
      const name = nameValue.slice(0, equalsIndex).trim();
      const value = nameValue.slice(equalsIndex + 1).trim();
      if (name) {
        this.cookieJar.set(name, value);
      }
    }
  }

  private getSetCookieValues(response: Response): string[] {
    const header = response.headers.get("set-cookie");
    const headers = response.headers as unknown as {
      getSetCookie?: () => string[];
    };
    if (headers.getSetCookie) {
      return headers.getSetCookie();
    }
    if (!header) {
      return [];
    }
    return this.splitSetCookie(header);
  }

  private splitSetCookie(header: string): string[] {
    const cookies: string[] = [];
    let start = 0;
    let inExpires = false;

    for (let i = 0; i < header.length; i += 1) {
      const char = header[i];
      if (!inExpires && char === ",") {
        const cookie = header.slice(start, i).trim();
        if (cookie) {
          cookies.push(cookie);
        }
        start = i + 1;
        continue;
      }

      if (
        !inExpires &&
        header.substring(i, i + 8).toLowerCase() === "expires="
      ) {
        inExpires = true;
        i += 7;
        continue;
      }

      if (inExpires && char === ";") {
        inExpires = false;
      }
    }

    const lastCookie = header.slice(start).trim();
    if (lastCookie) {
      cookies.push(lastCookie);
    }

    return cookies;
  }

  async followRedirects(options: RequestOptions, maxRedirects = 10): Promise<HttpResponse> {
    let currentUrl = options.url;
    let currentMethod = options.method;

    for (let i = 0; i < maxRedirects; i++) {
      const response = await this.request({
        ...options,
        method: currentMethod,
        url: currentUrl,
        body: currentMethod === "GET" ? undefined : options.body,
      });

      if (response.status >= 300 && response.status < 400 && response.headers.location) {
        currentUrl = new URL(response.headers.location, currentUrl).toString();
        currentMethod = "GET";
        continue;
      }

      response.resolvedUrl = currentUrl;
      return response;
    }

    throw new Error(`Too many redirects (max ${maxRedirects}).`);
  }

  private buildCookieHeader(): string {
    const cookies: string[] = [];
    for (const [name, value] of this.cookieJar.entries()) {
      cookies.push(`${name}=${value}`);
    }
    return cookies.join("; ");
  }
}
