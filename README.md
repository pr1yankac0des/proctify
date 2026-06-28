# Proctify

Privacy-first, edge-AI exam proctoring platform with separate instructor and student flows, scheduled tests, email verification, and proctored timed exams. Proctoring computation runs on the candidate's own device wherever possible; the server only ever receives the resulting integrity events, not raw video or audio.

## Assessment Safeguards & Anti-Cheat

- **Identity Verification & Session Integrity:** Students sign in with a one-time email code. Sessions are strictly bound to their attempt and cannot be resumed on another device.
- **Hardware & Environment Readiness:** A mandatory readiness gate enforces checks on HTTPS, API health, camera, microphone, local MediaPipe face models, and explicit monitoring consent.
- **AI Gaze & Face Tracking:** The browser continuously tracks the candidate's face using a MediaPipe BlazeFace model running entirely on-device. The assessment requires exactly one face looking at the screen. Looking away or having multiple people in frame triggers an alert after a short sustained-condition window (to avoid false positives from brief head turns).
- **Object Detection (Phones):** The AI proctor uses an EfficientDet-Lite0 vision model, run on-device via MediaPipe, to detect unauthorized devices (e.g. cell phones) in the camera frame.
- **Audio & Local Voice Monitoring:** The system continuously analyzes microphone volume on-device via the Web Audio API; sustained loud audio (talking, background noise) is logged as a proctor flag. Instructors can additionally opt in, per test, to **speech transcription** — this is the one monitoring feature that is *not* fully on-device: short audio clips are sent to the browser's built-in speech recognition service (Chromium-based browsers only) to produce text, and only the resulting transcript is logged. Candidates see this disclosed explicitly before consenting, and it is off by default.
- **Lockout Cooldown suspensions:** Critical violations (switching tabs, exiting fullscreen, or disconnecting media devices) trigger a **3-minute lockout suspension** covering the test. Candidates must wait out the cooldown before resuming. A **3rd infraction** results in immediate, automatic submission.
- **Anti-Photography measures:**
  - An invisible Moiré pattern grid overlay is placed on the screen. If a student tries to photograph their screen, it significantly distorts the image.
  - A dynamic, moving watermark containing the candidate's name overlays the exam view to trace any leaked images.
- **Copy/Paste Prevention:** Text selection and the context menu are disabled globally during the exam to prevent copying the question or pasting answers.
- **Data Privacy:** All camera analysis and audio-level monitoring happen locally in the browser. Raw video and audio streams are *never* uploaded. Only timestamped proctor alerts (and, if an instructor opts in to speech transcription for a test, short transcript snippets) are logged to the server.

Proctor flags are review signals, not automatic proof of misconduct. Instructors should review the context and provide accommodations when necessary.

## Coding Assessments

In addition to standard MCQs, Proctify supports full-fledged coding tests:
- **Assessment Builder:** Instructors can add coding questions alongside MCQs, configure mark values, and provide detailed problem statements.
- **In-Browser IDE:** Candidates solve coding challenges using an integrated Monaco Editor (the same engine behind VS Code) with syntax highlighting and auto-completion. If the Monaco CDN fails to load (slow connection, blocked CDN), a plain-text fallback editor is offered instead.
- **Test Cases:** Instructors can define multiple test cases consisting of STDIN inputs and expected STDOUT outputs. Test cases can be marked as visible (sample cases) or hidden — hidden cases and their expected outputs are never sent to the browser.
- **Auto-Grading & Parallel Execution:** Submissions are executed on the backend via the public Piston execution API (with a local Python/Node fallback if Piston is unreachable), in parallel across test cases, for fast and accurate scoring.

## Creator Studio Analytics

- **Cohort Visual Metrics:** Displays live summary cards (Pass Rate progress ring, cohort average score progress circle, and Integrity Index) directly inside the instructor dashboard.

## Roles & URLs

| URL | Who | Purpose |
|-----|-----|---------|
| `/admin` | Instructor only | Create tests, copy share links, view scores |
| `/test/:testId` | Students | Sign up, verify email, take scheduled test |
| `/` | Students | Landing page — explains they need a test link |

Students never see the Creator Dashboard. Instructors use `/admin` directly (bookmark it).

## Quick Start

```bash
npm install
npm run dev
```

This starts **both** the API server (`localhost:3001`) and the web app (`localhost:5173`).

You can also run the full stack with Docker — see `docker-compose.yml`. `docker compose up --build` builds and starts the frontend (served via nginx) and API together; add `--profile local-db` to also run a local MongoDB container instead of MongoDB Atlas.

### Workflow

1. Open **http://localhost:5173/admin**
2. Click **New Assessment** — set title, schedule window, questions, time limit
3. Click **Copy Link** on the published test
4. Share that link with students (e.g. `http://localhost:5173/test/abc-123`)
5. Students sign up with registration number + email, verify via code
6. Students can start only during the scheduled window, once
7. Both student and instructor can view scores

## Email Verification

Verification codes are sent via SMTP. Copy `.env.example` to `.env` and configure your mail provider (e.g. Gmail with an [App Password](https://myaccount.google.com/apppasswords)).

**Without SMTP (dev mode):** codes are printed in the API terminal and shown on-screen to the student.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + frontend together |
| `npm run dev:web` | Frontend only |
| `npm run dev:api` | API only |
| `npm run build` | Production frontend build |
| `npm test` | Isolated API integration tests (does not touch configured MongoDB or `server/data.json`) |

## Data Storage

Shared data (tests, submissions, students) is stored in MongoDB Atlas when `MONGODB_URI` is set, or falls back to `server/data.json` otherwise, so all students and the instructor see the same data when using the same server.

Active attempts are stored alongside tests and submissions. Set `DATA_STORE=local` to force the JSON store for development/testing even when `MONGODB_URI` exists. Production deployments should use MongoDB and must set a non-default `ADMIN_PASSWORD`.

**Note on scale:** the current store reads and writes the entire dataset as a single document per request. This is fine for a single class or small cohort, but will not scale gracefully to large numbers of concurrent students or a long submission history — a real production deployment at scale would need a proper per-document collection schema.

## Browser and deployment requirements

- Use HTTPS in production; browsers only expose camera/microphone APIs in a secure context.
- Set `ALLOWED_ORIGIN` to the exact frontend origin. Multiple origins can be comma-separated.
- The bundled Netlify configuration supplies CSP, anti-framing, content-type, referrer, and permissions-policy headers.
- The Render configuration uses `/api/health` for readiness checks.
- Speech transcription (if enabled for a test) only works in Chromium-based browsers (Chrome, Edge); it is unsupported in Firefox and Safari, and the UI discloses this.

## Sharing on a Network

To let students on other devices connect:

```bash
npm run dev:api
npm run dev:web -- --host
```

Share links using your machine's LAN IP, e.g. `http://192.168.1.5:5173/test/...`
