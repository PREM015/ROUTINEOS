"use client";

/**
 * RichTextEditor — lightweight contentEditable-based rich text editor with
 * a formatting toolbar (bold / italic / underline / ordered & unordered
 * lists). It stores and reports HTML strings via the `value` / `onChange`
 * pair, so consuming forms must sanitize the output server-side.
 *
 * NOTE: relies on `document.execCommand`, which is deprecated but still
 * supported in all evergreen browsers. Rendering stored HTML carries XSS
 * risk — always sanitize before persisting or displaying.
 *
 * Usage:
 *   <RichTextEditor value={html} onChange={setHtml} placeholder="Write…" />
 */
import * as React from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { cn } from '@/lib/utils';

type CommandName = 'bold' | 'italic' | 'underline' | 'insertOrderedList' | 'insertUnorderedList';

interface ActiveState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  insertOrderedList: boolean;
  insertUnorderedList: boolean;
}

const INITIAL_ACTIVE: ActiveState = {
  bold: false,
  italic: false,
  underline: false,
  insertOrderedList: false,
  insertUnorderedList: false,
};

export interface RichTextEditorProps {
  /** Current editor content as an HTML string. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  /** Show the formatting toolbar (default true). */
  showToolbar?: boolean;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  label,
  disabled = false,
  showToolbar = true,
  className,
}: RichTextEditorProps) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState<ActiveState>(INITIAL_ACTIVE);

  React.useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const refreshActive = React.useCallback(() => {
    const query = (command: string): boolean => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };
    setActive({
      bold: query('bold'),
      italic: query('italic'),
      underline: query('underline'),
      insertOrderedList: query('insertOrderedList'),
      insertUnorderedList: query('insertUnorderedList'),
    });
  }, []);

  React.useEffect(() => {
    const handler = () => {
      if (document.activeElement === editorRef.current) refreshActive();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [refreshActive]);

  const runCommand = (command: CommandName) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false);
    onChange(editorRef.current?.innerHTML ?? '');
    refreshActive();
  };

  const toolbarButtons: readonly { command: CommandName; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { command: 'bold', label: 'Bold', Icon: Bold },
    { command: 'italic', label: 'Italic', Icon: Italic },
    { command: 'underline', label: 'Underline', Icon: Underline },
    { command: 'insertUnorderedList', label: 'Bulleted list', Icon: List },
    { command: 'insertOrderedList', label: 'Numbered list', Icon: ListOrdered },
  ];

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      {showToolbar && (
        <div
          role="toolbar"
          aria-label="Formatting tools"
          className="flex items-center gap-0.5 rounded-t-md border border-b-0 border-gray-300 bg-gray-50 px-2 py-1.5"
        >
          {toolbarButtons.map(({ command, label: buttonLabel, Icon }) => (
            <button
              key={command}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(command)}
              aria-label={buttonLabel}
              aria-pressed={active[command]}
              className={cn(
                'rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
                active[command]
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={() => onChange(editorRef.current?.innerHTML ?? '')}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        data-placeholder={placeholder}
        className={cn(
          'min-h-32 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
          showToolbar && 'rounded-t-none',
          disabled && 'cursor-not-allowed bg-gray-50 opacity-60',
          placeholder && 'empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400',
        )}
      />
    </div>
  );
}

export default RichTextEditor;