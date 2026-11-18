import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Tags,
  Users,
  CreditCard,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  Pencil,
  Trash2,
  Check,
  X,
  Upload,
  Image as ImageIcon,
  Eye,
  Clock3,
  Menu,
  LogOut,
  Layers3,
  CalendarDays,
  Newspaper,
  BookOpen,
  ShieldCheck,
  Save as SaveIcon,
  LayoutTemplate,
  Settings2,
  BadgeIndianRupee,
} from 'lucide-react';
import {
  api,
  useApp,
  useLoad,
  date,
  shortDate,
  editionDate,
  titleCase,
  roles,
  statuses,
  money,
} from '../lib.jsx';
import { Logo, Kicker, Empty, Loading, ErrorBox, Modal, PageTitle } from '../components/UI.jsx';
import { Header } from '../components/Shell.jsx';
import { SignInGate } from './Membership.jsx';
import DeskSignIn from '../newsroom/DeskSignIn.jsx';
import Directory from '../newsroom/People.jsx';
import RoleDesks, { MyDeskBar } from '../newsroom/RoleDesks.jsx';
import ArticleManager from '../newsroom/ArticleManager.jsx';
import StoryStudio from '../newsroom/StoryStudio.jsx';
import { FrontPage, PlanManager, WorkspaceSettings } from '../newsroom/Controls.jsx';
import '../styles/workspace.css';
const senior = (u) => ['SUPER_ADMIN', 'CHIEF_EDITOR'].includes(u?.roleId);
const statusText = (s) => (s === 'IN_REVIEW' ? 'Submitted' : titleCase(s));
const Pill = ({ status }) => (
  <span className={'status-pill ' + status.toLowerCase()}>
    <i />
    {statusText(status)}
  </span>
);
export default function Newsroom() {
  const { user, authReady, refreshAuth, refreshEdition, notify, edition } = useApp();
  const lead = edition?.articles.find((a) => a.heroSlot === 1);
  const [params, setParams] = useSearchParams(),
    tab = params.get('tab') || 'overview',
    id = params.get('id');
  const [rev, bump] = useState(0),
    [mobile, setMobile] = useState(false);
  const [unsaved, setUnsaved] = useState(false),
    [leaving, setLeaving] = useState(null);
  const { data, loading, error } = useLoad(
    user && user.roleId !== 'READER' ? '/admin/overview' : null,
    rev,
  );
  const navigate = useNavigate();
  const change = (tab, id, force = false) => {
    const destination = typeof tab === 'string' ? { tab, ...(id ? { id } : {}) } : tab;
    if (unsaved && !force) {
      setLeaving(destination);
      return;
    }
    setUnsaved(false);
    setParams(destination);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const reload = () => {
    bump((n) => n + 1);
    refreshEdition();
  };
  const nav = [
    ['overview', 'Overview', LayoutDashboard],
    ['roles', 'Roles & access', ShieldCheck],
    ['articles', 'Article manager', FileText],
    ['review', 'Review queue', ClipboardCheck],
    ...(senior(user) ? [['front-page', 'Front page', LayoutTemplate]] : []),
    ...(user?.roleId === 'SUPER_ADMIN'
      ? [
          ['taxonomy', 'Sections & tags', Tags],
          ['users', 'Reader directory', Users],
          ['memberships', 'Subscriptions', CreditCard],
          ['plans', 'Membership plans', BadgeIndianRupee],
          ['settings', 'Workspace settings', Settings2],
        ]
      : []),
  ];
  if (!authReady) return <Loading />;
  if (!user || user.roleId === 'READER') return <DeskSignIn />;
  return (
    <main className="cms" id="main-content">
      <PageTitle title={tab === 'roles' ? 'Roles & access' : 'Newsroom workspace'} />
      <aside className={'cms-sidebar ' + (mobile ? 'open' : '')}>
        <div className="cms-brand">
          <Link to="/">
            <Logo />
          </Link>
          <span>EDITORIAL WORKSPACE</span>
        </div>
        <nav aria-label="Newsroom navigation">
          {nav.map(([v, n, Icon]) => (
            <button
              key={v}
              className={tab === v || (v === 'articles' && tab === 'edit') ? 'active' : ''}
              onClick={() => change(v)}
            >
              <Icon size={16} />
              {n}
              {v === 'review' && data?.counts.IN_REVIEW > 0 && <b>{data.counts.IN_REVIEW}</b>}
            </button>
          ))}
        </nav>
        <div className="cms-side-bottom">
          <Link to="/">
            View newspaper
            <ArrowUpRight size={15} />
          </Link>
          <button
            onClick={async () => {
              await api('/auth/logout', { method: 'POST' });
              await refreshAuth();
              navigate('/');
              notify('Signed out of the newsroom.');
            }}
          >
            Sign out
            <LogOut size={14} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="cms-mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="cms-workspace">
        <header className="cms-topbar">
          <button
            className="icon-button cms-menu"
            aria-label="Toggle newsroom navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <span>
            <span className="live-dot" />
            Newsroom online
          </span>
          <span className="cms-date">{editionDate()}</span>
          <div className="cms-person">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role.name}</small>
            </div>
          </div>
        </header>
        <div className="cms-content">
          {!data && error ? (
            <Empty title="Could not open the newsroom" text={error}>
              <button className="btn dark" onClick={() => bump((n) => n + 1)}>
                Try again
              </button>
            </Empty>
          ) : !data ? (
            <Loading label="Opening your newsroom…" />
          ) : tab === 'overview' ? (
            <>
              <div className="cms-title">
                <div>
                  <Kicker>Desk overview</Kicker>
                  <h1>The Newsroom</h1>
                  <p>Your edition, from first draft to front page.</p>
                </div>
                <button className="btn dark" onClick={() => change('edit')}>
                  <Plus size={15} />
                  New story
                </button>
              </div>
              <MyDeskBar user={user} open={() => change('roles')} />
              {data.settings.deskNote && (
                <div className="desk-message">
                  <FileText size={16} />
                  <span>
                    <b>Desk notice</b> {data.settings.deskNote}
                  </span>
                </div>
              )}
              <div className="stat-grid">
                {[
                  [data.liveCount || 0, 'Live in this edition', Newspaper],
                  [data.counts.IN_REVIEW || 0, 'Awaiting review', ClipboardCheck],
                  [data.counts.DRAFT || 0, 'Working drafts', FileText],
                  [data.views, 'Story reads', Eye],
                ].map(([v, n, Icon]) => (
                  <div key={n}>
                    <Icon size={18} />
                    <strong>{v}</strong>
                    <span>{n}</span>
                  </div>
                ))}
              </div>
              {lead && (
                <div className="overview-edition">
                  <div className="overview-photo">
                    <img
                      src={
                        lead.slug === 'rural-jobs-accountability' && lead.revision === 1
                          ? '/images/hero-india.jpg'
                          : lead.image
                      }
                      alt={lead.title}
                    />
                    <span>THE LIVE EDITION</span>
                  </div>
                  <div>
                    <Kicker>On the front page</Kicker>
                    <h2>{lead.title}</h2>
                    <p>
                      {lead.category.name} <i /> {date(lead.sourceDate)}
                    </p>
                  </div>
                  {senior(user) ? (
                    <button className="text-link" onClick={() => change('front-page')}>
                      Curate the edition
                      <ArrowUpRight size={13} />
                    </button>
                  ) : (
                    <Link className="text-link" to={'/story/' + lead.slug}>
                      Read story
                      <ArrowUpRight size={13} />
                    </Link>
                  )}
                </div>
              )}
              <div className="cms-two-col">
                <section className="cms-panel">
                  <div className="panel-header">
                    <h2>Editorial activity</h2>
                    <Clock3 size={16} />
                  </div>
                  <div className="activity-list">
                    {data.recent.length ? (
                      data.recent.map((r) => (
                        <div key={r.id}>
                          <i />
                          <section>
                            <small>
                              {r.actor.name} · {shortDate(r.createdAt)}
                            </small>
                            <p>
                              <b>{titleCase(r.action)}</b> · {r.article.title}
                            </p>
                          </section>
                        </div>
                      ))
                    ) : (
                      <p className="muted">No editorial actions yet.</p>
                    )}
                  </div>
                </section>
                <section className="cms-panel">
                  <div className="panel-header">
                    <h2>Edition pipeline</h2>
                    <Layers3 size={16} />
                  </div>
                  <div className="pipeline">
                    {statuses.map((s) => (
                      <div key={s}>
                        <Pill status={s} />
                        <strong>{data.counts[s] || 0}</strong>
                      </div>
                    ))}
                  </div>
                  <button className="text-link" onClick={() => change('articles')}>
                    Open article manager <ArrowRight size={14} />
                  </button>
                </section>
              </div>
            </>
          ) : tab === 'roles' ? (
            <RoleDesks user={user} categories={data.categories} go={change} />
          ) : tab === 'edit' ? (
            <StoryStudio
              onDirty={setUnsaved}
              key={id || 'new'}
              id={id}
              overview={data}
              rev={rev}
              reload={reload}
              change={change}
            />
          ) : tab === 'front-page' && senior(user) ? (
            <FrontPage rev={rev} reload={reload} />
          ) : tab === 'plans' && user.roleId === 'SUPER_ADMIN' ? (
            <PlanManager rev={rev} reload={reload} />
          ) : tab === 'settings' && user.roleId === 'SUPER_ADMIN' ? (
            <WorkspaceSettings data={data} rev={rev} reload={reload} />
          ) : tab === 'taxonomy' && user.roleId === 'SUPER_ADMIN' ? (
            <Taxonomy data={data} reload={reload} />
          ) : tab === 'users' && user.roleId === 'SUPER_ADMIN' ? (
            <Directory data={data} rev={rev} reload={reload} />
          ) : tab === 'memberships' && user.roleId === 'SUPER_ADMIN' ? (
            <Memberships rev={rev} reload={reload} />
          ) : ['articles', 'review'].includes(tab) ? (
            <ArticleManager
              key={params.toString()}
              initialStatus={params.get('status')}
              initialCategory={params.get('categoryId')}
              initialReviewType={
                params.get('reviewType') ||
                (user.roleId === 'SECTION_EDITOR' ? 'standard' : 'mandatory')
              }
              review={tab === 'review'}
              data={data}
              rev={rev}
              change={change}
            />
          ) : (
            <Empty
              title="This desk is not available"
              text="Open your assigned desk to see the tools available to your account."
            >
              <button className="btn dark" onClick={() => change('roles')}>
                Open my desk <ArrowRight size={14} />
              </button>
            </Empty>
          )}
        </div>
      </div>
      {leaving && (
        <Modal title="Leave unsaved manuscript" onClose={() => setLeaving(null)}>
          <Kicker>Unsaved manuscript</Kicker>
          <h2>Leave these changes?</h2>
          <p>
            Your last saved revision will be kept. Changes made since that save will be discarded.
          </p>
          <div className="dialog-actions">
            <button className="btn outline" onClick={() => setLeaving(null)}>
              Stay in editor
            </button>
            <button
              className="btn dark"
              onClick={() => {
                change(leaving, null, true);
                setLeaving(null);
              }}
            >
              Discard changes
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function Taxonomy({ data, reload }) {
  const { notify } = useApp(),
    [edit, setEdit] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const open = (type, item = null, del = false) => {
    setEdit({ type, item, del });
    setError('');
  };
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { item, type, del } = edit;
      await api('/admin/' + type + (item ? '/' + item.id : ''), {
        method: del ? 'DELETE' : item ? 'PATCH' : 'POST',
        ...(!del ? { body: Object.fromEntries(new FormData(e.currentTarget)) } : {}),
      });
      setEdit(null);
      reload();
      notify('Editorial index updated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="cms-title">
        <div>
          <Kicker>Editorial index</Kicker>
          <h1>Sections & Tags</h1>
          <p>Organise coverage across the newspaper.</p>
        </div>
      </div>
      {[
        ['categories', 'Sections', data.categories],
        ['tags', 'Tags', data.tags],
      ].map(([type, title, rows]) => (
        <section className="cms-panel taxonomy-panel" key={type}>
          <div className="panel-header">
            <h2>{title}</h2>
            <button className="btn outline small" onClick={() => open(type)}>
              <Plus size={13} />
              Add {type === 'tags' ? 'tag' : 'section'}
            </button>
          </div>
          {rows.map((i) => (
            <div className="taxonomy-row" key={i.id}>
              <div>
                <strong>{i.name}</strong>
                {i.description && <p>{i.description}</p>}
              </div>
              <span>{i._count.articles} stories</span>
              <button
                className="icon-button"
                aria-label={'Edit ' + i.name}
                onClick={() => open(type, i)}
              >
                <Pencil size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={'Delete ' + i.name}
                onClick={() => open(type, i, true)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </section>
      ))}
      {edit && (
        <Modal title="Manage editorial index" onClose={() => setEdit(null)}>
          <Kicker>Editorial index</Kicker>
          <h2>
            {edit.del ? 'Delete' : edit.item ? 'Edit' : 'Add'}{' '}
            {edit.type === 'tags' ? 'tag' : 'section'}
          </h2>
          <form onSubmit={save} className="form-stack">
            {edit.del ? (
              <p>
                Remove “{edit.item.name}” from the index? Sections with articles must be emptied
                first.
              </p>
            ) : (
              <>
                <label>
                  Name
                  <input
                    name="name"
                    defaultValue={edit.item?.name || ''}
                    required
                    minLength={2}
                    maxLength={45}
                  />
                </label>
                {edit.type === 'categories' && (
                  <label>
                    Description
                    <textarea
                      name="description"
                      defaultValue={edit.item?.description || ''}
                      minLength={10}
                      maxLength={240}
                      required
                      rows={3}
                    />
                  </label>
                )}
              </>
            )}
            <ErrorBox>{error}</ErrorBox>
            <button className="btn dark" disabled={busy}>
              {edit.del ? 'Confirm deletion' : 'Save changes'}
              <ArrowRight size={14} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Memberships({ rev, reload }) {
  const res = useLoad('/admin/subscriptions', rev),
    [c, setC] = useState(null),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false);
  const { notify } = useApp();
  return (
    <>
      <div className="cms-title">
        <div>
          <Kicker>Membership desk</Kicker>
          <h1>Subscriptions</h1>
          <p>Verified memberships, billing periods and renewal settings.</p>
        </div>
      </div>
      <ErrorBox>{res.error}</ErrorBox>
      {res.loading ? (
        <Loading />
      ) : res.data?.length ? (
        <div className="table-scroll cms-table">
          <table>
            <thead>
              <tr>
                <th>Subscriber</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Renewal date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {res.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.user.name}
                    <small className="table-small">{s.user.email}</small>
                  </td>
                  <td>
                    {s.plan.name} · {s.cycle}
                  </td>
                  <td>{titleCase(s.status)}</td>
                  <td>{s.periodEnd ? date(s.periodEnd) : 'Pending'}</td>
                  <td>
                    {s.status === 'ACTIVE' && !s.cancelAtEnd ? (
                      <button
                        className="text-link"
                        onClick={() => {
                          setC(s);
                          setErr('');
                        }}
                      >
                        Stop renewal
                      </button>
                    ) : s.cancelAtEnd ? (
                      'Renewal off'
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No subscriptions yet"
          text="Subscriptions appear here when a reader begins a Razorpay test checkout. Membership access requires verified payment."
        />
      )}
      {c && (
        <Modal title="Stop subscription renewal" onClose={() => setC(null)}>
          <Kicker>Membership action</Kicker>
          <h2>Stop this renewal?</h2>
          <p>{c.user.name} will retain paid access until the end of the period.</p>
          <ErrorBox>{err}</ErrorBox>
          <div className="dialog-actions">
            <button className="btn outline" onClick={() => setC(null)}>
              Keep renewal
            </button>
            <button
              className="btn dark"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/admin/subscriptions/' + c.id + '/cancel', { method: 'POST' });
                  setC(null);
                  reload();
                  notify('Renewal stopped.');
                } catch (e) {
                  setErr(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm cancellation
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
