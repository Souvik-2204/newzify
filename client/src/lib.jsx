import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
// Kept only in this tab's JavaScript memory, never in browser storage or a URL.
let deskSession = null;
export const setDeskSession = (token) => {
  deskSession = token || null;
};
export async function api(path, options = {}) {
  const opts = {
    ...options,
    credentials: 'same-origin',
    headers: { 'x-meridian-request': '1', ...options.headers },
  };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  if (deskSession && (path.startsWith('/admin/') || path === '/auth/me' || path === '/auth/logout'))
    opts.headers['x-meridian-desk-session'] = deskSession;
  const r = await fetch('/api' + path, opts);
  if (path === '/auth/logout' && r.ok) setDeskSession(null);
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error('The newsroom could not be reached. Please try again.');
  }
  if (!r.ok)
    throw Object.assign(new Error(data.error || 'The request could not be completed.'), {
      status: r.status,
      code: data.code,
    });
  return data;
}
export const date = (s, long = false) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: long ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(s));
export const shortDate = (s) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(s));
export const editionDate = () =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
export const titleCase = (s) =>
  s
    ? s
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    : '';
export const money = (p) => '₹' + (p / 100).toLocaleString('en-IN');
export const roles = ['READER', 'AUTHOR', 'SECTION_EDITOR', 'CHIEF_EDITOR', 'SUPER_ADMIN'];
export const statuses = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'];
export const rank = { FREE: 0, BRONZE: 1, SILVER: 2, GOLD: 3 };
export function useLoad(path, key = 0) {
  const [result, set] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let live = true;
    const ctl = new AbortController();
    if (!path) {
      set({ data: null, loading: false, error: '' });
      return;
    }
    set((v) => ({ ...v, loading: true, error: '' }));
    api(path, { signal: ctl.signal })
      .then((data) => live && set({ data, loading: false, error: '' }))
      .catch(
        (e) =>
          live && e.name !== 'AbortError' && set({ data: null, loading: false, error: e.message }),
      );
    return () => {
      live = false;
      ctl.abort();
    };
  }, [path, key]);
  return result;
}
const Context = createContext(null);
export const useApp = () => useContext(Context);
export function Provider({ children }) {
  const [user, setUser] = useState(null),
    [level, setLevel] = useState('FREE'),
    [saved, setSaved] = useState([]),
    [authReady, setReady] = useState(false),
    [auth, setAuth] = useState(null),
    [search, setSearch] = useState(false),
    [toast, setToast] = useState(''),
    [revision, setRevision] = useState(0);
  const timer = useRef();
  const edition = useLoad('/edition', revision);
  const refreshEdition = () => setRevision((n) => n + 1);
  useEffect(() => {
    let last = Date.now();
    const fresh = () => {
      if (!document.hidden && Date.now() - last > 240000) {
        setRevision((n) => n + 1);
        last = Date.now();
      }
    };
    const tick = setInterval(fresh, 300000);
    document.addEventListener('visibilitychange', fresh);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', fresh);
    };
  }, []);
  const refreshAuth = useCallback(async () => {
    try {
      const d = await api('/auth/me');
      setUser(d.user);
      setLevel(d.level);
      setSaved(d.saved);
      return d;
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);
  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 4200);
  }, []);
  async function bookmark(id) {
    if (!user) {
      setAuth({ mode: 'login', message: 'Sign in to save stories to your reading list.' });
      return;
    }
    const next = !saved.includes(id);
    try {
      await api('/bookmarks/' + id, { method: 'PUT', body: { saved: next } });
      setSaved((prev) => (next ? [...new Set([...prev, id])] : prev.filter((s) => s !== id)));
      notify(next ? 'Story saved to your reading list.' : 'Story removed from your reading list.');
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <Context.Provider
      value={{
        user,
        level,
        saved,
        authReady,
        refreshAuth,
        auth,
        setAuth,
        search,
        setSearch,
        toast,
        notify,
        edition: edition.data,
        editionError: edition.error,
        refreshEdition,
        bookmark,
      }}
    >
      {children}
    </Context.Provider>
  );
}
