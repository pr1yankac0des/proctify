import {
  ArrowRight,
  Eye,
  FileCheck,
  Fingerprint,
  Link2,
  Smartphone,
  Timer,
} from 'lucide-react'

const features = [
  {
    icon: Eye,
    title: 'Local gaze and presence',
    description:
      "A model running in the browser confirms one attentive candidate is present. The video frame is read and discarded immediately — never stored, never uploaded.",
  },
  {
    icon: Smartphone,
    title: 'On-device device detection',
    description:
      "Phones and secondary screens are flagged by a vision model trained for exam settings, computed entirely on the candidate's machine.",
  },
  {
    icon: FileCheck,
    title: 'Events, not footage',
    description:
      'Only a timestamped record of what happened is logged — "second face detected, 14:32" — never the underlying video or audio.',
  },
  {
    icon: Timer,
    title: 'Timed with auto-submit',
    description:
      'A countdown timer enforces the limit precisely. The attempt submits itself the moment time expires, no exceptions.',
  },
  {
    icon: Fingerprint,
    title: 'One verified attempt',
    description:
      'Each candidate authenticates by institutional email and OTP, then receives exactly one attempt. Duplicates are rejected server-side.',
  },
  {
    icon: Link2,
    title: 'Shareable, no login required',
    description:
      'Every assessment gets a single link. Share it directly — candidates never need an account to begin.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Build the assessment',
    desc: 'Set questions, time window, and which integrity checks apply, then publish.',
  },
  {
    num: '02',
    title: 'Share the link',
    desc: 'One URL per assessment. Send it directly or through your LMS — no accounts to provision.',
  },
  {
    num: '03',
    title: 'Review the record',
    desc: 'Every flagged moment is timestamped and explained, ready for instructor review.',
  },
]

export function HomeView() {
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="border-b border-paper-200 px-4 py-20 dark:border-ink-700 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="eyebrow">Edge-AI exam integrity</div>

          <h1 className="font-serif mt-5 text-4xl font-medium leading-tight tracking-tight text-ink-950 dark:text-paper-50 sm:text-5xl">
            Proctoring that watches the moment, not the footage.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-700 dark:text-paper-200">
            Every signal Proctify checks — gaze, presence, devices in frame — is computed on the
            candidate's own device. Nothing but the result ever reaches our servers.
          </p>

          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href="/admin"
              className="group flex items-center gap-2 rounded-sm bg-ink-950 px-6 py-3 font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
            >
              Open creator studio
              <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </a>
            <p className="text-sm text-ink-500 dark:text-ink-300">
              Candidates use the assessment link shared by their instructor
            </p>
          </div>

          {/* Trust marks — seal-style, not generic colored checkmarks */}
          <div className="mt-14 flex flex-wrap gap-8">
            {[
              { title: 'No video leaves the device', desc: 'Detection runs locally in-browser' },
              { title: 'Verified, not recorded', desc: 'Only integrity events are logged' },
              { title: 'Exceptions are disclosed', desc: 'Any cloud step is named plainly' },
            ].map((mark) => (
              <div key={mark.title} className="flex max-w-[180px] items-start gap-3">
                <div className="seal mt-0.5 text-verify-700 dark:text-verify-600">
                  <span className="text-sm">&#10003;</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-950 dark:text-paper-50">
                    {mark.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-300">{mark.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid — hairline-ruled, not gradient cards */}
      <section className="mx-auto max-w-5xl border-b border-paper-200 px-4 py-20 dark:border-ink-700 sm:px-6">
        <div className="eyebrow">What's monitored</div>
        <h2 className="font-serif mt-3 text-2xl font-medium text-ink-950 dark:text-paper-50 sm:text-3xl">
          Built for academic integrity
        </h2>

        <div className="mt-10 grid border-t border-paper-200 dark:border-ink-700 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`border-b border-paper-200 p-6 dark:border-ink-700 ${
                i % 2 === 0 ? 'sm:border-r' : ''
              } ${(i + 1) % 3 !== 0 ? 'lg:border-r' : 'lg:border-r-0'}`}
            >
              <f.icon className="h-5 w-5 text-brass-600 dark:text-brass-100" strokeWidth={1.75} />
              <h3 className="mt-4 font-semibold text-ink-950 dark:text-paper-50">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700 dark:text-paper-200">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — ruled three-column, numbered because order is real here */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="eyebrow">Process</div>
        <h2 className="font-serif mt-3 text-2xl font-medium text-ink-950 dark:text-paper-50 sm:text-3xl">
          Three steps, one record
        </h2>

        <div className="mt-10 grid gap-x-10 gap-y-8 border-t border-paper-200 pt-10 dark:border-ink-700 sm:grid-cols-3">
          {steps.map((item) => (
            <div key={item.num}>
              <div className="font-serif text-sm text-brass-600 dark:text-brass-100">
                {item.num}
              </div>
              <h4 className="mt-2 font-semibold text-ink-950 dark:text-paper-50">{item.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-ink-700 dark:text-paper-200">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
