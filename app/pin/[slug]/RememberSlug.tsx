'use client'

/**
 * app/pin/[slug]/RememberSlug.tsx — remember/forget the bookmarked family slug.
 *
 * `app/pin/page.tsx` (the bare, family-less entry point) reads this same
 * localStorage key to skip straight to `/pin/<slug>` on a repeat visit, so a
 * kid or parent only ever types/scans the family code ONCE per device. This
 * file renders nothing — it is a one-line side effect run from a server
 * component page, which cannot touch localStorage itself.
 */
import { useEffect } from 'react'

export const PIN_SLUG_STORAGE_KEY = 'hh_pin_family_slug'

export function RememberSlug({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(PIN_SLUG_STORAGE_KEY, slug)
    } catch {
      // Storage disabled (private mode, quota) — not remembering is harmless,
      // the kid just types the code again next time.
    }
  }, [slug])
  return null
}

/** Called when a slug 404s, so a stale bookmark doesn't loop back here. */
export function ForgetSlug() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(PIN_SLUG_STORAGE_KEY)
    } catch {
      // Nothing to clean up if storage never worked in the first place.
    }
  }, [])
  return null
}
