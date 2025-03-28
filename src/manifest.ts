import { stringify } from "yaml";
import path from "node:path";
import fs from "node:fs/promises";
import {
	CreateMetadataOptions,
	ReleaseFile,
	ReleaseManifest,
} from "./types.js";
import {
	getFileInfo,
	extractArchFromFilename,
	readReleaseNotes,
	extractVersionFromFilename,
} from "./file-utils.js";
import { spawn } from "node:child_process";

/**
 * Sign a file using the minisign command
 */
async function signFile(
	filePath: string,
	secretKeyPath: string,
	password?: string,
): Promise<void> {
	try {
		console.log(`Signing file: ${path.basename(filePath)}`);

		// If password is provided, use spawn with input piping
		if (password) {
			console.log("Using provided password for key decryption");
			// Use spawn with stdio configuration for password input
			const minisign = spawn(
				"minisign",
				["-S", "-s", secretKeyPath, "-m", filePath],
				{
					stdio: ["pipe", "inherit", "inherit"],
				},
			);

			// Write password to stdin and close it
			minisign.stdin.write(password + "\n");
			minisign.stdin.end();

			// Return a promise that resolves/rejects based on the process exit
			await new Promise((resolve, reject) => {
				minisign.on("close", (code) => {
					if (code === 0) {
						resolve(undefined);
					} else {
						reject(
							new Error(`minisign process exited with code ${String(code)}`),
						);
					}
				});
			});
		} else {
			// No password provided, use exec with 'inherit' stdio to allow interactive password input
			console.log("You may need to enter password in the terminal if prompted");

			// Use spawn instead of exec to allow for interactive password entry
			const minisign = spawn(
				"minisign",
				["-S", "-s", secretKeyPath, "-m", filePath],
				{
					stdio: "inherit", // Use inherit for all stdio streams to allow interactive input
				},
			);

			// Return a promise that resolves/rejects based on the process exit
			await new Promise((resolve, reject) => {
				minisign.on("close", (code) => {
					if (code === 0) {
						resolve(undefined);
					} else {
						reject(
							new Error(
								`minisign process exited with code ${String(code ?? "unknown")}`,
							),
						);
					}
				});
			});
		}

		console.log(`Successfully signed: ${path.basename(filePath)}`);
	} catch (error) {
		const err = error as Error;
		console.error(`Error signing file: ${path.basename(filePath)}`);

		// Forward any error output from minisign
		if (err.message) console.error(err.message);

		throw new Error(`Failed to sign file with minisign: ${err.message}`);
	}
}

/**
 * Creates release metadata files for ToDesktop Installer
 */
export async function createReleaseMetadata(
	options: CreateMetadataOptions,
): Promise<string> {
	const {
		distributables,
		secretKeyPath,
		autoUpdaterCompat = false,
		releaseNotes,
		releaseNotesPath,
		outputDir = ".",
		updaterVersion = "1.0.0",
		appVersion,
		baseUrl = "",
		platform = "mac",
		password,
		verbose = false,
	} = options;

	// Helper function for logging
	const log = (message: string) => {
		if (verbose) {
			console.log(`[ToDesktop Release] ${message}`);
		}
	};

	log("Starting release metadata creation...");

	// Validate inputs
	if (!distributables.length) {
		throw new Error("No distributable files provided");
	}

	if (!secretKeyPath) {
		throw new Error("Secret key path is required");
	}

	log(`Processing ${String(distributables.length)} distributable files`);

	// Read release notes if a path is provided
	const notes = releaseNotes ?? (await readReleaseNotes(releaseNotesPath));
	log(notes ? "Release notes loaded" : "No release notes provided");

	// Process each distributable file
	log("Calculating file hashes and metadata...");
	const fileEntries: ReleaseFile[] = await Promise.all(
		distributables.map(async (filePath, index) => {
			log(
				`Processing file ${String(index + 1)}/${String(distributables.length)}: ${path.basename(filePath)}`,
			);

			// Get file hash and size
			const { sha512, size } = await getFileInfo(filePath);
			log(`File size: ${String(size)} bytes`);

			// Determine architecture from filename
			const arch = extractArchFromFilename(path.basename(filePath));
			log(`Detected architecture: ${arch ?? "unknown"}`);

			// Create file entry
			const url = baseUrl
				? `${baseUrl}/${path.basename(filePath)}`
				: path.basename(filePath);

			return {
				url,
				sha512,
				size,
				...(arch ? { arch } : {}),
			};
		}),
	);

	// Determine app version if not provided
	const version =
		appVersion ??
		extractVersionFromFilename(path.basename(distributables[0])) ??
		"1.0.0";
	log(`Using version: ${version}`);

	// Create manifest object
	log("Creating manifest object...");
	const manifest: ReleaseManifest = {
		version,
		updaterVersion,
		schemaVersion: 1,
		releaseDate: new Date().toISOString(),
		files: fileEntries,
		...(notes ? { releaseNotes: notes } : {}),
	};

	// Add auto-updater compatibility fields if requested
	if (autoUpdaterCompat && fileEntries.length > 0) {
		log("Adding auto-updater compatibility fields");
		// Use the first file as the primary one
		manifest.path = path.basename(distributables[0]);
		manifest.sha512 = fileEntries[0].sha512;
		manifest.size = fileEntries[0].size;
	}

	// Convert manifest to YAML
	log("Converting manifest to YAML...");
	const yamlContent = stringify(manifest);

	// Ensure output directory exists
	log(`Ensuring output directory exists: ${outputDir}`);
	await fs.mkdir(outputDir, { recursive: true });

	// Write manifest to file
	const manifestFile = path.join(outputDir, `latest-${platform}.yml`);
	log(`Writing manifest to: ${manifestFile}`);
	await fs.writeFile(manifestFile, yamlContent, "utf-8");

	// Sign manifest
	log("Signing manifest file...");
	if (password) {
		log("Password provided for key decryption");
	} else {
		log("No password provided, you may need to enter it manually if prompted");
	}
	await signFile(manifestFile, secretKeyPath, password);

	// Sign each distributable file
	log("Signing distributable files...");
	for (const [index, filePath] of distributables.entries()) {
		log(
			`Signing file ${String(index + 1)}/${String(distributables.length)}: ${path.basename(filePath)}`,
		);
		await signFile(filePath, secretKeyPath, password);
	}

	log("Release metadata creation completed successfully!");
	return manifestFile;
}
