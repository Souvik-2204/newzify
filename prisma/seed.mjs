import { release } from '../server/publications.mjs';
import { db } from '../server/db.mjs';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import 'dotenv/config';
const desks = [
  [
    'Politics',
    'The decisions, institutions and people shaping public life in India.',
    'National Desk',
  ],
  ['Business', 'Markets, enterprise and the forces moving the Indian economy.', 'Business Desk'],
  ['Technology', 'The discoveries and ideas changing the way India lives.', 'Science Desk'],
  ['World', 'India’s place in a connected world, from diplomacy to trade.', 'Global Affairs Desk'],
  [
    'Sports',
    'Beyond the scorecard. India’s athletes, ambitions and defining moments.',
    'Sports Desk',
  ],
  ['Opinion', 'Independent perspectives on the questions that matter to India.', 'Opinion Desk'],
];
export async function seed() {
  if ((await db.role.count()) && (await db.article.count())) return;
  for (const [id, name] of [
    ['READER', 'Reader'],
    ['SUPER_ADMIN', 'Super Admin'],
    ['CHIEF_EDITOR', 'Chief Editor'],
    ['SECTION_EDITOR', 'Section Editor'],
    ['AUTHOR', 'Author / Journalist'],
  ])
    await db.role.upsert({ where: { id }, create: { id, name }, update: {} });
  const cats = {};
  for (const [i, [name, description]] of desks.entries())
    cats[name] = await db.category.upsert({
      where: { name },
      create: { name, slug: name.toLowerCase(), description, position: i },
      update: {},
    });
  const creds = [];
  const local = process.env.NODE_ENV !== 'production';
  async function user(name, email, roleId, sectionId, password) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return existing;
    const p = password || crypto.randomBytes(16).toString('base64url');
    const u = await db.user.create({
      data: {
        name,
        email,
        roleId,
        sectionId,
        ...(roleId === 'SECTION_EDITOR' && sectionId
          ? { assignedSections: { connect: { id: sectionId } } }
          : {}),
        passwordHash: await bcrypt.hash(p, 12),
        bio:
          roleId === 'AUTHOR'
            ? `Briefings and context from The Meridian’s ${name.toLowerCase()}.`
            : '',
      },
    });
    if (local && !email.includes('desk.')) creds.push({ role: roleId, email, password: p });
    return u;
  }
  if (
    !local &&
    (!process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      process.env.ADMIN_PASSWORD.length < 12)
  )
    throw new Error('Set a strong ADMIN_PASSWORD and ADMIN_EMAIL before the production seed.');
  await user(
    'Newsroom Administrator',
    process.env.ADMIN_EMAIL || 'admin@meridian.local',
    'SUPER_ADMIN',
    null,
    process.env.ADMIN_PASSWORD,
  );
  const chief = await user('Managing Editor', 'editor@meridian.local', 'CHIEF_EDITOR', null);
  await user(
    'National Section Editor',
    'section@meridian.local',
    'SECTION_EDITOR',
    cats.Politics.id,
  );
  await user('Newsroom Journalist', 'author@meridian.local', 'AUTHOR', null);
  const authors = {};
  for (let [name, , desk] of desks)
    authors[name] = await user(
      desk,
      `desk.${name.toLowerCase()}@meridian.local`,
      'AUTHOR',
      cats[name].id,
    );
  for (const [level, price, features] of [
    ['BRONZE', 99, ['All free journalism', 'Bronze member stories', 'Your personal reading list']],
    [
      'SILVER',
      199,
      [
        'Everything in Bronze',
        'Silver analysis and explainers',
        'Deeper coverage across six desks',
      ],
    ],
    [
      'GOLD',
      399,
      ['Everything in Silver', 'Every Gold editorial essay', 'Unlimited access to every story'],
    ],
  ])
    await db.plan.upsert({
      where: { level },
      create: {
        name: level[0] + level.slice(1).toLowerCase(),
        level,
        monthlyPaise: price * 100,
        annualPaise: price * 1000,
        features,
      },
      update: {},
    });
  const edition = JSON.parse(fs.readFileSync(new URL('./edition.json', import.meta.url), 'utf8'));
  for (const a of edition) {
    const { category, imageSource, originalHeadline, ...fields } = a;
    if (await db.article.findUnique({ where: { slug: a.slug } })) continue;
    const date = new Date(a.sourceDate);
    const created = await db.article.create({
      include: { tags: true },
      data: {
        ...fields,
        sourceDate: date,
        categoryId: cats[category].id,
        authorId: authors[category].id,
        creatorId: authors[category].id,
        submittedById: authors[category].id,
        submittedAt: date,
        indiaConfirmed: true,
        approvalLocked: true,
        publicationDate: date,
        lastEditorId: authors[category].id,
        status: 'PUBLISHED',
        publishedAt: date,
        createdAt: date,
        tags: {
          connectOrCreate: {
            where: { name: category === 'World' ? 'India abroad' : 'India' },
            create: { name: category === 'World' ? 'India abroad' : 'India' },
          },
        },
        approvals: {
          create: [
            { actorId: authors[category].id, action: 'SUBMITTED', revision: 1, createdAt: date },
            {
              actorId: chief.id,
              action: 'APPROVED',
              reason: 'Curated launch edition; source and publication date checked.',
              revision: 1,
              createdAt: date,
            },
            { actorId: chief.id, action: 'PUBLISHED', revision: 1, createdAt: date },
          ],
        },
      },
    });
    await release(db, created, date);
  }
  if (local && creds.length)
    fs.writeFileSync('data/local-accounts.json', JSON.stringify(creds, null, 2), { mode: 0o600 });
  console.log(
    `Edition ready: ${edition.length} India-focused articles, with original source dates.`,
  );
}
if (process.argv.includes('--run')) {
  await seed();
  await db.$disconnect();
}
