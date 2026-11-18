import React, { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Check } from 'lucide-react';
import { api, useApp, useLoad, date, roles, titleCase } from '../lib.jsx';
import { Kicker, Loading, ErrorBox, Empty, Modal } from '../components/UI.jsx';
export default function Directory({ data, rev, reload }) {
  const { user, notify } = useApp(),
    [edit, setEdit] = useState(null),
    [role, setRole] = useState(''),
    [err, setErr] = useState(''),
    [q, setQ] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 140);
    return () => clearTimeout(t);
  }, [q]);
  const result = useLoad('/admin/users?' + new URLSearchParams({ q: query, page }), rev);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const f = new FormData(e.currentTarget);
      const b = { roleId: f.get('roleId'), sectionIds: f.getAll('sectionIds') };
      if (edit.id) await api('/admin/users/' + edit.id, { method: 'PATCH', body: b });
      else
        await api('/admin/users', {
          method: 'POST',
          body: { ...b, name: f.get('name'), email: f.get('email'), password: f.get('password') },
        });
      setEdit(null);
      reload();
      notify(
        edit.id
          ? 'Permissions updated. The user must sign in again.'
          : 'Account created with the selected role.',
      );
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
          <Kicker>People & access</Kicker>
          <h1>Reader Directory</h1>
          <p>Manage reader accounts, editorial staff and their assigned sections.</p>
        </div>
        <button
          className="btn dark"
          onClick={() => {
            setEdit({});
            setRole('AUTHOR');
            setErr('');
          }}
        >
          <Plus size={15} /> Add user
        </button>
      </div>
      <div className="inline-search">
        <Search size={16} />
        <input
          aria-label="Find a user"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
        />
      </div>
      <ErrorBox>{result.error}</ErrorBox>
      {result.loading ? (
        <Loading />
      ) : (
        <div className="table-scroll cms-table">
          <table>
            <thead>
              <tr>
                <th>Reader</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {result.data?.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <small className="table-small">{u.email}</small>
                  </td>
                  <td>{u.role.name}</td>
                  <td>{date(u.createdAt)}</td>
                  <td>
                    {u.id !== user.id ? (
                      <button
                        className="text-link"
                        onClick={() => {
                          setEdit(u);
                          setRole(u.roleId);
                          setErr('');
                        }}
                      >
                        Manage <Pencil size={12} />
                      </button>
                    ) : (
                      <span className="muted">Your account</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.data?.total === 0 && (
        <Empty title="No matching accounts" text="Try a different name or email address." />
      )}
      {result.data?.pages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            {page} of {result.data.pages}
          </span>
          <button disabled={page >= result.data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
      {edit && (
        <Modal title="Manage user permissions" onClose={() => setEdit(null)}>
          <Kicker>Access control</Kicker>
          <h2>{edit.name || 'Create an account.'}</h2>
          <p>
            {edit.email ||
              'Choose an editorial role, or create a reader account without newsroom access.'}
          </p>
          <form className="form-stack" onSubmit={save}>
            {!edit.id && (
              <>
                <label>
                  Full name
                  <input name="name" minLength={2} maxLength={70} autoComplete="off" required />
                </label>
                <label>
                  Email address
                  <input type="email" name="email" autoComplete="off" maxLength={254} required />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                  />
                  <small>
                    Use at least 12 characters. Share the password privately with the account
                    holder.
                  </small>
                </label>
              </>
            )}
            <label>
              Role
              <select name="roleId" value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {titleCase(r)}
                  </option>
                ))}
              </select>
            </label>
            {role === 'SECTION_EDITOR' && (
              <fieldset>
                <legend>Assigned sections</legend>
                {data.categories.map((s) => (
                  <label className="check-row" key={s.id}>
                    <input
                      name="sectionIds"
                      type="checkbox"
                      value={s.id}
                      defaultChecked={[
                        edit.sectionId,
                        ...(edit.assignedSections || []).map((c) => c.id),
                      ].includes(s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </fieldset>
            )}
            <ErrorBox>{err}</ErrorBox>
            <button className="btn dark" disabled={busy}>
              {edit.id ? 'Update permissions' : 'Create account'}
              <Check size={15} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
