import Link from "next/link"

export const metadata = {
  title: "Privacy Policy | Disconnection Management System",
  description: "Privacy Policy for Disconnection Management System",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-100 pb-6 mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900">Privacy Policy</h1>
          <p className="text-sm text-slate-500 mt-2">Last Updated: July 23, 2026</p>
        </div>

        <div className="space-y-6 text-slate-700 leading-relaxed text-sm md:text-base">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">1. Introduction</h2>
            <p>
              Welcome to the <strong>Disconnection Management System</strong> ("App", "we", "us", or "our"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application and Google OAuth integrations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">2. Information We Collect</h2>
            <p>We collect information necessary to operate electrical supply disconnection, reconnection, DTR, and material management tracking:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Account Information:</strong> Name, username, role, and Customer Care Center (CCC) code.</li>
              <li><strong>Google Account Data:</strong> When linking Google Drive/Sheets, we access basic profile info (email address) and user-authorized Google Drive folders/spreadsheets.</li>
              <li><strong>Operational Data:</strong> Consumer records, meter replacement details, and field inspection images uploaded by authorized personnel.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">3. How We Use Your Google User Data</h2>
            <p>
              Our application requests access to Google Drive and Google Sheets APIs strictly to enable:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Storing and reading administrative tracking data from authorized Google Spreadsheets.</li>
              <li>Uploading field proof photos and receipt images directly into your designated Google Drive folders.</li>
            </ul>
            <p className="mt-2">
              We <strong>do not</strong> sell, share, or transfer your Google user data to third parties, advertising networks, or data brokers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">4. Data Security & Storage</h2>
            <p>
              OAuth refresh tokens are stored using AES-256-GCM encryption. All user communications with Google APIs occur securely via encrypted HTTPS endpoints.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">5. User Control & Token Revocation</h2>
            <p>
              You can revoke our access to your Google Account at any time through your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                Google Account Security Settings
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-2">6. Contact Us</h2>
            <p>
              If you have any questions regarding this Privacy Policy, please contact system administration support.
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
