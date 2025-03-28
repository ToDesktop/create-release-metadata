export interface ReleaseFile {
	url: string;
	sha512: string;
	size: number;
	arch?: string;
}

export interface ReleaseManifest {
	version: string;
	updaterVersion: string;
	schemaVersion: number;
	releaseDate: string;
	files: ReleaseFile[];
	releaseNotes?: string;
	releaseName?: string;

	// Auto-updater compatibility fields (optional)
	path?: string;
	sha512?: string;
	size?: number;
}

export interface CreateMetadataOptions {
	distributables: string[];
	secretKeyPath: string;
	autoUpdaterCompat?: boolean;
	releaseNotes?: string;
	releaseNotesPath?: string;
	outputDir?: string;
	updaterVersion?: string;
	appVersion?: string;
	baseUrl?: string;
	platform?: "mac" | "win" | "linux";
	password?: string;
	verbose?: boolean;
}

export interface SignOptions {
	filePath: string;
	secretKeyPath: string;
	outputPath?: string;
}
