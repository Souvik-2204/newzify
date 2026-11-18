import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ShieldCheck,
  LockKeyhole,
  Minus,
  Plus,
  BookOpen,
  Bookmark,
  Clock3,
  UserRound,
  LayoutDashboard,
  CreditCard,
  LogOut,
} from 'lucide-react';
import { api, useApp, useLoad, titleCase, date, money } from '../lib.jsx';
import {
  Kicker,
  Modal,
  ErrorBox,
  PageTitle,
  Loading,
  Empty,
  CheckLine,
  StoryCard,
  SectionHead,
  Logo,
} from '../components/UI.jsx';
const faqs = [
  [
    'Can I read The Meridian for free?',
    'Yes. All stories marked “Free to read” are available without a subscription. A free reader account also lets you keep a personal reading list.',
  ],
  [
    'What is included in each membership?',
    'Bronze unlocks free and Bronze stories. Silver includes Bronze and Silver coverage. Gold includes every article in the current edition, including our Gold essays.',
  ],
  [
    'How does annual billing work?',
    'Annual membership is billed once for twelve months of access. The current total for your selected plan is shown before checkout.',
  ],
  [
    'Can I stop automatic renewal?',
    'Yes. Open your account, choose your current membership and select “Cancel renewal”. Your access continues until the end of the paid period.',
  ],
];
async function loadCheckout() {
  if (window.Razorpay) return;
  await new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = ok;
    s.onerror = () => no(new Error('Could not load secure checkout. Please try again.'));
    document.head.appendChild(s);
  });
}
export function Subscribe() {
  const { user, setAuth, refreshAuth, level, notify } = useApp();
  const [params] = useSearchParams(),
    { data, loading, error } = useLoad('/plans');
  const [billing, setBilling] = useState('monthly'),
    [chosen, choose] = useState(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState(''),
    [joined, setJoined] = useState(false),
    [faq, setFaq] = useState(-1);
  const navigate = useNavigate();
  const setPlan = (p) => {
    choose(p);
    setErr('');
    setJoined(false);
  };
  useEffect(() => {
    if (data && params.get('plan') && params.get('checkout') === '1')
      setPlan(data.plans.find((p) => p.level === params.get('plan')) || null);
  }, [data, params]);
  async function start() {
    if (!user) {
      const p = chosen.level;
      choose(null);
      setAuth({
        mode: 'register',
        next: `/subscribe?plan=${p}&checkout=1`,
        message: 'Create your reader account to begin your membership.',
      });
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await loadCheckout();
      const d = await api('/subscriptions', {
        method: 'POST',
        body: { planId: chosen.id, cycle: billing, expectedVersion: chosen.version },
      });
      const rp = new window.Razorpay({
        key: d.key,
        subscription_id: d.subscriptionId,
        name: 'The Meridian',
        description: chosen.name + ' · ' + billing + ' membership',
        prefill: { name: user.name, email: user.email },
        theme: { color: '#9a6046' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (result) => {
          try {
            const v = await api('/subscriptions/verify', { method: 'POST', body: result });
            await refreshAuth();
            notify(
              v.active
                ? 'Your membership is active.'
                : 'Payment verified. Activation is pending gateway confirmation.',
            );
            choose(null);
            navigate('/account');
          } catch (e) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      });
      rp.on('payment.failed', () => {
        setErr('The test payment was not completed. No access has been granted.');
        setBusy(false);
      });
      rp.open();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }
  async function interest(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/plan-interest', {
        method: 'POST',
        body: {
          email: new FormData(e.currentTarget).get('email'),
          level: chosen.level,
          cycle: billing,
        },
      });
      setJoined(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="inner-page membership-page" id="main-content">
      <PageTitle title="Membership" />
      <section className="membership-intro container">
        <Kicker>Meridian membership</Kicker>
        <h1>A deeper reading of India.</h1>
        <p>Independent perspectives. Thoughtful analysis. Choose your edition.</p>
        <div className="billing-toggle" aria-label="Billing interval">
          <button
            className={billing === 'monthly' ? 'active' : ''}
            onClick={() => setBilling('monthly')}
          >
            Monthly
          </button>
          <button
            className={billing === 'annual' ? 'active' : ''}
            onClick={() => setBilling('annual')}
          >
            Annual{' '}
            <span>
              {data?.plans.length && data.plans.every((p) => p.annualPaise === p.monthlyPaise * 10)
                ? '2 months on us'
                : 'Pay yearly'}
            </span>
          </button>
        </div>
      </section>
      <div className="container">
        <ErrorBox>{error}</ErrorBox>
        {loading ? (
          <Loading />
        ) : (
          <div className="plans-grid">
            {data?.plans.map((p) => {
              const i = ['BRONZE', 'SILVER', 'GOLD'].indexOf(p.level);
              return (
                <article key={p.id} className={'plan-card plan-' + p.level.toLowerCase()}>
                  <div className="plan-overline">
                    <span>MEMBERSHIP {['I', 'II', 'III'][i]}</span>
                    {i === 1 && <strong>EDITOR’S CHOICE</strong>}
                  </div>
                  <h2>{p.name}</h2>
                  <p className="plan-description">
                    {
                      [
                        'An essential place to begin.',
                        'A broader view of the story.',
                        'The complete Meridian edition.',
                      ][i]
                    }
                  </p>
                  <div className="plan-price">
                    {money(billing === 'annual' ? p.annualPaise : p.monthlyPaise)}
                    <span> / {billing === 'annual' ? 'year' : 'month'}</span>
                  </div>
                  <p className="price-note">
                    {billing === 'annual'
                      ? 'Twelve months, one annual payment.'
                      : 'Billed monthly. Cancel renewal anytime.'}
                  </p>
                  <div className="plan-rule" />
                  <ul>
                    {p.features.map((f) => (
                      <CheckLine key={f}>{f}</CheckLine>
                    ))}
                  </ul>
                  <button
                    className={'btn full ' + (i === 1 ? 'peach' : 'dark')}
                    onClick={() => setPlan(p)}
                  >
                    {level === p.level ? 'View your plan' : 'Choose ' + p.name}
                    <ArrowUpRight size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
        {data && !data.plans.length && (
          <Empty
            title="Enrolment is paused"
            text="No plans are currently open for new subscriptions. Existing members can manage their plan from their account."
          />
        )}
        <div className="checkout-note">
          <ShieldCheck size={14} />
          Secure subscriptions through Razorpay <i />
          Test mode
        </div>
        <section className="comparison">
          <SectionHead kicker="At a glance" title="Compare Memberships" />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Your reading access</th>
                  <th>Free</th>
                  <th>Bronze</th>
                  <th>Silver</th>
                  <th>Gold</th>
                </tr>
              </thead>
              <tbody>
                {[
                  'Free reporting',
                  'Bronze member stories',
                  'Silver analysis & explainers',
                  'Gold essays & perspectives',
                ].map((s, i) => (
                  <tr key={s}>
                    <td>{s}</td>
                    {[0, 1, 2, 3].map((n) => (
                      <td key={n}>
                        {n >= i ? (
                          <Check size={16} aria-label="Included" />
                        ) : (
                          <Minus size={13} aria-label="Not included" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="faq">
          <Kicker>Good to know</Kicker>
          <h2>Membership questions</h2>
          {faqs.map(([q, a], i) => (
            <div className="faq-item" key={q}>
              <button aria-expanded={faq === i} onClick={() => setFaq(faq === i ? -1 : i)}>
                {q}
                {faq === i ? <Minus size={17} /> : <Plus size={17} />}
              </button>
              {faq === i && <p>{a}</p>}
            </div>
          ))}
        </section>
      </div>
      {chosen && (
        <Modal title="Membership checkout" onClose={() => !busy && choose(null)}>
          <Kicker>{joined ? 'Preference saved' : 'Your membership'}</Kicker>
          <h2>{joined ? 'You’re on the list.' : chosen.name + ' edition'}</h2>
          {joined ? (
            <>
              <p className="muted">
                Your interest in the {chosen.name} {billing} plan has been saved. No payment has
                been taken and no subscription has been started.
              </p>
              <button className="btn dark full" onClick={() => choose(null)}>
                Continue reading
                <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <div className="order-summary">
                <span>{titleCase(billing)} membership</span>
                <strong>
                  {money(billing === 'annual' ? chosen.annualPaise : chosen.monthlyPaise)}
                </strong>
              </div>
              <ErrorBox>{err}</ErrorBox>
              {level === chosen.level ? (
                <Link to="/account" className="btn dark full">
                  Manage your membership <ArrowRight size={15} />
                </Link>
              ) : data.checkoutReady ? (
                <>
                  <p className="muted">
                    Continue to Razorpay test checkout. Your access begins only after your payment
                    has been verified.
                  </p>
                  <button className="btn dark full" disabled={busy} onClick={start}>
                    {busy
                      ? 'Opening secure checkout…'
                      : user
                        ? 'Continue to test checkout'
                        : 'Create account & continue'}
                    <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <>
                  <div className="info-box">
                    <strong>Test checkout is awaiting configuration.</strong>
                    <br />
                    The publisher hasn’t connected Razorpay test credentials yet. You can register
                    your interest without making a payment.
                  </div>
                  <form className="form-stack" onSubmit={interest}>
                    <label>
                      Email address
                      <input
                        required
                        name="email"
                        type="email"
                        defaultValue={user?.email || ''}
                        placeholder="you@example.com"
                      />
                    </label>
                    <button className="btn dark full" disabled={busy}>
                      {busy ? 'Saving…' : 'Register my interest'}
                      <ArrowRight size={15} />
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </main>
  );
}
export function SignInGate({ staff = false }) {
  const { setAuth, user } = useApp();
  return (
    <div className="gate">
      <Logo />
      <Kicker>{staff ? 'Editorial workspace' : 'Your reader account'}</Kicker>
      <h1>{staff ? 'The newsroom.' : 'Your reading room.'}</h1>
      <p>
        {staff
          ? user
            ? 'This area is reserved for editorial staff. Your reader account is ready to use.'
            : 'Sign in with your editorial account to manage stories and review the current edition.'
          : 'Sign in to manage your membership, profile and saved stories.'}
      </p>
      {staff && user ? (
        <Link className="btn dark" to="/account">
          Go to my account
          <ArrowRight size={15} />
        </Link>
      ) : (
        <button
          className="btn dark"
          onClick={() => setAuth({ mode: 'login', next: staff ? '/newsroom' : '/account' })}
        >
          Sign in {staff ? 'to the newsroom' : ''}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Account() {
  const { user, authReady, saved, refreshAuth, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview',
    [rev, rerun] = useState(0),
    [cancel, setCancel] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const {
    data,
    loading,
    error: loadError,
  } = useLoad(user ? '/account' : null, rev + '-' + saved.length);
  const curr = data?.subscriptions.find(
    (s) => s.status === 'ACTIVE' && new Date(s.periodEnd) > new Date(),
  );
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/account', {
        method: 'PATCH',
        body: Object.fromEntries(new FormData(e.currentTarget)),
      });
      await refreshAuth();
      rerun((c) => c + 1);
      notify('Your profile has been updated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    try {
      await api('/subscriptions/' + cancel.id + '/cancel', { method: 'POST' });
      setCancel(null);
      rerun((c) => c + 1);
      notify('Renewal cancelled. Your paid access continues until the end of the period.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="inner-page" id="main-content">
      <PageTitle title="Your account" />
      {!authReady ? (
        <Loading />
      ) : !user ? (
        <SignInGate />
      ) : (
        <div className="container account-page">
          <div className="account-title">
            <div>
              <Kicker>Reader dashboard</Kicker>
              <h1>Your reading room.</h1>
              <p>Welcome back, {user.name.split(' ')[0]}.</p>
            </div>
            {user.roleId !== 'READER' && (
              <Link to="/newsroom" className="btn outline">
                <LayoutDashboard size={15} />
                Open newsroom
              </Link>
            )}
          </div>
          <div className="dashboard-tabs">
            {[
              ['overview', 'Overview'],
              ['saved', 'Reading list'],
              ['history', 'Subscription history'],
              ['profile', 'Profile'],
            ].map(([id, text]) => (
              <button
                key={id}
                className={tab === id ? 'active' : ''}
                onClick={() => {
                  setParams({ tab: id });
                  setError('');
                }}
              >
                {text}
                {id === 'saved' && <span>{saved.length}</span>}
              </button>
            ))}
          </div>
          <ErrorBox>{loadError || error}</ErrorBox>
          {loading ? (
            <Loading />
          ) : (
            data && (
              <>
                {tab === 'overview' ? (
                  <>
                    <div className="account-overview">
                      <div className="membership-ticket">
                        <Kicker light>Current membership</Kicker>
                        <h2>{titleCase(data.level)} edition</h2>
                        <p>
                          {curr
                            ? (curr.cancelAtEnd
                                ? 'Renewal is off. Access ends '
                                : 'Next renewal: ') + date(curr.periodEnd)
                            : 'Free reporting, a personal reading list, and a place in the edition.'}
                        </p>
                        {curr ? (
                          <button
                            className="text-link"
                            disabled={curr.cancelAtEnd}
                            onClick={() => setCancel(curr)}
                          >
                            {curr.cancelAtEnd ? 'Renewal cancelled' : 'Cancel renewal'}
                          </button>
                        ) : (
                          <Link className="text-link" to="/subscribe">
                            Explore membership
                            <ArrowUpRight size={14} />
                          </Link>
                        )}
                      </div>
                      <div className="account-details">
                        <span className="small-label">Reader details</span>
                        <dl>
                          <div>
                            <dt>Name</dt>
                            <dd>{user.name}</dd>
                          </div>
                          <div>
                            <dt>Email</dt>
                            <dd>{user.email}</dd>
                          </div>
                          <div>
                            <dt>Status</dt>
                            <dd>{curr ? 'Active subscriber' : 'Free reader'}</dd>
                          </div>
                          <div>
                            <dt>Member since</dt>
                            <dd>{date(user.createdAt)}</dd>
                          </div>
                        </dl>
                        <button className="text-link" onClick={() => setParams({ tab: 'profile' })}>
                          Edit profile
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                    <SectionHead kicker="Keep for later" title="Your Reading List" />
                    {data.saved.length ? (
                      <div className="three-grid">
                        {data.saved.slice(0, 3).map((a) => (
                          <StoryCard key={a.id} article={a} />
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="Your reading list starts here"
                        text="Use the bookmark on any story to save it for a quieter moment."
                      >
                        <Link to="/latest" className="btn outline">
                          Explore the edition <ArrowRight size={14} />
                        </Link>
                      </Empty>
                    )}
                  </>
                ) : tab === 'saved' ? (
                  <>
                    <SectionHead title="Saved Stories" />
                    {data.saved.length ? (
                      <div className="three-grid">
                        {data.saved.map((a) => (
                          <StoryCard key={a.id} article={a} />
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title="No saved stories yet"
                        text="Bookmark a story from the current edition to find it here."
                      >
                        <Link to="/latest" className="btn dark">
                          Browse stories <ArrowRight size={14} />
                        </Link>
                      </Empty>
                    )}
                  </>
                ) : tab === 'history' ? (
                  <>
                    <SectionHead title="Subscription History" />
                    {data.subscriptions.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Membership</th>
                              <th>Billing</th>
                              <th>Status</th>
                              <th>Period ends</th>
                              <th>Payments</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.subscriptions.map((s) => (
                              <tr key={s.id}>
                                <td>{s.plan.name}</td>
                                <td>{titleCase(s.cycle)}</td>
                                <td>
                                  {titleCase(s.status)}
                                  {s.cancelAtEnd ? ' · renewal off' : ''}
                                </td>
                                <td>{s.periodEnd ? date(s.periodEnd) : 'Awaiting activation'}</td>
                                <td>
                                  {s.payments.length
                                    ? s.payments.map((p) => (
                                        <div key={p.id}>
                                          {money(p.amountPaise)} · {date(p.createdAt)}
                                        </div>
                                      ))
                                    : 'None yet'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        title="No subscriptions yet"
                        text="Your subscriptions and verified payments will appear here."
                      >
                        <Link to="/subscribe" className="btn outline">
                          Compare plans
                          <ArrowRight size={14} />
                        </Link>
                      </Empty>
                    )}
                  </>
                ) : (
                  <div className="profile-form">
                    <Kicker>Your details</Kicker>
                    <h2>Reader profile</h2>
                    <form className="form-stack" onSubmit={save}>
                      <label>
                        Display name
                        <input
                          name="name"
                          defaultValue={user.name}
                          required
                          minLength={2}
                          maxLength={70}
                        />
                      </label>
                      <label>
                        Email address
                        <input value={user.email} disabled />
                        <small>Your email is used to secure your account.</small>
                      </label>
                      <label>
                        About you
                        <textarea
                          name="bio"
                          defaultValue={user.bio}
                          maxLength={300}
                          rows={3}
                          placeholder="A short introduction"
                        />
                      </label>
                      <button className="btn dark" disabled={busy}>
                        {busy ? 'Saving…' : 'Save profile'}
                        <Check size={15} />
                      </button>
                    </form>
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
      {cancel && (
        <Modal title="Cancel renewal" onClose={() => setCancel(null)}>
          <Kicker>Membership settings</Kicker>
          <h2>Stop automatic renewal?</h2>
          <p>
            Your {cancel.plan.name} membership remains available until {date(cancel.periodEnd)}. No
            further renewals will be scheduled.
          </p>
          <div className="dialog-actions">
            <button className="btn outline" onClick={() => setCancel(null)}>
              Keep renewal
            </button>
            <button className="btn dark" onClick={stop} disabled={busy}>
              Cancel renewal
            </button>
          </div>
          <ErrorBox>{error}</ErrorBox>
        </Modal>
      )}
    </main>
  );
}
