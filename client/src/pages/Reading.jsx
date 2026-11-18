import { DocumentBody } from '../components/Document.jsx';
import React, { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Clock3,
  Share2,
  Copy,
  Mail,
  Bookmark,
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Globe2,
  MapPin,
  Check,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import { useApp, useLoad, date, editionDate, titleCase } from '../lib.jsx';
import {
  Kicker,
  SectionHead,
  StoryCard,
  PageTitle,
  Loading,
  Empty,
  ErrorBox,
  Modal,
  Access,
  Save,
  Logo,
} from '../components/UI.jsx';
export function Browse() {
  const { slug } = useParams(),
    { edition } = useApp(),
    [params, setParams] = useSearchParams();
  const cat = edition?.categories.find((c) => c.slug === slug);
  const q = params.get('q') || '',
    [draft, setDraft] = useState(q),
    access = params.get('access') || '',
    sort = params.get('sort') || 'latest',
    page = Number(params.get('page')) || 1;
  useEffect(() => setDraft(q), [q]);
  const query = new URLSearchParams({
    page: String(page),
    sort,
    ...(q ? { q } : {}),
    ...(slug ? { category: slug } : {}),
    ...(access ? { access } : {}),
  });
  const { data, loading, error } = useLoad('/articles?' + query);
  function set(name, value) {
    const p = new URLSearchParams(params);
    if (value) p.set(name, value);
    else p.delete(name);
    if (name !== 'page') p.delete('page');
    setParams(p);
  }
  const title = slug ? cat?.name || titleCase(slug) : q ? 'Search results' : 'Latest News';
  return (
    <main className="inner-page" id="main-content">
      <PageTitle title={title} />
      <section className="section-banner">
        <div className="container">
          <div className="breadcrumbs">
            <Link to="/">Front page</Link>
            <ChevronRight size={11} />
            <span>{title}</span>
          </div>
          <div className="browse-title">
            <div>
              <Kicker>
                {slug ? 'The ' + (cat?.name || slug) + ' desk' : 'The complete edition'}
              </Kicker>
              <h1>{title}</h1>
              <p>
                {cat?.description ||
                  (q
                    ? `Stories matching “${q}” in the current edition.`
                    : 'Recent reporting from across India. Six desks, one considered perspective.')}
              </p>
            </div>
            <div className="edition-stamp">
              <Globe2 size={23} strokeWidth={1} />
              <span>The Indian edition</span>
              <small>{editionDate()}</small>
            </div>
          </div>
        </div>
      </section>
      <div className="container section browse-body">
        <div className="browse-tools">
          <form
            className="inline-search"
            onSubmit={(e) => {
              e.preventDefault();
              set('q', draft.trim());
            }}
          >
            <Search size={17} />
            <input
              aria-label="Search this section"
              placeholder={slug ? 'Search this section…' : 'Search the edition…'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button aria-label="Search">
              <ArrowRight size={16} />
            </button>
          </form>
          <div className="browse-selects">
            <select
              aria-label="Filter article access"
              value={access}
              onChange={(e) => set('access', e.target.value)}
            >
              <option value="">All access</option>
              <option value="free">Free to read</option>
              <option value="premium">Premium</option>
            </select>
            <select
              aria-label="Sort articles"
              value={sort}
              onChange={(e) => set('sort', e.target.value)}
            >
              <option value="latest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="trending">Most read</option>
            </select>
          </div>
        </div>
        <div className="browse-count">
          <span>
            {data?.total ?? '—'} {data?.total === 1 ? 'story' : 'stories'}
          </span>
          <span>India · Last 28 days</span>
        </div>
        <ErrorBox>{error}</ErrorBox>
        {loading ? (
          <Loading label="Gathering the latest stories…" />
        ) : data?.articles.length ? (
          <div className="three-grid browse-grid">
            {data.articles.map((a) => (
              <StoryCard key={a.id} article={a} />
            ))}
          </div>
        ) : (
          <Empty
            title="No stories in this selection"
            text="Try another search, or return to the full Indian edition."
          >
            <Link className="btn outline" to="/latest">
              Browse all stories <ArrowRight size={15} />
            </Link>
          </Empty>
        )}
        {data?.pages > 1 && (
          <div className="pagination">
            <button
              disabled={page <= 1}
              onClick={() => {
                set('page', page - 1);
                window.scrollTo({ top: 200, behavior: 'smooth' });
              }}
            >
              <ArrowLeft size={15} />
              Previous
            </button>
            <span>
              Page {page} of {data.pages}
            </span>
            <button
              disabled={page >= data.pages}
              onClick={() => {
                set('page', page + 1);
                window.scrollTo({ top: 200, behavior: 'smooth' });
              }}
            >
              Next
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
export function Article() {
  const { slug } = useParams(),
    { user, level, notify, setAuth, edition } = useApp();
  const { data, loading, error } = useLoad(
    '/articles/' + encodeURIComponent(slug),
    (user?.id || 'guest') + level,
  );
  const [author, setAuthor] = useState(false),
    [share, setShare] = useState(false);
  useEffect(() => {
    setShare(false);
    setAuthor(false);
  }, [slug]);
  if (loading)
    return (
      <main className="inner-page">
        <Loading label="Opening your story…" />
      </main>
    );
  if (error || !data)
    return (
      <main className="inner-page container page-pad">
        <Empty title="Story unavailable" text={error || 'This story is not available.'}>
          <Link className="btn dark" to="/latest">
            Return to the edition
            <ArrowRight size={15} />
          </Link>
        </Empty>
      </main>
    );
  const { article: a, locked, related } = data,
    url = window.location.href;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      notify('Story link copied.');
      setShare(false);
    } catch {
      notify('Select and copy the story address below.');
    }
  }
  return (
    <main className="inner-page article-page" id="main-content">
      <PageTitle title={a.seoTitle || a.title} description={a.metaDescription || a.summary} />
      <div className="container article-intro">
        <div className="breadcrumbs">
          <Link to="/">Front page</Link>
          <ChevronRight size={10} />
          <Link to={'/section/' + a.category.slug}>{a.category.name}</Link>
          <ChevronRight size={10} />
          <span>{a.category.name === 'Opinion' ? 'Perspective' : 'The briefing'}</span>
        </div>
        <div className="article-title-area">
          <Kicker>
            {a.category.name} <span className="kicker-sep">/</span>{' '}
            {a.category.name === 'Opinion' ? 'The opinion pages' : 'The Indian edition'}
          </Kicker>
          <h1>{a.title}</h1>
          <p className="dek">{a.summary}</p>
          <div className="article-byline">
            <button className="author-button" onClick={() => setAuthor(true)}>
              <span className="avatar">
                {a.author.name
                  .split(' ')
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')}
              </span>
              <span>
                <strong>{a.author.name}</strong>
                <small>
                  {date(a.publishedAt, true)} · {a.location}
                </small>
              </span>
            </button>
            <div className="article-actions">
              <Access level={a.access} />
              <span className="vline" />
              <Save article={a} />
              <button
                className="icon-button"
                aria-label="Share this story"
                onClick={() => setShare(true)}
              >
                <Share2 size={16} />
              </button>
            </div>
          </div>
        </div>
        <figure className="article-figure">
          <img src={a.image} alt={a.title} />
          <figcaption>
            <span>
              {a.location} · {a.category.name}
            </span>
            <span>{a.imageCredit}</span>
          </figcaption>
        </figure>
      </div>
      <article className="reading-column">
        {locked ? (
          <div className="paywall">
            <LockKeyhole size={24} strokeWidth={1} />
            <Kicker>The members’ edition</Kicker>
            <h2>There’s more to this story.</h2>
            <p>
              This {titleCase(a.access)} article is reserved for{' '}
              {a.access === 'GOLD' ? 'Gold members' : titleCase(a.access) + ' members and above'}.
              Subscribe for the full perspective.
            </p>
            <Link className="btn dark" to={'/subscribe?plan=' + a.access}>
              Explore {titleCase(a.access)} membership <ArrowRight size={15} />
            </Link>
            {!user && (
              <button className="paywall-login" onClick={() => setAuth({ mode: 'login' })}>
                Already a member? <u>Sign in</u>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="reading-eyebrow">
              <span className="small-label">
                {a.category.name === 'Opinion' ? 'Opinion & analysis' : 'News briefing'}
              </span>
              <span>
                <Clock3 size={12} />
                {Math.max(1, Math.ceil(a.content.split(/\s+/).length / 180))} min read
              </span>
            </div>
            <DocumentBody doc={a.bodyDoc} text={a.content} />
            <div className="article-seal">✦</div>
          </>
        )}
        <aside className="source-note">
          <span className="small-label">Source & context</span>
          <p>
            This{' '}
            {a.category.name === 'Opinion' ? 'perspective is informed by' : 'briefing draws on'}{' '}
            reporting published by <strong>{a.sourceName}</strong> on {date(a.sourceDate)}.
          </p>
          <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="text-link">
            Read the source report <ArrowUpRight size={13} />
          </a>
        </aside>
        {a.tags.length > 0 && (
          <nav className="story-topics" aria-label="Article topics">
            <span>Topics</span>
            {a.tags.map((t) => (
              <Link key={t.name} to={'/latest?q=' + encodeURIComponent(t.name)}>
                {t.name}
              </Link>
            ))}
          </nav>
        )}
        <div className="article-foot">
          <span>
            Filed under <Link to={'/section/' + a.category.slug}>{a.category.name}</Link>
          </span>
          <button onClick={() => setShare(true)}>
            <Share2 size={14} />
            Share story
          </button>
        </div>
      </article>
      {related.length > 0 && (
        <section className="section related-section">
          <div className="container">
            <SectionHead
              kicker="Continue reading"
              title="Related Stories"
              to={'/section/' + a.category.slug}
              link={'All ' + a.category.name}
            />
            <div className="three-grid">
              {related.map((s) => (
                <StoryCard key={s.id} article={s} />
              ))}
            </div>
          </div>
        </section>
      )}
      {author && (
        <Modal title="About the author" onClose={() => setAuthor(false)}>
          <Kicker>The newsroom</Kicker>
          <h2>{a.author.name}</h2>
          <p className="muted">
            {a.author.bio || 'Reporting and perspective from The Meridian’s editorial team.'}
          </p>
          <h4 className="modal-subtitle">More from this desk</h4>
          <div className="simple-story-list">
            {edition?.articles
              .filter((s) => s.author.id === a.author.id && s.id !== a.id)
              .slice(0, 3)
              .map((s) => (
                <Link key={s.id} to={'/story/' + s.slug}>
                  {s.title}
                  <ArrowUpRight size={14} />
                </Link>
              ))}
          </div>
        </Modal>
      )}
      {share && (
        <Modal title="Share this story" onClose={() => setShare(false)}>
          <Kicker>Pass it on</Kicker>
          <h2>Share this story.</h2>
          <p className="muted">{a.title}</p>
          <label className="share-url">
            Story address
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <div className="share-options">
            <button className="btn dark" onClick={copy}>
              <Copy size={15} />
              Copy link
            </button>
            <a
              className="btn outline"
              href={
                'mailto:?subject=' +
                encodeURIComponent(a.title) +
                '&body=' +
                encodeURIComponent(url)
              }
            >
              <Mail size={15} />
              Email
            </a>
            <a
              className="btn outline"
              target="_blank"
              rel="noreferrer"
              href={'https://wa.me/?text=' + encodeURIComponent(a.title + ' ' + url)}
            >
              WhatsApp
              <ArrowUpRight size={13} />
            </a>
          </div>
        </Modal>
      )}
    </main>
  );
}
export function About() {
  const { page } = useParams();
  const privacy = page === 'privacy';
  return (
    <main className="inner-page" id="main-content">
      <div className="container page-pad">
        <div className="breadcrumbs">
          <Link to="/">Front page</Link>
          <ChevronRight size={11} />
          About the publication
        </div>
      </div>
      <article className="reading-column policy">
        <Kicker>The Meridian</Kicker>
        <h1>{privacy ? 'Reader privacy' : 'Editorial standards'}</h1>
        {privacy ? (
          <>
            <h2>Your account</h2>
            <p>
              We store your name, email address, password hash and reading-list choices in our
              database. Sign-in uses an expiring, HTTP-only session cookie. Your password is never
              returned to the browser.
            </p>
            <h2>Membership and payments</h2>
            <p>
              Razorpay handles payment authorisation in test mode. We keep the plan, payment
              reference, amount and subscription status. We do not store card details.
            </p>
            <h2>Reader preferences</h2>
            <p>
              Briefing sign-ups and membership-interest requests store the email address you
              provide. You can update your display name and remove saved stories from your account.
              Signing out revokes the current session.
            </p>
          </>
        ) : (
          <>
            <h2>An Indian lens</h2>
            <p>
              Every public story concerns India, its people, or its relationship with the world. Our
              current edition covers a rolling 28-day window and preserves the publication date of
              the source reporting.
            </p>
            <h2>Reporting, with a source</h2>
            <p>
              Our launch edition pairs concise, independently written briefs with links to the
              reporting that informs them. Opinion is filed separately from news. Forecasts are
              identified as forecasts, not reported outcomes.
            </p>
            <h2>Independent editorial review</h2>
            <p>
              Every story is reviewed before publication. Stories marked for mandatory approval need
              an independent senior editor’s sign-off; a section editor can review and release
              standard submissions on their own desk. Creators, byline authors, submitters and the
              last editor cannot check their own work. A returned story carries a reason, and drafts
              never replace the released edition.
            </p>
            <h2>Photography</h2>
            <p>
              Article images are credited below the photograph. The front-page lead uses an
              editorial image of New Delhi. Photographs illustrate the reporting and are not
              automatically presented as images captured on the story date.
            </p>
          </>
        )}
        <Link to="/" className="text-link">
          Back to the front page
          <ArrowRight size={15} />
        </Link>
      </article>
    </main>
  );
}
