# Security policy

Tick stores two-factor secrets, so security reports get priority.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through
GitHub: go to the repository's **Security** tab and choose **Report a vulnerability**.

Include what you found, how to reproduce it, and the impact you expect. You'll get an
acknowledgement within 3 working days and updates until it's resolved. Reporters are credited in
the fix unless they prefer not to be.

## Scope

In scope:

- Anything that exposes secrets or codes: vault encryption, key handling, storage, backups, imports
- Ways to run scripts in the app or bypass its Content Security Policy
- Incorrect codes from the TOTP implementation

Out of scope:

- Attacks that need malware or full control of the user's device or browser
- Someone who already knows the master password
- Missing hardening headers on forks or self-hosted copies

## Design

The security model is described in the README: AES-256-GCM vault with a random data key,
PBKDF2-SHA256 (600,000 iterations) to wrap it with the master password, storage only in the
browser's IndexedDB, no server and no third-party requests.
