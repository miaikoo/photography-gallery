// Static export fails when generateStaticParams returns nothing, and production
// starts with no events. Pages 404 on this slug and postbuild removes its output.
export const PLACEHOLDER_SLUG = "__none";

export function paramsOrPlaceholder<T extends object>(params: T[], placeholder: T): T[] {
  return params.length > 0 ? params : [placeholder];
}
