/**
 * Minimal ambient types for react-test-renderer (test-only). The package
 * ships no TypeScript declarations; this covers exactly what the
 * component tests use. Not part of the shipped app bundle.
 */
declare module "react-test-renderer" {
	import type { ElementType, ReactElement } from "react";

	export interface ReactTestInstance {
		type: ElementType;
		// Props are dynamic host-element props in these tests; `any`
		// keeps the test-only shim practical. This file is not shipped.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		props: { [key: string]: any };
		findAllByType(type: string | ElementType): ReactTestInstance[];
		findByType(type: string | ElementType): ReactTestInstance;
		findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
		findByProps(props: Record<string, unknown>): ReactTestInstance;
		findAll(
			predicate: (node: ReactTestInstance) => boolean,
		): ReactTestInstance[];
	}

	export interface ReactTestRenderer {
		root: ReactTestInstance;
		toJSON(): unknown;
		unmount(): void;
	}

	export function create(element: ReactElement): ReactTestRenderer;
	export function act<T>(callback: () => T): T;
}
