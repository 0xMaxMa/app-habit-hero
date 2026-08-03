/**
 * app/login/page.tsx — the gate in front of parent sign-in.
 *
 * On a fresh install there is no account to sign in with, so showing a login
 * form is a dead end: the visitor has to notice a small "create an account"
 * link and click it before anything works. Check first instead — while no
 * parent exists, send them straight to /setup, which is the only thing they
 * can actually do.
 *
 * The check is a DB read, so this stays dynamic; the form itself lives in
 * LoginForm.tsx as a client component.
 *
 * No redirect loop: /setup bounces back to /login once a parent exists, and
 * this page only redirects while one does not — the two conditions are exact
 * opposites and both read the same row.
 */

import { redirect } from 'next/navigation'
import { needsSetup } from '@/lib/setup'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await needsSetup()) redirect('/setup')
  return <LoginForm />
}
