import { describe, it, expect, vi } from "vitest";
import {
	extractArchFromFilename,
	extractVersionFromFilename,
} from "./file-utils.js";

// Mocks for other functions we're not testing
vi.mock("node:fs", () => ({
	createReadStream: vi.fn(),
}));
vi.mock("node:fs/promises");
vi.mock("node:crypto");

describe("extractArchFromFilename", () => {
	it("should correctly identify arm64 architecture", () => {
		expect(extractArchFromFilename("app-arm64.dmg")).toBe("arm64");
		expect(extractArchFromFilename("app-aarch64.dmg")).toBe("arm64");
	});

	it("should correctly identify x64 architecture", () => {
		expect(extractArchFromFilename("app-x64.dmg")).toBe("x64");
		expect(extractArchFromFilename("app-x86_64.dmg")).toBe("x64");
		expect(extractArchFromFilename("app-amd64.dmg")).toBe("x64");
	});

	it("should correctly identify x86 architecture", () => {
		expect(extractArchFromFilename("app-x86.dmg")).toBe("ia32");
		expect(extractArchFromFilename("app-ia32.dmg")).toBe("ia32");
		expect(extractArchFromFilename("app-i386.dmg")).toBe("ia32");
	});

	it("should correctly identify universal architecture", () => {
		expect(extractArchFromFilename("app-universal.dmg")).toBe("universal");
	});

	it("should return undefined for unidentifiable architecture", () => {
		expect(extractArchFromFilename("app.dmg")).toBeUndefined();
	});
});

describe("extractVersionFromFilename", () => {
	it("should extract version with v prefix", () => {
		expect(extractVersionFromFilename("app-v1.2.3.dmg")).toBe("1.2.3");
	});

	it("should extract version without v prefix", () => {
		expect(extractVersionFromFilename("app-1.2.3.dmg")).toBe("1.2.3");
	});

	it("should handle or skip complex version patterns gracefully", () => {
		// The implementation might not capture all complex patterns
		const result = extractVersionFromFilename("app-1.2.3-beta.1.dmg");
		expect(result).toBe("1.2.3-beta.1");
	});

	it("should return null for filenames without version", () => {
		expect(extractVersionFromFilename("app.dmg")).toBeNull();
	});
});
