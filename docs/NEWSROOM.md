# The Meridian newsroom

**Entry:** `/admin` or `/cms` for your role desk; `/newsroom` for the overview. The newsroom is separate from the public masthead and reader dashboard. For the local installation, use the private staff credentials in `data/local-accounts.json`. Open two different browser profiles (or one private window) to try a writer and reviewer at the same time.

## Find your role desk

Signing in from `/admin` or `/cms` opens **Roles & access**. From the overview, choose **Open my desk** or select **Roles & access** in the sidebar. The page shows the responsibilities of all four roles, but its action buttons use only the role returned by the authenticated staff session. Signing in is not a role selector. The sign-in page also offers a read-only **View newsroom roles** guide.

- **Super Admin:** open Users & roles, Categories & tags, Subscription plans or Newsroom settings.
- **Chief Editor:** open the mandatory approval queue, the list of approved stories ready for publication, or the featured-story layout.
- **Section Editor:** open an assigned category or the standard section review queue. Mandatory stories still go to a senior reviewer.
- **Author / Journalist:** create a draft, open your own drafts, correct a returned story or track your submissions.

## A story from draft to release

1. Open **Article manager → New story**. Give the draft a headline and section. The URL slug initially follows the headline; edit it in **Search & URL**. **Save draft** does not release anything.
2. **Manuscript** supports paragraphs, section headings, subheadings, bold, italic, underline, quotes, lists, web links, undo/redo and uploaded images with alt text. **Featured image** is the cover, separate from inline photographs. JPEG, PNG and WebP uploads are limited to 5 MB locally and 4 MB on Vercel. Add the image credit and select the author/byline.
3. Set the article's **Free, Bronze, Silver or Gold** access. Select **Mandatory approval** for the senior review route. New stories can inherit a default from Workspace settings; that default is not retroactive.
4. In **Source & metadata**, enter the original reporting publication, HTTPS link, source date, dateline and tags. Confirm the story is India-focused. The selected publication timestamp is in IST (leave blank to use release time). Future publication is not a scheduler. Submission and publication both check a current source, the manuscript, summary and attributed cover.
5. Use **Preview** to read the private version. **Submit for review** routes it to the appropriate queue. The author can read the submitted version but cannot change it in place.

| Working status | What happens next |
| --- | --- |
| Draft | Save edits or submit this revision. No draft is served by the public API. |
| Submitted · mandatory | **Pending approval**: an independent Chief Editor or Super Admin reviews it. The mandatory flag is locked against downgrades. |
| Submitted · standard | **Section review**: an independent assigned Section Editor or senior editor can approve, return, or confirm review and publish directly. |
| Rejected | The author sees the required reason in the editor and history. Save a corrected revision before resubmitting. |
| Approved | An authorised editor can publish the approved revision. Editing it invalidates the approval. |
| Published | Readers see the released snapshot at its configured tier. A new edit creates a draft; it does not change the released version. |

**Separation of duties:** the creator, credited author, submitters and last editor cannot approve their own work, even if they hold a senior role. Direct standard publication also requires an independent editor and explicit confirmation of review. The manuscript's revision number is sent with each edit, delete and decision; a conflicting write returns `409`, not a silent overwrite.

**Editorial record:** actions, actor, timestamp, revision and rejection reason are retained. Deleting a file is a soft removal. A live story can be removed only by a senior editor.

## Working copy versus public edition

`Article` is the private working file. `Publication` is a separately stored released revision. The guarded publish transaction swaps the reader-facing body, slug, SEO fields, byline, section, tags, dates, media and access level together. It is the only editorial workflow action that writes the live snapshot. Source expiry or a deliberate removal can independently take a released story out of the edition.

Home, search, sections, story pages, related stories, saved lists and crawler-visible metadata all read released data. Insufficient membership returns metadata only: neither the article text nor the rich document is in the response. Uploaded covers are public teasers only after release; uploaded inline photographs follow access to the released body. An unattached new upload is available to its uploader; an assigned editor can view media in a working file. Original upload URLs are served through Express permission checks with private, no-store responses.

## Running the desks

- **Article manager:** search headline/slug and filter by author, category and workflow status. Under **More filters**, select last edit, source date or publication date. Date ranges are inclusive calendar days in IST; the server applies role scope before returning paginated rows.
- **Front page:** Chief Editors and Super Admins select three cover leads, three Top Stories positions, an Editor’s Pick and up to twelve breaking stories. The options are live, in-window snapshots. A version guard prevents two editors from overwriting each other's layout.
- **Sections & tags:** Super Admins maintain the global taxonomy. Writers assign existing tags to a manuscript. A section with retained working or released records cannot be deleted.
- **Reader directory:** Super Admins can search accounts, create a staff or reader login, change roles and assign multiple sections. Changing permissions revokes that user's existing sessions. An administrator cannot change their own role. Share newly created credentials privately.
- **Membership plans:** change new-enrolment terms or pause an offer. Paid access remains cumulative. Existing contracts retain the agreed price and Razorpay plan; no staff toggle fabricates a successful payment.
- **Workspace settings:** choose the default access and review route, post a private desk notice, and inspect the administration log.

## API map

All paths below are under `/api`. Browser mutations use the same-origin `x-meridian-request: 1` header and HTTP-only session cookie. Roles, scope, independence and revision checks are server-side.

| Operation | Method and path |
| --- | --- |
| Staff sign-in | `POST /auth/staff-login` |
| Scoped dashboard and taxonomy choices | `GET /admin/overview` |
| Library or queue | `GET /admin/articles?q=&authorId=&categoryId=&status=&dateField=&from=&to=&reviewType=&page=` (omit unused filters) |
| Create, load, replace draft fields, soft-remove | `POST /admin/articles`; `GET`, `PUT`, `DELETE /admin/articles/:id` |
| Decide on a revision | `POST /admin/articles/:id/workflow` with `action`, `expectedRevision`, and `reason` for rejection or `reviewed: true` for direct publication |
| Upload one image | `POST /admin/images`, multipart field `image` |
| Read/save home placements | `GET`, `PUT /admin/front-page` (layout `version` on save) |
| Super Admin controls | `/admin/users`, `/admin/categories`, `/admin/tags`, `/admin/plans`, `/admin/settings`, `/admin/audit`, `/admin/subscriptions` |

`IN_REVIEW` is shown as **Submitted** in the interface. `reviewType=mandatory` selects Pending Approval; `reviewType=standard` selects Section Review. Article reads outside a person's desk return `404`. `401` means no valid session; `403` means the action is not permitted. Incomplete review material returns `422`; invalid fields or a missing rejection reason return `400`.

## Verification

With the seeded local preview running, `npm test` exercises the actual Express routes and PostgreSQL. `npm run test:newsroom` uses Chromium and separate journalist, chief, section-editor and administrator sessions. It uploads and formats a manuscript, previews it, returns it for corrections, releases it, revises a live tier and tests a standard direct publication on mobile. `npm run test:browser` additionally tests the public newspaper, reader account and membership interface. Use a disposable/local installation for these checks; fixtures are removed and layout/offer/settings changes restored.
