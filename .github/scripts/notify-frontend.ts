import { sign } from "node:crypto";
import { fileURLToPath } from "node:url";

interface Publication {
  tag: string;
  commit: string;
  sha256: string;
}

interface AppCredentials {
  appId: string;
  privateKey: string;
}

export async function dispatchFrontend(
  publication: Publication,
  credentials: AppCredentials,
  fetcher: typeof fetch = fetch,
): Promise<{ workflow_run_id: number; html_url: string }> {
  if (
    !/^master-[0-9a-f]{64}(?:-[A-Za-z0-9.-]+)?$/.test(publication.tag) ||
    !/^[0-9a-f]{40}$/.test(publication.commit) ||
    !/^[0-9a-f]{64}$/.test(publication.sha256)
  )
    throw new Error("Invalid database publication provenance");
  if (!/^[0-9]+$/.test(credentials.appId) || !credentials.privateKey)
    throw new Error("Frontend GitHub App credentials are required");
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: credentials.appId }),
  ).toString("base64url");
  const unsigned = `${header}.${claims}`;
  const jwt = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), credentials.privateKey).toString("base64url")}`;

  async function request(
    path: string,
    token: string,
    body?: unknown,
    method = "POST",
  ) {
    const response = await fetcher(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(
        `GitHub ${method} ${path} failed (${response.status}); no automatic write retry`,
      );
    return response;
  }

  const installationResponse = await request(
    "/repos/holodori-net/frontend/installation",
    jwt,
    undefined,
    "GET",
  );
  const installation = (await installationResponse.json()) as {
    id: number;
    app_id: number;
  };
  if (
    !Number.isSafeInteger(installation.id) ||
    installation.app_id !== Number(credentials.appId)
  )
    throw new Error("The dedicated App is not installed on frontend");
  const response = await request(
    `/app/installations/${installation.id}/access_tokens`,
    jwt,
    {
      repositories: ["frontend"],
      permissions: { actions: "write" },
    },
  );
  const grant = (await response.json()) as {
    token: string;
    permissions: { actions?: string; contents?: string };
    repositories: Array<{ name: string }>;
  };
  if (!grant.token)
    throw new Error("GitHub did not return an installation token");
  try {
    if (
      grant.permissions.actions !== "write" ||
      grant.permissions.contents ||
      grant.repositories.length !== 1 ||
      grant.repositories[0]?.name !== "frontend"
    )
      throw new Error(
        "GitHub did not return the requested frontend-only Actions token",
      );
    const dispatched = await request(
      "/repos/holodori-net/frontend/actions/workflows/deploy-pages.yml/dispatches",
      grant.token,
      {
        ref: "main",
        inputs: {
          database_tag: publication.tag,
          database_commit: publication.commit,
          database_sha256: publication.sha256,
        },
      },
    );
    const run = (await dispatched.json()) as {
      workflow_run_id: number;
      html_url: string;
    };
    if (
      !Number.isSafeInteger(run.workflow_run_id) ||
      !/^https:\/\/github\.com\/holodori-net\/frontend\/actions\/runs\/[0-9]+$/.test(
        run.html_url,
      )
    )
      throw new Error(
        "Dispatch response did not identify the frontend workflow run",
      );
    return run;
  } finally {
    await request("/installation/token", grant.token, undefined, "DELETE");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = await dispatchFrontend(
    {
      tag: process.env.DATABASE_TAG ?? "",
      commit: process.env.DATABASE_COMMIT ?? "",
      sha256: process.env.DATABASE_SHA256 ?? "",
    },
    {
      appId: process.env.FRONTEND_APP_ID ?? "",
      privateKey: process.env.FRONTEND_APP_PRIVATE_KEY ?? "",
    },
  );
  console.info(JSON.stringify({ event: "frontend-dispatched", ...run }));
}
