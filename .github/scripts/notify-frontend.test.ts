import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchFrontend } from "./notify-frontend.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  appId: "12",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};
const publication = {
  tag: `master-${"a".repeat(64)}`,
  commit: "b".repeat(40),
  sha256: "c".repeat(64),
};

test("dispatches the main CD with pinned data using a frontend-only Actions token, then revokes it", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/frontend/installation"))
      return Response.json({ id: 34, app_id: 12 });
    if (String(url).includes("/access_tokens"))
      return Response.json({
        token: "fixture-token",
        permissions: { actions: "write" },
        repositories: [{ name: "frontend" }],
      });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({
      workflow_run_id: 56,
      html_url: "https://github.com/holodori-net/frontend/actions/runs/56",
    });
  }) as typeof fetch;
  const run = await dispatchFrontend(publication, credentials, fetcher);
  assert.equal(run.workflow_run_id, 56);
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    repositories: ["frontend"],
    permissions: { actions: "write" },
  });
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    ref: "main",
    inputs: {
      database_tag: publication.tag,
      database_commit: publication.commit,
      database_sha256: publication.sha256,
    },
  });
  assert.equal(calls[3]?.init?.method, "DELETE");
});

test("rejects invalid provenance before issuing a token", async () => {
  const fetcher = (async () => {
    throw new Error("must not request");
  }) as typeof fetch;
  await assert.rejects(
    dispatchFrontend({ ...publication, tag: "../main" }, credentials, fetcher),
    /Invalid database/,
  );
});

test("does not retry uncertain dispatches and still revokes the issued token", async () => {
  let dispatches = 0;
  let revoked = false;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/frontend/installation"))
      return Response.json({ id: 34, app_id: 12 });
    if (String(url).includes("/access_tokens"))
      return Response.json({
        token: "fixture-token",
        permissions: { actions: "write" },
        repositories: [{ name: "frontend" }],
      });
    if (init?.method === "DELETE") {
      revoked = true;
      return new Response(null, { status: 204 });
    }
    dispatches++;
    return new Response("", { status: 503 });
  }) as typeof fetch;
  await assert.rejects(
    dispatchFrontend(publication, credentials, fetcher),
    /no automatic write retry/,
  );
  assert.equal(dispatches, 1);
  assert.equal(revoked, true);
});

test("rejects and revokes an over-scoped installation token before dispatch", async () => {
  let revoked = false;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/frontend/installation"))
      return Response.json({ id: 34, app_id: 12 });
    if (String(url).includes("/access_tokens"))
      return Response.json({
        token: "fixture-token",
        permissions: { actions: "write", contents: "read" },
        repositories: [{ name: "frontend" }],
      });
    assert.equal(init?.method, "DELETE");
    revoked = true;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  await assert.rejects(
    dispatchFrontend(publication, credentials, fetcher),
    /frontend-only Actions token/,
  );
  assert.equal(revoked, true);
});
