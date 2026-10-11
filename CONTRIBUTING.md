# Contributing to Forma

Use Node 24 LTS and npm 11 on Windows. Fork the repository, create a focused branch and run `npm ci`. Read the architecture and project-format documents before changing storage or IPC.

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e` before submitting a pull request. Changes to packaging also need `npm run package` and `npm run test:packaged`. Keep tests tied to user-visible behavior and security boundaries. Include screenshots for interface changes and before/after image examples for segmentation changes.

Keep the installed application fully offline. Do not add telemetry, runtime downloads, authentication, remote fonts, remote executable code or localhost servers. New IPC methods must validate their inputs and operate on dialog-selected or internally owned files only. Never expose Node or unrestricted file access to the renderer.

Use original or permissively licensed assets and retain dependency notices. Do not copy proprietary source, branding, templates or private interfaces. Update the lockfile and dependency-license inventory when dependencies change. Keep MIT attribution for contributions. Do not submit secrets or generated executables in source commits.

Small, clear PRs are easier to review. Describe the problem, resulting behavior, test evidence and any limitations. For major changes, discuss an issue first. We welcome bug reports, accessibility fixes, Windows compatibility testing, template contributions and improvements to local image processing.
