# Super Fren Pet Test — five logo options

1. **logo-1.png — Mascot:** the reference's smiling green pixel pet, enlarged into a friendly face with chunky dark contours and cream eye highlights.
2. **logo-2.png — Geometric icon:** a deep-green pet silhouette with mint eyes and smile; selected for `../artifacts/logo.png` because it stays clearest in a 32-pixel circle.
3. **logo-3.png — Lettermark:** bespoke block lettering spelling **SFPT**, with ear-like corners and a green offset; this is the only option containing text.
4. **logo-4.png — Minted badge:** a jade-green embossed pet and sculpted coin rim, designed to remain recognizable at 64 pixels.
5. **logo-5.png — Meme illustration:** a gleeful tilted pet with raised fists, bold outlines and a mint comic burst.

All five are opaque, square **1024 × 1024 PNGs**, generated with Codex's built-in `image_gen` tool using the [creator's reference](https://fxumiqjngmabtgvruvka.supabase.co/storage/v1/object/public/forum-attachments/posts/mv2xmo7j-b4hchu.jpg). They preserve its digital pet subject, squared ear bumps, green/mint palette and near-black accents. No code-drawn artwork or fallback SVGs were used. The tool returned 1254 × 1254 images; a pixel-only area resample exported the required 1024 × 1024 files without redrawing or changing the compositions.

**Draft accounting:** five generation calls produced five drafts, one per requested approach. All five drafts are retained as the requested options; none failed or was discarded, and no regeneration was needed. Option 2 is the selected launch logo. The other options remain useful alternatives: option 1 has more eye and contour detail at 32 pixels; option 3 has letters, which the launch icon must exclude; option 4 has a rim, which the launch icon must exclude; option 5 has fists and burst details that compete with the face at 32 pixels.

`preview.png` shows options 1–5 from left to right. Within each column are an actual-size 64-pixel square, a 64-pixel circle and a 32-pixel circle. The upper row uses a light page background; the lower row uses a dark one. These previews were visually inspected: all five read at 64 pixels, and option 2 preserves its ears, square eyes and smile at 32 pixels without lettering, a frame or fine detail. Its opaque mint background fills the entire image.

The final prompt set is recorded in [PROMPTS.md](PROMPTS.md). Run `python3 tools/check_logos.py` from the project root to validate the dimensions and selected artifact and rebuild the inspection sheet offline; its small PNG dependency is included in `tools/vendor/`.
