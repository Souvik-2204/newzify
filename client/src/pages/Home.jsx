import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  MapPin,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Plus,
  Globe2,
} from 'lucide-react';
import { useApp, date, editionDate } from '../lib.jsx';
import {
  Kicker,
  SectionHead,
  StoryCard,
  Reveal,
  PageTitle,
  ErrorBox,
  Loading,
  Empty,
} from '../components/UI.jsx';
const fronts = [
  {
    tag: 'Top news',
    lines: ['The stories', 'shaping India'],
    summary:
      'The people, policies, and turning points defining a nation.\nA closer look at the news that matters.',
    image: '/images/hero-india.jpg',
    place: 'Raisina Hill, New Delhi',
  },
  {
    tag: 'Business',
    lines: ['Business', 'beyond borders'],
    summary: 'From Indian ports to international markets.\nThe forces moving the nation’s economy.',
    image: '/images/hero-business.jpg',
    place: 'Vizhinjam, Kerala',
  },
  {
    tag: 'Technology',
    lines: ['Technology', 'of tomorrow'],
    summary: 'Inside the ambition, ideas, and industry\nbuilding India’s technological future.',
    image: '/images/hero-technology.jpg',
    place: 'India’s semiconductor industry',
  },
];
function Hero({ articles }) {
  const [idx, setIdx] = useState(0),
    [prev, setPrev] = useState(-1),
    [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(false),
    [key, setKey] = useState(0);
  const hero = useRef(),
    touch = useRef(0);
  const defaults = [
    'rural-jobs-accountability',
    'india-trillion-dollar-exports',
    'india-semiconductor-supply-chain',
  ];
  const slots = fronts.map((f, i) => {
    const article = articles.find((a) => a.heroSlot === i + 1);
    return {
      ...f,
      ...(article && (article.slug !== defaults[i] || article.revision !== 1)
        ? {
            image: article.image,
            lines: [article.title],
            custom: true,
            summary: article.summary,
            place: article.location,
            tag: article.category.name,
          }
        : {}),
      article,
    };
  });
  const go = (n) => {
    setPrev(idx);
    setIdx((n + 3) % 3);
    setKey((k) => k + 1);
  };
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const c = () => setReduced(m.matches);
    m.addEventListener('change', c);
    return () => m.removeEventListener('change', c);
  }, []);
  useEffect(() => {
    if (paused || reduced) return;
    const t = setTimeout(() => {
      if (!document.hidden) go(idx + 1);
      else setKey((k) => k + 1);
    }, 14000);
    return () => clearTimeout(t);
  }, [idx, paused, reduced, key]);
  useEffect(() => {
    let raf;
    const s = () => {
      if (!reduced && window.scrollY < 900) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() =>
          hero.current?.style.setProperty('--parallax', Math.min(window.scrollY * 0.13, 75) + 'px'),
        );
      }
    };
    window.addEventListener('scroll', s, { passive: true });
    return () => {
      window.removeEventListener('scroll', s);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);
  const s = slots[idx];
  return (
    <section
      className="hero"
      ref={hero}
      aria-label="Front page lead stories"
      aria-roledescription="carousel"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const d = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(d) > 70) go(idx + (d < 0 ? 1 : -1));
      }}
    >
      <div className={'hero-pictures' + (prev === -1 ? ' initial' : '')} aria-hidden="true">
        {slots.map((f, i) => (
          <div
            key={i}
            className={'hero-picture ' + (idx === i ? 'current' : prev === i ? 'previous' : '')}
          >
            <img src={f.image} alt="" fetchPriority={i === 0 ? 'high' : 'low'} />
          </div>
        ))}
      </div>
      <div className="hero-shade" />
      <div className="hero-body container" key={'copy' + idx}>
        <div className="hero-labels">
          <span className="hero-category">
            <i />
            {s.tag}
          </span>
          <span className="hero-rule" />
          <span>The front page</span>
          <span className="hero-edition-date">{date(new Date())}</span>
        </div>
        <h1 className={s.custom ? 'curated-headline' : undefined}>
          {s.lines.map((line, i) => (
            <span className="headline-mask" key={line}>
              <span style={{ '--n': i }}>{line}</span>
            </span>
          ))}
        </h1>
        <p>{s.summary}</p>
        <Link
          to={s.article ? '/story/' + s.article.slug : '/latest'}
          className="btn peach hero-cta"
        >
          {s.article ? 'Read story' : 'Explore the edition'} <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="hero-bottom container">
        <div className="slide-meter">
          <span className="slide-number">0{idx + 1}</span>
          <div className="progress-tracks">
            {fronts.map((f, i) => (
              <button
                key={i}
                aria-label={'Go to slide ' + (i + 1)}
                aria-current={idx === i ? 'true' : undefined}
                className={idx === i ? 'active' : ''}
                onClick={() => go(i)}
              >
                <i
                  key={idx === i ? key : 'idle'}
                  style={{ animationPlayState: paused || reduced ? 'paused' : 'running' }}
                />
              </button>
            ))}
          </div>
          <span className="slide-total">03</span>
          <button
            className="playback"
            aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
            onClick={() => setPaused((p) => !p)}
          >
            {paused || reduced ? <Play size={10} /> : <Pause size={10} />}
          </button>
        </div>
        <div className="hero-bottom-right">
          <span className="photo-location">
            <MapPin size={12} />
            {s.place}
          </span>
          <button
            onClick={() => go(idx - 1)}
            className="round-arrow"
            aria-label="Previous lead story"
          >
            <ArrowLeft size={16} />
          </button>
          <button onClick={() => go(idx + 1)} className="round-arrow" aria-label="Next lead story">
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
function Ticker({ articles }) {
  const list = articles.filter((a) => a.breaking).slice(0, 12);
  if (!list.length) return null;
  return (
    <aside className="ticker" aria-label="Breaking news">
      <div className="ticker-badge">
        <i />
        Breaking news
      </div>
      <div className="ticker-window">
        <div className="ticker-track">
          {[0, 1].map((n) => (
            <div className="ticker-copy" key={n} aria-hidden={n === 1}>
              {list.map((a) => (
                <React.Fragment key={a.id}>
                  <Link to={'/story/' + a.slug} tabIndex={n === 1 ? -1 : 0}>
                    {a.title}
                  </Link>
                  <b>✦</b>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>
      <Link className="ticker-end" to="/latest" aria-label="View all recent news">
        <ArrowRight size={16} />
      </Link>
    </aside>
  );
}
export default function Home() {
  const { edition, editionError, refreshEdition } = useApp();
  const articles = edition?.articles || [],
    categories = edition?.categories || [];
  const [latestFilter, setFilter] = useState('All');
  const top = articles
    .filter((a) => a.featuredRank > 0)
    .sort((a, b) => a.featuredRank - b.featuredRank)
    .slice(0, 3);
  const supporting = articles.filter((a) => !top.some((b) => b.id === a.id)).slice(0, 3);
  const picks = articles.find((a) => a.editorPick);
  const trending = [...articles]
    .sort((a, b) => b.views - a.views || Date.parse(b.sourceDate) - Date.parse(a.sourceDate))
    .slice(0, 4);
  const latest = (
    latestFilter === 'All' ? articles : articles.filter((a) => a.category.name === latestFilter)
  )
    .filter((a) => !top.some((t) => t.id === a.id))
    .slice(0, 3);
  const premium = articles.filter((a) => a.access !== 'FREE').slice(0, 3);
  return (
    <>
      <PageTitle />
      <Hero articles={articles} />
      <Ticker articles={articles} />
      {editionError && (
        <div className="container">
          <ErrorBox>
            {editionError} <button onClick={refreshEdition}>Reload edition</button>
          </ErrorBox>
        </div>
      )}
      <main id="main-content">
        <section className="container section top-stories">
          <SectionHead kicker="The daily edit" title="Top Stories" to="/latest" />
          {!edition ? (
            <Loading />
          ) : (
            <>
              <div className="top-grid">
                {top.map((a, i) => (
                  <StoryCard key={a.id} article={a} large={i === 0} />
                ))}
              </div>
              {!top.length && (
                <Empty
                  title="The next edition is being prepared"
                  text="Only India coverage published in the past 28 days appears here."
                />
              )}
              <div className="supporting-grid">
                {supporting.map((a) => (
                  <Link to={'/story/' + a.slug} key={a.id}>
                    <div className="small-label">{a.category.name}</div>
                    <h3>{a.title}</h3>
                    <ArrowUpRight size={15} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
        <Reveal as="section" className="trending-section">
          <div className="container">
            <div className="trending-intro">
              <span className="live-dot" />
              <h2>Trending Now</h2>
              <span className="trending-rule" />
            </div>
            <div className="trending-grid">
              {trending.map((a, i) => (
                <Link key={a.id} to={'/story/' + a.slug}>
                  <b>0{i + 1}</b>
                  <div>
                    <span className="small-label">{a.category.name}</span>
                    <h3>{a.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
        <Reveal as="section" className="container section">
          <SectionHead
            kicker="From our news desks"
            title="Latest News"
            to="/latest"
            link="Explore the edition"
          />
          <div className="filter-tabs" aria-label="Filter latest news">
            {['All', ...categories.map((c) => c.name)].map((c) => (
              <button
                key={c}
                className={latestFilter === c ? 'selected' : ''}
                onClick={() => setFilter(c)}
              >
                {c === 'All' ? 'All sections' : c}
              </button>
            ))}
          </div>
          <div className="three-grid">
            {latest.map((a) => (
              <StoryCard key={a.id} article={a} />
            ))}
          </div>
        </Reveal>
        {picks && (
          <Reveal as="section" className="editor-pick container">
            <Link to={'/story/' + picks.slug} className="editor-image">
              <img src={picks.image} alt={picks.title} loading="lazy" />
              <span>
                <MapPin size={12} />
                {picks.location}, India
              </span>
            </Link>
            <div className="editor-copy">
              <Kicker>Editor’s pick</Kicker>
              <div className="editor-symbol">“</div>
              <span className="small-label">{picks.category.name} / The long view</span>
              <h2>
                <Link to={'/story/' + picks.slug}>{picks.title}</Link>
              </h2>
              <p>{picks.summary}</p>
              <Link className="text-link" to={'/story/' + picks.slug}>
                Read the story <ArrowUpRight size={15} />
              </Link>
            </div>
          </Reveal>
        )}
        <Reveal as="section" className="container section">
          <SectionHead kicker="Explore the newspaper" title="Our Sections" />
          <div className="category-grid">
            {categories.map((c, i) => {
              const img = articles.find((a) => a.category.id === c.id);
              return (
                <Link
                  to={'/section/' + c.slug}
                  key={c.id}
                  style={{
                    backgroundImage: `linear-gradient(0deg,rgba(15,24,23,.86),rgba(15,24,23,.09)),url(${img?.image || '/images/hero-india.jpg'})`,
                  }}
                >
                  <div>
                    <small>0{i + 1} /</small>
                    <ArrowUpRight size={15} />
                  </div>
                  <h3>{c.name}</h3>
                </Link>
              );
            })}
          </div>
        </Reveal>
        <Reveal as="section" className="premium-section">
          <div className="container">
            <div className="premium-heading">
              <div>
                <Kicker light>Meridian membership</Kicker>
                <h2>
                  Premium Stories<span>✦</span>
                </h2>
                <p>Go beyond the headline with our members’ edition.</p>
              </div>
              <Link className="btn peach" to="/subscribe">
                Explore membership <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="premium-grid">
              {premium.map((a) => (
                <Link key={a.id} to={'/story/' + a.slug}>
                  <div className="premium-image">
                    <img loading="lazy" src={a.image} alt="" />
                  </div>
                  <div>
                    <span className="small-label">
                      <LockKeyhole size={10} />
                      {a.access} edition
                    </span>
                    <h3>{a.title}</h3>
                    <span className="premium-date">{date(a.sourceDate)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      </main>
    </>
  );
}
