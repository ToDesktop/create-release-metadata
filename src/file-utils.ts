import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import crypto from "node:crypto";

/**
 * Calculate the SHA-512 hash of a file
 */
export async function calculateSha512(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash("sha512");
		const stream = createReadStream(filePath);

		stream.on("error", reject);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => {
			const digest = hash.digest("base64");
			resolve(digest);
		});
	});
}

/**
 * Get the size of a file in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
	const stats = await stat(filePath);
	return stats.size;
}

/**
 * Get file information (hash and size)
 */
export async function getFileInfo(
	filePath: string,
): Promise<{ sha512: string; size: number }> {
	const [sha512, size] = await Promise.all([
		calculateSha512(filePath),
		getFileSize(filePath),
	]);
	return { sha512, size };
}

/**
 * Extract architecture from filename (heuristic)
 */
export function extractArchFromFilename(filename: string): string | undefined {
	const armMatch = /arm64|aarch64/i.exec(filename);
	if (armMatch) return "arm64";

	const x64Match = /x64|x86_64|amd64/i.exec(filename);
	if (x64Match) return "x64";

	const x86Match = /x86|ia32|i386/i.exec(filename);
	if (x86Match) return "ia32";

	const universalMatch = /universal/i.exec(filename);
	if (universalMatch) return "universal";

	return undefined;
}

/**
 * Read release notes from a file if path is provided
 */
export async function readReleaseNotes(
	releaseNotesPath?: string,
): Promise<string | undefined> {
	if (!releaseNotesPath) return undefined;

	try {
		return await fs.readFile(releaseNotesPath, "utf-8");
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to read release notes from ${releaseNotesPath}: ${errorMessage}`,
		);
	}
}

/**
 * Ensure a directory exists
 */
export async function ensureDir(dir: string): Promise<void> {
	try {
		await fs.mkdir(dir, { recursive: true });
	} catch (error) {
		// Ignore if directory already exists
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
			throw error;
		}
	}
}

/**
 * Extract version from filename (heuristic)
 */
export function extractVersionFromFilename(filename: string): string | null {
	// Remove file extension first
	const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

	// Try matching with prerelease tag on filename without extension
	const versionMatchFull = /v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/.exec(
		nameWithoutExt,
	);
	if (versionMatchFull) {
		return versionMatchFull[1];
	}

	// Fallback to just matching the semver part
	const versionMatchSimple = /v?(\d+\.\d+\.\d+)/.exec(nameWithoutExt);
	return versionMatchSimple ? versionMatchSimple[1] : null;
}
