import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPrivateOrSpecialIp, shotRejection, subrequestAllowed, validatePublicUrl } from "../src/url.ts";

describe("validatePublicUrl", () => {
  it("accepts a normal https page", () => {
    assert.deepEqual(validatePublicUrl("https://example.com/pricing"), { ok: true, host: "example.com" });
  });

  it("rejects http, localhost, IP literals, odd ports, and overlong URLs", () => {
    const bad = [
      "http://example.com",
      "https://localhost",
      "https://localhost/admin",
      "https://app.localhost",
      "https://127.0.0.1",
      "https://127.0.0.1/",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/",
      "https://2130706433/",
      "https://0x7f000001/",
      "https://0177.0.0.1/",
      "https://10.1.2.3/",
      "https://192.168.0.5/",
      "https://example.com:8443/a",
      "https://user:pass@example.com/",
      "http://169.254.169.254",
      "https://printer.local",
      "https://rebind.nip.io",
      "https://" + "a".repeat(2100) + ".com/",
    ];
    for (const input of bad) {
      const result = validatePublicUrl(input);
      assert.equal(result.ok, false, input);
    }
  });
});

describe("address classes", () => {
  it("treats loopback, link-local, metadata, and private ranges as unsafe", () => {
    for (const ip of ["127.0.0.1", "10.0.0.8", "172.16.0.1", "192.168.1.20", "169.254.169.254", "::1", "fe80::1", "fd00::1", "2130706433"]) {
      assert.equal(isPrivateOrSpecialIp(ip), true, ip);
    }
    assert.equal(isPrivateOrSpecialIp("1.1.1.1"), false);
    assert.equal(isPrivateOrSpecialIp("8.8.8.8"), false);
  });
});

describe("subrequests and redirects", () => {
  it("blocks private targets and odd ports, and refuses redirects", () => {
    assert.equal(subrequestAllowed("https://cdn.example.com/app.js"), true);
    assert.equal(subrequestAllowed("http://169.254.169.254/latest/meta-data"), false);
    assert.equal(subrequestAllowed("https://127.0.0.1/"), false);
    assert.equal(subrequestAllowed("https://[::1]/"), false);
    assert.equal(subrequestAllowed("https://example.com:8443/x"), false);
    assert.equal(subrequestAllowed("file:///etc/passwd"), false);
    assert.equal(shotRejection(302, "image/png", 100), "redirect");
    assert.equal(shotRejection(301, "image/jpeg", 100), "redirect");
    assert.equal(shotRejection(200, "text/html", 100), "type");
    assert.equal(shotRejection(200, "image/png", 4 * 1024 * 1024), "size");
    assert.equal(shotRejection(200, "image/jpeg", 1024), null);
  });
});
