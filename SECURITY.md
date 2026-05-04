# Security Policy

## Supported Versions

Security fixes are applied to the latest published version of each package. Older versions do not receive backported patches.

| Package | Supported |
|---|---|
| `@adaptivekit/cli` | Latest |
| `@adaptivekit/sdk` | Latest |
| `@adaptivekit/core` | Latest |

## Reporting a Vulnerability

The responsible disclosure of security vulnerabilities is appreciated and taken seriously. If you discover a vulnerability in any of the three AdaptiveKit packages, report it privately before disclosing it publicly.

Do not open a GitHub issue for security vulnerabilities. Public issues are visible immediately and give no time to assess or address the problem before it reaches users.

Send your report to hello@omrajguru.com or through the contact form at omrajguru.com/contact. Include as much of the following as you can provide:

- A description of the vulnerability and the component it affects
- The conditions required to reproduce it
- The potential impact if exploited
- Any proof-of-concept code or steps you used to confirm it

You will receive a response within 72 hours acknowledging the report. If you do not hear back within that window, follow up through the same channel.

## Disclosure Process

Once a report is received, the following process applies:

1. The vulnerability is confirmed and its severity is assessed.
2. A fix is developed and tested against the affected package.
3. The patched version is published to npm.
4. A security advisory is published on the GitHub repository.
5. Credit is given to the reporter in the advisory unless anonymity is requested.

The goal is to move from confirmed report to published patch as quickly as the complexity of the fix allows. Simple issues are resolved within days. Issues that require a more significant change take longer, and the reporter is kept informed throughout.

## Scope

The following are in scope for vulnerability reports:

- Code execution or data exfiltration via the CLI codemod
- Event data exposure or interception in the browser SDK
- Score manipulation or state corruption in the scoring engine
- Dependency vulnerabilities in any of the three packages

The following are out of scope:

- Vulnerabilities in the application that integrates AdaptiveKit, not in AdaptiveKit itself
- Issues that require physical access to the user's machine
- Social engineering attacks

## A Note on the Architecture

AdaptiveKit routes all engagement data through the integrating application's own server. There is no AdaptiveKit cloud, no third-party telemetry endpoint, and no hosted backend of any kind. The security posture of the data layer is entirely determined by the infrastructure choices of the application that installs the toolkit. Vulnerabilities in that infrastructure are outside the scope of this policy.
