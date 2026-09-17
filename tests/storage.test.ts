import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  blobDriver,
  contentMatches,
  diskDriver,
  keyFromSegments,
  type BlobClient,
} from "@/lib/storage-drivers";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);

async function drain(body: Uint8Array | ReadableStream<Uint8Array>): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

describe("upload keys", () => {
  test("accept the shape store() writes", () => {
    assert.deepEqual(keyFromSegments(["payments", "1700000000000-abcdef.png"]), {
      key: "payments/1700000000000-abcdef.png",
      contentType: "image/png",
    });
  });

  test("refuse traversal, absolute paths and unknown types", () => {
    for (const segments of [
      [],
      ["..", ".env"],
      ["payments", "..", "x.png"],
      ["..%2f.env"],
      ["/etc", "passwd.png"],
      ["payments", "x.html"],
      ["a", "b", "c.png"],
    ]) {
      assert.equal(keyFromSegments(segments), null, segments.join("/"));
    }
  });

  test("magic bytes must agree with the declared type", () => {
    assert.equal(contentMatches("image/png", PNG), true);
    assert.equal(contentMatches("image/png", Buffer.from("<html><script>")), false);
    assert.equal(contentMatches("application/pdf", Buffer.from("%PDF-1.7")), true);
    assert.equal(contentMatches("text/html", Buffer.from("<html>")), false);
  });
});

describe("disk driver", () => {
  let root: string;
  let legacy: string;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), "swc-upload-"));
    legacy = await mkdtemp(path.join(tmpdir(), "swc-legacy-"));
    await writeFile(path.join(legacy, "old.png"), PNG);
  });
  after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(legacy, { recursive: true, force: true });
  });

  test("writes under the root and reads the same bytes back", async () => {
    const driver = diskDriver(root, [legacy]);
    await driver.write("payments/1-a.png", PNG, "image/png");
    assert.deepEqual(await readFile(path.join(root, "payments", "1-a.png")), PNG);
    const file = await driver.read("payments/1-a.png");
    assert.ok(file);
    assert.equal(file.size, PNG.length);
    assert.deepEqual(await drain(file.body), PNG);
  });

  test("never overwrites a stored file", async () => {
    const driver = diskDriver(root);
    await assert.rejects(driver.write("payments/1-a.png", Buffer.from("x"), "image/png"));
    assert.deepEqual(await readFile(path.join(root, "payments", "1-a.png")), PNG);
  });

  test("falls back to the legacy folder, read-only", async () => {
    const driver = diskDriver(root, [legacy]);
    assert.ok(await driver.read("old.png"));
    assert.equal(await driver.read("payments/missing.png"), null);
  });

  test("cannot be walked out of its root", async () => {
    const outside = path.join(path.dirname(root), "swc-outside.png");
    await mkdir(path.dirname(outside), { recursive: true });
    await writeFile(outside, PNG);
    const driver = diskDriver(root);
    assert.equal(await driver.read(`../${path.basename(outside)}`), null);
    await assert.rejects(driver.write("../escape.png", PNG, "image/png"));
    await rm(outside, { force: true });
  });
});

describe("blob driver, against a stand-in client", () => {
  function fakeClient() {
    const objects = new Map<string, { bytes: Buffer; access: string; contentType: string }>();
    const client: BlobClient = {
      async put(pathname, body, options) {
        if (objects.has(pathname) && !options.allowOverwrite) {
          throw new Error("This blob already exists");
        }
        objects.set(pathname, {
          bytes: Buffer.from(body),
          access: options.access,
          contentType: options.contentType,
        });
        return { pathname: options.addRandomSuffix ? `${pathname}-rand` : pathname };
      },
      async get(pathname, options) {
        assert.equal(options.token, "vercel_blob_rw_store_secret");
        const found = objects.get(pathname);
        if (!found) return null;
        return {
          statusCode: 200,
          stream: new Blob([new Uint8Array(found.bytes)]).stream() as ReadableStream<Uint8Array>,
          blob: { size: found.bytes.length },
        };
      },
    };
    return { client, objects };
  }

  test("stores privately under uploads/<key>, never with a random suffix", async () => {
    const { client, objects } = fakeClient();
    const driver = blobDriver(async () => client, "vercel_blob_rw_store_secret");
    await driver.write("cargo/2-b.png", PNG, "image/png");
    const saved = objects.get("uploads/cargo/2-b.png");
    assert.ok(saved);
    assert.equal(saved.access, "private");
    assert.equal(saved.contentType, "image/png");

    const file = await driver.read("cargo/2-b.png");
    assert.ok(file);
    assert.equal(file.size, PNG.length);
    assert.deepEqual(await drain(file.body), PNG);
    assert.equal(await driver.read("cargo/none.png"), null);
  });

  test("a missing blob is null; any other failure is thrown", async () => {
    const notFound = Object.assign(new Error("gone"), { name: "BlobNotFoundError" });
    const failing = (error: Error): BlobClient => ({
      put: async () => ({ pathname: "" }),
      get: async () => {
        throw error;
      },
    });
    const token = "vercel_blob_rw_store_secret";
    assert.equal(await blobDriver(async () => failing(notFound), token).read("a/b.png"), null);
    await assert.rejects(
      blobDriver(async () => failing(new Error("store suspended")), token).read("a/b.png"),
      /store suspended/
    );
  });

  test("refuses a store that renamed the upload", async () => {
    const renaming: BlobClient = {
      put: async (pathname) => ({ pathname: `${pathname}-x` }),
      get: async () => null,
    };
    await assert.rejects(
      blobDriver(async () => renaming, "t").write("cargo/3-c.png", PNG, "image/png"),
      /different name/
    );
  });
});

describe("blob driver, through the real @vercel/blob SDK", () => {
  /*
    The SDK itself, with the network replaced underneath it. `put` goes out
    through the SDK's own undici and `get` through Node's fetch; both honour the
    global dispatcher, so a MockAgent answers for the store and refuses anything
    that would leave the machine.
  */
  const token = "vercel_blob_rw_teststore123_secretsecret";
  const undici = createRequire(require.resolve("@vercel/blob"))(
    "undici"
  ) as typeof import("undici");
  const previous = undici.getGlobalDispatcher();
  const seen: { method: string; path: string; headers: Record<string, string> }[] = [];

  before(() => {
    const agent = new undici.MockAgent();
    agent.disableNetConnect();
    const record = (opts: { method: string; path: string; headers?: unknown }) => {
      const raw = opts.headers ?? {};
      const headers: Record<string, string> = {};
      const entries = Array.isArray(raw)
        ? Array.from({ length: raw.length / 2 }, (_, i) => [raw[i * 2], raw[i * 2 + 1]])
        : raw instanceof Headers
          ? Array.from(raw.entries())
          : Object.entries(raw as Record<string, string>);
      for (const [k, v] of entries) headers[String(k).toLowerCase()] = String(v);
      seen.push({ method: opts.method, path: opts.path, headers });
    };

    agent
      .get("https://vercel.com")
      .intercept({ path: (p) => p.startsWith("/api/blob/"), method: "PUT" })
      .reply(200, (opts) => {
        record(opts);
        const pathname = new URL(opts.path, "https://vercel.com").searchParams.get("pathname");
        return {
          url: `https://teststore123.private.blob.vercel-storage.com/${pathname}`,
          downloadUrl: `https://teststore123.private.blob.vercel-storage.com/${pathname}?download=1`,
          pathname,
          contentType: "image/png",
          contentDisposition: "inline",
          etag: '"1"',
        };
      }, { headers: { "content-type": "application/json" } })
      .persist();

    const store = agent.get("https://teststore123.private.blob.vercel-storage.com");
    store
      .intercept({ path: "/uploads/payments/4-d.png", method: "GET" })
      .reply(200, (opts) => {
        record(opts);
        return PNG;
      }, { headers: { "content-length": String(PNG.length), "content-type": "image/png" } })
      .persist();
    store
      .intercept({ path: "/uploads/payments/missing.png", method: "GET" })
      .reply(404, "")
      .persist();

    undici.setGlobalDispatcher(agent);
  });
  after(() => {
    undici.setGlobalDispatcher(previous);
  });

  test("put and get carry private access and the store token", async () => {
    const driver = blobDriver(async () => await import("@vercel/blob"), token);
    await driver.write("payments/4-d.png", PNG, "image/png");

    const put = seen.find((r) => r.method === "PUT");
    assert.ok(put, "the SDK issued a PUT");
    assert.equal(
      new URL(put.path, "https://vercel.com").searchParams.get("pathname"),
      "uploads/payments/4-d.png"
    );
    assert.equal(put.headers["authorization"], `Bearer ${token}`);
    assert.equal(put.headers["x-vercel-blob-access"], "private");
    assert.notEqual(put.headers["x-add-random-suffix"], "1");

    const file = await driver.read("payments/4-d.png");
    assert.ok(file);
    assert.deepEqual(await drain(file.body), PNG);
    const get = seen.at(-1)!;
    assert.equal(get.method, "GET");
    assert.equal(get.headers["authorization"], `Bearer ${token}`);

    assert.equal(await driver.read("payments/missing.png"), null);
  });
});
