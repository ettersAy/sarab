import { describe, it } from "node:test";
import assert from "node:assert";
import { AppError, NotFoundError, ValidationError } from "../../src/errors.js";

describe("AppError", () => {
  it("sets message, code, and statusCode", () => {
    const err = new AppError("Something broke", "BROKEN", 500);
    assert.strictEqual(err.message, "Something broke");
    assert.strictEqual(err.code, "BROKEN");
    assert.strictEqual(err.statusCode, 500);
    assert.strictEqual(err.name, "AppError");
  });

  it("defaults statusCode to 500", () => {
    const err = new AppError("Oops", "OOPS");
    assert.strictEqual(err.statusCode, 500);
  });

  it("toJSON returns error object", () => {
    const err = new AppError("msg", "CODE", 400);
    assert.deepStrictEqual(err.toJSON(), { error: "CODE", message: "msg" });
  });
});

describe("NotFoundError", () => {
  it("formats resource and ID", () => {
    const err = new NotFoundError("Project", "abc");
    assert.strictEqual(err.message, "Project 'abc' not found");
    assert.strictEqual(err.code, "NOT_FOUND");
    assert.strictEqual(err.statusCode, 404);
  });
});

describe("ValidationError", () => {
  it("creates 400 error", () => {
    const err = new ValidationError("Name required");
    assert.strictEqual(err.message, "Name required");
    assert.strictEqual(err.code, "VALIDATION_ERROR");
    assert.strictEqual(err.statusCode, 400);
  });
});
