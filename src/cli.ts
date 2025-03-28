#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseMetadata } from "./manifest.js";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if minisign is installed
 */
function isMinisignInstalled(): boolean {
	try {
		execSync("minisign -v", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

// Read package.json to get version
const pkgPath = path.resolve(__dirname, "../package.json");
const pkgContent = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(pkgContent) as { version: string };

// Create commander program
const program = new Command();

program
	.name("create-release-metadata")
	.description("Create signed release metadata files for ToDesktop Installer")
	.version(pkg.version);

interface CLIOptions {
	secretKey?: string;
	outputDir?: string;
	releaseNotes?: string;
	releaseNotesFile?: string;
	autoUpdaterCompat?: boolean;
	baseUrl?: string;
	appVersion?: string;
	updaterVersion?: string;
	platform?: string;
	installMinisign?: boolean;
}

program
	.argument("[files...]", "Distributable files to include in the manifest")
	.option("-k, --secret-key <path>", "Path to the minisign secret key file")
	.option(
		"-o, --output-dir <path>",
		"Directory where the metadata files will be written",
	)
	.option("-n, --release-notes <text>", "Release notes in Markdown format")
	.option(
		"--release-notes-file <path>",
		"Path to a file containing release notes in Markdown format",
	)
	.option(
		"--auto-updater-compat",
		"Generate manifest compatible with Electron Builder auto-updater",
	)
	.option(
		"--base-url <url>",
		"Base URL where the distributable files will be hosted",
	)
	.option(
		"--app-version <version>",
		"Version of the application (defaults to version extracted from filename)",
	)
	.option(
		"--updater-version <version>",
		"Version of the updater (default: 1.0.0)",
	)
	.option(
		"--platform <platform>",
		"Platform to create metadata for (mac, win, linux)",
		"mac",
	)
	.option("--install-minisign", "Show instructions to install minisign")
	.action(async (files: string[], options: CLIOptions) => {
		try {
			// Check if minisign is installed
			const minisignAvailable = isMinisignInstalled();

			// Show instructions for installing minisign
			if (options.installMinisign) {
				console.log("Installation instructions for minisign:");
				console.log("\nOn macOS:");
				console.log("  brew install minisign");
				console.log("\nOn Ubuntu/Debian:");
				console.log("  apt install minisign");
				console.log("\nOn Windows:");
				console.log("  Download from https://jedisct1.github.io/minisign/");
				console.log("\nFor more information and other platforms:");
				console.log("  https://jedisct1.github.io/minisign/");
				console.log("\nTo generate keys, use:");
				console.log("  minisign -G");
				return;
			}

			// Require minisign
			if (!minisignAvailable) {
				console.error(
					"Error: The minisign command is required but not installed or not in your PATH.",
				);
				console.error("Please install minisign first:");
				console.error(
					"  Run: npx @todesktop/create-release-metadata --install-minisign",
				);
				process.exit(1);
			}

			// Validate inputs
			if (!files.length) {
				console.error("Error: No distributable files specified");
				program.help();
				process.exit(1);
			}

			// Handle secret key
			const secretKeyPath = options.secretKey;
			if (!secretKeyPath) {
				console.error("Error: --secret-key is required");
				program.help();
				process.exit(1);
			}

			// Create metadata
			const result = await createReleaseMetadata({
				distributables: files,
				secretKeyPath,
				releaseNotes: options.releaseNotes,
				releaseNotesPath: options.releaseNotesFile,
				outputDir: options.outputDir,
				updaterVersion: options.updaterVersion,
				appVersion: options.appVersion,
				baseUrl: options.baseUrl,
				platform: options.platform as "mac" | "win" | "linux",
				autoUpdaterCompat: Boolean(options.autoUpdaterCompat),
			});

			console.log(`Successfully created metadata at ${result}`);
			console.log("Created signature files:");
			console.log(` - ${result}.minisig`);
			for (const file of files) {
				console.log(` - ${file}.minisig`);
			}
		} catch (err) {
			const error = err as Error;
			console.error("Error:", error.message || String(err));
			process.exit(1);
		}
	});

// Parse command line arguments
program.parse();
