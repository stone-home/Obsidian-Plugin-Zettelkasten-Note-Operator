/** Bytes exactly as covered by the input (a Uint8Array view keeps its offset and length). */
function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
	return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/**
 * Git's blob id for the given content: lowercase hex SHA-1 of `"blob <byteLength>\0"` + bytes.
 * Equal to the `sha`/`oid` GitHub reports for a file with exactly these bytes.
 */
export async function gitBlobSha(data: ArrayBuffer | Uint8Array): Promise<string> {
	const bytes = toBytes(data);
	const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
	const payload = new Uint8Array(header.byteLength + bytes.byteLength);
	payload.set(header, 0);
	payload.set(bytes, header.byteLength);
	const digest = await crypto.subtle.digest("SHA-1", payload);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Base64 of the bytes. Built in chunks so large files stay within the argument limit
 * of String.fromCharCode (Obsidian's arrayBufferToBase64 needs a newer app version).
 */
export function bytesToBase64(data: ArrayBuffer | Uint8Array): string {
	const bytes = toBytes(data);
	const CHUNK = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
	}
	return btoa(binary);
}
