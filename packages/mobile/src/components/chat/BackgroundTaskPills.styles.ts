import { tv, combineStyles } from "@/lib/styles";

const row = tv({
	base: "flex-row gap-2 px-4 pb-2",
	variants: {},
});

const pill = tv({
	base: "flex-row items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full max-w-[240px]",
	variants: {},
});

export const backgroundTaskPillsStyles = combineStyles({
	row,
	pill,
});
