import { Image, Text, View } from "react-native";
import { typography, useTheme } from "@/theme";
import type { AttachedFile } from "./FileAttachment";
import { formatFileSize, getFileExtension } from "./fileUtils";

/**
 * Read-only attachment chips shown on a sent user message.
 * Mirrors the composer preview (AttachedFilesList) minus the remove button:
 * image thumbnail when the file is an image with a local uri, otherwise an
 * extension badge. Returns null when there are no attachments.
 */
export function MessageAttachments({
	attachments,
}: {
	attachments?: AttachedFile[];
}) {
	const { colors } = useTheme();

	if (!attachments || attachments.length === 0) {
		return null;
	}

	return (
		<View className="flex-row flex-wrap gap-2 mb-2">
			{attachments.map((file) => {
				const isImage = file.type.startsWith("image/");
				const extension = getFileExtension(file.name);

				return (
					<View
						key={file.id}
						accessibilityLabel={`Attachment: ${file.name}`}
						className="flex-row items-center gap-2 pl-1 pr-2 py-1 rounded-lg border"
						style={{
							backgroundColor: colors.muted,
							borderColor: colors.border,
						}}
					>
						{isImage && file.uri ? (
							<Image source={{ uri: file.uri }} className="w-8 h-8 rounded" />
						) : (
							<View
								className="w-8 h-8 rounded items-center justify-center"
								style={{ backgroundColor: colors.card }}
							>
								<Text
									style={[typography.micro, { color: colors.mutedForeground }]}
								>
									{extension.toUpperCase().slice(0, 3)}
								</Text>
							</View>
						)}

						<View className="max-w-[100px]">
							<Text
								style={[typography.micro, { color: colors.foreground }]}
								numberOfLines={1}
							>
								{file.name}
							</Text>
							<Text
								style={[typography.micro, { color: colors.mutedForeground }]}
							>
								{formatFileSize(file.size)}
							</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}
