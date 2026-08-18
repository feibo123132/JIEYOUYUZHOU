export function getMeowGeneratorUrl(
  base = import.meta.env?.BASE_URL || '/',
): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}meow-generator/index.html`;
}
