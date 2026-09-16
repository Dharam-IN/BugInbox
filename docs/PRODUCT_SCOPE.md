# Product scope — BugInbox V1

## Who it is for

- **Owner**: a solo developer or freelancer looking after several websites. They
  hold a BugInbox account and manage every project they create.
- **Reporter**: a visitor, client or tester on one of those websites. They never
  need a BugInbox account, and BugInbox never learns who they are unless they
  choose to type an email address.

## Core journey

Sign up → create a project → configure the widget → copy the snippet → install it
on a website → a reporter submits a problem → the owner receives an email and
works the report in the dashboard.

It has to work on ordinary multi-page websites and on React-style single-page
applications.

## Hypothesis

BugInbox is useful if installation is straightforward, the widget's behaviour is
predictable and owner-controlled, data collection is minimal, and the whole thing
can be run locally or self-hosted reproducibly. Nothing in the product claims a
user base, testimonials, compliance certifications or a unique market position,
because none of those have been established.

## In scope for V1

| Area | What is included |
| --- | --- |
| Owner accounts | Signup, login, logout, email verification, password reset, password change |
| Projects | Multiple projects per owner, create/edit/pause/resume/delete |
| Installation | Public project key, script snippet, custom-button example, allowed origins |
| Widget | Embeddable bundle, Shadow DOM isolation, accessible form, optional screenshot |
| Widget controls | Launcher on/off, text, accent colour, theme, preset icon, corner, offsets, mobile visibility and offsets, include/exclude path rules, immediate/delay/manual trigger |
| Preview and testing | Live appearance preview and a sample URL/device eligibility tester |
| Reports | Inbox filtered by project and status, detail view, status changes, deletion |
| Attachments | One optional reporter-uploaded PNG/JPEG, max 5 MiB, private storage |
| Notifications | Per-project email notification toggle, recoverable delivery |
| Safety | Origin allowlist, rate limits, project/storage caps, retention, tenant isolation |
| Operations | Docker Compose environment, Mailpit, health checks, seeds, tests |

## Explicitly out of scope for V1

Teams, invitations and roles. Billing and subscriptions. Live chat and threaded
comments. AI summaries or automatic debugging. Session recording. Console or
network recording. Automatic screenshots or DOM capture. Video, screenshot
annotation and arbitrary file attachments. Jira/Slack/GitHub integrations.
Public roadmaps and upvoting. Arbitrary custom JavaScript or CSS editors.
Kubernetes and unnecessary microservices. Cloud provisioning and public
deployment.

Pingexa may become an integration later. BugInbox is not merged into Pingexa, and
this project does not modify Pingexa's repository or use its credentials or data.

## Data BugInbox collects from a reporter

Collected:

- What the reporter typed: the description, and an email address if they chose to
  give one.
- A sanitised page URL: query string and fragment removed. The owner can turn URL
  collection off entirely, or supply their own short page context string instead.
- Limited browser context the browser already exposes: user agent string, viewport
  size, device pixel ratio, language, time zone, and whether the widget treated
  the device as mobile.
- The image the reporter chose to upload, if any.

Never collected automatically:

- Cookies or tokens.
- Form or input values.
- Page HTML/DOM.
- Console logs or network request/response bodies.
- Browsing history.
- The host application's user identity.

Sanitisation reduces exposure; it is not a guarantee. A URL *path* can still
carry a sensitive value (`/invoices/secret-slug`), which is why URL collection is
switchable and a host-provided page context is supported.

## Retention

Reports and their screenshots are deleted 90 days after they arrive, by default.
The value is configurable per project, and the dashboard tells the owner what the
current policy is.

## Limits a reporter sees

- Description: 5–2000 characters, required.
- Email: optional, standard address, max 254 characters.
- Screenshot: optional, one PNG or JPEG, max 5 MiB, previewable and removable
  before submission.
