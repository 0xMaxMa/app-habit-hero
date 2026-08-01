/**
 * Tiny className joiner — filters out falsy values and joins with a space.
 * Local to the UI kit so components stay dependency-free (no clsx installed).
 */
export type ClassValue = string | number | false | null | undefined

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}
