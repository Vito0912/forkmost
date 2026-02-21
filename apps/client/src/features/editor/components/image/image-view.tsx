import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { Image } from "@mantine/core";
import { Group, Image, Loader, Text } from "@mantine/core";
import { useMemo } from "react";
import { getFileUrl } from "@/lib/config.ts";
import clsx from "clsx";
import classes from "./image-view.module.css";
import { useTranslation } from "react-i18next";

export default function ImageView(props: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  const { t } = useTranslation();
  const { editor, node, selected } = props;
  const { src, width, align, title, aspectRatio, placeholder } = node.attrs;
  const alignClass = useMemo(() => {
    if (align === "left") return "alignLeft";
    if (align === "right") return "alignRight";
    if (align === "center") return "alignCenter";
    return "alignCenter";
  }, [align]);
  const previewSrc = useMemo(() => {
    editor.storage.shared.imagePreviews =
      editor.storage.shared.imagePreviews || {};

    if (placeholder?.id) {
      return editor.storage.shared.imagePreviews[placeholder.id];
    }

    return null;
  }, [placeholder, editor]);

  useEffect(() => {
    const wrapper = ref.current?.closest(".react-renderer.node-image");
    if (wrapper instanceof HTMLElement) {
      wrapper.removeAttribute("style");

      if (align === "floatLeft" || align === "floatRight") {
        let float: string;
        let padding: string;
        const p = 10;

        if (align === "floatLeft"){
          float = "left";
          padding = `0 ${p}px 0 0`;
        }
        if (align === "floatRight"){
          float = "right";
          padding = `0 0 0 ${p}px`;
        }

        Object.assign(wrapper.style, {
          float: float,
          width: width,
          padding: padding,
        });
      }
    }
  }, [align, width]);

  return (
    <NodeViewWrapper data-drag-handle>
      <div
        className={clsx(
          selected && "ProseMirror-selectednode",
          classes.imageWrapper,
          alignClass,
        )}
        style={{
          aspectRatio: aspectRatio ? aspectRatio : src ? undefined : "16 / 9",
          width,
        }}
      >
        {src && (
          <Image radius="md" fit="contain" src={getFileUrl(src)} alt={title} />
        )}
        {!src && previewSrc && (
          <Group pos="relative" h="100%" w="100%">
              <Image
                  radius="md"
                  fit="contain"
                  w={(align==="floatLeft" || align==="floatRight") ? "100%" : width}
                  src={getFileUrl(src)}
                  alt={title}
                  className={clsx(selected ? "ProseMirror-selectednode" : "", alignClass)}
              />
            <Loader size={20} pos="absolute" bottom={6} right={6} />
          </Group>
        )}
        {!src && !previewSrc && (
          <Group justify="center" wrap="nowrap" gap="xs" maw="100%" px="md">
            <Loader size={20} style={{ flexShrink: 0 }} />
            <Text component="span" size="sm" truncate="end">
              {placeholder?.name
                ? t("Uploading {{name}}", { name: placeholder.name })
                : t("Uploading file")}
            </Text>
          </Group>
        )}
      </div>

    </NodeViewWrapper>
  );
}
