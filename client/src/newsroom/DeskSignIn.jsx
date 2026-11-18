import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api, useApp, editionDate, setDeskSession } from '../lib.jsx';
import { RoleDirectory } from './RoleDesks.jsx';
import { Logo, Kicker, ErrorBox, PageTitle, Modal } from '../components/UI.jsx';
export default function DeskSignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [sessionIssue, setSessionIssue] = useState(false);
  const embedded = window.self !== window.top;
  const { user, refreshAuth } = useApp(),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false),
    [guide, setGuide] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSessionIssue(false);
    try {
      const login = (headers) => api('/auth/staff-login', { method: 'POST', body, headers });
      const body = Object.fromEntries(new FormData(e.currentTarget));
      setDeskSession(null);
      let signedIn = await login();
      let session = await refreshAuth();
      const confirmed = () =>
        Boolean(
          session?.user &&
          session.user.id === signedIn.user?.id &&
          session.user.roleId !== 'READER',
        );
      if (!confirmed() && embedded) {
        signedIn = await login({ 'x-meridian-session-mode': 'desk-preview' });
        if (signedIn.deskSession) {
          setDeskSession(signedIn.deskSession);
          session = await refreshAuth();
        }
      }
      if (!confirmed()) {
        setDeskSession(null);
        setSessionIssue(true);
        setError(
          embedded
            ? 'The preview could not start your session. Retry here or open the full-page CMS in this same tab.'
            : 'Your password was accepted, but we could not confirm your session. Make sure cookies are allowed for this site, then try again here.',
        );
        return;
      }
      if (!params.has('tab')) navigate('/newsroom?tab=roles', { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="staff-entry" id="main-content">
      <PageTitle title="Newsroom sign-in" />
      <section className="staff-cover">
        <div className="staff-cover-shade" />
        <Link to="/" aria-label="The Meridian front page">
          <Logo />
        </Link>
        <div className="staff-cover-copy">
          <Kicker light>The editorial workspace</Kicker>
          <h1>
            Behind the
            <br />
            front page.
          </h1>
          <p>
            From the first line to the published edition.
            <br />A workspace for The Meridian newsroom.
          </p>
        </div>
        <div className="staff-cover-foot">
          <span>INDIA EDITION</span>
          <span>{editionDate()}</span>
        </div>
      </section>
      <section className="staff-entry-form">
        <div className="staff-entry-top">
          <span>
            <i />
            STAFF ACCESS
          </span>
          <Link to="/">
            View newspaper <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="staff-form-inner">
          <div className="press-monogram">
            M<span>✦</span>
          </div>
          <Kicker>The Meridian newsroom</Kicker>
          <h2>Newsroom sign-in</h2>
          <p>Enter your staff credentials to open your editorial desk.</p>
          {user && (
            <div className="info-box">
              Your current account is a reader account. Use an authorised staff account below.
            </div>
          )}
          <form onSubmit={submit} className="form-stack">
            <label>
              Work email
              <input
                name="email"
                type="email"
                placeholder="name@publication.com"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={show ? 'text' : 'password'}
                  placeholder="Your newsroom password"
                  autoComplete="current-password"
                  required
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
            {sessionIssue && embedded && (
              <a className="btn full" href="/newsroom?tab=roles" target="_top">
                Open full-page CMS in this tab <ArrowRight size={16} />
              </a>
            )}
            <button className="btn dark full" disabled={busy}>
              {busy ? 'Opening your desk…' : sessionIssue ? 'Retry sign-in' : 'Enter the newsroom'}
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="staff-help">
            <ShieldCheck size={17} />
            <p>
              Access is assigned by your newsroom administrator. Reader memberships do not grant
              editorial permissions.
              <br />
              <button type="button" className="roles-help-button" onClick={() => setGuide(true)}>
                View newsroom roles <ArrowRight size={12} />
              </button>
            </p>
          </div>
        </div>
        <div className="staff-entry-bottom">
          <LockKeyhole size={12} />
          Protected editorial workspace<span>The Meridian</span>
        </div>
      </section>
      {guide && (
        <Modal
          wide
          title="Newsroom roles"
          className="desk-signin-guide"
          onClose={() => setGuide(false)}
        >
          <Kicker>Staff handbook</Kicker>
          <h2>Newsroom roles</h2>
          <p>
            Sign in with your staff account. Your assigned role determines which tools you can use.
          </p>
          <RoleDirectory />
          <button className="btn dark" onClick={() => setGuide(false)}>
            Back to sign-in <ArrowRight size={14} />
          </button>
        </Modal>
      )}
    </main>
  );
}
