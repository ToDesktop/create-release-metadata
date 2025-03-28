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
import { promisify } from "node:util";
import { exec } from "node:child_process";

const execAsync = promisify(exec);

/**
 * Sign a file using the minisign command
 */
async function signFile(
	filePath: string,
	secretKeyPath: string,
): Promise<void> {
	try {
		await execAsync(`minisign -S -s "${secretKeyPath}" -m "${filePath}"`);
	} catch (error) {
		throw new Error(
			`Failed to sign file with minisign: ${(error as Error).message}`,
		);
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
	} = options;

	// Validate inputs
	if (!distributables.length) {
		throw new Error("No distributable files provided");
	}

	if (!secretKeyPath) {
		throw new Error("Secret key path is required");
	}

	// Read release notes if a path is provided
	const notes = releaseNotes ?? (await readReleaseNotes(releaseNotesPath));

	// Process each distributable file
	const fileEntries: ReleaseFile[] = await Promise.all(
		distributables.map(async (filePath) => {
			// Get file hash and size
			const { sha512, size } = await getFileInfo(filePath);

			// Determine architecture from filename
			const arch = extractArchFromFilename(path.basename(filePath));

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

	// Create manifest object
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
		// Use the first file as the primary one
		manifest.path = path.basename(distributables[0]);
		manifest.sha512 = fileEntries[0].sha512;
		manifest.size = fileEntries[0].size;
	}

	// Convert manifest to YAML
	const yamlContent = stringify(manifest);

	// Ensure output directory exists
	await fs.mkdir(outputDir, { recursive: true });

	// Write manifest to file
	const manifestFile = path.join(outputDir, `latest-${platform}.yml`);
	await fs.writeFile(manifestFile, yamlContent, "utf-8");

	// Sign manifest
	await signFile(manifestFile, secretKeyPath);

	// Sign each distributable file
	for (const filePath of distributables) {
		await signFile(filePath, secretKeyPath);
	}

	return manifestFile;
}
