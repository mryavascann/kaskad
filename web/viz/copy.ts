/**
 * Chart copy. Every visible string and accessible name is a prop with an English default. Templates
 * use `{name}` placeholders (plain strings, so Turkish copy can come straight from a Server
 * Component); the chart fills them with already formatted values.
 */

export type TemplateValues = Record<string, string | number>;

/** Replaces `{name}` with `values.name`. Unknown names stay as written, so a typo is visible. */
export function fill(template: string, values: TemplateValues): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** English defaults with the caller's overrides on top (undefined keys keep the default). */
export function mergeCopy<T extends Record<string, string>>(defaults: T, overrides?: Partial<T>): T {
  if (!overrides) return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const value = overrides[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
