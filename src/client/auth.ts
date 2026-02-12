import type { Logger } from "homebridge";

import type { HttpClient } from "../utils/http";

const BASE_URL = "https://melcloudhome.com";
const LOGIN_PATH = "/bff/login?returnUrl=/dashboard";

const CSRF_REGEX = /name="_csrf"\s+value="([^"]+)"/i;
const FORM_ACTION_REGEX = /<form[^>]+action="([^"]+)"/i;

const decodeHtmlEntities = (html: string): string =>
  html.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const encodeForm = (values: Record<string, string>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    params.set(key, value);
  }
  return params.toString();
};

export class MelCloudAuth {
  private readonly log: Logger;
  private readonly http: HttpClient;

  constructor(log: Logger, http: HttpClient) {
    this.log = log;
    this.http = http;
  }

  async login(email: string, password: string): Promise<void> {
    const loginPage = await this.fetchLoginPage();
    await this.submitCredentials(loginPage, email, password);
    await this.validateSession();
  }

  // Follow the full redirect chain from /bff/login to the actual login form
  private async fetchLoginPage(): Promise<{ url: string; html: string }> {
    const response = await this.http.followRedirects({
      method: "GET",
      url: `${BASE_URL}${LOGIN_PATH}`,
      headers: { Accept: "text/html" },
    });

    this.log.debug("Login page resolved to status %s (%s chars).", response.status, response.text.length);

    if (response.status !== 200 || !response.text) {
      throw new Error(`Login page returned unexpected status: ${response.status}`);
    }

    return {
      url: response.resolvedUrl ?? `${BASE_URL}${LOGIN_PATH}`,
      html: response.text,
    };
  }

  private async submitCredentials(
    loginPage: { url: string; html: string },
    email: string,
    password: string,
  ): Promise<void> {
    const loginPageUrl = loginPage.url;
    const csrfMatch = loginPage.html.match(CSRF_REGEX);
    const actionMatch = loginPage.html.match(FORM_ACTION_REGEX);

    if (!csrfMatch || !actionMatch) {
      this.log.warn("Unable to extract login form. Page snippet: %s", loginPage.html.slice(0, 500));
      throw new Error("Unable to extract login form details.");
    }

    const csrfToken = csrfMatch[1];
    const actionUrl = new URL(decodeHtmlEntities(actionMatch[1]), loginPageUrl).toString();

    this.log.debug("Submitting credentials to %s", actionUrl);

    const body = encodeForm({
      _csrf: csrfToken,
      username: email,
      password,
    });

    const submitResponse = await this.http.request({
      method: "POST",
      url: actionUrl,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
        Origin: new URL(loginPageUrl).origin,
        Referer: loginPageUrl,
      },
      body,
    });

    // Follow the callback redirect chain back to the app
    if (submitResponse.status >= 300 && submitResponse.status < 400) {
      const callback = submitResponse.headers.location;
      if (callback) {
        const callbackUrl = new URL(callback, actionUrl).toString();
        await this.http.followRedirects({
          method: "GET",
          url: callbackUrl,
          headers: { Accept: "text/html" },
        });
      }
    } else if (submitResponse.status !== 200) {
      this.log.warn("Login POST returned status %s.", submitResponse.status);
    }
  }

  private async validateSession(): Promise<void> {
    const response = await this.http.request({
      method: "GET",
      url: `${BASE_URL}/api/user/context`,
      headers: {
        Accept: "application/json",
        "x-csrf": "1",
        Referer: `${BASE_URL}/dashboard`,
      },
    });

    if (response.status === 401) {
      throw new Error("MELCloud login failed (unauthorized).");
    }

    this.log.info("MELCloud session validated successfully.");
  }
}
