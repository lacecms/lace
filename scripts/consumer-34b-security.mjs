import assert from "node:assert/strict";

/** Regression probes against an exact consumer's real HTTP boundary. */
export async function consumer34bSecurity({ base, cookie, png }) {
  const invoke = (path, options = {}) =>
    fetch(new URL(path, base), {
      ...options,
      headers: { cookie, ...options.headers },
      signal: AbortSignal.timeout(20000),
    });
  const users = await (await invoke("/api/v1/admin/users")).json();
  const media = await (await invoke("/api/v1/admin/media")).json();
  for (const origin of ["https://foreign-34b.test", "null"]) {
    const denied = await invoke("/api/v1/admin/users", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        email: "denied-34b@lace.test",
        password: "Unused-local-regression-password-34B!",
        role: "admin",
      }),
    });
    assert.equal(denied.status, 403, "exact consumer foreign-origin mutation was accepted");
  }
  const crossSite = await invoke("/api/v1/admin/users", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
    body: JSON.stringify({
      email: "denied-34b@lace.test",
      password: "Unused-local-regression-password-34B!",
      role: "admin",
    }),
  });
  assert.equal(
    crossSite.status,
    403,
    "exact consumer origin-less cross-site mutation was accepted",
  );
  const form = new FormData();
  form.append(
    "file",
    new Blob([png, Buffer.from("<script>34b-polyglot</script>")], { type: "image/png" }),
    "polyglot.png",
  );
  const image = await invoke("/api/v1/admin/media", {
    method: "POST",
    headers: { origin: new URL(base).origin },
    body: form,
  });
  assert.equal(image.status, 422, "exact consumer accepted trailing executable image bytes");
  assert.deepEqual(
    await (await invoke("/api/v1/admin/users")).json(),
    users,
    "negative probe changed users",
  );
  assert.deepEqual(
    await (await invoke("/api/v1/admin/media")).json(),
    media,
    "negative probe changed media",
  );
  const notices = await invoke("/admin/third-party-notices.txt");
  assert.equal(notices.status, 200, "exact consumer lacks bundled dependency/font notices");
  const text = await notices.text();
  assert.ok(
    text.includes("SIL OPEN FONT LICENSE") && text.includes("sharp-libvips"),
    "exact consumer notices are incomplete",
  );
  console.info(
    "34B exact consumer: origin, cross-site metadata, image-container negatives, unchanged users/media and bundled notices passed",
  );
}
