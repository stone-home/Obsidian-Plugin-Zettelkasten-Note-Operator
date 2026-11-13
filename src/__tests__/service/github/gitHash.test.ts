/**
 * R2: git object helpers used to push prompts in a single commit.
 *
 * gitBlobSha(bytes) = lowercase hex SHA-1 of "blob <byteLength>\0" + bytes (git's blob id).
 * bytesToBase64(bytes) = Buffer.from(bytes).toString("base64"), also for large and non-UTF-8 input.
 * Expected values are computed here with Node's crypto/Buffer, independent of the module.
 */

import { createHash } from "crypto";
import { gitBlobSha, bytesToBase64 } from "../../../service/github/gitHash";

const nodeBlobSha = (bytes: Uint8Array) =>
	createHash("sha1").update(Buffer.from(`blob ${bytes.byteLength}\0`)).update(Buffer.from(bytes)).digest("hex");

/** Deterministic pseudo-random bytes (all 256 values occur, so not valid UTF-8). */
function pseudoRandomBytes(length: number, seed: number = 1): Uint8Array {
	const out = new Uint8Array(length);
	let x = seed >>> 0;
	for (let i = 0; i < length; i++) {
		x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
		out[i] = x >>> 24;
	}
	return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("gitBlobSha (R2)", () => {
	it("matches git's id for the empty blob", async () => {
		await expect(gitBlobSha(new ArrayBuffer(0))).resolves.toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
		await expect(gitBlobSha(new Uint8Array(0))).resolves.toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
	});

	it('matches git\'s id for "hello\\n"', async () => {
		await expect(gitBlobSha(utf8("hello\n"))).resolves.toBe("ce013625030ba8dba906f756967f9e9ca394464a");
		const buffer = utf8("hello\n").slice().buffer;
		await expect(gitBlobSha(buffer)).resolves.toBe("ce013625030ba8dba906f756967f9e9ca394464a");
	});

	it("returns 40 lowercase hex characters", async () => {
		const sha = await gitBlobSha(utf8("# Prompt\n\nSome text\n"));
		expect(sha).toMatch(/^[0-9a-f]{40}$/);
	});

	it("uses the byte length, not the character length, for UTF-8 text", async () => {
		const bytes = utf8("Grüße ✓ 研究\n");
		expect(bytes.byteLength).not.toBe("Grüße ✓ 研究\n".length);
		await expect(gitBlobSha(bytes)).resolves.toBe(nodeBlobSha(bytes));
	});

	it("hashes binary (non-UTF-8) bytes exactly", async () => {
		const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0x0d, 0x0a]);
		await expect(gitBlobSha(bytes)).resolves.toBe(nodeBlobSha(bytes));
	});

	it("hashes only the bytes a Uint8Array view covers", async () => {
		const backing = pseudoRandomBytes(64, 7);
		const view = backing.subarray(10, 30);
		await expect(gitBlobSha(view)).resolves.toBe(nodeBlobSha(view.slice()));
	});

	it("hashes a large input (300 KB)", async () => {
		const bytes = pseudoRandomBytes(300 * 1024, 3);
		await expect(gitBlobSha(bytes.buffer)).resolves.toBe(nodeBlobSha(bytes));
	});
});

describe("bytesToBase64 (R2)", () => {
	const expectSameAsBuffer = (bytes: Uint8Array) => {
		expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
		expect(bytesToBase64(bytes.slice().buffer)).toBe(Buffer.from(bytes).toString("base64"));
	};

	it("encodes the empty input as an empty string", () => {
		expect(bytesToBase64(new Uint8Array(0))).toBe("");
		expect(bytesToBase64(new ArrayBuffer(0))).toBe("");
	});

	it("encodes ASCII text with every padding length", () => {
		expectSameAsBuffer(utf8("a"));
		expectSameAsBuffer(utf8("ab"));
		expectSameAsBuffer(utf8("abc"));
		expectSameAsBuffer(utf8("hello\n"));
	});

	it("encodes UTF-8 text bytes", () => {
		expectSameAsBuffer(utf8("Grüße ✓ 研究 😀\n"));
	});

	it("encodes non-UTF-8 bytes (every byte value)", () => {
		const all = new Uint8Array(256);
		for (let i = 0; i < 256; i++) all[i] = i;
		expectSameAsBuffer(all);
		expectSameAsBuffer(new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28]));
	});

	it("encodes only the bytes a Uint8Array view covers", () => {
		const backing = pseudoRandomBytes(50, 11);
		const view = backing.subarray(5, 22);
		expect(bytesToBase64(view)).toBe(Buffer.from(view).toString("base64"));
	});

	it("encodes inputs larger than 100 KB", () => {
		expectSameAsBuffer(pseudoRandomBytes(100 * 1024 + 1, 5));
		expectSameAsBuffer(pseudoRandomBytes(1024 * 1024, 9));
	});
});
