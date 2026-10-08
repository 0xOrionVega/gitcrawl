declare const __DEMO__: boolean;

/** Static demo build: bundled fixture dungeons + in-browser generation, no server. */
export const DEMO: boolean = __DEMO__;

/** API origin ('' = same origin). null = no API (demo / local CLI). */
export const API_BASE: string | null = DEMO ? null : ((import.meta.env.VITE_API_BASE as string | undefined) ?? '');

/** Public site used in share links and badges. */
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://gitcrawl.dev';

/** The site owner's X handle, credited on the landing page, in link previews and share posts. */
export const OWNER_X = '0xOrionVega';

export const DEBUG = /[?&]debug=1/.test(location.search) || /[?&]debug=1/.test(location.hash);

/** Running inside another page's frame (e.g. an embedded preview): no URL routing, no downloads. */
export const EMBEDDED: boolean = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
