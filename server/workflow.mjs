import { failure, DAY } from './core.mjs';
export const senior = (u) => ['CHIEF_EDITOR', 'SUPER_ADMIN'].includes(u?.roleId);
export const assigned = (u) => [
  ...new Set([u.sectionId, ...(u.assignedSections || []).map((c) => c.id)].filter(Boolean)),
];
export const scope = (u) => ({
  deletedAt: null,
  ...(u.roleId === 'AUTHOR'
    ? { OR: [{ creatorId: u.id }, { authorId: u.id }] }
    : u.roleId === 'SECTION_EDITOR'
      ? { categoryId: { in: assigned(u) } }
      : senior(u)
        ? {}
        : { id: 'not-authorised' }),
});
export function canManage(a, u) {
  return (
    !a.deletedAt &&
    (senior(u) ||
      (u.roleId === 'AUTHOR' && (a.creatorId === u.id || a.authorId === u.id)) ||
      (u.roleId === 'SECTION_EDITOR' && assigned(u).includes(a.categoryId)))
  );
}
export function independent(a, id) {
  return ![
    a.creatorId,
    a.authorId,
    a.lastEditorId,
    a.submittedById,
    ...(a.approvals || []).filter((x) => x.action === 'SUBMITTED').map((x) => x.actorId),
  ].includes(id);
}
export function transition(a, u, action, reason, reviewed = false) {
  if (!canManage(a, u)) throw failure(403, 'This story is outside your editorial permissions.');
  if (action === 'SUBMIT') {
    if (a.status === 'REJECTED')
      throw failure(409, 'Save a corrected revision before resubmitting.');
    if (a.status !== 'DRAFT') throw failure(409, 'Only a saved draft can be submitted.');
    return 'IN_REVIEW';
  }
  const mandatory = a.requiresApproval !== false;
  if (!senior(u) && (u.roleId !== 'SECTION_EDITOR' || mandatory))
    throw failure(
      403,
      mandatory
        ? 'A Chief Editor must review mandatory-approval stories.'
        : 'Only an authorised editor can review this submission.',
    );
  if (action === 'APPROVE' || action === 'REJECT') {
    if (a.status !== 'IN_REVIEW') throw failure(409, 'The story is not awaiting review.');
    if (!independent(a, u.id))
      throw failure(
        403,
        'Creators, byline authors, submitters and the last editor cannot check their own work.',
      );
    if (action === 'REJECT' && !reason?.trim())
      throw failure(400, 'A rejection reason is required.');
    return action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  }
  if (action === 'PUBLISH') {
    const approved =
      a.status === 'APPROVED' &&
      a.approvals?.some(
        (x) => x.action === 'APPROVED' && x.revision === a.revision && independent(a, x.actorId),
      );
    if (!approved) {
      if (mandatory || a.status !== 'IN_REVIEW')
        throw failure(409, 'Approval of the current submitted revision is required.');
      if (!independent(a, u.id))
        throw failure(403, 'A separate editor must review and publish this submission.');
      if (!reviewed)
        throw failure(400, 'Confirm that you reviewed the current revision and its source.');
    }
    if (
      !a.sourceDate ||
      +a.sourceDate < Date.now() - 28 * DAY ||
      +a.sourceDate > Date.now() ||
      a.region !== 'IN'
    )
      throw failure(400, 'Only India coverage sourced in the last 28 days can be published.');
    return 'PUBLISHED';
  }
  throw failure(400, 'Unknown workflow action.');
}
export function readyForReview(a) {
  const errors = [];
  if (a.title.trim().length < 8) errors.push('a headline of at least 8 characters');
  if (a.summary.trim().length < 20) errors.push('a summary of at least 20 characters');
  if (a.content.trim().length < 80) errors.push('at least 80 characters of article text');
  if (!a.image || !a.imageCredit.trim()) errors.push('a credited featured image');
  if (!a.sourceName?.trim() || !/^https:\/\//.test(a.sourceUrl))
    errors.push('a named source and secure source URL');
  if (!a.sourceDate || +a.sourceDate > Date.now() || +a.sourceDate < Date.now() - 28 * DAY)
    errors.push('a source date within the last 28 days');
  if (!a.indiaConfirmed) errors.push('confirmation of India-focused coverage');
  if (a.publicationDate && (+a.publicationDate > Date.now() || +a.publicationDate < +a.sourceDate))
    errors.push('a publication time between the original source date and now');
  if (errors.length) throw failure(422, 'Before submission, add ' + errors.join('; ') + '.');
}
