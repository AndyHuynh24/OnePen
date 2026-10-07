type Theme = 'light' | 'dark';

const STORAGE_KEY = 'onepen.theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let _current = $state<Theme>(readInitial());

export const theme = {
  get current() {
    return _current;
  },
  set(next: Theme) {
    _current = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
  },
  toggle() {
    this.set(_current === 'dark' ? 'light' : 'dark');
  },
};
