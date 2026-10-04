import { apiGet } from "../lib/httpClient";

/**
 * Shadow Node artifacts API (durable documents).
 *
 * Server contract (apps/shadow-node/shadow_node/main.py and
 * apps/shadow-node/shadow_node/artifacts.py):
 *   GET /artifacts?limit&offset&kind -> {artifacts, total, limit, offset}
 *     NOTE: the list envelope key is `artifacts`, not a _page envelope;
 *     each entry is the artifact meta (no content) plus size_bytes.
 *   GET /artifacts/{id}            -> full artifact JSON (with content)
 *   GET /artifacts/{id}/versions   -> {artifact_id, versions} where each
 *     version is {version, created_at, size_bytes}
 *   GET /artifacts/{id}/versions/{version} -> full artifact JSON at version
 *   PATCH /artifacts/{id}          -> update body + optional
 *     expected_version (409 on conflict). Editing is out of scope for the
 *     mobile client; the API is exposed here for a follow-up.
 *   DELETE /artifacts/{id}
 *
 * ARTIFACT_KINDS = ("markdown", "html", "code", "csv", "json", "text")
 */

export type ArtifactKind =
	| "markdown"
	| "html"
	| "code"
	| "csv"
	| "json"
	| "text";

/** Artifact meta as returned by GET /artifacts (content excluded). */
export interface ArtifactMeta {
	id: string;
	title: string;
	kind: string;
	tags: string[];
	version: number;
	created_at: number;
	updated_at: number;
	size_bytes: number;
}

/** Full artifact as returned by GET /artifacts/{id}. */
export interface Artifact extends ArtifactMeta {
	content: string;
}

/** Version entry as returned by GET /artifacts/{id}/versions. */
export interface ArtifactVersionInfo {
	version: number;
	created_at: number;
	size_bytes: number;
}

interface ArtifactsListResponse {
	artifacts: ArtifactMeta[];
	total: number;
	limit: number;
	offset: number;
}

interface ArtifactsVersionsResponse {
	artifact_id: string;
	versions: ArtifactVersionInfo[];
}

export const artifactsApi = {
	/** List artifact metas, newest first (node default limit 20). */
	async list(options?: {
		limit?: number;
		offset?: number;
		kind?: ArtifactKind;
	}): Promise<{ artifacts: ArtifactMeta[]; total: number }> {
		const response = await apiGet<ArtifactsListResponse>("/artifacts", {
			limit: options?.limit ?? 50,
			offset: options?.offset ?? 0,
			kind: options?.kind,
		});
		return {
			artifacts: Array.isArray(response.artifacts)
				? response.artifacts
				: [],
			total:
				typeof response.total === "number"
					? response.total
					: response.artifacts?.length ?? 0,
		};
	},

	/** Full artifact JSON including content. */
	async get(artifactId: string): Promise<Artifact> {
		return apiGet<Artifact>(
			`/artifacts/${encodeURIComponent(artifactId)}`,
		);
	},

	/** Version history for an artifact. */
	async versions(artifactId: string): Promise<ArtifactVersionInfo[]> {
		const response = await apiGet<ArtifactsVersionsResponse>(
			`/artifacts/${encodeURIComponent(artifactId)}/versions`,
		);
		return Array.isArray(response.versions) ? response.versions : [];
	},

	/** Full artifact JSON at a specific version. */
	async getVersion(artifactId: string, version: number): Promise<Artifact> {
		return apiGet<Artifact>(
			`/artifacts/${encodeURIComponent(artifactId)}/versions/${version}`,
		);
	},
};
