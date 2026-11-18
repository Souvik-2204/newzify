import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Link2,
  Unlink,
  ImagePlus,
  Undo2,
  Redo2,
  Upload,
  ArrowRight,
} from 'lucide-react';
import { Modal, Kicker, ErrorBox } from '../components/UI.jsx';
import { api } from '../lib.jsx';
const maxUploadMb = import.meta.env.MODE === 'vercel' ? 4 : 5;
export default function RichEditor({ initial, onChange, disabled = false }) {
  const [dialog, setDialog] = useState(''),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false),
    [src, setSrc] = useState('');
  const selection = useRef(null);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          link: { openOnClick: false, autolink: false, linkOnPaste: false },
          code: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Image.configure({ allowBase64: false }),
      ],
      content: initial,
      editable: !disabled,
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          'aria-label': 'Article body',
          role: 'textbox',
          'aria-multiline': 'true',
          'data-placeholder': 'Write the first paragraph…',
          class: 'manuscript-input',
        },
      },
      onUpdate: ({ editor }) => onChange(editor.getJSON()),
    },
    [],
  );
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);
  if (!editor) return <div className="manuscript-placeholder">Preparing your manuscript…</div>;
  const toggle = (label, Icon, command, active) => (
    <button
      type="button"
      key={label}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={active ? 'active' : ''}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={command}
    >
      <Icon size={15} />
    </button>
  );
  const open = (t) => {
    selection.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setErr('');
    setSrc('');
    setDialog(t);
  };
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxUploadMb * 1024 * 1024) {
      e.target.value = '';
      return setErr(`Images must be ${maxUploadMb} MB or smaller.`);
    }
    setBusy(true);
    setErr('');
    try {
      const d = new FormData();
      d.set('image', file);
      const r = await api('/admin/images', { method: 'POST', body: d });
      setSrc(r.image);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  function insert(e) {
    e.preventDefault();
    e.stopPropagation();
    const f = new FormData(e.currentTarget);
    if (dialog === 'link') {
      let href;
      try {
        const u = new URL(f.get('url'));
        if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw 0;
        href = u.href;
      } catch {
        setErr('Enter a valid http or https address.');
        return;
      }
      const label = String(f.get('label') || href).trim();
      editor
        .chain()
        .focus()
        .setTextSelection(selection.current)
        .insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] })
        .run();
    } else {
      if (!src) return;
      editor
        .chain()
        .focus()
        .setTextSelection(selection.current)
        .setImage({ src, alt: String(f.get('alt')).trim() })
        .run();
    }
    setDialog('');
  }
  const words = editor.getText().trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className={'rich-editor ' + (disabled ? 'read-only' : '')}>
      <div className="format-bar" role="toolbar" aria-label="Article formatting">
        <select
          aria-label="Paragraph style"
          disabled={disabled}
          value={
            editor.isActive('heading', { level: 2 })
              ? 'h2'
              : editor.isActive('heading', { level: 3 })
                ? 'h3'
                : 'p'
          }
          onChange={(e) =>
            e.target.value === 'p'
              ? editor.chain().focus().setParagraph().run()
              : editor
                  .chain()
                  .focus()
                  .setHeading({ level: Number(e.target.value[1]) })
                  .run()
          }
        >
          <option value="p">Paragraph</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
        </select>
        <i />
        {toggle(
          'Bold',
          Bold,
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive('bold'),
        )}
        {toggle(
          'Italic',
          Italic,
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive('italic'),
        )}
        {toggle(
          'Underline',
          Underline,
          () => editor.chain().focus().toggleUnderline().run(),
          editor.isActive('underline'),
        )}
        <i />
        {toggle(
          'Bulleted list',
          List,
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive('bulletList'),
        )}
        {toggle(
          'Numbered list',
          ListOrdered,
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive('orderedList'),
        )}
        {toggle(
          'Quotation',
          Quote,
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive('blockquote'),
        )}
        {toggle('Insert link', Link2, () => open('link'), editor.isActive('link'))}
        {editor.isActive('link') &&
          toggle('Remove link', Unlink, () =>
            editor.chain().focus().extendMarkRange('link').unsetLink().run(),
          )}
        {toggle('Insert inline image', ImagePlus, () => open('image'))}
        <i />
        {toggle('Undo', Undo2, () => editor.chain().focus().undo().run())}
        {toggle('Redo', Redo2, () => editor.chain().focus().redo().run())}
      </div>
      <EditorContent editor={editor} />
      <div className="document-foot">
        <span>{words.toLocaleString('en-IN')} words</span>
        <span>{Math.max(1, Math.ceil(words / 180))} min read</span>
      </div>
      {dialog && (
        <Modal
          title={dialog === 'link' ? 'Insert a link' : 'Insert an inline image'}
          onClose={() => setDialog('')}
        >
          <Kicker>Manuscript tools</Kicker>
          <h2>{dialog === 'link' ? 'Insert a link.' : 'Illustrate the story.'}</h2>
          <form onSubmit={insert} className="form-stack">
            {dialog === 'link' ? (
              <>
                <label>
                  Link text
                  <input
                    name="label"
                    defaultValue={editor.state.doc.textBetween(
                      selection.current.from,
                      selection.current.to,
                      ' ',
                    )}
                    maxLength={2000}
                    placeholder="Text to display"
                    required
                  />
                </label>
                <label>
                  Web address
                  <input
                    name="url"
                    type="url"
                    defaultValue={editor.getAttributes('link').href || ''}
                    required
                    placeholder="https://"
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Image to insert
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} />
                  <small>JPEG, PNG or WebP · Maximum {maxUploadMb} MB</small>
                </label>
                {src && <img className="inline-upload-preview" src={src} alt="Upload preview" />}
                <label>
                  Image description
                  <input
                    name="alt"
                    required
                    maxLength={300}
                    placeholder="Describe the image for readers"
                  />
                </label>
              </>
            )}
            <ErrorBox>{err}</ErrorBox>
            <button className="btn dark" disabled={busy || (dialog === 'image' && !src)}>
              {busy ? 'Uploading…' : dialog === 'link' ? 'Insert link' : 'Insert image'}
              <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
