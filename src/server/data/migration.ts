import { ExportData } from './exporter';
export function migrateExportData(data: any, fromVersion: string): ExportData {
  if (fromVersion === '0.9') return { ...data, version: '1.0', sleepLogs: data.sleepLogs || [], scores: data.scores || [], reflections: data.reflections || [] };
  return data as ExportData;
}
export function getCurrentExportVersion(): string { return '1.0'; }
