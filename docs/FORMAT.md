# .forma project format, version 1

A `.forma` file is a ZIP container with `project.json` and zero or more `assets/<sha256>` entries. Paths outside that exact grammar are rejected. No archive files are extracted to disk. Maximum compressed and total expanded size: 512 MiB. Maximum entries: 10,000. Metadata limit: 64 MiB.

The root JSON contains `format: "forma"`, `version: 1`, UUID-like `id`, `name`, ISO `created`/`modified`, `pages`, `fonts`, and optional `template`. Pages contain ID, name, width, height, background, Fabric `scene` and optional PNG thumbnail. Scenes retain objects, nested groups, custom IDs/names, visibility, locks, transforms, filters, text, source images, original source, masks and image adjustments. Custom properties are registered for Fabric serialization.

Embedded data URIs are replaced inside ZIP metadata by `{ "$asset": "<sha256>", "mime": "image/png" }` (or another supported raster/font MIME). Contents are deduplicated by SHA-256 and verified on open. The document in renderer memory uses data URIs. PNG, JPEG and WebP sources are accepted; imported SVG is sanitized and converted into editable Fabric vector objects. Remote image URLs and arbitrary file references are rejected. Fonts are embedded with their family names.

Dimension bounds: 16–16,384 px per side and 70 megapixels per page. Project page count: 1–100. Top-level object count across pages: ≤10,000. Nested structures have depth/visit limits. Unknown format versions are rejected rather than guessed. Migrations must be explicit when a new format version is introduced.

Recovery is a regular `.forma` snapshot in the internal `recovery` directory, indexed by safe project ID. It does not overwrite the user's selected file until explicit Save. Recents store internal path mappings and display metadata; those paths are never accepted directly from the renderer. Missing/corrupt recents do not block a new blank document.
