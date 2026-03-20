import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | string, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k));
  return parseFloat((Number(bytes) / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

export function getDataTypeCategory(dataType: string): 'text' | 'numeric' | 'date' | 'json' | 'boolean' | 'other' {
  const lower = dataType.toLowerCase();
  
  if (['varchar', 'character varying', 'text', 'char', 'character', 'citext', 'uuid'].some(t => lower.includes(t))) {
    return 'text';
  }
  if (['int', 'numeric', 'decimal', 'real', 'double', 'serial', 'bigserial', 'float', 'money'].some(t => lower.includes(t))) {
    return 'numeric';
  }
  if (['date', 'time', 'timestamp', 'interval', 'timetz', 'timestamptz'].some(t => lower.includes(t))) {
    return 'date';
  }
  if (['json', 'jsonb'].some(t => lower.includes(t))) {
    return 'json';
  }
  if (['bool', 'boolean'].some(t => lower.includes(t))) {
    return 'boolean';
  }
  return 'other';
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function maskPassword(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isImageUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'];
  try {
    const lowUrl = url.toLowerCase().split('?')[0];
    return imageExtensions.some(ext => lowUrl.endsWith(ext));
  } catch {
    return false;
  }
}

export function isVideoUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
  try {
    const lowUrl = url.toLowerCase().split('?')[0];
    return videoExtensions.some(ext => lowUrl.endsWith(ext));
  } catch {
    return false;
  }
}

export function detectMedia(value: any): { url: string; type: 'image' | 'video' }[] {
  const media: { url: string; type: 'image' | 'video' }[] = [];
  
  const processStr = (str: string) => {
    if (isImageUrl(str)) media.push({ url: str, type: 'image' });
    else if (isVideoUrl(str)) media.push({ url: str, type: 'video' });
  };

  if (Array.isArray(value)) {
    value.forEach(processStr);
  } else if (typeof value === 'string') {
    // Try parsing as JSON first
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        parsed.forEach(processStr);
      } else {
        processStr(value);
      }
    } catch {
      processStr(value);
    }
  }
  
  return media;
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function rowsToCSV(rows: Record<string, any>[], columns: string[]): string {
  const header = columns.join(',');
  const body = rows.map(row => 
    columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  ).join('\n');
  return `${header}\n${body}`;
}

export function rowsToJSON(rows: Record<string, any>[]): string {
  return JSON.stringify(rows, null, 2);
}

export function rowsToSQLInsert(rows: Record<string, any>[], tableName: string, columns: string[]): string {
  return rows.map(row => {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      return `'${String(val).replace(/'/g, "''")}'`;
    }).join(', ');
    return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values});`;
  }).join('\n');
}