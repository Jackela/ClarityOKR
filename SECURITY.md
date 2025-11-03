# Security Policy

## Reporting a Vulnerability

If you believe you’ve found a security issue, please report it responsibly:

- Email the repository owner/maintainers, or open a private security advisory.
- Provide a minimal description, steps to reproduce, and potential impact.
- Do not disclose publicly until we coordinate a fix and release.

## Scope and hardening
- Electron main/renderer use typed IPC and a minimal preload.
- No remote code execution; contextIsolation must remain enabled.
- Keep dependencies updated (CI will flag critical issues).

