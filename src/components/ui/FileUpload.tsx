"use client";

/**
 * FileUpload — drag-and-drop file dropzone backed by a hidden
 * `input[type="file"]`, with per-file previews (name + size), MIME/extension
 * filtering via `accept`, an optional `maxSize` limit and error states.
 *
 * Usage:
 *   <FileUpload files={files} onChange={setFiles} accept=".png,.jpg" maxSize={5 * 1024 * 1024} />
 */
import * as React from 'react';
import { CloudUpload, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const unit = units[exponent];
  return `${(bytes / 1024 ** exponent).toFixed(1)} ${unit}`;
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  return accept
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .some((pattern) => {
      if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern.toLowerCase());
      if (pattern.endsWith('/*')) return file.type.toLowerCase().startsWith(pattern.slice(0, -2));
      return file.type.toLowerCase() === pattern.toLowerCase();
    });
}

export interface FileUploadProps {
  /** Files currently attached (rendered as preview chips). */
  files: readonly File[];
  onChange: (files: File[]) => void;
  /** Accepted types; e.g. `.png,.jpg` or `image/*`. */
  accept?: string;
  /** Allow selecting several files at once (default true). */
  multiple?: boolean;
  /** Maximum file size in bytes; larger files are rejected with an error. */
  maxSize?: number;
  /** Maximum number of files; extra selections are ignored. */
  maxFiles?: number;
  /** External error message (e.g. from a form validation library). */
  error?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  files,
  onChange,
  accept,
  multiple = true,
  maxSize,
  maxFiles,
  error: externalError,
  label,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [internalError, setInternalError] = React.useState<string | null>(null);

  const addFiles = React.useCallback(
    (incoming: File[]) => {
      const rejected: string[] = [];
      const accepted: File[] = [];

      for (const file of incoming) {
        if (maxFiles !== undefined && files.length + accepted.length >= maxFiles) break;
        if (maxSize !== undefined && file.size > maxSize) {
          rejected.push(`${file.name} (${formatBytes(file.size)}) exceeds ${formatBytes(maxSize)}`);
          continue;
        }
        if (!matchesAccept(file, accept)) {
          rejected.push(`${file.name} has an unsupported type`);
          continue;
        }
        accepted.push(file);
      }

      if (rejected.length > 0) {
        setInternalError(rejected.join(' · '));
      } else {
        setInternalError(null);
      }

      if (accepted.length > 0) {
        const next = multiple ? [...files, ...accepted] : accepted.slice(0, 1);
        onChange(next);
      }
    },
    [accept, files, maxFiles, maxSize, multiple, onChange],
  );

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 0) addFiles(dropped);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) addFiles(selected);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
    setInternalError(null);
  };

  const showError = internalError ?? externalError ?? null;

  return (
    <div className={cn('w-full space-y-3', className)}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={label || 'Upload files'}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:bg-gray-50',
          disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
        )}
      >
        <CloudUpload
          className={cn('h-8 w-8', dragActive ? 'text-blue-600' : 'text-gray-400')}
        />
        <div>
          <p className="text-sm font-medium text-gray-700">
            {dragActive ? 'Drop files here' : 'Drag & drop files, or click to browse'}
          </p>
          {accept && <p className="mt-1 text-xs text-gray-500">Accepted: {accept}</p>}
          {maxSize && <p className="text-xs text-gray-500">Max size: {formatBytes(maxSize)}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
        className="hidden"
      />
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
            >
              <FileText className="h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                aria-label={`Remove ${file.name}`}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {showError && <p className="text-sm text-red-600">{showError}</p>}
    </div>
  );
}