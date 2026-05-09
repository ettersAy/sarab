import { describe, it } from "node:test";
import assert from "node:assert";
import { slugify, safeFilename, safeFilenameWithId, validateProjectName } from "../../src/storage/fs-utils.js";
import { ValidationError } from "../../src/errors.js";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    assert.strictEqual(slugify("My Project"), "my-project");
  });

  it("removes special characters", () => {
    assert.strictEqual(slugify("Hello! @World #2024"), "hello-world-2024");
  });

  it("trims leading/trailing hyphens", () => {
    assert.strictEqual(slugify("  --test--  "), "test");
  });

  it("handles empty input", () => {
    assert.strictEqual(slugify(""), "");
  });

  it("handles only special chars", () => {
    assert.strictEqual(slugify("!@#$%"), "");
  });
});

describe("safeFilename", () => {
  it("slugifies title", () => {
    assert.strictEqual(safeFilename("Fix login button"), "fix-login-button");
  });

  it("truncates to maxLen", () => {
    assert.strictEqual(safeFilename("a".repeat(200), 20), "a".repeat(20));
  });

  it("returns untitled for empty slug", () => {
    assert.strictEqual(safeFilename("!@#"), "untitled");
  });
});

describe("safeFilenameWithId", () => {
  it("appends id with md extension", () => {
    assert.strictEqual(safeFilenameWithId("My Ticket", "abc12345"), "my-ticket-abc12345.md");
  });
});

describe("validateProjectName", () => {
  it("returns trimmed name for valid input", () => {
    assert.strictEqual(validateProjectName("  my-app  "), "my-app");
  });

  it("throws for empty name", () => {
    assert.throws(() => validateProjectName("   "), ValidationError);
  });

  it("throws for path traversal", () => {
    assert.throws(() => validateProjectName("test/../etc"), ValidationError);
    assert.throws(() => validateProjectName("a/b"), ValidationError);
  });
});
