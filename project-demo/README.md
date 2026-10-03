# Automation Context Mapping ad

This isolated package records and renders the owner's 60-second ad for the Control Center. It includes the editable Remotion composition, storyboard, synchronized narration and captions, and reusable Playwright/FFmpeg helpers. Production application code and dependencies remain unchanged.

## Deliverables

- `output/automation-context-mapping-ad.mp4`: 60 seconds, 1920 × 1080, 30fps, H.264 with AAC narration and burned-in captions.
- `output/automation-context-mapping-ad.srt`: synchronized subtitles.
- `output/ad-verification.json`: metadata, full-decode checks and final QA-frame location.
- `storyboard/ad-script.json`: supplied copy, timing, voice and closing tagline.
- `storyboard/creative-direction.md`: visual direction and disclosure of fictional fixtures.
- `src/Ad.tsx`: editable `AutomationContextMappingAd` composition.

The product screens are recorded from the actual application with three fictional client projects, two local mock instances and synthetic execution history. Every product scene displays “Illustrative demo data”. Preview endpoints reject all non-GET requests. Recording checks assert zero remote writes and browser errors. Restore is shown only at its review step. The temporary preview is stopped and deleted after recording; the installed Control Center and real n8n installations are untouched.

Narration uses the synthetic `en-US-GuyNeural` voice through [edge-tts](https://github.com/rany2/edge-tts). Only the supplied ad copy is sent to that online service. No music track is included.

## Requirements and setup

Use Node 22.18+ and npm. Local packages are pinned in `package-lock.json`: Playwright 1.62.1, Remotion 4.0.532 and React 19.3. The helpers use existing system FFmpeg/ffprobe; on Windows they discover the installed Gyan WinGet package if PATH has not refreshed. `MONTAGE_FFMPEG_PATH` and `MONTAGE_FFPROBE_PATH` can override those paths. Rendering uses Playwright's matching Chrome Headless Shell, without another Remotion browser download.

From the repository root:

```powershell
npm.cmd --prefix project-demo ci
npm.cmd --prefix project-demo exec -- playwright install chromium
npm.cmd --prefix project-demo run montage:check
```

npm lifecycle scripts stay disabled in this package's `.npmrc`. No global Node/Python package or PATH changes are required.

## Edit and render

Existing recorded clips and narration can be reused locally:

```powershell
npm.cmd --prefix project-demo run montage:typecheck
npm.cmd --prefix project-demo run montage:ad-stills
npm.cmd --prefix project-demo run montage:render -- AutomationContextMappingAd output/ad-revision.mp4
npm.cmd --prefix project-demo run montage:verify-ad -- output/ad-revision.mp4
```

Rendering refuses to overwrite an existing MP4. `montage:studio` opens the editable Remotion preview. `montage:render-ad` writes the original deliverable filename. Inspect the extracted final frames before considering a revision complete.

## Re-record the product

The recording fixture starts a separate production preview on a free loopback port and creates an isolated workspace/database. Background sync, automatic commits and live external calls are disabled. It requires a current build at `app/.next-audit-montage`:

```powershell
npm.cmd --prefix project-demo run montage:build-preview
npm.cmd --prefix project-demo run montage:record
```

`node project-demo/scripts/record-ad.mjs --only=02-context` replaces one clip. `--resume` reuses existing assets. The manifest records fixture checks in `output/recording-manifest.json`. The recording viewport is 1600 × 900; standardized assets are 1920 × 1080. Each clip starts and stops independently using the [Playwright screencast API](https://playwright.dev/docs/api/class-screencast).

## Regenerate narration

Python is needed only for narration generation. Create a package-local virtual environment, install its pinned dependency, and regenerate cached segments when changing the script:

```powershell
python -m venv project-demo/.tools/tts
project-demo/.tools/tts/Scripts/python.exe -m pip install -r project-demo/scripts/tts-requirements.txt
project-demo/.tools/tts/Scripts/python.exe project-demo/scripts/narration.py
npm.cmd --prefix project-demo run montage:audio
```

The generator reuses original MP3s when both the audio and sentence-boundary cache exist. Remove only the relevant cached segment pair to regenerate changed copy. `montage:audio` aligns speech to six approved time slots, limits peaks and writes the WAV, caption JSON and SRT. It refuses excessive time compression. Local Node configuration variables do not introduce environment variables into n8n workflows.

## Other helpers

| Command after `npm.cmd --prefix project-demo run` | Purpose |
| --- | --- |
| `montage:setup-check` | Verifies tooling, media helpers and the two-second `SetupTest` composition. |
| `montage:test` | Checks safe filenames, URL inference, health detection and server ownership. |
| `montage:frames -- [input.mp4]` | Extracts one QA frame per second; defaults to the newest output MP4. |
| `montage:render-test` | Renders the setup placeholder only. |
| `montage:clean` | Deletes generated recordings, screenshots, QA frames and outputs. This includes the final MP4 and SRT; preserve desired deliverables first. |

`recording.mjs` provides recording sessions, readiness checks and screenshots. `application.mjs` reuses a healthy server without taking ownership, or creates an empty disposable offline preview. `media.mjs` normalizes, trims, speeds and concatenates clips using executable/argument arrays without a shell. `LocalVideo.tsx` loads local assets through [Remotion Video](https://www.remotion.dev/docs/media/video).

Generated media, QA evidence, `.tools/`, `public/audio/` and private `.auth/` storage are Git-ignored. Editable source, scripts, storyboard and config remain trackable. No publication, commit or push is performed by these commands.