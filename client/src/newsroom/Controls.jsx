import React, { useState } from 'react';
import {
  Check,
  ArrowRight,
  ArrowUpRight,
  Layers3,
  Newspaper,
  ShieldCheck,
  Globe2,
  Clock3,
  Settings2,
  Save,
  Star,
  LockKeyhole,
  Pencil,
  LayoutTemplate,
  Radio,
} from 'lucide-react';
import { api, useLoad, useApp, titleCase, money, date } from '../lib.jsx';
import { Kicker, Loading, ErrorBox, Modal, Empty } from '../components/UI.jsx';
export function FrontPage({ rev, reload }) {
  const rs = useLoad('/admin/front-page', rev);
  return rs.error ? (
    <ErrorBox>{rs.error}</ErrorBox>
  ) : rs.loading || !rs.data ? (
    <Loading />
  ) : (
    <LayoutEditor key={rs.data.version} data={rs.data} reload={reload} />
  );
}
function LayoutEditor({ data, reload }) {
  const { notify } = useApp();
  const articles = data.articles;
  const [f, setF] = useState(() => ({
      hero: [1, 2, 3].map((i) => articles.find((a) => a.heroSlot === i)?.id || null),
      top: [1, 2, 3].map((i) => articles.find((a) => a.featuredRank === i)?.id || null),
      pick: articles.find((a) => a.editorPick)?.id || null,
      breaking: articles.filter((a) => a.breaking).map((a) => a.id),
    })),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, mark] = useState(false);
  function update(k, v) {
    setF((a) => ({ ...a, [k]: v }));
    mark(true);
  }
  async function save() {
    setBusy(true);
    setErr('');
    try {
      await api('/admin/front-page', { method: 'PUT', body: { ...f, version: data.version } });
      notify('Front-page selections published.');
      reload();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  const options = [
    <option value="" key="none">
      Unassigned
    </option>,
    ...articles.map((a) => (
      <option key={a.id} value={a.id}>
        {a.category.name} — {a.title}
      </option>
    )),
  ];
  return (
    <>
      <div className="cms-title">
        <div>
          <Kicker>Edition curation</Kicker>
          <h1>The Front Page</h1>
          <p>Choose the stories that lead the Indian edition.</p>
        </div>
        <button className="btn dark" disabled={busy || !dirty} onClick={save}>
          <Save size={14} />
          {busy ? 'Publishing…' : 'Publish layout'}
        </button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      <div className="layout-notice">
        <ShieldCheck size={15} />
        <span>
          Only published, in-window stories are available. Saving a layout never approves a draft.
        </span>
      </div>
      <section className="cms-panel layout-section">
        <div className="panel-header">
          <h2>Cinematic leads</h2>
          <span className="small-label">3 cover positions</span>
        </div>
        <div className="lead-pickers">
          {f.hero.map((id, i) => {
            const a = articles.find((s) => s.id === id);
            const img =
              [
                'rural-jobs-accountability',
                'india-trillion-dollar-exports',
                'india-semiconductor-supply-chain',
              ][i] === a?.slug && a?.revision === 1
                ? [
                    '/images/hero-india.jpg',
                    '/images/hero-business.jpg',
                    '/images/hero-technology.jpg',
                  ][i]
                : a?.image;
            return (
              <div key={i}>
                <div
                  className="lead-preview"
                  style={{
                    backgroundImage: img
                      ? `linear-gradient(0deg,#17221de8,transparent),url(${img})`
                      : undefined,
                  }}
                >
                  <span>FRONT PAGE / 0{i + 1}</span>
                  <h3>{a?.title || 'Open cover position'}</h3>
                </div>
                <label>
                  Lead story {i + 1}
                  <select
                    value={id || ''}
                    onChange={(e) =>
                      update(
                        'hero',
                        f.hero.map((x, j) => (i === j ? e.target.value || null : x)),
                      )
                    }
                  >
                    {options}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      </section>
      <div className="layout-columns">
        <section className="cms-panel layout-section">
          <div className="panel-header">
            <h2>Top Stories</h2>
            <LayoutTemplate size={16} />
          </div>
          <div className="form-stack">
            {f.top.map((id, i) => (
              <label key={i}>
                {i === 0 ? 'Lead feature' : 'Supporting story ' + i}
                <select
                  value={id || ''}
                  onChange={(e) =>
                    update(
                      'top',
                      f.top.map((x, j) => (i === j ? e.target.value || null : x)),
                    )
                  }
                >
                  {options}
                </select>
              </label>
            ))}
          </div>
        </section>
        <section className="cms-panel layout-section">
          <div className="panel-header">
            <h2>Editor’s pick</h2>
            <Star size={16} />
          </div>
          <div className="form-stack">
            <label>
              Featured perspective
              <select value={f.pick || ''} onChange={(e) => update('pick', e.target.value || null)}>
                {options}
              </select>
            </label>
          </div>
          {f.pick && (
            <img
              className="pick-preview"
              alt="Selected editor’s pick"
              src={articles.find((a) => a.id === f.pick)?.image}
            />
          )}
        </section>
      </div>
      <section className="cms-panel layout-section">
        <div className="panel-header">
          <h2>Breaking ticker</h2>
          <span className="small-label">{f.breaking.length} / 12 selected</span>
        </div>
        <div className="ticker-options">
          {articles.map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={f.breaking.includes(a.id)}
                onChange={(e) =>
                  update(
                    'breaking',
                    e.target.checked
                      ? [...f.breaking, a.id]
                      : f.breaking.filter((id) => id !== a.id),
                  )
                }
              />
              <span>
                <small>{a.category.name}</small>
                {a.title}
              </span>
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
export function PlanManager({ rev, reload }) {
  const { notify } = useApp(),
    rs = useLoad('/admin/plans', rev),
    [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const f = new FormData(e.currentTarget);
    try {
      await api('/admin/plans/' + edit.id, {
        method: 'PATCH',
        body: {
          name: f.get('name'),
          monthlyPaise: Math.round(+f.get('monthly') * 100),
          annualPaise: Math.round(+f.get('annual') * 100),
          features: f
            .get('features')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          available: f.has('available'),
          version: edit.version,
        },
      });
      setEdit(null);
      reload();
      notify('Membership terms updated for new subscriptions.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="cms-title">
        <div>
          <Kicker>Subscription desk</Kicker>
          <h1>Membership Plans</h1>
          <p>Set the offer for new members. Existing billing agreements keep their agreed price.</p>
        </div>
      </div>
      <ErrorBox>{rs.error}</ErrorBox>
      {rs.loading ? (
        <Loading />
      ) : (
        <div className="admin-plans">
          {rs.data?.map((p, i) => (
            <article className={'admin-plan ' + p.level.toLowerCase()} key={p.id}>
              <div className="admin-plan-cap">
                <span>MEMBERSHIP 0{i + 1}</span>
                <span>{p.available ? 'ENROLMENT OPEN' : 'PAUSED'}</span>
              </div>
              <h2>{p.name}</h2>
              <strong>
                {money(p.monthlyPaise)}
                <small> / month</small>
              </strong>
              <p>{money(p.annualPaise)} annually</p>
              <ul>
                {p.features.map((f, j) => (
                  <li key={j}>
                    <Check size={13} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="btn outline full"
                onClick={() => {
                  setEdit(p);
                  setErr('');
                }}
              >
                Edit plan <Pencil size={13} />
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="layout-notice">
        <LockKeyhole size={15} />
        Access tiers are cumulative: Bronze → Silver → Gold. Altering prices never grants a reader
        access.
      </div>
      {edit && (
        <Modal title="Edit membership plan" onClose={() => setEdit(null)}>
          <Kicker>Membership terms / {edit.level}</Kicker>
          <h2>Edit {edit.name}</h2>
          <form onSubmit={save} className="form-stack">
            <label>
              Plan name
              <input name="name" defaultValue={edit.name} required minLength={2} maxLength={40} />
            </label>
            <div className="field-pair">
              <label>
                Monthly price (₹)
                <input
                  name="monthly"
                  type="number"
                  step="0.01"
                  min={1}
                  max={100000}
                  defaultValue={edit.monthlyPaise / 100}
                  required
                />
              </label>
              <label>
                Annual price (₹)
                <input
                  name="annual"
                  type="number"
                  step="0.01"
                  min={1}
                  max={1200000}
                  defaultValue={edit.annualPaise / 100}
                  required
                />
              </label>
            </div>
            <label>
              Plan features
              <textarea name="features" rows={4} required defaultValue={edit.features.join('\n')} />
              <small>One feature per line, up to ten.</small>
            </label>
            <label className="check-row">
              <input type="checkbox" name="available" defaultChecked={edit.available} />
              Available for new subscriptions
            </label>
            <ErrorBox>{err}</ErrorBox>
            <button className="btn dark" disabled={busy}>
              Save membership terms <Check size={14} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function WorkspaceSettings({ data, rev, reload }) {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState('');
  const audit = useLoad('/admin/audit', rev);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const f = new FormData(e.currentTarget);
    try {
      await api('/admin/settings', {
        method: 'PATCH',
        body: {
          defaultApproval: f.has('review'),
          defaultAccess: f.get('access'),
          deskNote: f.get('note'),
        },
      });
      reload();
      notify('Newsroom defaults saved. Existing stories are unchanged.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="cms-title">
        <div>
          <Kicker>Administration</Kicker>
          <h1>Workspace Settings</h1>
          <p>Editorial defaults, desk notices and a record of administrative changes.</p>
        </div>
      </div>
      <div className="layout-columns">
        <section className="cms-panel">
          <div className="panel-header">
            <h2>Editorial defaults</h2>
            <Settings2 size={16} />
          </div>
          <form className="form-stack" onSubmit={save}>
            <label>
              Default reading access
              <select name="access" defaultValue={data.settings.defaultAccess}>
                {['FREE', 'BRONZE', 'SILVER', 'GOLD'].map((v) => (
                  <option key={v} value={v}>
                    {titleCase(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-row coverage-check">
              <input type="checkbox" name="review" defaultChecked={data.settings.defaultApproval} />
              Require Chief Editor approval by default on new drafts.
            </label>
            <label>
              Desk notice
              <textarea
                name="note"
                maxLength={320}
                defaultValue={data.settings.deskNote}
                placeholder="A short note for your editorial team…"
                rows={3}
              />
              <small>Shown on the private newsroom overview.</small>
            </label>
            <ErrorBox>{err}</ErrorBox>
            <button className="btn dark" disabled={busy}>
              Save settings <Check size={14} />
            </button>
          </form>
        </section>
        <section className="cms-panel publication-standards">
          <div className="panel-header">
            <h2>Publication safeguards</h2>
            <ShieldCheck size={17} />
          </div>
          {[
            [
              Globe2,
              'India-focused coverage',
              'Source and country confirmation are checked before submission.',
            ],
            [
              Clock3,
              '28-day publication window',
              'Older source reporting is excluded from the public edition.',
            ],
            [
              ShieldCheck,
              'Independent approval',
              'Authors, creators and submitters cannot approve their own stories.',
            ],
            [
              Layers3,
              'Protected live editions',
              'Unapproved revisions never replace the released article.',
            ],
          ].map(([I, h, t]) => (
            <div key={h}>
              <I size={17} />
              <section>
                <strong>{h}</strong>
                <p>{t}</p>
              </section>
            </div>
          ))}
        </section>
      </div>
      <section className="cms-panel config-audit">
        <div className="panel-header">
          <h2>Administration log</h2>
          <Clock3 size={15} />
        </div>
        <ErrorBox>{audit.error}</ErrorBox>
        {audit.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Administrator</th>
                  <th>When (IST)</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((x) => (
                  <tr key={x.id}>
                    <td>{titleCase(x.action)}</td>
                    <td>{x.actor.name}</td>
                    <td>
                      {new Date(x.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Changes to permissions, plans, settings and the front page will appear here.
          </p>
        )}
      </section>
    </>
  );
}
