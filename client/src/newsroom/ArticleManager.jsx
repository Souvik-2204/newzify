import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  ShieldCheck,
  Layers3,
  X,
} from 'lucide-react';
import { useLoad, date, titleCase, statuses } from '../lib.jsx';
import { Kicker, Loading, ErrorBox, Empty } from '../components/UI.jsx';
export const statusName = (s) => (s === 'IN_REVIEW' ? 'Submitted' : titleCase(s));
export function Status({ value }) {
  return (
    <span className={'status-pill ' + value.toLowerCase()}>
      <i />
      {statusName(value)}
    </span>
  );
}
export default function ArticleManager({
  review,
  data,
  rev,
  change,
  initialStatus,
  initialCategory,
  initialReviewType,
}) {
  const empty = {
    q: '',
    categoryId: '',
    authorId: '',
    status: '',
    from: '',
    to: '',
    dateField: 'updated',
  };
  const [f, set] = useState(() => ({
      ...empty,
      status: !review && statuses.includes(initialStatus) ? initialStatus : '',
      categoryId: data.categories.some((c) => c.id === initialCategory) ? initialCategory : '',
    })),
    [query, setQuery] = useState(''),
    [mode, setMode] = useState(initialReviewType === 'standard' ? 'standard' : 'mandatory'),
    [advanced, setAdvanced] = useState(false),
    [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(f.q);
      setPage(1);
    }, 160);
    return () => clearTimeout(t);
  }, [f.q]);
  const update = (key, v) => {
    set((s) => ({ ...s, [key]: v }));
    setPage(1);
  };
  const params = new URLSearchParams(
    Object.entries({
      ...f,
      q: query,
      page,
      ...(review ? { status: 'IN_REVIEW', reviewType: mode } : {}),
    }).filter(([, v]) => v !== ''),
  );
  const rs = useLoad('/admin/articles?' + params, rev);
  let selected = Object.entries(f).filter(([k, v]) => k !== 'dateField' && v).length;
  return (
    <>
      <div className="cms-title">
        <div>
          <Kicker>{review ? 'Independent editorial review' : 'Editorial library'}</Kicker>
          <h1>{review ? 'Review Queue' : 'Article Manager'}</h1>
          <p>
            {review
              ? 'Review the submitted revision, check its sources, and record your decision.'
              : 'Your drafts, submissions and published stories, in one place.'}
          </p>
        </div>
        <button className="btn dark" onClick={() => change('edit')}>
          <Plus size={15} />
          New story
        </button>
      </div>
      {review && (
        <div className="queue-tabs">
          <button
            className={mode === 'mandatory' ? 'active' : ''}
            onClick={() => {
              setMode('mandatory');
              setPage(1);
            }}
          >
            <ShieldCheck size={15} />
            Pending approval <b>{data.queues.mandatory}</b>
          </button>
          <button
            className={mode === 'standard' ? 'active' : ''}
            onClick={() => {
              setMode('standard');
              setPage(1);
            }}
          >
            <Layers3 size={15} />
            Section review <b>{data.queues.standard}</b>
          </button>
        </div>
      )}
      <div className="library-tools">
        <div className="inline-search">
          <Search size={16} />
          <input
            aria-label="Search articles"
            placeholder="Search headline or URL slug…"
            value={f.q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <select
          aria-label="Article category"
          value={f.categoryId}
          onChange={(e) => update('categoryId', e.target.value)}
        >
          <option value="">All sections</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!review && (
          <select
            aria-label="Article status"
            value={f.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusName(s)}
              </option>
            ))}
          </select>
        )}
        <button
          className={'filter-disclosure ' + (advanced ? 'active' : '')}
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={14} />
          More filters
        </button>
      </div>
      {advanced && (
        <div className="advanced-filters">
          <label>
            Author
            <select value={f.authorId} onChange={(e) => update('authorId', e.target.value)}>
              <option value="">All authors</option>
              {data.authors.map((u) => (
                <option value={u.id} key={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date range applies to
            <select value={f.dateField} onChange={(e) => update('dateField', e.target.value)}>
              <option value="updated">Last edited</option>
              <option value="published">Publication date</option>
              <option value="source">Source date</option>
            </select>
          </label>
          <label>
            From date
            <input
              type="date"
              value={f.from}
              max={f.to || undefined}
              onChange={(e) => update('from', e.target.value)}
            />
          </label>
          <label>
            To date
            <input
              type="date"
              value={f.to}
              min={f.from || undefined}
              onChange={(e) => update('to', e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="library-count">
        <span>
          {rs.data?.total ?? '—'} {rs.data?.total === 1 ? 'story' : 'stories'} on this desk
        </span>
        {selected > 0 ? (
          <button
            onClick={() => {
              set(empty);
              setQuery('');
              setPage(1);
            }}
          >
            <X size={11} />
            Clear filters
          </button>
        ) : (
          <span>Dates in IST</span>
        )}
      </div>
      <ErrorBox>{rs.error}</ErrorBox>
      {rs.loading ? (
        <Loading />
      ) : rs.data?.articles?.length ? (
        <div className="table-scroll cms-table">
          <table>
            <thead>
              <tr>
                <th>Headline / byline</th>
                <th>Section</th>
                <th>Status</th>
                <th>Access</th>
                <th>Last edited</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rs.data.articles.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button className="table-story" onClick={() => change('edit', a.id)}>
                      <img src={a.image} alt="" />
                      <span>
                        <strong>{a.title}</strong>
                        <small>
                          {a.author.name} · Revision {a.revision}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>{a.category.name}</td>
                  <td>
                    <Status value={a.status} />
                    {a.live && a.live.revision !== a.revision && (
                      <small className="table-small">v{a.live.revision} stays live</small>
                    )}
                    {review && (
                      <small className="table-small">{a.submitter?.name || 'Editorial desk'}</small>
                    )}
                  </td>
                  <td>{titleCase(a.access)}</td>
                  <td className="nowrap">{date(a.updatedAt)}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={'Open ' + a.title}
                      onClick={() => change('edit', a.id)}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !rs.error && (
          <Empty
            title={
              review
                ? mode === 'mandatory'
                  ? 'No stories awaiting mandatory approval'
                  : 'The section review desk is clear'
                : 'No matching stories'
            }
            text={
              review
                ? 'Submitted stories with this review route will appear here.'
                : 'Adjust your filters or start a new draft.'
            }
          />
        )
      )}{' '}
      {rs.data?.pages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            <ArrowLeft size={13} />
            Previous
          </button>
          <span>
            {page} of {rs.data.pages}
          </span>
          <button disabled={page >= rs.data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
            <ArrowRight size={13} />
          </button>
        </div>
      )}
    </>
  );
}
