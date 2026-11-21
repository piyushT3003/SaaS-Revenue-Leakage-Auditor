# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository. Include:
- the affected version or commit;
- the steps to reproduce;
- the impact you expect.

You will get an acknowledgement within 5 working days. Please give a reasonable time for a fix before disclosing publicly.

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | Yes |

## How the application protects data

The full review is in [`docs/security/SECURITY_REVIEW.md`](docs/security/SECURITY_REVIEW.md).

**Sign-in and sessions**
- Passwords are hashed with bcrypt.
- Sessions use a JWT in an httpOnly, `SameSite=Strict` cookie, with server-side revocation.
- Sessions are signed out after inactivity.
- Failed logins are throttled through the database.

**Access**
- Role-based access is enforced on every API endpoint.
- The public demo account is read-only and its password cannot be changed.

**Data integrity**
- Audit results and finalised audit runs are append-only, enforced by database triggers.
- Corrections void and reissue the record; they never edit it.

**Browser and exports**
- A strict Content-Security-Policy with no third-party origins, plus clickjacking and MIME-sniffing protections.
- Spreadsheet exports are protected against formula injection.

**Secrets and backups**
- No secrets are kept in the repository; production refuses to start with a weak `JWT_SECRET`.
- Backups are encrypted before they leave the database host.

**Automated checks**
- Every CI run checks dependencies for known vulnerabilities (`pip-audit`, `npm audit`).
- Dependabot opens weekly update pull requests.
