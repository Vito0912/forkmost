import { Box, Stack, Text } from "@mantine/core";
import { TextSelection } from "@tiptap/pm/state";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import classes from "./toc-node-view.module.css";

type TocHeadingLink = {
  label: string;
  level: number;
  element: HTMLElement;
  position: number;
};

const DEFAULT_MAX_SHOW_COUNT = 20;

export default function TocNodeView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { editor, node } = props;
  const [links, setLinks] = useState<TocHeadingLink[]>([]);
  const [activePosition, setActivePosition] = useState<number | null>(null);

  const showTitle = node.attrs.showTitle !== false;
  const maxShowCount = Number(node.attrs.maxShowCount ?? DEFAULT_MAX_SHOW_COUNT);

  const visibleLinks = useMemo(() => {
    if (!Number.isFinite(maxShowCount) || maxShowCount < 0) {
      return links;
    }

    return links.slice(0, maxShowCount);
  }, [links, maxShowCount]);

  const refreshHeadings = useCallback(() => {
    const headingNodes = editor.$nodes("heading");

    if (!headingNodes) {
      setLinks([]);
      return;
    }

    try {
      const nextLinks = Array.from(headingNodes).reduce<TocHeadingLink[]>(
        (acc, headingNode) => {
          const label = headingNode.node.textContent.trim();
          const level = Number(headingNode.node.attrs.level);

          if (!label || !Number.isFinite(level)) {
            return acc;
          }

          const position = editor.view.posAtDOM(headingNode.element, 0);

          acc.push({
            label,
            level,
            element: headingNode.element,
            position,
          });

          return acc;
        },
        [],
      );

      setLinks(nextLinks);
    } catch {
      setLinks([]);
    }
  }, [editor]);

  const handleScrollToHeading = useCallback(
    (link: TocHeadingLink) => {
      link.element.scrollIntoView({ behavior: "smooth", block: "start" });

      const tr = editor.state.tr;
      tr.setSelection(new TextSelection(tr.doc.resolve(link.position)));
      editor.view.dispatch(tr);
      editor.view.focus();

      setActivePosition(link.position);
    },
    [editor],
  );

  useEffect(() => {
    refreshHeadings();
    editor.on("update", refreshHeadings);

    return () => {
      editor.off("update", refreshHeadings);
    };
  }, [editor, refreshHeadings]);

  useEffect(() => {
    if (!visibleLinks.length) {
      setActivePosition(null);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const match = visibleLinks.find((link) => link.element === entry.target);
          if (match) {
            setActivePosition(match.position);
          }
        });
      },
      {
        root: null,
        rootMargin: "-10% 0px -75% 0px",
        threshold: 0,
      },
    );

    visibleLinks.forEach((link) => observer.observe(link.element));

    return () => {
      visibleLinks.forEach((link) => observer.unobserve(link.element));
      observer.disconnect();
    };
  }, [visibleLinks]);

  return (
    <NodeViewWrapper data-drag-handle>
      <Box className={classes.container}>
        {showTitle && (
          <Text fw={600} size="sm" className={classes.title}>
            {t("Table of contents")}
          </Text>
        )}

        {!visibleLinks.length ? (
          <Text size="sm" c="dimmed">
            {t("Add headings (H1, H2, H3) to generate a table of contents.")}
          </Text>
        ) : (
          <Stack gap={2}>
            {visibleLinks.map((link) => (
              <Box<"button">
                key={`${link.position}-${link.label}`}
                component="button"
                type="button"
                className={clsx(classes.link, {
                  [classes.linkActive]: link.position === activePosition,
                })}
                style={{
                  "--toc-indent-level": String(Math.max(link.level - 1, 0)),
                }}
                onClick={() => handleScrollToHeading(link)}
              >
                {link.label}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </NodeViewWrapper>
  );
}
