export function saveToLocalStorage<T>(key: string, data: T): void { if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(data)); }
export function getFromLocalStorage<T>(key: string): T | null { if (typeof window !== 'undefined') { const data = localStorage.getItem(key); return data ? JSON.parse(data) : null; } return null; }
export function removeFromLocalStorage(key: string): void { if (typeof window !== 'undefined') localStorage.removeItem(key); }
export function saveTodayData(data: any): void { saveToLocalStorage('today_data', data); }
export function getTodayData(): any | null { return getFromLocalStorage('today_data'); }
