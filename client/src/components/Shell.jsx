import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  Search,
  UserRound,
  ArrowUpRight,
  ArrowRight,
  Mail,
  Check,
  Eye,
  EyeOff,
  LogOut,
  Bookmark,
  LayoutDashboard,
  ChevronRight,
  Globe2,
} from 'lucide-react';
import { Logo, Kicker, Modal, ErrorBox, Empty, Loading } from './UI.jsx';
import { api, useApp, useLoad, editionDate } from '../lib.jsx';
const initialSections = ['Politics', 'Business', 'Technology', 'World', 'Sports', 'Opinion'];
export function Header() {
  const { user, edition, setAuth, setSearch, notify, refreshAuth } = useApp();
  const { pathname } = useLocation(),
    navigate = useNavigate();
  const [scrolled, scroll] = useState(window.scrollY > 30),
    [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState(false);
  const profileRef = useRef();
  useEffect(() => {
    const go = () => scroll(window.scrollY > 30);
    window.addEventListener('scroll', go, { passive: true });
    go();
    return () => window.removeEventListener('scroll', go);
  }, []);
  useEffect(() => {
    setMobile(false);
    setProfile(false);
  }, [pathname]);
  useEffect(() => {
    const close = (e) => {
      if (!profileRef.current?.contains(e.target)) setProfile(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === 'Escape') {
        setMobile(false);
        setProfile(false);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setSearch]);
  const sections =
    edition?.categories || initialSections.map((n) => ({ name: n, slug: n.toLowerCase() }));
  const solid = pathname !== '/' || scrolled || mobile;
  return (
    <header className={'site-header ' + (solid ? 'solid' : 'transparent')}>
      <div className="nav-wrap">
        <Link to="/" className="brand-link" aria-label="The Meridian home">
          <Logo />
        </Link>
        <span className="nav-divider" />
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavLink to="/" end>
            Home
          </NavLink>
          {sections.slice(0, 6).map((c) => (
            <NavLink key={c.slug} to={'/section/' + c.slug}>
              {c.name}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          <button
            className="icon-button search-trigger"
            onClick={() => setSearch(true)}
            aria-label="Search stories"
          >
            <Search size={20} strokeWidth={1.6} />
          </button>
          <Link className="subscribe-nav" to="/subscribe">
            Subscribe <ArrowUpRight size={14} />
          </Link>
          <div className="profile-wrap" ref={profileRef}>
            <button
              className="icon-button account-trigger"
              aria-label={user ? 'Open account menu' : 'Sign in or register'}
              aria-expanded={profile}
              onClick={() => (user ? setProfile(!profile) : setAuth({ mode: 'login' }))}
            >
              <UserRound size={20} strokeWidth={1.5} />
              {user && <i />}
            </button>
            {profile && (
              <div className="profile-menu">
                <small>SIGNED IN AS</small>
                <strong>{user.name}</strong>
                <Link to="/account">
                  <UserRound size={15} />
                  My account
                </Link>
                <Link to="/account?tab=saved">
                  <Bookmark size={15} />
                  Reading list
                </Link>
                {user.roleId !== 'READER' && (
                  <Link to="/newsroom">
                    <LayoutDashboard size={15} />
                    Newsroom CMS
                  </Link>
                )}
                <button
                  onClick={async () => {
                    await api('/auth/logout', { method: 'POST' });
                    await refreshAuth();
                    setProfile(false);
                    navigate('/');
                    notify('You have signed out.');
                  }}
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </div>
            )}
          </div>
          <button
            className="icon-button hamburger"
            aria-label={mobile ? 'Close menu' : 'Open menu'}
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {mobile && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Kicker>The Indian edition</Kicker>
          <NavLink to="/" end>
            Front page
            <ArrowUpRight />
          </NavLink>
          {sections.map((c) => (
            <NavLink key={c.slug} to={'/section/' + c.slug}>
              {c.name}
              <ArrowUpRight />
            </NavLink>
          ))}
          <button
            onClick={() => {
              setMobile(false);
              setSearch(true);
            }}
          >
            <Search size={17} />
            Search the edition
          </button>
          <button
            onClick={() => {
              setMobile(false);
              user ? navigate('/account') : setAuth({ mode: 'login' });
            }}
          >
            <UserRound size={17} />
            {user ? 'My account' : 'Sign in / Create account'}
          </button>
          <span>{editionDate()}</span>
        </nav>
      )}
    </header>
  );
}
export function Footer() {
  const { edition } = useApp();
  const [email, setEmail] = useState(''),
    [done, setDone] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/newsletter', { method: 'POST', body: { email } });
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <footer>
      <section className="newsletter">
        <div className="container newsletter-inner">
          <div>
            <Kicker>The Meridian briefing</Kicker>
            <h2>A more considered inbox.</h2>
            <p>Join the reader list for our India briefing.</p>
          </div>
          {done ? (
            <div className="newsletter-success">
              <Check size={23} />
              <div>
                <strong>You’re on the list.</strong>
                <span>Your briefing preference has been saved.</span>
              </div>
            </div>
          ) : (
            <form onSubmit={join}>
              <label className="sr-only" htmlFor="newsletter-email">
                Your email address
              </label>
              <div className="newsletter-field">
                <Mail size={18} />
                <input
                  id="newsletter-email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email address"
                />
                <button aria-label="Join the briefing" disabled={busy}>
                  <ArrowRight size={20} />
                </button>
              </div>
              <small>
                By joining, you agree to our <Link to="/about/privacy">privacy policy</Link>.
              </small>
              <ErrorBox>{error}</ErrorBox>
            </form>
          )}
        </div>
      </section>
      <div className="footer-base">
        <div className="container">
          <div className="footer-top">
            <Link to="/" aria-label="The Meridian home">
              <Logo />
            </Link>
            <span>Independent perspectives. An Indian lens.</span>
          </div>
          <div className="footer-nav">
            <nav>
              {(edition?.categories || []).map((c) => (
                <Link key={c.id} to={'/section/' + c.slug}>
                  {c.name}
                </Link>
              ))}
            </nav>
            <Link to="/subscribe" className="text-link">
              Become a subscriber <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} The Meridian</span>
            <div>
              <Link to="/about/standards">Editorial standards</Link>
              <Link to="/about/privacy">Privacy</Link>
              <Link to="/cms">
                Newsroom access <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
export function AuthModal() {
  const { auth, setAuth, refreshAuth, notify } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState(auth?.mode || 'login'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [show, setShow] = useState(false);
  const register = mode === 'register';
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const d = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api('/auth/' + (register ? 'register' : 'login'), { method: 'POST', body: d });
      await refreshAuth();
      notify(
        register
          ? 'Welcome to The Meridian. Your account is ready.'
          : 'Welcome back to The Meridian.',
      );
      setAuth(null);
      if (auth.next) navigate(auth.next);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={register ? 'Create an account' : 'Sign in'}
      onClose={() => setAuth(null)}
      className="auth-modal"
    >
      <Logo />
      <div className="auth-rule" />
      <Kicker>Reader membership</Kicker>
      <h2>{register ? 'A place in the edition.' : 'Welcome back.'}</h2>
      <p className="muted">
        {auth.message ||
          (register
            ? 'Create your free account to save stories and choose a membership.'
            : 'Sign in to your account and pick up where you left off.')}
      </p>
      <form className="form-stack" onSubmit={submit}>
        {register && (
          <label>
            Full name
            <input
              name="name"
              required
              minLength={2}
              maxLength={70}
              autoComplete="name"
              placeholder="Your name"
            />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            required
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <div className="password-field">
            <input
              name="password"
              required
              minLength={register ? 10 : 1}
              maxLength={72}
              type={show ? 'text' : 'password'}
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder={register ? 'At least 10 characters' : 'Enter your password'}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => setShow(!show)}
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn dark full" disabled={busy}>
          {busy ? 'Please wait…' : register ? 'Create free account' : 'Sign in'}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="auth-switch">
        {register ? 'Already a reader?' : 'New to The Meridian?'}{' '}
        <button
          onClick={() => {
            setMode(register ? 'login' : 'register');
            setError('');
          }}
        >
          {register ? 'Sign in' : 'Create an account'}
        </button>
      </div>
    </Modal>
  );
}
export function SearchModal() {
  const { setSearch, edition } = useApp();
  const [q, setQ] = useState(''),
    [query, debounce] = useState('');
  useEffect(() => {
    const t = setTimeout(() => debounce(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error } = useLoad('/articles?q=' + encodeURIComponent(query));
  const navigate = useNavigate();
  const go = (path) => {
    setSearch(false);
    navigate(path);
  };
  return (
    <Modal
      title="Search The Meridian"
      onClose={() => setSearch(false)}
      wide
      className="search-modal"
    >
      <Kicker>The Meridian index</Kicker>
      <h2>Search the edition</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go('/latest?q=' + encodeURIComponent(q));
        }}
        className="search-big"
      >
        <Search size={24} />
        <input
          aria-label="Search headlines, topics and stories"
          placeholder="Headlines, topics, and stories…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <button aria-label="Show all search results">
          <ArrowRight size={19} />
        </button>
      </form>
      <div className="small-label">{query ? 'Search results' : 'From the latest edition'}</div>
      <ErrorBox>{error}</ErrorBox>
      {loading ? (
        <Loading label="Searching…" />
      ) : data?.articles?.length ? (
        <div className="search-results">
          {data.articles.slice(0, 5).map((a) => (
            <button key={a.id} onClick={() => go('/story/' + a.slug)}>
              <img src={a.image} alt="" />
              <span>
                <small>{a.category.name}</small>
                <strong>{a.title}</strong>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty
          title="No matching stories"
          text="Try a different keyword or browse a section below."
        />
      )}
      <div className="search-cats">
        {edition?.categories.map((c) => (
          <button key={c.id} onClick={() => go('/section/' + c.slug)}>
            {c.name}
            <ChevronRight size={11} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
