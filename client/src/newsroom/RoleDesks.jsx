import React from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ClipboardCheck,
  FilePenLine,
  LayoutTemplate,
  ListChecks,
  LockKeyhole,
  Newspaper,
  NotebookPen,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  WalletCards,
} from 'lucide-react';
import { Kicker } from '../components/UI.jsx';
import '../styles/role-desks.css';

// Display copy and navigation only. Express obtains permissions from the signed-in user.
const desks = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    desk: 'Administration',
    icon: ShieldCheck,
    description: 'Manage users, roles, categories, subscription plans and settings.',
    tools: [
      ['Users & roles', Users, { tab: 'users' }],
      ['Categories & tags', Tags, { tab: 'taxonomy' }],
      ['Subscription plans', WalletCards, { tab: 'plans' }],
      ['Newsroom settings', Settings2, { tab: 'settings' }],
    ],
  },
  CHIEF_EDITOR: {
    name: 'Chief Editor',
    desk: 'Publication',
    icon: Newspaper,
    description:
      'Review and approve articles across all categories. Manage publication and featured stories.',
    tools: [
      ['Review mandatory submissions', ClipboardCheck, { tab: 'review', reviewType: 'mandatory' }],
      ['Ready to publish', BadgeCheck, { tab: 'articles', status: 'APPROVED' }],
      ['Curate featured stories', LayoutTemplate, { tab: 'front-page' }],
    ],
  },
  SECTION_EDITOR: {
    name: 'Section Editor',
    desk: 'Section desk',
    icon: ListChecks,
    description:
      'Manage assigned categories, review submissions and publish articles that do not require higher approval.',
    tools: [
      ['Review section submissions', ClipboardCheck, { tab: 'review', reviewType: 'standard' }],
      ['Assigned articles', Newspaper, { tab: 'articles' }],
      ['Start a section draft', FilePenLine, { tab: 'edit' }],
    ],
  },
  AUTHOR: {
    name: 'Author / Journalist',
    desk: 'Reporting',
    icon: NotebookPen,
    description: 'Create and edit your own drafts, then submit articles for editorial review.',
    tools: [
      ['Create a draft', FilePenLine, { tab: 'edit' }],
      ['My drafts', NotebookPen, { tab: 'articles', status: 'DRAFT' }],
      ['Returned for correction', ClipboardCheck, { tab: 'articles', status: 'REJECTED' }],
      ['My submissions', Newspaper, { tab: 'articles', status: 'IN_REVIEW' }],
    ],
  },
};

export function RoleDirectory({ current }) {
  return (
    <div className="roles-register" aria-label="The four newsroom roles">
      {Object.entries(desks).map(([id, role], index) => {
        const Icon = role.icon;
        return (
          <article key={id} className={'role-entry' + (current === id ? ' is-current' : '')}>
            <div className="role-entry-meta">
              <span>
                0{index + 1} <i /> {role.desk}
              </span>
              {current === id ? (
                <b>
                  <Check size={12} /> Your role
                </b>
              ) : (
                <Icon aria-hidden="true" size={17} />
              )}
            </div>
            <h3>{role.name}</h3>
            <p>{role.description}</p>
          </article>
        );
      })}
    </div>
  );
}

export function MyDeskBar({ user, open }) {
  const role = desks[user.roleId];
  if (!role) return null;
  const Icon = role.icon;
  return (
    <section className="my-desk-bar" aria-label="Your signed-in role">
      <div className="my-desk-emblem">
        <Icon size={21} aria-hidden="true" />
      </div>
      <div className="my-desk-copy">
        <span>YOUR ASSIGNED ROLE</span>
        <h2>{role.name}</h2>
        <p>{role.description}</p>
      </div>
      <button className="desk-open" onClick={open}>
        Open my desk <ArrowUpRight size={14} />
      </button>
    </section>
  );
}

export default function RoleDesks({ user, categories, go }) {
  const role = desks[user.roleId];
  if (!role) return null;
  const assigned = new Set(
    [user.sectionId, ...(user.assignedSections || []).map((s) => s.id)].filter(Boolean),
  );
  const sections = categories.filter((c) => assigned.has(c.id));
  const sectionDesk = user.roleId === 'SECTION_EDITOR';
  const Icon = role.icon;
  return (
    <div className="desk-page">
      <div className="cms-title">
        <div>
          <Kicker>Newsroom directory</Kicker>
          <h1>Roles &amp; access</h1>
          <p>Your editorial tools and the responsibilities of each newsroom role.</p>
        </div>
      </div>
      <section className="desk-console" aria-label="Your assigned desk">
        <div className="desk-console-heading">
          <span className="desk-overline">
            <i /> SIGNED-IN DESK
          </span>
          <span className="desk-identity">
            <LockKeyhole size={13} /> {user.name}
          </span>
        </div>
        <div className="desk-summary">
          <span className="desk-seal">
            <Icon size={27} strokeWidth={1.3} />
          </span>
          <div>
            <h2>{role.name}</h2>
            <p>{role.description}</p>
          </div>
        </div>
        {sectionDesk && (
          <div className="desk-assignments">
            <span>Assigned categories</span>
            {sections.length ? (
              sections.map((c) => (
                <button key={c.id} onClick={() => go({ tab: 'articles', categoryId: c.id })}>
                  {c.name} <ArrowUpRight size={12} />
                </button>
              ))
            ) : (
              <small>No categories assigned. Contact your Super Admin.</small>
            )}
          </div>
        )}
        {(!sectionDesk || sections.length > 0) && (
          <nav className="desk-tools" aria-label="Tools for your role">
            {role.tools.map(([name, Glyph, target]) => (
              <button key={name} onClick={() => go(target)}>
                <Glyph size={16} />
                <span>{name}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </nav>
        )}
      </section>
      <section className="roles-guide" aria-labelledby="roles-register-title">
        <div className="roles-guide-heading">
          <div>
            <Kicker>Staff handbook</Kicker>
            <h2 id="roles-register-title">Newsroom roles</h2>
          </div>
          <span>04 DESKS</span>
        </div>
        <RoleDirectory current={user.roleId} />
      </section>
      <aside className="desk-review-note">
        <ShieldCheck size={17} />
        <p>
          <strong>Independent review.</strong> No one can approve a story they created or submitted.
          Mandatory stories need independent senior approval; a Section Editor may release a
          standard submission in an assigned category after reviewing it.
        </p>
      </aside>
    </div>
  );
}
