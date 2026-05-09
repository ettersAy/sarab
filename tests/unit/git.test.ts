import { describe, it } from "node:test";
import assert from "node:assert";
import { validateGitUrl, repoNameFromUrl } from "../../src/services/git.js";

describe("validateGitUrl", () => {
  it("accepts valid github.com HTTPS URL", () => {
    assert.strictEqual(validateGitUrl("https://github.com/user/repo.git"), "https://github.com/user/repo.git");
  });

  it("accepts URL without .git suffix", () => {
    assert.strictEqual(validateGitUrl("https://github.com/user/repo"), "https://github.com/user/repo");
  });

  it("accepts gitlab.com URL", () => {
    assert.strictEqual(validateGitUrl("https://gitlab.com/group/project.git"), "https://gitlab.com/group/project.git");
  });

  it("accepts bitbucket.org URL", () => {
    assert.strictEqual(validateGitUrl("https://bitbucket.org/team/repo.git"), "https://bitbucket.org/team/repo.git");
  });

  it("rejects command injection via semicolon", () => {
    assert.throws(() => validateGitUrl("https://github.com/user/repo.git; rm -rf /"), /invalid characters/i);
  });

  it("rejects command injection via backtick", () => {
    assert.throws(() => validateGitUrl("https://github.com/user/repo.git`id`"), /invalid characters/i);
  });

  it("rejects command injection via pipe", () => {
    assert.throws(() => validateGitUrl("https://github.com/user/repo.git|cat /etc/passwd"), /invalid characters/i);
  });

  it("rejects non-github/gitlab/bitbucket URLs", () => {
    assert.throws(() => validateGitUrl("https://evil.com/user/repo.git"), /must be an https/);
  });

  it("rejects empty URL", () => {
    assert.throws(() => validateGitUrl("  "), /required/);
  });

  it("trims whitespace", () => {
    assert.strictEqual(validateGitUrl("  https://github.com/user/repo.git  "), "https://github.com/user/repo.git");
  });
});

describe("repoNameFromUrl", () => {
  it("extracts repo name from HTTPS URL", () => {
    assert.strictEqual(repoNameFromUrl("https://github.com/user/my-project.git"), "my-project");
  });

  it("extracts repo name without .git suffix", () => {
    assert.strictEqual(repoNameFromUrl("https://github.com/user/my-project"), "my-project");
  });

  it("sanitizes special chars in repo name", () => {
    assert.strictEqual(repoNameFromUrl("https://github.com/user/my project!.git"), "my-project");
  });
});
