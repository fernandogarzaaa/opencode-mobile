/**
 * Minimal ambient types for react-test-renderer.
 *
 * @types/react-test-renderer is not installed (no registry egress in this
 * environment), and jest runs ts-jest in transpile-only mode, so the real
 * types are only needed for `tsc --noEmit`. This declaration covers
 * exactly what the *.test.tsx files use. Replace with the real
 * @types/react-test-renderer package when registry access is available.
 */
declare module "react-test-renderer" {
	import type { ReactElement } from "react";

	export interface ReactTestInstance {
		readonly type: unknown;
		readonly props: Record<string, unknown>;
		readonly parent: ReactTestInstance | null;
		readonly children: Array<ReactTestInstance | string>;
		findAllByType(type: unknown): ReactTestInstance[];
		findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
		findByType(type: unknown): ReactTestInstance;
		findByProps(props: Record<string, unknown>): ReactTestInstance;
	}

	export interface ReactTestRenderer {
		readonly root: ReactTestInstance;
		toJSON(): unknown;
		unmount(): void;
		update(element: ReactElement): void;
	}

	export function create(element: ReactElement): ReactTestRenderer;
	export function act<T>(callback: () => T | Promise<T>): T;
}
