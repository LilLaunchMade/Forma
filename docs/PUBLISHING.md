# Publishing Forma

Source repository: [LilLaunchMade/forma](https://github.com/LilLaunchMade/forma). A stable release has not been published. The commands below describe the maintainer publishing workflow; do not recreate the existing repository.

Install GitHub CLI if necessary, then run these commands from the source root:

```powershell
gh auth login
git add .
git commit -m "Prepare Forma 1.0.0"
gh repo create forma --public --source=. --remote=origin --push
```

If a remote repository already exists, configure its real URL instead of creating another:

```powershell
git remote add origin https://github.com/YOUR-ACCOUNT/forma.git
git push -u origin main
```

Enable private vulnerability reporting in repository settings. Inspect the push build in GitHub Actions and download its artifacts. Resolve every stable-release gate in `docs/RELEASE_READINESS.md` before tagging. The release workflow refuses tag/package version mismatch and any required failing tests.

```powershell
git tag -a v1.0.0 -m "Forma 1.0.0"
git push origin v1.0.0
```

That tag authorizes the saved release workflow to create the GitHub Release. It builds on Windows, verifies installer and portable artifacts, creates SHA-256 checksums and uploads the three expected release files using the scoped built-in `GITHUB_TOKEN`. No external credentials are embedded. Review the generated release notes and attachments after it succeeds.

For an explicitly authorized manual upload after equivalent verification:

```powershell
gh release create v1.0.0 .\release\Forma-Setup-1.0.0.exe .\release\Forma-Portable-1.0.0.exe .\release\SHA256SUMS.txt --title "Forma 1.0.0" --generate-notes
```

If verification is incomplete, use a prerelease tag/version and label it clearly instead of publishing an unverified stable 1.0.0. Do not claim workflows succeeded or files are hosted until GitHub reports success.

