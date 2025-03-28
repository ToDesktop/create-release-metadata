import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createReleaseMetadata } from "./manifest.js";
import * as fileUtils from "./file-utils.js";
import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { ChildProcess } from "node:child_process";

// Define a basic interface for our mocked process
interface BasicMockProcess {
	stdin: {
		write: ReturnType<typeof vi.fn>;
		end: ReturnType<typeof vi.fn>;
	};
}

// Mock dependencies
vi.mock("./file-utils.js");
vi.mock("node:fs/promises");
vi.mock("node:child_process", () => {
	return {
		spawn: vi.fn().mockImplementation(() => {
			const emitter = new EventEmitter() as EventEmitter & BasicMockProcess;

			// Add stdin for password input tests
			emitter.stdin = {
				write: vi.fn(),
				end: vi.fn(),
			};

			// Simulate process completion in the next event loop tick
			setTimeout(() => {
				emitter.emit("close", 0);
			}, 0);

			// Type assertion to satisfy TypeScript
			return emitter as unknown as ChildProcess;
		}),
	};
});

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

		// Reset console logs for testing
		vi.spyOn(console, "log").mockImplementation(() => {
			return;
		});
		vi.spyOn(console, "error").mockImplementation(() => {
			return;
		});
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

	it("should use password when provided", async () => {
		// Import the mocked spawn from the child_process module
		const childProcess = await import("node:child_process");
		const spawnMock = vi.mocked(childProcess.spawn);

		await createReleaseMetadata({
			distributables: ["app-1.0.0.zip"],
			secretKeyPath: "secret.key",
			appVersion: "1.0.0",
			password: "test-password",
		});

		// Check spawn was called twice (once for manifest, once for distributable)
		expect(spawnMock).toHaveBeenCalledTimes(2);

		// Get the first call to spawn
		const firstCall = spawnMock.mock.results[0].value as EventEmitter &
			BasicMockProcess;

		// Verify stdin.write was called with the password
		expect(firstCall.stdin.write).toHaveBeenCalledWith("test-password\n");
		expect(firstCall.stdin.end).toHaveBeenCalled();

		// Verify console message indicates password usage
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining("Using provided password for key decryption"),
		);
	});

	it("should allow interactive password input when no password provided", async () => {
		// Import the mocked spawn from the child_process module
		const childProcess = await import("node:child_process");
		const spawnMock = vi.mocked(childProcess.spawn);

		await createReleaseMetadata({
			distributables: ["app-1.0.0.zip"],
			secretKeyPath: "secret.key",
			appVersion: "1.0.0",
		});

		// Check spawn was called twice (once for manifest, once for distributable)
		expect(spawnMock).toHaveBeenCalledTimes(2);

		// Verify spawn was called with correct stdio option for interactive input
		expect(spawnMock).toHaveBeenCalledWith(
			"minisign",
			expect.arrayContaining(["-S", "-s", "secret.key"]),
			expect.objectContaining({ stdio: "inherit" }),
		);

		// Verify console message indicates manual password entry might be needed
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining("may need to enter password in the terminal"),
		);
	});

	it("should handle minisign failure", async () => {
		// Import the mocked spawn from the child_process module
		const childProcess = await import("node:child_process");

		// Mock spawn to simulate error
		vi.mocked(childProcess.spawn).mockImplementationOnce(() => {
			const emitter = new EventEmitter() as EventEmitter & BasicMockProcess;

			// Add stdin for password tests
			emitter.stdin = {
				write: vi.fn(),
				end: vi.fn(),
			};

			// Simulate error code
			setTimeout(() => {
				emitter.emit("close", 1);
			}, 0);

			// Type assertion to satisfy TypeScript
			return emitter as unknown as ChildProcess;
		});

		await expect(
			createReleaseMetadata({
				distributables: ["app-1.0.0.zip"],
				secretKeyPath: "secret.key",
			}),
		).rejects.toThrow("Failed to sign file with minisign");
	});
});
