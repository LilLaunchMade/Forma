# Release readiness

Status: locally implemented 1.0.0 release candidate. Public stable release verification is incomplete.

Verified on this Windows 11 x64 host:

- Build, TypeScript, ESLint and 11 unit/security/image-channel tests pass.
- 40 Electron checks pass, including real pointer/text interactions, group coordinates, filters/crop/masks, all templates, multi-page editing, native save/reopen, recovery on close, file-association command line, four export formats and all-page PNG ZIP exports.
- Bundled model inference through telemetry-free WASM CPU and automatic WebGPU/WASM; injected GPU initialization failure falls back to isolated CPU inference. Manual mask erase/restore and undo/redo pass.
- Portrait/product/animal/complex-scene quality visually checked; approximately 1.8-2.4 seconds per fixture with WASM CPU on this host. Fine details and crowded scenes can need refinement.
- Renderer context offline and zero remote requests during integration checks. Host network adapter was not disabled. No native ONNX build or telemetry library is shipped.
- Model/font integrity checks and 135 dependency license declarations/notices inventoried. Sharp is development-only. Full npm audit reports zero vulnerabilities on 2026-10-11.
- Installer and portable executables rebuilt. Final unpacked packaged application launches, supports shape/layer UI and performs bundled CPU inference offline.
- Dashboard and dark/light editor screenshots visually reviewed.

Remaining gates:

- Portable wrapper verification is interrupted during launcher investigation. Computer Use was stopped with Escape; the packaged test has not reported completion. Installer installation/uninstallation and portable persistence are not yet verified for these final binaries.
- Final SHA-256 checksum file and source distribution archive.
- Confirm repeatability of the pointer test, which had intermittent failures after closing the export modal; the latest full suite passed with layout-aware coordinate capture.
- Clean Windows 10, ordinary 8 GB CPU-only hardware, broader memory/performance and GPU-driver coverage.
- Authenticated public GitHub repository, remote build/release workflow execution and attachment verification.

No repository or release has been published. See PROGRESS.md for exact continuation steps and docs/KNOWN_LIMITATIONS.md for product limits.
