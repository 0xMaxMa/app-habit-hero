/**
 * app/login/page.tsx — the gate in front of parent sign-in.
 *
 * Multi-family (Phase A): sign-up is now open and repeatable (POST
 * /api/signup, no more one-time needsSetup() gate), so there is no DB state
 * that tells a visitor whether "they" already have an account — many
 * different families can exist at once. /login always shows the sign-in
 * form; a first-time visitor follows the explicit "สร้างครอบครัวใหม่" link in
 * LoginForm to /signup instead of being redirected there automatically.
 */

import LoginForm from './LoginForm'

export default function LoginPage() {
  return <LoginForm />
}
