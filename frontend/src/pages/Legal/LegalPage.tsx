import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cosmos } from '@/components/Cosmos'
import { Logo } from '@/layouts/Sidebar'
import { useAuthOptions } from '@/lib/demo'

const UPDATED = '22 November 2026'

const H = ({ children }: { children: ReactNode }) => <h2 className="mt-6 text-lg font-semibold text-ink">{children}</h2>

/** Public privacy notice and terms of use. Facts about what the software does are fixed; who operates the
 *  deployment and which optional services are switched on come from the server's configuration. */
export default function LegalPage() {
  const { pathname } = useLocation()
  const o = useAuthOptions().data?.operator
  const operatedBy = o?.name ? `operated by ${o.name}` : 'run by its operator'
  const contact = o?.contact ? <a className="text-accent-blueSoft underline" href={`mailto:${o.contact}`}>{o.contact}</a> : 'the operator’s administrator'
  const processors = [
    'the hosting and database providers chosen by the operator (for example Vercel and Neon)',
    ...(o?.email_provider ? [`${o.email_provider === 'brevo' ? 'Brevo' : 'an SMTP email provider'} (account and alert emails)`] : []),
    ...(o?.error_monitoring ? ['Sentry (error reports; personal data and request bodies are removed before sending)'] : []),
    ...(o?.llm_provider ? [`${o.llm_provider} (only when the AI assistant’s language-model mode is on: question text and query results)`] : []),
  ]
  const privacy = pathname === '/privacy'
  return (
    <div className="relative min-h-full p-6">
      <Cosmos />
      <article className="panel relative z-10 mx-auto max-w-3xl p-8 text-[14.5px] leading-relaxed text-ink-muted">
        <div className="mb-4 flex items-center justify-between gap-4"><Logo /><Link to="/" className="flex items-center gap-1 text-sm text-accent-blueSoft hover:underline"><ArrowLeft size={14} />Back</Link></div>
        <h1 className="text-2xl font-bold text-ink">{privacy ? 'Privacy notice' : 'Terms of use'}</h1>
        <p className="text-xs text-ink-faint">Last updated {UPDATED}</p>
        {privacy ? (
          <>
            <H>Who is responsible</H>
            <p>This deployment of SaaS Revenue Assurance is {operatedBy}, who decides what data is loaded and who can access it. Questions and requests: {contact}.</p>
            <H>What data is processed</H>
            <ul className="list-disc space-y-1 pl-5">
              <li><b className="text-ink">Account data:</b> name, work email, role, a bcrypt hash of the password (never the password itself), sign-in times and active sessions.</li>
              <li><b className="text-ink">Business data loaded by the operator:</b> customers, contracts, pricing, usage, invoices, payments and costs, plus the audits, exceptions, notes and reports produced from them.</li>
              <li><b className="text-ink">Security records:</b> an audit trail of actions (who, what, when) and short-lived sign-in attempt records used to block password guessing.</li>
            </ul>
            <H>Why</H>
            <p>Only to provide the service: reconcile revenue, investigate discrepancies and report unit economics; to keep accounts secure; and to keep an auditable record of financial actions.</p>
            <H>Cookies and tracking</H>
            <p>One essential cookie, <code>sra_token</code> (httpOnly, SameSite=Strict), keeps you signed in. There are no advertising or analytics cookies and no third-party tracking. Some interface preferences (for example a collapsed sidebar) are stored only in your browser.</p>
            <H>Who receives data</H>
            <p>Data is not sold or shared for marketing. It is processed on the operator’s behalf by:</p>
            <ul className="list-disc space-y-1 pl-5">{processors.map((p) => <li key={p}>{p}</li>)}</ul>
            <H>How long it is kept</H>
            <p>Business data and audit history are kept until the operator deletes them; administrators can export or erase all company data at any time (Settings → Data &amp; Privacy). Sign-in attempt records are removed after a day and expired sessions after a week. Encrypted database backups are kept for 30 days.</p>
            <H>Security</H>
            <p>Encrypted connections (HTTPS), hashed passwords, role-based access, idle sign-out, append-only audit results, and encrypted backups.</p>
            <H>Your rights</H>
            <p>You can ask the operator for access to, correction of, export of, or deletion of your personal data. Depending on where you live, laws such as India’s Digital Personal Data Protection Act 2023 or the EU GDPR may give you further rights. Contact {contact}.</p>
          </>
        ) : (
          <>
            <H>The service</H>
            <p>SaaS Revenue Assurance compares contracts, usage, invoices and payments to find billing and collection discrepancies. It is {operatedBy}. By signing in you agree to these terms.</p>
            <H>Accounts</H>
            <p>Keep your password confidential and use only the access your role grants. Administrators are responsible for who is given access and for the data they load.</p>
            <H>Acceptable use</H>
            <p>Do not attempt to bypass access controls, disrupt the service, probe it for vulnerabilities without the operator’s permission, or load data you are not entitled to process.</p>
            <H>Results are decision support</H>
            <p>Findings, scores, simulations and AI answers support human review; they are not accounting, tax or legal advice. Verify material findings against source records before acting. What-If simulations are hypothetical and never change records.</p>
            <H>Demo workspace</H>
            <p>Where a public demo is offered, all customer and financial data in it is synthetic and the demo account is read-only.</p>
            <H>Availability and liability</H>
            <p>The service is provided as is, without guarantees of uninterrupted availability. To the extent the law allows, the operator is not liable for indirect losses arising from its use.</p>
            <H>Changes and contact</H>
            <p>These terms may be updated; the date above shows the latest version. Questions: {contact}.</p>
          </>
        )}
      </article>
    </div>
  )
}
