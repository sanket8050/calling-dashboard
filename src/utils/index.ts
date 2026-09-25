/**
 * Normalize a phone number for duplicate detection.
 * Handles Indian numbers (+91, 0 prefix), strips spaces/hyphens/parens.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  let num = raw.toString().trim();

  // Remove spaces, hyphens, dots, parens
  num = num.replace(/[\s\-.()/]/g, '');

  // Remove leading +
  if (num.startsWith('+')) {
    num = num.slice(1);
  }

  // Handle Indian country code: 91XXXXXXXXXX -> keep as is (10 digits after removing 91)
  if (num.startsWith('91') && num.length === 12) {
    num = num.slice(2);
  }

  // Handle leading 0 for Indian numbers: 07722013548 -> 7722013548
  if (num.startsWith('0') && num.length === 11) {
    num = num.slice(1);
  }

  return num;
}

/**
 * Build a tel: link from a phone string. Adds +91 for 10-digit Indian numbers.
 */
export function buildTelLink(phone: string): string {
  const norm = normalizePhone(phone);
  if (!norm) return '';

  // 10-digit Indian mobile
  if (/^\d{10}$/.test(norm)) {
    return `tel:+91${norm}`;
  }

  // Longer international (already has country code)
  if (/^\d{11,15}$/.test(norm)) {
    return `tel:+${norm}`;
  }

  // Fallback: use as-is
  return `tel:${phone}`;
}

/**
 * Generate a stable ID from phone or fallback fields.
 */
export function generateId(phone: string, company: string, person: string, area: string): string {
  const norm = normalizePhone(phone);
  if (norm) return `phone-${norm}`;

  // Fallback: hash-like from fields
  const raw = [company, person, area].join('|').toLowerCase().replace(/\s+/g, '');
  return `contact-${raw}`;
}

/**
 * Format a date string for display.
 */
export function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatShortTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Check if a callback is due today or earlier.
 */
export function isCallbackDueToday(callbackDate: string): boolean {
  if (!callbackDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return callbackDate <= today;
}

/**
 * Escape a CSV cell value.
 */
export function escapeCSV(val: unknown): string {
  const str = val === undefined || val === null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Download a string as a file.
 */
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

/**
 * Today's date as YYYY-MM-DD
 */
export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Tomorrow's date as YYYY-MM-DD
 */
export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/**
 * Copy text to clipboard with fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Date formatted for export filename: YYYY-MM-DD-HHmm
 */
export function exportDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
