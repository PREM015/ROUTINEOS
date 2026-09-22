'use client';

/**
 * ImportData — client-side JSON import flow.
 *
 * Accepts a JSON backup file, parses it, validates that it contains
 * recognizable top-level entity collections and renders a preview via
 * `ImportPreview`. The backend import endpoint does not exist yet, so the
 * Import button is disabled with an explanatory note — this component is a
 * safe preview-only surface until POST /api/import lands.
 */

import { useRef, useState } from 'react';
import { FileText, FileUp, Info, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ImportPreview } from './ImportPreview';

const VALID_COLLECTION_KEYS = new Set([
  'habits',
  'goals',
  'tasks',
  'projects',
  'categories',
  'tags',
  'routine',
  'focusSessions',
  'journal',
  'sleep',
  'wellness',
  'reflections',
  'settings',
]);

interface ParsedCount {
  name: string;
  count: number;
}

export function ImportData() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<unknown>(null);
  const [counts, setCounts] = useState<ParsedCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setReading(true);
    setError(null);
    setParsed(null);
    setCounts([]);
    setFileName(file.name);

    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const validation = validateImport(json);
      if (validation.error) {
        setError(validation.error);
        return;
      }
      setParsed(json);
      setCounts(validation.counts);
    } catch {
      setError('The selected file is not valid JSON. Choose a backup file exported by RoutineOS.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">Import Data</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Restore from a JSON backup file. Choose a file below to preview its contents.
        </p>

        <label
          className={cn(
            'mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            error ? 'border-red-300 bg-red-50/50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'
          )}
        >
          <Upload className="h-8 w-8 text-gray-400" />
          <span className="mt-3 text-sm font-medium text-gray-700">
            {reading ? 'Reading file…' : fileName ?? 'Click to select a JSON file'}
          </span>
          <span className="mt-1 text-xs text-gray-500">.json backup files are supported</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            disabled={reading}
            className="sr-only"
            aria-label="Choose a JSON backup file"
          />
        </label>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {Boolean(parsed) && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="primary">
                <FileText className="mr-1 h-3 w-3" />
                {fileName}
              </Badge>
              {counts.map((count) => (
                <Badge key={count.name} variant="success">
                  {count.name}: {count.count.toLocaleString()}
                </Badge>
              ))}
            </div>

            <div className="mt-4">
              <ImportPreview data={parsed} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-start gap-2 text-xs text-gray-500">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                Importing is not available yet — the import API has not been
                deployed. You can review your file here and import it later.
              </p>
              <Button disabled title="Import API not available yet">
                Import data
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function validateImport(json: unknown): { error: string | null; counts: ParsedCount[] } {
  if (Array.isArray(json)) {
    return {
      error: null,
      counts: [{ name: 'entities', count: json.length }],
    };
  }

  if (typeof json !== 'object' || json === null) {
    return {
      error: 'The file must be a JSON object or array. Found a scalar value instead.',
      counts: [],
    };
  }

  const entries = Object.entries(json as Record<string, unknown>);
  if (entries.length === 0) {
    return { error: 'The file is empty. Nothing to import.', counts: [] };
  }

  const counts: ParsedCount[] = [];
  let recognized = 0;

  for (const [key, value] of entries) {
    const items = Array.isArray(value) ? value : value === null || typeof value !== 'object' ? [] : [value];
    if (items.length === 0) continue;
    const name = VALID_COLLECTION_KEYS.has(key) ? key : `${key}*`;
    counts.push({ name, count: items.length });
    recognized += 1;
  }

  if (recognized === 0) {
    return {
      error: 'No recognizable entity collections found (habits, goals, tasks, projects, etc.).',
      counts: [],
    };
  }

  return { error: null, counts };
}

export default ImportData;