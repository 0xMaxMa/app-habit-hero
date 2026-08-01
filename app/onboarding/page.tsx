/**
 * app/onboarding/page.tsx — the S2 onboarding wizard host (T08).
 *
 * Server component: enforces that the caller is an authenticated PARENT before
 * the wizard renders (children are bounced to their own home; anonymous callers
 * to /login). It prefills the family-name suggestion from the parent's existing
 * Family (created at sign-up) and hands off to the client wizard, which owns the
 * multi-step UI + localStorage-backed resumability.
 *
 * force-dynamic: this always depends on the live session / DB, never build time.
 */
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { Card, PageShell } from '@/components/ui'
import { OnboardingWizard } from './OnboardingWizard'

export const dynamic = 'force-dynamic'

async function familyNameFor(familyId: string): Promise<string> {
  try {
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { name: true },
    })
    return family?.name ?? ''
  } catch {
    return ''
  }
}

export default async function OnboardingPage() {
  const user = await getSessionUser()

  // Auth gate (mirrors middleware intent; /onboarding isn't in its matcher).
  if (!user) redirect('/login?callbackUrl=/onboarding')
  if (user.role !== 'parent') redirect('/child')

  const suggestedName = await familyNameFor(user.familyId)

  return (
    <PageShell containerSize="sm">
      <div className="mx-auto w-full max-w-md">
        <Card padding="lg">
          <OnboardingWizard
            userId={user.userId}
            initialFamilyName={suggestedName}
          />
        </Card>
      </div>
    </PageShell>
  )
}
