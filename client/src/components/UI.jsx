import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  LockKeyhole,
  Check,
  X,
  LoaderCircle,
  Newspaper,
} from 'lucide-react';
import { useApp, date, titleCase } from '../lib.jsx';
export function Logo({ compact = false }) {
  return (
    <span className={'brand' + (compact ? ' compact' : '')}>
      <svg className="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.55" transform="rotate(-23 24 24)">
          <circle cx="24" cy="24" r="19.5" />
          <ellipse cx="24" cy="24" rx="11.3" ry="19.5" />
          <path d="M24 4.5v39M4.5 24h39M8.2 12.4c8.4 6.2 23.2 6.2 31.6 0M8.2 35.6c8.4-6.2 23.2-6.2 31.6 0" />
        </g>
        <path d="M3 33C12 34 37 20 44 10" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      <span className="brand-word">
        The Meridian<span className="brand-sub">THE INDIAN EDITION</span>
      </span>
    </span>
  );
}
export function Kicker({ children, light = false }) {
  return (
    <div className={'kicker' + (light ? ' light' : '')}>
      <i />
      {children}
    </div>
  );
}
export function SectionHead({ kicker, title, to, link = 'View all stories', children }) {
  return (
    <div className="section-heading">
      <div>
        {kicker && <Kicker>{kicker}</Kicker>}
        <h2>{title}</h2>
      </div>
      {to ? (
        <Link className="text-link" to={to}>
          {link}
          <ArrowUpRight size={15} />
        </Link>
      ) : (
        children
      )}
    </div>
  );
}
export function Save({ article, light = false }) {
  const { saved, bookmark } = useApp();
  const yes = saved.includes(article.id);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        bookmark(article.id);
      }}
      className={'save-button' + (light ? ' over-image' : '') + (yes ? ' saved' : '')}
      aria-label={(yes ? 'Unsave ' : 'Save ') + article.title}
      title={yes ? 'Remove from reading list' : 'Save story'}
    >
      <Bookmark size={16} fill={yes ? 'currentColor' : 'none'} strokeWidth={1.5} />
    </button>
  );
}
export function Access({ level }) {
  return (
    <span className={'access-label ' + (level === 'FREE' ? 'free' : 'member')}>
      {level === 'FREE' ? <span className="little-dot" /> : <LockKeyhole size={10} />}{' '}
      {level === 'FREE' ? 'Free to read' : titleCase(level) + ' · Premium'}
    </span>
  );
}
export function StoryCard({ article: a, large = false, compact = false }) {
  if (!a) return null;
  return (
    <article
      className={'story-card' + (large ? ' lead-card' : '') + (compact ? ' compact-card' : '')}
    >
      <div className="card-media">
        <Link to={'/story/' + a.slug} aria-label={'Read ' + a.title}>
          <img loading="lazy" src={a.image} alt={a.title} />
        </Link>
        <Link className="photo-category" to={'/section/' + a.category.slug}>
          {a.category.name}
        </Link>
        <Save article={a} light />
      </div>
      <div className="card-info">
        <div className="card-meta">
          <span>{date(a.sourceDate)}</span>
          <span className="meta-dot" />
          <Access level={a.access} />
        </div>
        <h3>
          <Link to={'/story/' + a.slug}>{a.title}</Link>
        </h3>
        <p>{a.summary}</p>
        <div className="card-byline">
          By {a.author.name}
          <Link to={'/story/' + a.slug} aria-label={'Read ' + a.title}>
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Reveal({ children, className = '', as: Tag = 'div' }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      !('IntersectionObserver' in window) ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          el.classList.add('is-revealed');
          ob.disconnect();
        }
      },
      { threshold: 0.025 },
    );
    el.classList.add('reveal-ready');
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
export function Modal({ children, onClose, title, wide = false, className = '' }) {
  const panel = useRef(),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement,
      old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(
      () => panel.current?.querySelector('input,button,a,select,textarea')?.focus(),
      50,
    );
    const key = (e) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const els = [
          ...panel.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),a[href],select,textarea,[tabindex="0"]',
          ),
        ].filter((el) => el.offsetParent !== null);
        if (!els.length) return;
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        className={'modal-panel ' + (wide ? 'wide ' : '') + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button className="modal-close icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export function Empty({
  title = 'No stories found',
  text = 'Try another section or search term.',
  children,
}) {
  return (
    <div className="empty-state">
      <Newspaper size={28} strokeWidth={1} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Loading({ label = 'Opening the edition…' }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle size={19} />
      {label}
    </div>
  );
}
export function ErrorBox({ children }) {
  return children ? (
    <div className="error-box" role="alert">
      {children}
    </div>
  ) : null;
}
export function PageTitle({ title, description }) {
  useEffect(() => {
    document.title = title ? `${title} — The Meridian` : 'The Meridian — The Indian Edition';
    const meta = document.querySelector('meta[name=description]');
    const previous = meta?.content;
    if (description && meta) meta.content = description;
    return () => {
      if (meta && description) meta.content = previous || '';
    };
  }, [title, description]);
  return null;
}
export function CheckLine({ children }) {
  return (
    <li>
      <Check size={16} />
      {children}
    </li>
  );
}
