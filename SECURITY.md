# Security policy

The 1.0.x line is the initial supported line once a public release is published. Do not assume a draft build has completed all release verification.

Report vulnerabilities through the repository's **Security → Report a vulnerability** private reporting feature when enabled. If that feature is unavailable, contact a repository maintainer privately through their listed GitHub contact. Do not place working exploits, sensitive local paths or personal project files in public issues. Include affected version, Windows version, reproduction steps, impact and a minimized sample where appropriate.

Security boundaries: isolated and sandboxed renderer; no Node integration; fixed preload methods; main-frame sender checks; strict IPC argument validation; dialog-mediated file access; safe ZIP entry names and decompression limits; raster-only embedded project sources; sanitized imported SVG; denied remote requests; restrictive CSP; timeout and size limits for AI and exports.

Locally supplied project files, SVG and fonts are untrusted. Parser and native-runtime dependencies remain a risk surface and should be kept current. Use a patched OS and supported Electron version. Automatic crash telemetry is intentionally absent. Never include secrets or credentials in source, issues or artifacts.
