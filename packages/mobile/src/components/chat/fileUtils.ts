/**
 * Pure file-display helpers shared by the composer attachment UI and the
 * read-only attachment chips on sent messages. No I/O, no state.
 *
 * (Mirrors the private helpers in FileAttachment.tsx, which cannot export
 * them without tripping the react-refresh/only-export-components rule.)
 */

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(name: string): string {
	return name.split(".").pop()?.toLowerCase() || "";
}
