export function achievementDateBn(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  const parts = new Intl.DateTimeFormat('bn-BD', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${get('day')} ${get('month')} ${get('year')}`;
}
