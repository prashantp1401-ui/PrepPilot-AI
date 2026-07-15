/**************************************************************************
 * PrepPilot AI — API layer
 * Talks to the Google Apps Script Web App deployed from apps-script/Code.gs
 **************************************************************************/

// 👇 PASTE your deployed Apps Script Web App URL here (ends in /exec)
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzYMsJCNCPxLnuYsUlJU1VOpoZXfXcbj48Nls5kbzeMAcvrmzhL24F40PqqlQM4w_tu/exec';

const Api = {
  /**
   * Reads use GET with query params (fast, cacheable, no CORS preflight).
   */
  async get(action, params = {}) {
    const url = new URL(API_BASE_URL);
    url.searchParams.set('action', action);
    Object.keys(params).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
    });
    const res = await fetch(url.toString(), { method: 'GET' });
    return res.json();
  },

  /**
   * Writes use POST. Content-Type is deliberately 'text/plain' — Apps Script
   * web apps don't support the OPTIONS preflight that 'application/json'
   * would trigger, so this avoids CORS errors entirely.
   */
  async post(action, body = {}) {
    const res = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body })
    });
    return res.json();
  }
};
