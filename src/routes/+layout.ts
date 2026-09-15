/**
 * The app is client-rendered end to end.
 *
 * Every screen reads from IndexedDB and from the user's own OAuth session, both
 * of which exist only in the browser. There is nothing a server could usefully
 * render, and rendering on one would mean sending it data the PRD says never
 * leaves the browser.
 */
export const ssr = false;
