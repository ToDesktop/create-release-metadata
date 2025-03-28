# @todesktop/create-release-metadata

Create signed release metadata files for ToDesktop Installer.

## Prerequisites

### Install minisign (required)

This tool requires the native minisign command to generate keys and sign files:

```bash
# View installation instructions
npx @todesktop/create-release-metadata --install-minisign

# On macOS
brew install minisign

# On Ubuntu/Debian
apt install minisign

# On Windows
# Download from https://jedisct1.github.io/minisign/
```

### Generate signing key pair with minisign

Generate a new signing key pair using minisign:

```bash
# Generate a new signing key pair
minisign -G
# This will create minisign.key (secret key) and minisign.pub (public key)

# or
minisign -G -p minisign.pub -s minisign.key
```

## Usage

### CLI

```bash
# Basic usage
npx @todesktop/create-release-metadata \
  --secret-key minisign.key \
  MyApp-1.2.3-arm64.zip MyApp-1.2.3-x64.zip

# With release notes
npx @todesktop/create-release-metadata \
  --secret-key minisign.key \
  --release-notes-file release-notes.md \
  MyApp-1.2.3-arm64.zip MyApp-1.2.3-x64.zip

# With auto-updater compatibility
npx @todesktop/create-release-metadata \
  --secret-key minisign.key \
  --auto-updater-compat \
  --release-notes "What's new in this release:\n- Feature A\n- Bug fix B" \
  MyApp-1.2.3-arm64.zip MyApp-1.2.3-x64.zip

# Provide password for the minisign key (for automation)
npx @todesktop/create-release-metadata \
  --secret-key minisign.key \
  --password "my-secure-key-password" \
  MyApp-1.2.3-arm64.zip MyApp-1.2.3-x64.zip

# Show detailed progress information
npx @todesktop/create-release-metadata \
  --secret-key minisign.key \
  --verbose \
  MyApp-1.2.3-arm64.zip MyApp-1.2.3-x64.zip
```

If you don't provide a password via the `--password` option, the tool will allow you to enter it interactively when minisign prompts for it.

## Verifying signatures

Verify the generated signatures using the minisign utility:

```bash
# Verify the manifest file
minisign -Vm latest-mac.yml -p minisign.pub

# Verify a distributable file
minisign -Vm MyApp-1.2.3-arm64.zip -p minisign.pub
```

Example output of successful verification:

```
Signature and comment signature verified
Trusted comment: timestamp:1655234567 filename:MyApp-1.2.3-arm64.zip
```

### API

```typescript
import { createReleaseMetadata } from "@todesktop/create-release-metadata";

async function createRelease() {
	const manifestPath = await createReleaseMetadata({
		distributables: ["MyApp-1.2.3-arm64.zip", "MyApp-1.2.3-x64.zip"],
		secretKeyPath: "path/to/minisign.key",
		releaseNotes: "What's new in this release:\n- Feature A\n- Bug fix B",
		autoUpdaterCompat: true,
		baseUrl: "https://example.com/downloads",
		// Optional: provide password for the minisign key
		password: "my-secure-key-password",
		// Optional: show detailed progress information
		verbose: true,
	});

	console.log(`Created manifest at ${manifestPath}`);
}
```

## Manifest Format

```yaml
# latest-mac.yml
version: 1.2.3
updaterVersion: 1.0.0
schemaVersion: 1
releaseDate: "2024-03-20T10:00:00.000Z"
files:
  - url: MyApp-1.2.3-arm64.zip
    sha512: abcdef1234567890...
    size: 123456789
    arch: arm64
  - url: MyApp-1.2.3-x64.zip
    sha512: 0987654321fedcba...
    size: 123456789
    arch: x64
releaseNotes: |
  What's new in this release:
  - Feature A
  - Bug fix B
```

## Options

| Option                        | CLI                 | API                                                             | Description |
| ----------------------------- | ------------------- | --------------------------------------------------------------- | ----------- |
| `--secret-key <path>`         | `secretKeyPath`     | Path to the minisign secret key                                 |
| `--release-notes <text>`      | `releaseNotes`      | Release notes in Markdown format                                |
| `--release-notes-file <path>` | `releaseNotesPath`  | Path to a file containing release notes                         |
| `--auto-updater-compat`       | `autoUpdaterCompat` | Generate manifest compatible with Electron Builder auto-updater |
| `--base-url <url>`            | `baseUrl`           | Base URL where distributable files will be hosted               |
| `--app-version <version>`     | `appVersion`        | Version of the application                                      |
| `--updater-version <version>` | `updaterVersion`    | Version of the updater                                          |
| `--platform <platform>`       | `platform`          | Platform to create metadata for (mac, win, linux)               |
| `--output-dir <path>`         | `outputDir`         | Directory where metadata files will be written                  |
| `--password <password>`       | `password`          | Password for the minisign secret key (optional)                 |
| `--verbose`                   | `verbose`           | Show detailed progress information during execution             |
| `--install-minisign`          | N/A                 | Show instructions for installing minisign                       |

## License

MIT
