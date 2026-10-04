/**
 * Shadow Node request signing and pairing helpers.
 *
 * The node authenticates every non-exempt request with four headers
 * (see `DeviceSessionStore.verify` in
 * `packages/agent-core/agent_core/security.py`):
 *
 *   x-shadow-device-id
 *   x-shadow-signature
 *   x-shadow-nonce
 *   x-shadow-timestamp
 *
 * The signature is HMAC-SHA256 over a canonical message built by
 * `_build_signed_message`:
 *
 *   METHOD_UPPER + "\n" + path + "\n" + body + "\n" + nonce + "\n" + timestamp
 *
 * where `body` is the exact UTF-8 request body text ("" when there is no
 * body) and the HMAC key is the UTF-8 encoding of the device secret
 * string issued at `/pair/confirm`. The signature is hex-encoded.
 *
 * SHA-256/HMAC are implemented here in dependency-free TypeScript so the
 * signer works identically on Hermes without adding a native module.
 * Correctness is verified against the node's own Python implementation
 * (see the cross-check vectors in the PR description).
 */

// ---------------------------------------------------------------------------
// Minimal SHA-256 (FIPS 180-4), operating on byte arrays.
// ---------------------------------------------------------------------------

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
	return (x >>> n) | (x << (32 - n));
}

/** SHA-256 of a byte array, returned as a 32-byte array. */
export function sha256Bytes(data: Uint8Array): Uint8Array {
	const bitLen = data.length * 8;
	// Padded length: message + 0x80 + zeroes + 8-byte length, multiple of 64.
	const paddedLen = (((data.length + 8) >> 6) + 1) << 6;
	const padded = new Uint8Array(paddedLen);
	padded.set(data);
	padded[data.length] = 0x80;
	// 64-bit big-endian length (high 32 bits first; safe while < 2^32 bits).
	const dv = new DataView(padded.buffer);
	dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
	dv.setUint32(paddedLen - 4, bitLen >>> 0, false);

	let h0 = 0x6a09e667;
	let h1 = 0xbb67ae85;
	let h2 = 0x3c6ef372;
	let h3 = 0xa54ff53a;
	let h4 = 0x510e527f;
	let h5 = 0x9b05688c;
	let h6 = 0x1f83d9ab;
	let h7 = 0x5be0cd19;

	const w = new Uint32Array(64);
	for (let off = 0; off < paddedLen; off += 64) {
		for (let i = 0; i < 16; i++) {
			w[i] = dv.getUint32(off + i * 4, false);
		}
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;
		let f = h5;
		let g = h6;
		let h = h7;

		for (let i = 0; i < 64; i++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (S0 + maj) | 0;
			h = g;
			g = f;
			f = e;
			e = (d + t1) | 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) | 0;
		}

		h0 = (h0 + a) | 0;
		h1 = (h1 + b) | 0;
		h2 = (h2 + c) | 0;
		h3 = (h3 + d) | 0;
		h4 = (h4 + e) | 0;
		h5 = (h5 + f) | 0;
		h6 = (h6 + g) | 0;
		h7 = (h7 + h) | 0;
	}

	const out = new Uint8Array(32);
	const odv = new DataView(out.buffer);
	odv.setUint32(0, h0 >>> 0, false);
	odv.setUint32(4, h1 >>> 0, false);
	odv.setUint32(8, h2 >>> 0, false);
	odv.setUint32(12, h3 >>> 0, false);
	odv.setUint32(16, h4 >>> 0, false);
	odv.setUint32(20, h5 >>> 0, false);
	odv.setUint32(24, h6 >>> 0, false);
	odv.setUint32(28, h7 >>> 0, false);
	return out;
}

/** HMAC-SHA256. Keys longer than 64 bytes are hashed first (RFC 2104). */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
	let k = key;
	if (k.length > 64) {
		k = sha256Bytes(k);
	}
	const padded = new Uint8Array(64);
	padded.set(k);
	const ipad = new Uint8Array(64);
	const opad = new Uint8Array(64);
	for (let i = 0; i < 64; i++) {
		ipad[i] = padded[i] ^ 0x36;
		opad[i] = padded[i] ^ 0x5c;
	}
	const inner = new Uint8Array(64 + data.length);
	inner.set(ipad);
	inner.set(data, 64);
	const innerHash = sha256Bytes(inner);
	const outer = new Uint8Array(64 + 32);
	outer.set(opad);
	outer.set(innerHash, 64);
	return sha256Bytes(outer);
}

// ---------------------------------------------------------------------------
// Encoding helpers (manual UTF-8: no platform TextEncoder dependency).
// ---------------------------------------------------------------------------

/** UTF-8 encode a string (handles the full BMP and surrogate pairs). */
export function utf8Encode(s: string): Uint8Array {
	const bytes: number[] = [];
	for (let i = 0; i < s.length; i++) {
		let cp = s.charCodeAt(i);
		if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
			const lo = s.charCodeAt(i + 1);
			if (lo >= 0xdc00 && lo <= 0xdfff) {
				cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
				i++;
			}
		}
		if (cp < 0x80) {
			bytes.push(cp);
		} else if (cp < 0x800) {
			bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
		} else if (cp < 0x10000) {
			bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
		} else {
			bytes.push(
				0xf0 | (cp >> 18),
				0x80 | ((cp >> 12) & 0x3f),
				0x80 | ((cp >> 6) & 0x3f),
				0x80 | (cp & 0x3f),
			);
		}
	}
	return new Uint8Array(bytes);
}

const HEX_DIGITS = "0123456789abcdef";

/** Lowercase hex encoding of a byte array. */
export function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) {
		out += HEX_DIGITS[bytes[i] >> 4] + HEX_DIGITS[bytes[i] & 0x0f];
	}
	return out;
}

/** Parse an even-length lowercase/uppercase hex string into bytes. */
export function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) {
		throw new Error("hexToBytes: odd-length input");
	}
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		if (Number.isNaN(byte)) {
			throw new Error("hexToBytes: invalid hex");
		}
		out[i] = byte;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Shadow request signing (mirrors the node's canonical construction).
// ---------------------------------------------------------------------------

export interface ShadowSignatureInput {
	/** Device secret string issued at /pair/confirm (UTF-8 encoded as the HMAC key). */
	secret: string;
	method: string;
	/** URL path only, no query string (the node signs request.url.path). */
	path: string;
	/** Exact request body text; "" when there is no body. */
	body: string;
	nonce: string;
	/** Unix seconds. */
	timestamp: number;
}

/**
 * Compute the value for the x-shadow-signature header.
 * Canonical message: METHOD_UPPER + "\n" + path + "\n" + body + "\n" + nonce + "\n" + timestamp
 */
export function signShadowRequest(input: ShadowSignatureInput): string {
	const message = [
		input.method.toUpperCase(),
		input.path,
		input.body,
		input.nonce,
		String(input.timestamp),
	].join("\n");
	return bytesToHex(
		hmacSha256(utf8Encode(input.secret), utf8Encode(message)),
	);
}

/** 32 hex chars (16 bytes) from the best available RNG. */
export function generateNonce(): string {
	const bytes = new Uint8Array(16);
	const g = globalThis as unknown as {
		crypto?: { getRandomValues?: (a: Uint8Array) => void };
	};
	if (g.crypto && typeof g.crypto.getRandomValues === "function") {
		g.crypto.getRandomValues(bytes);
	} else {
		// Fallback: the node only requires per-device uniqueness (replay
		// ledger), not cryptographic strength.
		let seed = Date.now() % 0x100000000;
		for (let i = 0; i < bytes.length; i++) {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			bytes[i] = (seed ^ Math.floor(Math.random() * 256)) & 0xff;
		}
	}
	return bytesToHex(bytes);
}

/** Current Unix time in whole seconds (node allows +-300s skew). */
export function shadowTimestamp(): number {
	return Math.floor(Date.now() / 1000);
}

export interface ShadowHeaders {
	"x-shadow-device-id": string;
	"x-shadow-signature": string;
	"x-shadow-nonce": string;
	"x-shadow-timestamp": string;
}

/** Build the four auth headers for one request. */
export function buildShadowHeaders(
	deviceId: string,
	secret: string,
	method: string,
	path: string,
	body: string,
): ShadowHeaders {
	const nonce = generateNonce();
	const timestamp = shadowTimestamp();
	return {
		"x-shadow-device-id": deviceId,
		"x-shadow-signature": signShadowRequest({
			secret,
			method,
			path,
			body,
			nonce,
			timestamp,
		}),
		"x-shadow-nonce": nonce,
		"x-shadow-timestamp": String(timestamp),
	};
}

// ---------------------------------------------------------------------------
// Pairing ceremony (auth-exempt endpoints).
// ---------------------------------------------------------------------------

export interface PairStartResponse {
	pairing_id: string;
	code: string;
	expires_in_seconds: number;
}

export interface PairConfirmOk {
	device: { id: string; name: string; fingerprint: string; is_owner: boolean };
	secret: string;
}

export interface PairConfirmPending {
	pairing_id: string;
	status: "pending";
}

async function postJson<T>(baseUrl: string, path: string, payload: unknown): Promise<{ status: number; data: T }> {
	const response = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify(payload),
	});
	const text = await response.text();
	let data: T;
	try {
		data = (text ? JSON.parse(text) : {}) as T;
	} catch {
		data = {} as T;
	}
	return { status: response.status, data };
}

/**
 * Begin pairing: POST /pair/start {device_name, public_key}.
 * Returns the pairing_id and the 6-char code the owner must approve.
 */
export async function shadowPairStart(
	baseUrl: string,
	deviceName: string,
	publicKey: string,
): Promise<PairStartResponse> {
	const { status, data } = await postJson<PairStartResponse>(baseUrl, "/pair/start", {
		device_name: deviceName,
		public_key: publicKey,
	});
	if (status < 200 || status >= 300) {
		throw new Error(
			`Pairing start failed (${status}): ${(data as unknown as { detail?: string })?.detail ?? "unknown error"}`,
		);
	}
	return data;
}

/**
 * Collect credentials: POST /pair/confirm {pairing_id}.
 * Returns the device + secret once the owner approves (or immediately on
 * first-ever bootstrap pairing), or null while still pending.
 */
export async function shadowPairConfirm(
	baseUrl: string,
	pairingId: string,
): Promise<PairConfirmOk | null> {
	const { status, data } = await postJson<PairConfirmOk | PairConfirmPending>(
		baseUrl,
		"/pair/confirm",
		{ pairing_id: pairingId },
	);
	if (status === 202) {
		return null;
	}
	if (status === 404) {
		throw new Error("Pairing not found. Start pairing again.");
	}
	if (status === 410) {
		throw new Error("Pairing code expired. Start pairing again.");
	}
	if (status < 200 || status >= 300) {
		throw new Error(
			`Pairing confirm failed (${status}): ${(data as unknown as { detail?: string })?.detail ?? "unknown error"}`,
		);
	}
	const ok = data as PairConfirmOk;
	if (!ok.device?.id || !ok.secret) {
		throw new Error("Pairing confirm returned an unexpected response.");
	}
	return ok;
}
