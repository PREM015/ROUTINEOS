import { ExportData } from './exporter';
export interface ImportPreview { habitsCount: number; goalsCount: number; sleepLogsCount: number; scoresCount: number; warnings: string[]; canImport: boolean; }
export function generateImportPreview(data: ExportData): ImportPreview {
  const habitsCount = data.habits?.length || 0; const goalsCount = data.goals?.length || 0; const sleepLogsCount = data.sleepLogs?.length || 0; const scoresCount = data.scores?.length || 0;
  const warnings = []; if (!data.version) warnings.push('No version found in import data.');
  return { habitsCount, goalsCount, sleepLogsCount, scoresCount, warnings, canImport: warnings.length === 0 || data.version === '1.0' };
}
