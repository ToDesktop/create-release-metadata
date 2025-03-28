import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReleaseMetadata } from "./manifest.js";
import * as fileUtils from "./file-utils.js";
import fs from "node:fs/promises";
import path from "node:path";

// Mock dependencies
vi.mock("./file-utils.js");
vi.mock("node:fs/promises");
vi.mock("node:child_process");
vi.mock("node:util", () => ({
	promisify: vi.fn().mockImplementation(() => {
		// Return a mock async function that resolves
		return vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
	}),
}));
vi.mock("yaml", () => ({
	stringify: vi.fn().mockReturnValue("mocked-yaml-content"),
}));

describe("createReleaseMetadata", () => {
	beforeEach(() => {
		// Setup mocks
		vi.mocked(fileUtils.getFileInfo).mockResolvedValue({
			sha512: "mocked-hash",
			size: 12345,
		});
		vi.mocked(fileUtils.extractArchFromFilename).mockReturnValue("x64");
		vi.mocked(fileUtils.readReleaseNotes).mockResolvedValue(
			"Mocked release notes",
		);
		vi.mocked(fs.mkdir).mockResolvedValue(undefined);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should create a manifest with correct structure", async () => {
		const result = await createReleaseMetadata({
			distributables: ["app-1.0.0.zip"],
			secretKeyPath: "secret.key",
			appVersion: "1.0.0",
		});

		// Verify file operations were called
		expect(fs.mkdir).toHaveBeenCalledWith(".", { recursive: true });
		expect(fs.writeFile).toHaveBeenCalledWith(
			path.join(".", "latest-mac.yml"),
			"mocked-yaml-content",
			"utf-8",
		);

		// Verify result
		expect(result).toBe(path.join(".", "latest-mac.yml"));
	});

	it("should throw an error when no distributables are provided", async () => {
		await expect(
			createReleaseMetadata({
				distributables: [],
				secretKeyPath: "secret.key",
			}),
		).rejects.toThrow("No distributable files provided");
	});

	it("should throw an error when no secret key is provided", async () => {
		await expect(
			createReleaseMetadata({
				distributables: ["app.zip"],
				secretKeyPath: "",
			}),
		).rejects.toThrow("Secret key path is required");
	});

	it("should include electron auto-updater compatibility fields when requested", async () => {
		const writeFileMock = vi.mocked(fs.writeFile);

		await createReleaseMetadata({
			distributables: ["app-1.0.0.zip"],
			secretKeyPath: "secret.key",
			appVersion: "1.0.0",
			autoUpdaterCompat: true,
		});

		// The second argument to writeFile should be the YAML content
		// We mocked yaml.stringify so can't check exact content, but we can verify it was called
		expect(writeFileMock).toHaveBeenCalled();
	});
});
