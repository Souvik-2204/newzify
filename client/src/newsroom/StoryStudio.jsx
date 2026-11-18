import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  FileText,
  Globe2,
  SlidersHorizontal,
  Clock3,
  ImagePlus,
  Save,
  Send,
  ShieldCheck,
  LockKeyhole,
  Trash2,
  Layers3,
  ChevronRight,
  PenLine,
  MapPin,
  BookOpen,
} from 'lucide-react';
import { api, useApp, useLoad, titleCase, date } from '../lib.jsx';
import { Kicker, Modal, ErrorBox, Loading } from '../components/UI.jsx';
import { DocumentBody, legacyDocument } from '../components/Document.jsx';
import { Status } from './ArticleManager.jsx';
const RichEditor = lazy(() => import('./RichEditor.jsx'));
const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
const ist = (v, n = 16) => (v ? new Date(+new Date(v) + 19800000).toISOString().slice(0, n) : '');
const stamp = (s) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(s)) + ' IST';
const maxUploadMb = import.meta.env.MODE === 'vercel' ? 4 : 5;
export default function StoryStudio(props) {
  const { id, rev } = props;
  const { data, loading, error } = useLoad(id ? '/admin/articles/' + id : null, rev);
  if (id && loading) return <Loading label="Opening the manuscript…" />;
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (id && !data) return <Loading />;
  return (
    <Composer
      key={(id || 'new') + '-' + (data?.revision || 0) + '-' + (data?.status || 'new')}
      {...props}
      a={id ? data : null}
    />
  );
}
function Composer({ a, id, overview, reload, change, onDirty }) {
  const { user, notify } = useApp(),
    sections = overview.categories.filter(
      (c) =>
        user.roleId !== 'SECTION_EDITOR' ||
        [user.sectionId, ...(user.assignedSections || []).map((s) => s.id)].includes(c.id),
    );
  const [f, setF] = useState(() => ({
    title: a?.title || '',
    slug: a?.slug || '',
    summary: a?.summary || '',
    bodyDoc: a?.bodyDoc || legacyDocument(a?.content),
    categoryId: a?.categoryId || sections[0]?.id || '',
    authorId: a?.authorId || user.id,
    access: a?.access || overview.settings.defaultAccess,
    requiresApproval: a?.requiresApproval ?? overview.settings.defaultApproval,
    image: a?.image || '/images/hero-india.jpg',
    imageCredit: a?.imageCredit || 'The Meridian · Editorial image',
    location: a?.location || 'India',
    sourceName: a?.sourceName || '',
    sourceUrl: a?.sourceUrl || '',
    sourceDate: a?.sourceDate || null,
    publicationDate: a?.publicationDate || null,
    indiaCoverage: a?.indiaConfirmed || false,
    tagIds: a?.tags.map((t) => t.id) || [],
    seoTitle: a?.seoTitle || '',
    metaDescription: a?.metaDescription || '',
  }));
  const [tab, setTab] = useState('write'),
    [dialog, setDialog] = useState(''),
    [dirty, dirtySet] = useState(false),
    [busy, working] = useState(false),
    [err, error] = useState(''),
    [reason, setReason] = useState(''),
    [reviewed, setReviewed] = useState(false),
    [slugManual, setManual] = useState(!!a);
  const locked = !!a && !a.permissions.edit;
  const readOnly = busy || locked;
  const initialDoc = useRef(f.bodyDoc);
  const set = (k, v) => {
    setF((prev) => ({
      ...prev,
      [k]: v,
      ...(k === 'title' && !slugManual ? { slug: slugify(v) } : {}),
    }));
    dirtySet(true);
  };
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const chosenCat = overview.categories.find((c) => c.id === f.categoryId),
    chosenAuthor = overview.authors.find((u) => u.id === f.authorId) || a?.author || user;
  const p = a?.permissions || {};
  async function save(submit = false) {
    if (!f.title.trim() || f.title.trim().length < 2) {
      setTab('write');
      error('Give the draft a headline of at least two characters.');
      return;
    }
    working(true);
    error('');
    let saved;
    try {
      if (!id || dirty)
        saved = await api('/admin/articles' + (id ? '/' + id : ''), {
          method: id ? 'PUT' : 'POST',
          body: { ...f, slug: f.slug || undefined, expectedRevision: a?.revision },
        });
      else saved = a;
      if (submit)
        await api('/admin/articles/' + saved.id + '/workflow', {
          method: 'POST',
          body: { action: 'SUBMIT', expectedRevision: saved.revision },
        });
      dirtySet(false);
      onDirty?.(false);
      notify(
        submit
          ? f.requiresApproval
            ? 'Submitted to Pending Approval.'
            : 'Submitted to the section review desk.'
          : 'Draft saved. The public edition is unchanged.',
      );
      change('edit', saved.id, true);
      reload();
    } catch (e) {
      if (saved && (!id || dirty)) {
        dirtySet(false);
        onDirty?.(false);
        notify('Draft saved. ' + e.message);
        change('edit', saved.id, true);
        reload();
      } else error(e.message);
    } finally {
      working(false);
    }
  }
  function confirm(action) {
    setDialog(action);
    error('');
    setReason('');
    setReviewed(false);
  }
  async function action(kind) {
    working(true);
    error('');
    try {
      if (kind === 'DELETE') {
        await api('/admin/articles/' + id, {
          method: 'DELETE',
          body: { expectedRevision: a.revision },
        });
        onDirty?.(false);
        change('articles', null, true);
        notify('Story removed. Its audit record is retained.');
      } else {
        await api('/admin/articles/' + id + '/workflow', {
          method: 'POST',
          body: {
            action: kind,
            expectedRevision: a.revision,
            ...(kind === 'REJECT' ? { reason } : {}),
            ...(kind === 'PUBLISH' ? { reviewed } : {}),
          },
        });
        notify(
          kind === 'APPROVE'
            ? 'Revision approved. It is ready for publication.'
            : kind === 'REJECT'
              ? 'Returned to the author with your feedback.'
              : 'The approved edition is now live.',
        );
      }
      setDialog('');
      reload();
    } catch (e) {
      error(e.message);
    } finally {
      working(false);
    }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxUploadMb * 1024 * 1024) {
      e.target.value = '';
      return error(`Images must be ${maxUploadMb} MB or smaller.`);
    }
    working(true);
    error('');
    try {
      const data = new FormData();
      data.set('image', file);
      const d = await api('/admin/images', { method: 'POST', body: data });
      set('image', d.image);
      notify('Featured image uploaded. Save the draft to keep it.');
    } catch (e) {
      error(e.message);
    } finally {
      working(false);
    }
  }
  return (
    <>
      <div className="studio-crumb">
        <button onClick={() => change('articles')}>
          <ArrowLeft size={13} />
          Article manager
        </button>
        <ChevronRight size={11} />
        <span>{id ? 'Editorial file' : 'New manuscript'}</span>
      </div>
      <div className="cms-title studio-title">
        <div>
          <Kicker>Editorial workspace</Kicker>
          <h1>{id ? 'Story Editor' : 'Create a Story'}</h1>
        </div>
        <div className="studio-actions">
          <button className="btn outline small" onClick={() => setDialog('preview')}>
            <Eye size={14} />
            Preview
          </button>
          {!locked && (
            <button
              className="btn dark small"
              disabled={busy || (!!id && !dirty)}
              onClick={() => save(false)}
            >
              <Save size={14} />
              {busy ? 'Working…' : 'Save draft'}
            </button>
          )}
        </div>
      </div>
      <div className="studio-state">
        <Status value={a?.status || 'DRAFT'} />
        <span>Revision {a?.revision || 1}</span>
        <i />
        <span className={dirty ? 'unsaved' : ''}>
          {dirty ? 'Unsaved changes' : a ? 'Changes saved' : 'New file'}
        </span>
        {a?.live && (
          <Link to={'/story/' + a.live.slug}>
            Live edition · v{a.live.revision}
            <ArrowUpRight size={12} />
          </Link>
        )}
      </div>
      {a?.live && a.live.revision !== a.revision && (
        <div className="studio-notice">
          <Layers3 size={16} />
          <p>
            <strong>A working revision is open.</strong> Readers still see published revision{' '}
            {a.live.revision}. This draft will replace it only when released.
          </p>
        </div>
      )}
      {a && ['IN_REVIEW', 'APPROVED', 'REJECTED'].includes(a.status) && (
        <div className={'checker-box ' + (a.status === 'REJECTED' ? 'returned' : '')}>
          <ShieldCheck size={21} />
          <div>
            <strong>
              {a.status === 'REJECTED'
                ? 'Returned for corrections'
                : a.status === 'APPROVED'
                  ? 'Approved for publication'
                  : a.requiresApproval
                    ? 'Pending Chief Editor approval'
                    : 'Submitted for section review'}
            </strong>
            <p>
              {a.status === 'REJECTED'
                ? a.approvals.find((x) => x.action === 'REJECTED')?.reason
                : a.status === 'APPROVED'
                  ? 'An independent editor approved this exact revision.'
                  : `Submitted by ${a.submitter?.name || 'the newsroom'}${a.submittedAt ? ' · ' + stamp(a.submittedAt) : ''}.`}
            </p>
          </div>
          <div className="checker-actions">
            {p.reject && (
              <button
                className="btn outline small"
                disabled={busy || dirty}
                onClick={() => confirm('REJECT')}
              >
                Return to author
              </button>
            )}
            {p.approve && (
              <button
                className="btn dark small"
                disabled={busy || dirty}
                onClick={() => confirm('APPROVE')}
              >
                Approve revision
              </button>
            )}
            {(p.directPublish || p.publish) && (
              <button
                className="btn peach small"
                disabled={busy || dirty}
                onClick={() => confirm('PUBLISH')}
              >
                {p.directPublish ? 'Review & publish' : 'Publish approved revision'}
                <ArrowUpRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}
      <ErrorBox>{!dialog && err}</ErrorBox>
      <div className="studio-tabs">
        {[
          ['write', 'Manuscript', PenLine],
          ['details', 'Source & metadata', SlidersHorizontal],
          ['seo', 'Search & URL', Globe2],
          ['history', 'Editorial record', Clock3],
        ].map(([v, n, I]) => (
          <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
            <I size={14} />
            {n}
          </button>
        ))}
      </div>
      <div className="studio-layout">
        <div className="studio-working">
          <section className="manuscript-paper" hidden={tab !== 'write'}>
            <div className="manuscript-mast">
              <span>THE MERIDIAN</span>
              <small>MANUSCRIPT / {String(a?.revision || 1).padStart(2, '0')}</small>
            </div>
            <label className="headline-label">
              Headline
              <textarea
                disabled={readOnly}
                rows={2}
                aria-label="Headline"
                placeholder="Write your headline…"
                value={f.title}
                maxLength={220}
                onChange={(e) => set('title', e.target.value)}
              />
            </label>
            <label className="standfirst-label">
              Summary
              <textarea
                disabled={readOnly}
                aria-label="Summary"
                rows={2}
                value={f.summary}
                maxLength={450}
                placeholder="Introduce the story in a sentence or two."
                onChange={(e) => set('summary', e.target.value)}
              />
            </label>
            <span className="body-caption">Article body</span>
            <Suspense fallback={<Loading label="Preparing the writing tools…" />}>
              <RichEditor
                initial={initialDoc.current}
                onChange={(d) => set('bodyDoc', d)}
                disabled={readOnly}
              />
            </Suspense>
          </section>
          {tab === 'details' && (
            <section className="cms-panel studio-section">
              <Kicker>Reporting file</Kicker>
              <h2>Source & attribution</h2>
              <p className="panel-dek">
                Keep the original reporting date and source with the story.
              </p>
              <div className="form-stack">
                <label>
                  Source publication
                  <input
                    disabled={readOnly}
                    value={f.sourceName}
                    onChange={(e) => set('sourceName', e.target.value)}
                    placeholder="Publication or institution"
                    maxLength={120}
                  />
                </label>
                <label>
                  Source URL
                  <input
                    disabled={readOnly}
                    type="url"
                    value={f.sourceUrl}
                    onChange={(e) => set('sourceUrl', e.target.value)}
                    placeholder="https://"
                  />
                </label>
                <div className="field-pair">
                  <label>
                    Original source date
                    <input
                      type="date"
                      disabled={readOnly}
                      value={ist(f.sourceDate, 10)}
                      max={ist(new Date(), 10)}
                      onChange={(e) =>
                        set(
                          'sourceDate',
                          e.target.value
                            ? new Date(e.target.value + 'T00:00:00+05:30').toISOString()
                            : null,
                        )
                      }
                    />
                  </label>
                  <label>
                    Dateline
                    <input
                      disabled={readOnly}
                      value={f.location}
                      onChange={(e) => set('location', e.target.value)}
                      maxLength={100}
                    />
                  </label>
                </div>
                <label className="check-row coverage-check">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={f.indiaCoverage}
                    onChange={(e) => set('indiaCoverage', e.target.checked)}
                  />
                  I confirm this is sourced, India-focused reporting.
                </label>
                <fieldset>
                  <legend>Article tags</legend>
                  {overview.tags.length ? (
                    overview.tags.map((t) => (
                      <label className="check-row" key={t.id}>
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={f.tagIds.includes(t.id)}
                          onChange={(e) =>
                            set(
                              'tagIds',
                              e.target.checked
                                ? [...f.tagIds, t.id]
                                : f.tagIds.filter((id) => id !== t.id),
                            )
                          }
                        />
                        {t.name}
                      </label>
                    ))
                  ) : (
                    <small>No tags have been created yet.</small>
                  )}
                </fieldset>
                <small>
                  Only stories sourced within the past 28 days can enter the public edition.
                </small>
              </div>
            </section>
          )}
          {tab === 'seo' && (
            <section className="cms-panel studio-section">
              <Kicker>Discoverability</Kicker>
              <h2>Search & URL</h2>
              <p className="panel-dek">
                These details go live with the approved article, not its draft.
              </p>
              <div className="form-stack">
                <label>
                  URL slug
                  <div className="slug-field">
                    <span>/story/</span>
                    <input
                      disabled={readOnly}
                      value={f.slug}
                      onChange={(e) => {
                        setManual(true);
                        set('slug', e.target.value);
                      }}
                      maxLength={140}
                      placeholder="your-story-headline"
                    />
                  </div>
                  <small>
                    Lowercase words separated by hyphens. Each story needs a unique URL.
                  </small>
                </label>
                <label>
                  SEO title
                  <input
                    disabled={readOnly}
                    value={f.seoTitle}
                    maxLength={100}
                    onChange={(e) => set('seoTitle', e.target.value)}
                    placeholder={f.title || 'Defaults to the article headline'}
                  />
                  <small>
                    {f.seoTitle.length}/100 characters · Aim for a concise, descriptive title.
                  </small>
                </label>
                <label>
                  Meta description
                  <textarea
                    disabled={readOnly}
                    rows={3}
                    value={f.metaDescription}
                    maxLength={320}
                    onChange={(e) => set('metaDescription', e.target.value)}
                    placeholder={f.summary || 'Defaults to the article summary'}
                  />
                  <small>{f.metaDescription.length}/320 characters</small>
                </label>
              </div>
              <div className="search-snippet">
                <span className="small-label">
                  <Globe2 size={12} />
                  Search preview
                </span>
                <small>The Meridian › story › {f.slug || 'your-story'}</small>
                <strong>{f.seoTitle || f.title || 'Your story headline'}</strong>
                <p>
                  {f.metaDescription || f.summary || 'Your article description will appear here.'}
                </p>
              </div>
            </section>
          )}
          {tab === 'history' && (
            <section className="cms-panel studio-section">
              <Kicker>Accountability</Kicker>
              <h2>Editorial record</h2>
              <p className="panel-dek">
                An actor, a timestamp and a revision for every editorial decision.
              </p>
              {a ? (
                <>
                  <div className="record-founder">
                    Created by <strong>{a.creator?.name}</strong> · {stamp(a.createdAt)}
                  </div>
                  <div className="audit-timeline">
                    {a.approvals.map((x) => (
                      <article key={x.id}>
                        <span className="audit-pin" />
                        <div>
                          <small>
                            REVISION {x.revision} <i /> {stamp(x.createdAt)}
                          </small>
                          <h4>{titleCase(x.action)}</h4>
                          <p>{x.actor.name}</p>
                          {x.reason && <blockquote>{x.reason}</blockquote>}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted">Save your first draft to begin the record.</p>
              )}
            </section>
          )}
        </div>
        <aside className="studio-inspector">
          <section className="inspector-block">
            <div className="inspector-heading">
              <SlidersHorizontal size={15} />
              <h3>Story settings</h3>
            </div>
            <div className="form-stack">
              <label>
                Section
                <select
                  disabled={readOnly}
                  aria-label="Section"
                  value={f.categoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                >
                  {sections.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Author / byline
                <select
                  disabled={readOnly || user.roleId === 'AUTHOR'}
                  aria-label="Author / byline"
                  value={f.authorId}
                  onChange={(e) => set('authorId', e.target.value)}
                >
                  {[
                    ...new Map([...overview.authors, chosenAuthor].map((u) => [u.id, u])).values(),
                  ].map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reading access
                <select
                  disabled={readOnly}
                  aria-label="Reading access"
                  value={f.access}
                  onChange={(e) => set('access', e.target.value)}
                >
                  {['FREE', 'BRONZE', 'SILVER', 'GOLD'].map((v) => (
                    <option value={v} key={v}>
                      {titleCase(v)}
                      {v === 'FREE' ? ' · Open to all' : ' · Members'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Publication date & time · IST
                <input
                  disabled={readOnly}
                  type="datetime-local"
                  max={ist(new Date())}
                  value={ist(f.publicationDate)}
                  onChange={(e) =>
                    set(
                      'publicationDate',
                      e.target.value ? new Date(e.target.value + ':00+05:30').toISOString() : null,
                    )
                  }
                />
                <small>Optional. Leave blank to use the release time.</small>
              </label>
            </div>
          </section>
          <section className="inspector-block approval-setting">
            <div className="inspector-heading">
              <ShieldCheck size={16} />
              <h3>Review route</h3>
            </div>
            <label className="toggle-line">
              <span>Mandatory approval</span>
              <input
                type="checkbox"
                aria-label="Mandatory approval"
                checked={f.requiresApproval}
                disabled={readOnly || a?.approvalLocked}
                onChange={(e) => set('requiresApproval', e.target.checked)}
              />
              <i />
            </label>
            <p>
              {f.requiresApproval
                ? 'An independent Chief Editor must approve this revision before publication.'
                : 'An assigned Section Editor can review and publish this submission directly.'}
            </p>
            {a?.approvalLocked && (
              <small>
                <LockKeyhole size={10} />
                Locked after submission
              </small>
            )}
          </section>
          <section className="inspector-block cover-field">
            <div className="inspector-heading">
              <ImagePlus size={15} />
              <h3>Featured image</h3>
            </div>
            <img src={f.image} alt="Current featured image" />
            {!locked && (
              <label className="cover-upload">
                <ImagePlus size={13} />
                Replace image
                <input
                  type="file"
                  disabled={busy}
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Upload featured image"
                  onChange={upload}
                />
              </label>
            )}
            <label className="credit-field">
              Image credit
              <input
                disabled={readOnly}
                value={f.imageCredit}
                onChange={(e) => set('imageCredit', e.target.value)}
                maxLength={250}
              />
            </label>
          </section>
          {(!a || p.submit || dirty) && !locked && (
            <button
              className="btn dark full send-review"
              disabled={busy}
              onClick={() => save(true)}
            >
              <Send size={14} />
              {dirty || !a ? 'Save & submit for review' : 'Submit for review'}
            </button>
          )}
        </aside>
      </div>
      {a && p.delete && (
        <button className="danger-link" onClick={() => confirm('DELETE')}>
          <Trash2 size={13} />
          Delete article
        </button>
      )}
      {dialog === 'preview' && (
        <Modal
          title="Private editorial preview"
          wide
          className="story-preview"
          onClose={() => setDialog('')}
        >
          <span className="preview-label">
            <Eye size={12} />
            PRIVATE EDITORIAL PREVIEW
          </span>
          <Kicker>
            {chosenCat?.name} / {f.access} edition
          </Kicker>
          <h2>{f.title || 'Untitled manuscript'}</h2>
          <p className="preview-dek">{f.summary || 'Your summary will appear here.'}</p>
          <div className="preview-byline">
            {chosenAuthor.name} · {f.publicationDate ? date(f.publicationDate) : 'Not yet released'}
          </div>
          <img src={f.image} alt="Featured photograph" />
          <DocumentBody doc={f.bodyDoc} />
        </Modal>
      )}
      {dialog && dialog !== 'preview' && (
        <Modal title="Editorial decision" onClose={() => !busy && setDialog('')}>
          <Kicker>Revision {a?.revision} / Editorial decision</Kicker>
          <h2>
            {
              {
                APPROVE: 'Approve this revision?',
                PUBLISH: 'Publish this edition?',
                REJECT: 'Return to the author.',
                DELETE: 'Remove this story?',
              }[dialog]
            }
          </h2>
          <p>
            {dialog === 'APPROVE'
              ? 'Your approval applies to this saved revision only. Publication is a separate action.'
              : dialog === 'PUBLISH'
                ? 'The saved headline, manuscript, metadata and reading tier will become the public edition.'
                : dialog === 'REJECT'
                  ? 'Describe the corrections needed. Your reason will be visible in the author’s editorial record.'
                  : 'The story will be removed from the library and public site. The audit record is retained.'}
          </p>
          {dialog === 'REJECT' && (
            <label className="modal-field">
              Rejection reason
              <textarea
                value={reason}
                required
                rows={4}
                maxLength={1500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {dialog === 'PUBLISH' && p.directPublish && (
            <label className="check-row coverage-check">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I have reviewed this revision and its reporting source.
            </label>
          )}
          <ErrorBox>{err}</ErrorBox>
          <div className="dialog-actions">
            <button className="btn outline" onClick={() => setDialog('')} disabled={busy}>
              Go back
            </button>
            <button
              className="btn dark"
              disabled={
                busy ||
                (dialog === 'REJECT' && !reason.trim()) ||
                (dialog === 'PUBLISH' && p.directPublish && !reviewed)
              }
              onClick={() => action(dialog)}
            >
              {busy
                ? 'Saving…'
                : {
                    APPROVE: 'Confirm approval',
                    PUBLISH: 'Publish story',
                    REJECT: 'Return with feedback',
                    DELETE: 'Delete article',
                  }[dialog]}
              <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
