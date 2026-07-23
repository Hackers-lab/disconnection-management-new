import Link from "next/link"

export const metadata = {
  title: "Terms of Service | Disconnection Management System",
  description: "Terms of Service for Disconnection Management System",
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-100 pb-6 mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900">Terms of Service</h1>
          <p className="text-sm text-slate-500 mt-2">Last Updated: July 23, 2026</p>
        </div>

        <div className="space-y-6 text-slate-700 leading-relaxed text-sm md:text-base">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">1. Agreement to Terms</h2>
            <p>
              By accessing or using the <strong>Disconnection Management System</strong>, you agree to be bound by these Terms of Service. This application is intended for authorized utility personnel, administrators, and agency field operators.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">2. Authorized Use</h2>
            <p>
              Users are granted access based on their assigned role (Admin, Executive, Agency, Viewer). You agree not to perform unauthorized data modifications or export sensitive consumer information without permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">3. Google Services Integration</h2>
            <p>
              When linking your Google Account, you grant the system permission to manage spreadsheets and upload files to designated Drive folders for operational tracking. You remain the owner of your Google Drive content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">4. Limitation of Liability</h2>
            <p>
              The system is provided "as is" for operational workflow management. Users are responsible for verifying field inspection parameters and data accuracy before submitting official disconnection or reconnection updates.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">5. Modifications to Service</h2>
            <p>
              We reserve the right to modify system features, update terms, or discontinue services with notice to registered tenant administrators.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <Link href="/login" className="text-blue-600 font-semibold hover:underline">
            &larr; Back to Login
          </Link>
          <span>Disconnection Management System</span>
        </div>
      </div>
    </div>
  )
}
