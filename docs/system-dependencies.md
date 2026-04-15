# System Dependencies

## Required local tooling

Contributors and agents should assume these tools are available or installable:

- `Node.js 22+`
- `pnpm 10+`
- `ffmpeg`
- `ffprobe`

## Policy

- The repository does not vendor `ffmpeg` or `ffprobe` binaries in the initial implementation.
- Runtime modules should call system-installed binaries through explicit adapters.
- Binaries must be discoverable on `PATH` unless a future configuration layer introduces an explicit override.

## Verification commands

Contributors should be able to run:

```bash
node --version
pnpm --version
ffmpeg -version
ffprobe -version
```

## Why system-installed FFmpeg

- avoids coupling the repo to archived wrapper packages
- avoids bundling large binary artifacts into the project baseline
- keeps the tool boundary explicit
- makes it easier to swap execution strategy later

## License posture

Because FFmpeg builds can differ in enabled codecs and license posture:

- the repository should document FFmpeg as an external prerequisite,
- avoid shipping pinned FFmpeg binaries by default,
- and keep the JavaScript layer independent of GPL-only Node wrapper packages.

If a future release needs packaged binaries, that should be a deliberate maintainer decision with separate license review.

## Fixture expectations

- Test fixtures should be small and explicitly licensed.
- Modules should not assume production-scale media files are present locally.
- Audio fixture metadata should be documented alongside the fixture set.
