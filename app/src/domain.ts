export function minorUnits(value: string): number {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) throw new Error('Enter a non-negative amount with at most two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value / 100);
}

export function pricePreview(mode: string, rate: number, participants: number, days: number, custom: number): number {
  switch (mode) {
    case 'person': case 'package': return rate * participants;
    case 'person_day': return rate * participants * days;
    case 'family_day': return rate * days;
    case 'custom': case 'suggested': return custom;
    case 'free': return 0;
    default: return rate;
  }
}

export function csv(rows: Record<string, string | number | null>[]): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const cell = (value: string | number | null) => {
    const text = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n');
}
