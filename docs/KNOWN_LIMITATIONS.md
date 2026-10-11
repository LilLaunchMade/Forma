# Known limitations

- Windows x64 only. Windows 11 is the local test host; Windows 10 compatibility needs independent verification on a clean Windows 10 machine.
- Builds are unsigned and may trigger SmartScreen. No auto-updater is included.
- U²-NetP is a small general segmentation model, with a 320×320 inference grid. Fine hair, glass, shadows, low contrast and crowded scenes may need manual refinement. Manual mask editing uses a maximum 1600 px preview mask and scales it back to the original image dimensions.
- Automatic AI mode attempts WebGPU and falls back to an isolated WebAssembly CPU worker. Graph nodes unsupported by WebGPU can execute through WASM. Dedicated GPU benchmarking and driver-specific failure coverage remain limited to available hardware.
- AI input is limited to 40 megapixels, general imports to 70 megapixels and 64 MiB, exports to 65 megapixels. Extremely large documents may exceed OS memory despite limits. History sheds old snapshots when its memory budget is exceeded.
- RGB workflow only: no CMYK, ICC color management, bleed/crop marks, pressure-sensitive drawing, text on a path or precision vector-node editing.
- PDF pages are high-resolution raster images; PDF text is not searchable/selectable. SVG preserves supported vectors and embeds fonts, but receiving editors may interpret filters, fonts and masks differently.
- Multiple selected PNG, JPG or SVG pages are delivered in a ZIP file, one file per page. PDF combines selected pages into one document. ZIP exports are bounded to 120 MiB of uncompressed page data.
- Crop uses numeric bounds and aspect presets. Imported SVG supports a safe vector/text subset; scripts, external references, foreign objects and embedded image tags are removed.
- System fonts depend on the receiving computer. Use bundled fonts or embed appropriately licensed imported fonts for portability.
- Dashboard removal can keep the saved `.forma` file or move it to the Recycle Bin. Recovery-only deletion is permanent for that recovery file.
- No on-canvas snapping guides, ruler/grid controls, advanced mesh gradients, video, collaboration or cloud sync are included. These were not required for the initial desktop scope.
- Public GitHub repository, hosted workflow results and published release attachments cannot be verified until a maintainer authenticates and authorizes publication.

