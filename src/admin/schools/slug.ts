const MAX_SLUG_LENGTH = 60;

export function slugify(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug || 'school';
}

export function withSlugSuffix(base: string, attempt: number): string {
  if (attempt <= 1) {
    return base;
  }

  const suffix = `-${attempt}`;
  const trimmed = base
    .slice(0, Math.max(1, MAX_SLUG_LENGTH - suffix.length))
    .replace(/-+$/g, '');

  return `${trimmed || 'school'}${suffix}`;
}
