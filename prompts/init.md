I want to create a `@todesktop/create-release-metadata` typescript library.

## Manifest Description

This schema is a superset of the electron-updater (Electron Builder) update format. The idea is that this manifest can also be used with Electron Builder apps and this will ease the transition to using our updater.\
I went with Electron Builder format because it is consistent across platforms, whereas Electron Forge has a different manifest format for each platform.

## Manifest format

```yaml
# latest-mac.yml*
version: 1.2.3
updaterVersion: 1.0.0  *# Prevent downgrade attacks (see note 1)*
schemaVersion: 1 *# Future proofing (see note 2)*
releaseDate: "2024-03-20T10:00:00.000Z"
# Top level `path`, `sha512`, `size` have been removed because are only needed for Electron Builder compatibilty. You can add them back in by using the `--auto-updater-compat` flag.*
files:
  - url: MyApp-1.2.3-arm64.zip
    sha512: abcdef1234567890...
    size: 123456789
    arch: arm64
  - url: MyApp-1.2.3-x64.zip
    sha512: 0987654321fedcba...
    size: 123456789
    arch: x64
releaseNotes: | # Markdown formatted release notes (see note 3)
  What's new in this release  :
  - Feature A
  - Bug fix B
```

## Notes

1.  `updaterVersion` is used to prevent downgrade attacks. It is the version of the updater that the app has been built with. The updater client can look at this value and decide whether to allow an update or not. This means that the updater client library is responsible for deciding if an update is allowed and we only take account of the updater library version when making the decision and not the actual version of the application.
2.  This is just for future proofing in case we need to change the manifest format, it also helps us to identify that the manifest is not a n Electron Builder manifest
3.  `releaseNotes` is a markdown formatted string that will be displayed to the user when an update is available. We could potentially show this in the UI of the app when an update is available. I'm not sure how important this is but it's worth considering.

## How to create release metadata from an existing app

### Input:

- Distributable files (in the example above: `MyApp-1.2.3-arm64.zip` and `MyApp-1.2.3-x64.zip`)
- Minisign secret key
- Optional: Release notes for the new version

### Example commands:

```
npx @todesktop/create-release-metadata \\
  --secret-key minisign.key \\
  --release-notes release-notes.md
```

Or if you want to be more explicit and use a string for the release notes:

```
npx @todesktop/create-release-metadata \\
  --secret-key minisign.key \\
  --release-notes "What's new in this release:\n- Feature A\n- Bug fix B" \\
  --distributable-files MyApp-1.2.3-arm64.zip MyApp-1.2.3-x64.zip \\
  --mac
```

If you want to create a manifest that has Electron Builder compatibility, you can use the `--auto-updater-compat` flag. This will add top-level `path`, `sha512`, `size` fields to the manifest and will allow Electron Builder to work with the manifest.

```
npx @todesktop/create-release-metadata \\
  --secret-key minisign.key \\
  --auto-updater-compat
```

This would create a manifest with extra fields for Electon Builder comatibility.

```yaml
# latest-mac.yml\
# add the following fields to the top-level of the manifest\
path: MyApp-1.2.3-mac.zip\
sha512: abcdef1234567890...\
size: 123456789\
# ...
```

### Output files:

- latest-mac.yml
- latest-mac.yml.minisig
- MyApp-1.2.3-arm64.zip.minisig
- MyApp-1.2.3-x64.zip.minisig

# Building the **@todesktop/create-release-metadata** package in detail

## Project Structure: CLI Tool and Library API

Design the project to serve both as a command-line tool and a reusable library. The source can be split into two entry points: one for the CLI and one for the library logic. Key aspects of structuring the project include:

- **CLI Entry Point:** Create a small TypeScript file (e.g. `src/cli.ts`) that handles parsing command-line arguments and then calls into the library functions. Add a shebang (`#!/usr/bin/env node`) at the top so it can run via `npx` or when installed globally. In **package.json**, define a **`bin`** field pointing to the compiled CLI file (e.g. `"bin": { "create-release-metadata": "./dist/cli.js" }`). This ensures running `npx @todesktop/create-release-metadata` invokes your tool.
- **Library Module:** Implement the core functionality in another file (e.g. `src/index.ts`) exporting functions (like `generateReleaseMetadata(...)`). This function will accept inputs (the list of distributable file paths, the Minisign secret key, release notes, etc.) and produce the release manifest. By separating logic from the CLI interface, other Node.js scripts or tests can call the function programmatically.
- **Internal Workflow:** The CLI module should parse options (file paths, flags, etc.), then call the library function with those parameters. The library function does the work: computing hashes, building the manifest object, signing files, and writing output files. The CLI can then handle any user messaging or error handling. This separation follows good modular design and makes the code easier to maintain and test.

This dual structure is a common best practice for CLI packages – you get a nice user-facing command while also allowing integration as a library in other tools. For example, many CLI tools use this approach: a lightweight CLI wrapper and a core library beneath. Ensure the CLI entry is compiled with the shebang preserved (TypeScript’s `preserveShebangs` compiler option can help) so that the generated JavaScript still starts with `#!/usr/bin/env node`.

## Command-Line Argument Parsing

For parsing command-line arguments, leverage a proven Node.js CLI parsing library rather than writing manual parsing logic. Two popular choices are **Commander.js** and **Yargs**:

- **Commander.js:** A lightweight, minimal-dependency library for defining options and commands. It has an intuitive API for single-command CLIs. Commander allows chaining option definitions and automatically generates a help message. It’s actively maintained and supports features like subcommands and default help/version options. Commander is known for its simplicity and small size ([Commander.js vs other CLI frameworks - Mastering Command-Line Applications with Commander.js | StudyRaid](https://app.studyraid.com/en/read/11908/379336/commanderjs-vs-other-cli-frameworks#:~:text=)) ([Commander.js vs other CLI frameworks - Mastering Command-Line Applications with Commander.js | StudyRaid](https://app.studyraid.com/en/read/11908/379336/commanderjs-vs-other-cli-frameworks#:~:text=,overkill%20for%20simple%20CLI%20applications)). For example:

  ```ts
  program
  	.option("-k, --key <file>", "Path to Minisign secret key")
  	.option("--auto-updater-compat", "Include legacy auto-updater fields")
  	.option("--notes <file>", "Release notes markdown file");
  program.parse(process.argv);
  const opts = program.opts();
  ```

  This would parse flags like `--auto-updater-compat` or `--notes README.md` etc., and you can then use `opts.key`, `opts.autoUpdaterCompat` in your code.

- **Yargs:** A feature-rich parser that uses a declarative syntax. Yargs can infer argument types and even provide **typed** results in TypeScript. It includes utilities like `.argv` for quick access to parsed arguments and built-in help and completion. Yargs tends to have more dependencies and a slightly larger footprint, but it shines for complex CLIs with multiple commands. For instance, you can define options with constraints:

  ```ts
  import * as yargs from "yargs";
  const argv = yargs.options({
  	key: {
  		alias: "k",
  		type: "string",
  		demandOption: true,
  		description: "Minisign secret key file",
  	},
  	"auto-updater-compat": {
  		type: "boolean",
  		default: false,
  		description: "Enable Electron AutoUpdater compatibility",
  	},
  	notes: {
  		type: "string",
  		alias: "n",
  		description: "Path to release notes file",
  	},
  }).argv;
  ```

  This automatically handles parsing and gives you `argv.key`, `argv.notes`, etc., with the correct types ([Creating a CLI for your Node.js app using Typescript - DEV Community](https://dev.to/int0h/creating-a-cli-for-your-node-js-app-using-typescript-124p#:~:text=const%20yargs%20%3D%20require)) ([Commander.js vs other CLI frameworks - Mastering Command-Line Applications with Commander.js | StudyRaid](https://app.studyraid.com/en/read/11908/379336/commanderjs-vs-other-cli-frameworks#:~:text=,overkill%20for%20simple%20CLI%20applications)). Yargs will also generate a `--help` output describing each option.

Both libraries are excellent. **Commander** might be ideal if your CLI is simple (just a few options) because it’s very lightweight and has zero dependencies besides Node.js ([Commander.js vs other CLI frameworks - Mastering Command-Line Applications with Commander.js | StudyRaid](https://app.studyraid.com/en/read/11908/379336/commanderjs-vs-other-cli-frameworks#:~:text=,overkill%20for%20simple%20CLI%20applications)). **Yargs** is great if you want more robust parsing and built-in type safety for the parsed args. Either way, using one of these ensures your CLI handles arguments consistently and provides helpful usage info to users.

For our tool, the CLI will likely accept: one or more file paths (the distributables), a `-k/--key` for the Minisign secret key (or perhaps an environment variable for security), an optional `--notes` for release notes text/file, and the `--auto-updater-compat` boolean flag. You can also include a `-v/--version` flag that prints the tool version (often handled by the library or manually). By following established CLI parsing practices, you'll get standardized `--help` output and error handling for unknown options for free.

## Generating the Release Manifest (YAML)

Once inputs are parsed, the core task is to generate the `latest-mac.yml` file containing metadata about the release. The format will be a **YAML** document (for compatibility with Electron’s auto-updater) that is a superset of Electron Builder’s update info schema. Key fields to include in the manifest:

- **version:** The version of the application being released (e.g. `1.2.3`). This can be passed in or derived. It’s crucial that this matches the app’s actual version.
- **updaterVersion:** A version number for your update tool itself or the format. This field isn’t in standard electron-updater, but as part of your extended schema you can use it to indicate the version of `@todesktop/create-release-metadata` or the metadata schema version.
- **schemaVersion:** An identifier for the manifest schema revision. For example, `schemaVersion: 1` (or `v2` etc.) to allow future evolution of the file format.
- **releaseDate:** Timestamp of the release. It’s good practice to include an ISO 8601 datetime (e.g. `2025-03-26T17:18:00Z`) when the release was created. This helps clients or developers know when this version was published.
- **files:** An array of objects, each describing one distributable file for this release. For each file, include:

  - `url`: The direct download URL for the file (for example, an HTTPS link to the `.dmg` or `.zip`).
  - `sha512`: The SHA-512 checksum of the file, encoded in base64. This ensures integrity – the updater can verify the file it downloads matches the expected hash.
  - `size`: The size of the file in bytes. This is useful for display or verification and is part of your extended schema.
  - `arch`: The target CPU architecture for the file (e.g. `x64`, `arm64`, `universal`). This allows the manifest to list multiple files for different architectures if applicable.

- **releaseNotes (optional):** If release notes text is provided (either as a string of Markdown or HTML), include it here. Electron’s updater supports a `releaseNotes` field (which can be a string or an array for multi-entry changelogs) ([electron-builder/packages/builder-util-runtime/src/updateInfo.ts at master · electron-userland/electron-builder · GitHub](https://github.com/electron-userland/electron-builder/blob/master/packages/builder-util-runtime/src/updateInfo.ts#:~:text=%2F)). If you pass a Markdown string, the electron-updater will display it in the update dialog.
- **releaseName (optional):** A short human-readable name for the release (not always used, but part of the schema if needed).

These fields cover the superset of Electron Builder’s format. In fact, Electron’s built-in **UpdateInfo** schema already includes `files`, `version`, `releaseDate`, `releaseNotes`, etc., and historically had top-level `path` and `sha512` for a single file (now deprecated) ([electron-builder/packages/builder-util-runtime/src/updateInfo.ts at master · electron-userland/electron-builder · GitHub](https://github.com/electron-userland/electron-builder/blob/master/packages/builder-util-runtime/src/updateInfo.ts#:~:text=%2F)). Our manifest extends this with `updaterVersion`, `schemaVersion`, and `size` and `arch` details.

To build the manifest, gather all required data (from inputs and computed values) into a JavaScript object. For example:

```js
const manifest = {
	version: "1.2.3",
	updaterVersion: "1.0.0",
	schemaVersion: 1,
	releaseDate: new Date().toISOString(),
	files: [
		{
			url: "https://downloads.example.com/MyApp-1.2.3-mac.dmg",
			sha512: "<computed-base64-hash>",
			size: 12345678,
			arch: "x64",
		},
		{
			url: "https://downloads.example.com/MyApp-1.2.3-mac-arm64.dmg",
			sha512: "<computed-base64-hash-2>",
			size: 12300000,
			arch: "arm64",
		},
	],
	releaseNotes: "### Changelog\n* Fixed some bugs...\n* Added a feature...",
};
```

(If only one file is provided, `files` would be an array of length 1. If release notes are not given, omit that field or set it to `null`.)

Now we need to serialize this object to YAML format. Use a reliable YAML library for Node.js so that we don't have to manually format YAML (which is error-prone). Two popular choices are **js-yaml** and **yaml**. The **`yaml`** npm package (by eemeli) is a modern YAML library with full YAML 1.2 support and built-in TypeScript types ([yaml - npm](https://www.npmjs.com/package/yaml#:~:text=,This%20library)). For example, using the `yaml` package:

```ts
import { stringify } from "yaml";
const yamlText = stringify(manifest);
```

This will produce a YAML string following YAML conventions (keys, indentation, etc.) ([yaml - npm](https://www.npmjs.com/package/yaml#:~:text=YAML)). The library handles converting JavaScript types to YAML (e.g. converting the `files` array of objects, ensuring the byte size is a number, not a string). Using a library ensures the output is well-formed. If you prefer **js-yaml**, it offers a similar API via `yaml.dump(manifest)` – either is fine. Just make sure to include the YAML library as a dependency and import it in your code. The output file should be named **`latest-mac.yml`** (YAML typically uses `.yml` or `.yaml`; electron-builder uses `.yml` by convention). Finally, write the `yamlText` to disk at the desired location (likely in the current directory or a specified output path). At this stage, we have the unsigned manifest file ready.

## Computing File Hashes and Sizes

A core part of manifest generation is computing the SHA-512 hashes and file sizes for each distributable. This should be automated to avoid mistakes. **Node.js** provides built-in APIs to accomplish this efficiently:

- **File Size:** Use the `fs` module to stat the file and get its size in bytes. For example, `fs.statSync(filePath).size` returns the size in bytes ([How to find the size of the file in Node.js? - Stack Overflow](https://stackoverflow.com/questions/42363140/how-to-find-the-size-of-the-file-in-node-js#:~:text=Overflow%20stackoverflow,var%20fileSizeInBytes%20%3D%20stats.size)). If you prefer async, you can use `await fs.promises.stat(filePath)`.size. This gives an exact size which you will put into the manifest.

- **SHA-512 Hash:** Use Node’s `crypto` module to create a hash of the file content. It’s best to stream the file rather than read it entirely into memory (especially since installers could be hundreds of MB). You can do this by piping a read stream into a hash:

  ```js
  import * as fs from 'fs';
  import * as crypto from 'crypto';
  function hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha512');
      const stream = fs.createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        const digest = hash.digest('base64');
        resolve(digest);
      });
    });
  }
  ```

  In this example (based on a Node.js hashing snippet ([How To Get The Hash of A File In Node.js - DEV Community](https://dev.to/saranshk/how-to-get-the-hash-of-a-file-in-nodejs-1bdk#:~:text=const%20getHash%20%3D%20path%20%3D,resolve%28hash.digest%28%27hex%27%29%29%29%3B))), we create a SHA-512 hash instance, stream the file data through it, and on end, get the final digest in base64 format. We choose base64 because that’s the format expected by Electron’s updater (electron-builder generates base64 SHA512 hashes in its YAML). You could also use the synchronous `fs.readFileSync` and hash update, but streaming is more memory-efficient for large files.

Alternatively, there are convenience libraries like **hasha** that wrap this logic. For example, _hasha_ can compute a hash with one function call (it internally uses crypto and streams) ([hasha - NPM](https://www.npmjs.com/package/hasha#:~:text=Hashing%20made%20simple,simpler%20API%20and%20better%20defaults)). Using Node’s core modules is perfectly fine and avoids extra dependencies, but hasha is an option if you want slightly simpler code.

After this step, for each file we will have: the file’s `size` (bytes, as a number) and its `sha512` hash (base64 string). Both are inserted into the manifest under the corresponding file entry. It’s a good idea to double-check these values (perhaps print them in verbose mode) and ensure the hash matches an expected value (if you have a reference), especially the first few times to be sure the hashing is correct.

## Signing the Manifest and Files with Minisign

Security is a crucial part of release distribution. We will use **minisign** (an Ed25519-based signing tool) to sign both the manifest and each distributable file. This ensures that consumers of your app can verify that the update and files are authentic and untampered. The **minisign** npm package provides a JavaScript implementation of the Minisign functionality ([minisign - npm](https://www.npmjs.com/package/minisign#:~:text=,jedisct1%29%20minisign%20tool)), so we don’t need an external binary. Here’s how to use it in our context:

1. **Load the Secret Key:** Accept the Minisign secret key (likely as a file path, e.g. `minisign.key`). This key is typically password-protected. For security, avoid passing the password on the command line. Instead, you can prompt the user (in CLI) to enter the passphrase (using a library like **inquirer** to hide input), or allow an environment variable. Use the minisign API to read and parse the secret key. For example:

   ```ts
   import * as minisign from "minisign";
   const secretKeyBuf = fs.readFileSync(secretKeyPath);
   const secretKeyInfo = minisign.parseSecretKey(secretKeyBuf);
   // secretKeyInfo will contain the encrypted key material and metadata.
   const skDetails = minisign.extractSecretKey(
   	Buffer.from(passphrase),
   	secretKeyInfo,
   );
   ```

   The `parseSecretKey` function reads the key file content and validates its checksum ([minisign - npm](https://www.npmjs.com/package/minisign#:~:text=Reading%20secret%20key)). Then `extractSecretKey` uses the provided password to decrypt the key, giving us the actual secret key bytes ready for signing ([minisign - npm](https://www.npmjs.com/package/minisign#:~:text=)). **Important:** Handle the passphrase carefully – do not log it or store it. Once `skDetails` is obtained, you have the secret key in memory.

2. **Sign the Manifest:** We have the manifest content as YAML text. Convert it to a `Buffer` and call minisign’s signing function:

   ```ts
   const manifestBuf = Buffer.from(yamlText, "utf8");
   const sigResult = minisign.signContent(manifestBuf, skDetails, {
   	comment: "signed by todesktop CLI",
   	tComment: `trusted comment: manifest for v${manifest.version}`,
   });
   fs.writeFileSync("latest-mac.yml.minisig", sigResult.outputBuf);
   ```

   The `signContent` API will produce a signature in the Minisign format ([minisign - npm](https://www.npmjs.com/package/minisign#:~:text=Signing%20content%20provided%20as%20)). It returns an object containing an `outputBuf` – this is the exact bytes that make up the `.minisig` file (including the untrusted and trusted comments, signature, and the “trusted comment signature” block). By writing `sigResult.outputBuf` to `latest-mac.yml.minisig`, we create the signature file. The comments (untrusted and trusted) are optional metadata; here we set a short identifier to indicate what was signed. The trusted comment (prefixed with `trusted comment:` in the output) is part of the signed data, so it can carry the manifest version or other info securely.

3. **Sign Each Distributable File:** Similarly, for each file that was listed in the manifest, generate a Minisign signature. You can either read the entire file as a buffer or stream it – but since the minisign library’s `signContent` expects a complete buffer, you may need to read it fully. For each file `path/to/YourApp.dmg`, do:

   ```ts
   const fileBuf = fs.readFileSync(filePath); // (Consider memory impact for large files)
   const fileSig = minisign.signContent(fileBuf, skDetails, {
   	comment: "signed by todesktop CLI",
   	tComment: `trusted comment: ${path.basename(filePath)}`,
   });
   fs.writeFileSync(filePath + ".minisig", fileSig.outputBuf);
   ```

   This will output a `.minisig` signature next to each file. By default, the minisign CLI would do the same (it appends “.minisig” to the filename) ([minisign - npm](https://www.npmjs.com/package/minisign#:~:text=Signing%20files)). We are programmatically replicating that behavior. After this, you should have: **`latest-mac.yml`**, **`latest-mac.yml.minisig`**, and for example **`YourApp.dmg.minisig`** (and similarly for any other file e.g. a zip or another dmg). Each `.minisig` contains a base64 signature and comments, and can be verified using the corresponding public key.

4. **Verification (optional but recommended):** It’s good to verify the signatures as a test. You can use minisign’s verify functions if available, or use the minisign CLI manually: e.g. `minisign -Vm latest-mac.yml -p /path/to/pubkey.pub` which should report “Signature and comment signature verified” if all went well ([minisign - npm](https://www.npmjs.com/package/minisign#:~:text=%24%20minisign%20,pub)). This step is mainly for your own confidence that signing worked correctly.

**Secure usage considerations:** Keep the secret key secure. Ideally, the CLI should not expose the secret key content or passphrase. If this tool is used in CI, consider providing the key via a secure file and the passphrase via an environment secret. The `minisign` npm library handles the cryptography internally (Ed25519 signatures), which is safer than trying to implement signing yourself. Using the official library also ensures compatibility with Minisign’s file format. By signing both the manifest and files, you allow end-users or your update process to verify that not only the app package is valid, but also that the manifest listing the update came from you (preventing tampering of the update info).

## Electron Builder Compatibility Mode

Electron’s auto-updater (specifically `electron-updater` used with electron-builder) historically looked for certain fields at the top level of the update YAML. In newer versions, it prefers the `files` array approach, but for backward compatibility you might need to include the legacy fields. When the user passes the `--auto-updater-compat` flag, your tool should add the following top-level keys in **latest-mac.yml**, in addition to the `files` list:

- **path:** The file name of the primary artifact (e.g. `"YourApp-1.2.3-mac.dmg"`). This corresponds to what electron-updater calls `UpdateInfo.path` ([electron-builder/packages/builder-util-runtime/src/updateInfo.ts at master · electron-userland/electron-builder · GitHub](https://github.com/electron-userland/electron-builder/blob/master/packages/builder-util-runtime/src/updateInfo.ts#:~:text=%2F)). It’s marked deprecated in the schema but some older updaters might still expect it. Typically, if you have multiple files (like an x64 and arm64 build), you might choose the **universal** or x64 one as the main path. In a single-file scenario, it’s just that file’s name.
- **sha512:** The SHA-512 hash of the primary file, as a base64 string (same value that should also be in the files array entry). This duplicates information, but older auto-update implementations use it. Electron-updater’s interface still defines `sha512` at the root for backward compat ([electron-builder/packages/builder-util-runtime/src/updateInfo.ts at master · electron-userland/electron-builder · GitHub](https://github.com/electron-userland/electron-builder/blob/master/packages/builder-util-runtime/src/updateInfo.ts#:~:text=%2F)).
- **size:** The size of the primary file in bytes. This isn’t part of the original electron-updater schema (which relied on the files array for size), but including it can be helpful for any tool that might look for it. It doesn’t harm compatibility to add an extra field.

Including these fields makes your `latest-mac.yml` look similar to what electron-builder would generate. For example, with compatibility on, the YAML might start like:

```yaml
version: "1.2.3"
path: "MyApp-1.2.3-mac.dmg"
sha512: "BASE64_HASH=="
size: 12345678
releaseDate: "2025-03-26T17:18:00.000Z"
files:
  - url: "https://downloads.example.com/MyApp-1.2.3-mac.dmg"
    sha512: "BASE64_HASH=="
    size: 12345678
    arch: "x64"
  - url: "https://downloads.example.com/MyApp-1.2.3-mac-arm64.dmg"
    sha512: "BASE64_HASH2=="
    size: 12300000
    arch: "arm64"
releaseNotes: "Fixed issue X, improved Y..."
```

Here, `path/sha512/size` reflect the first file (x64 dmg) for compatibility. Electron-updater will populate its `updateInfo.path` and `updateInfo.sha512` from these if present ([electron-builder/packages/builder-util-runtime/src/updateInfo.ts at master · electron-userland/electron-builder · GitHub](https://github.com/electron-userland/electron-builder/blob/master/packages/builder-util-runtime/src/updateInfo.ts#:~:text=%2F)), but in modern versions it actually uses the `files` array (and treats the first entry as the one to download for the current platform). By providing both, you cover both old and new updater expectations.

Make this compatibility opt-in via the flag because it slightly duplicates data and is not needed in all cases. Internally, implementing this can be as simple as: after you assemble the manifest object with `files`, if the flag is true, copy `files[0].sha512` to a top-level `sha512`, `files[0].size` to top-level `size`, and set top-level `path` to the filename (which could be extracted from the URL or input path). This way, the YAML serialization will include them. Remember to mark them clearly in comments or docs as legacy fields. The electron-builder docs note that these were deprecated in favor of the array approach ([electron-builder/packages/builder-util-runtime/src/updateInfo.ts at master · electron-userland/electron-builder · GitHub](https://github.com/electron-userland/electron-builder/blob/master/packages/builder-util-runtime/src/updateInfo.ts#:~:text=%2F)), so future tools might not require them, but it doesn’t hurt to have them for safety if you know some users rely on electron-updater’s older behavior.

## TypeScript Project Setup and Tooling

To make development smooth, set up your TypeScript project with standard configurations and tools:

- **TypeScript Config:** In your `tsconfig.json`, target a Node-compatible environment (e.g. `"target": "ES2020"` or later, and `"module": "CommonJS"` for output if you plan to publish CommonJS). Include `"declaration": true` to generate `.d.ts` type definitions for library consumers. If you use the shebang in the CLI source, enable `"preserveShebangs": true` so that it appears in the compiled output.

- **Build Process:** You can use **tsc** (TypeScript compiler) to compile your project (maybe with an npm script like `"build": "tsc"`). This will output JavaScript (and .d.ts files). Alternatively, consider using a bundler like **tsup** or **esbuild** to produce a single-file bundle for the CLI. Tools like **tsup** can bundle your code and its dependencies into a compact output, and even produce both CommonJS and ESM bundles easily ([GitHub - kucherenko/cli-typescript-starter: TypeScript CLI starter kit for Node.js. Optimized for quick setup and development efficiency.](https://github.com/kucherenko/cli-typescript-starter#:~:text=development%20experience%3A)) ([How to build dual package npm from Typescript — the easiest way | by Duy NG | ekino-france | Medium](https://medium.com/ekino-france/supporting-dual-package-for-cjs-and-esm-in-typescript-library-b5feabac1357#:~:text=JavaScript%20is%20evolving%20rapidly,ESM)). Supporting both CJS and ESM is a modern best practice so that your library can be `require()`-ed in Node or `import`-ed in ESM projects without issues ([How to build dual package npm from Typescript — the easiest way | by Duy NG | ekino-france | Medium](https://medium.com/ekino-france/supporting-dual-package-for-cjs-and-esm-in-typescript-library-b5feabac1357#:~:text=JavaScript%20is%20evolving%20rapidly,ESM)). For example, you might output `dist/index.cjs.js` and `dist/index.esm.js` and use **package.json** `"exports"` field to direct to the right one. The CLI can be bundled as a separate file (CommonJS, since Node will execute it).

- **Project Template:** To hit the ground running, you can use a starter template or boilerplate. For instance, the _cli-typescript-starter_ kit incorporates Yargs for parsing, tsup for bundling, and even testing and linting setup out of the box ([GitHub - kucherenko/cli-typescript-starter: TypeScript CLI starter kit for Node.js. Optimized for quick setup and development efficiency.](https://github.com/kucherenko/cli-typescript-starter#:~:text=development%20experience%3A)). It shows how to structure the project and includes conveniences like a logger, config for Prettier/ESLint, etc. Using such a template (or referencing it) can save time in configuring your project. However, even without it, ensure you have at least: a build script, a clean script (to remove `dist` before rebuilds), and possibly a basic test setup to verify functionality.

- **CLI Publishing:** When publishing to npm, double-check the package.json fields: the `"bin"` is correctly set, the `"main"` or `"exports"` points to your library entry (if you want people to import it), and add `"files"` or `.npmignore` so you only publish the necessary compiled files and not your entire source/test folder. Also include a README and proper versioning. Since this tool will likely be used via `npx`, users will get the latest from npm on each run – so test thoroughly and consider using semantic versioning for releases.

- **Error Handling and UX:** As a CLI, ensure it exits with non-zero codes on error, prints meaningful messages (possibly use a logging library or just console.error). You might integrate a pretty output (colors via something like **chalk** or **picocolors**, which is used in some CLI templates ([GitHub - kucherenko/cli-typescript-starter: TypeScript CLI starter kit for Node.js. Optimized for quick setup and development efficiency.](https://github.com/kucherenko/cli-typescript-starter#:~:text=,fastest%20way%20to%20bundle%20your))) to highlight success or errors. These are not strictly required, but polish the user experience.

By following these project setup practices, you’ll create a robust TypeScript project. It will be easy to maintain and extend (e.g. adding new flags or supporting Windows/Linux manifests in the future), and friendly for others to contribute to or use. Modern TypeScript tooling and Node features will help keep it secure and up-to-date. For example, automated tests can verify that a sample input produces the correct `latest-mac.yml` and that verification of signatures passes, giving confidence in your package’s reliability.

## Conclusion

In summary, building `@todesktop/create-release-metadata` involves combining several best practices: a clean TypeScript project structure that delivers both a CLI and an importable API, use of reliable libraries for parsing CLI args (Commander/Yargs) and producing output (YAML), solid Node.js methods for file hashing and I/O, and the secure use of the Minisign library for digital signatures. By structuring the code logically and using these tools, the package can automatically generate a correct **latest-mac.yml** manifest with all required fields and matching signatures. This manifest will incorporate additional metadata (like updater and schema versions) to future-proof it, while an optional compatibility mode ensures it works with Electron’s auto-updater expectations. Following the outlined practices and using the recommended libraries will result in a robust, user-friendly CLI tool that streamlines the release process for Electron apps.
