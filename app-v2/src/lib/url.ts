// Small URL helpers shared by the embed-link feature.

/** Normalize user input into a fully-qualified URL (adds https:// if missing). */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  return 'https://' + s;
}

/** Pretty hostname for display ("youtube.com"), falling back to the raw string. */
export function hostOf(raw: string): string {
  if (!raw) return '';
  try {
    return new URL(normalizeUrl(raw)).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

/** Rewrite known URLs to their embeddable form (YouTube → /embed/…). */
export function embedUrl(raw: string): string {
  const url = normalizeUrl(raw);
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (host === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
  } catch {
    /* fall through */
  }
  return url;
}
