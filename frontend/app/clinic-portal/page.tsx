export default function ClinicPortalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="max-w-md text-center p-8">
        <h1 className="text-2xl font-semibold text-on-surface mb-4">
          Access your clinic&apos;s portal
        </h1>
        <p className="text-on-surface-variant mb-6">
          TriageAI is accessed through your clinic&apos;s dedicated portal.
          Contact your clinic administrator for your portal URL.
        </p>
        <p className="text-sm text-on-surface-variant">
          Example: <span className="font-mono">yourclinic.usetriageai.com</span>
        </p>
      </div>
    </div>
  )
}
