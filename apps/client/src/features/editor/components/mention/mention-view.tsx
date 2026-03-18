import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Anchor, Text, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IconFileDescription } from "@tabler/icons-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { useAtomValue } from "jotai";
import { sharedTreeDataAtom } from "@/features/share/atoms/shared-page-atom";
import { isPageInTree } from "@/features/share/utils";
import {
  buildPageUrl,
  buildSharedPageUrl,
} from "@/features/page/page.utils.ts";
import { extractPageSlugId } from "@/lib";
import classes from "./mention.module.css";

const truncateText = (text: string, maxLength: number = 30): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

export default function MentionView(props: NodeViewProps) {
  const { node } = props;
  const { t } = useTranslation();
  const { label, entityType, slugId, anchorSlug, anchorText } = node.attrs;
  const { spaceSlug, pageSlug } = useParams();
  const { shareId } = useParams();
  const navigate = useNavigate();
  const sharedTreeData = useAtomValue(sharedTreeDataAtom);

  const location = useLocation();
  const isShareRoute = location.pathname.startsWith("/share");

  const {
    data: page,
    isError,
  } = usePageQuery({
    pageId: entityType === "page" && !isShareRoute ? slugId : null,
  });

  const isPageAvailableInShareTree =
    isShareRoute &&
    !!sharedTreeData &&
    entityType === "page" &&
    isPageInTree(sharedTreeData, slugId);

  const currentPageSlugId = extractPageSlugId(pageSlug);
  const isSamePage = currentPageSlugId === slugId;

  const handleClick = (e: React.MouseEvent) => {
    if (isSamePage && anchorSlug) {
      e.preventDefault();
      const element = document.querySelector(`[id="${anchorSlug}"]`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        navigate(`#${anchorSlug}`, { replace: true });
      }
    }
  };

  const shareSlugUrl = buildSharedPageUrl({
    shareId,
    pageSlugId: slugId,
    pageTitle: label,
    anchorId: anchorSlug,
  });

  const canNavigateToPageMention =
    entityType === "page" &&
    (isShareRoute ? isPageAvailableInShareTree : !isError);

  return (
    <NodeViewWrapper style={{ display: "inline" }} data-drag-handle>
      {entityType === "user" && (
        <Text className={classes.userMention} component="span">
          @{label}
        </Text>
      )}

      {entityType === "page" && !canNavigateToPageMention && (
        <Tooltip label={t("Not available")} withArrow>
          <Text component="span" c="dimmed" size="sm">
            {label}
          </Text>
        </Tooltip>
      )}

       {entityType === "page" && canNavigateToPageMention && (
         <Anchor
           component={Link}
           fw={500}
           to={
             isShareRoute ? shareSlugUrl : buildPageUrl(page?.space?.slug || spaceSlug, slugId, page?.title || label, anchorSlug)
           }
           onClick={handleClick}
           underline="never"
           className={classes.pageMentionLink}
         >
          {page?.icon ? (
            <span style={{ marginRight: "4px" }}>{page.icon}</span>
          ) : (
            <ActionIcon
              variant="transparent"
              color="gray"
              component="span"
              size={18}
              style={{ verticalAlign: "text-bottom" }}
            >
              <IconFileDescription size={18} />
            </ActionIcon>
          )}

          <span className={classes.pageMentionText}>
            {page?.title || label}
            {anchorText && (
              <span className={classes.anchorText}>
                {'#'}{truncateText(anchorText)}
              </span>
            )}
          </span>
        </Anchor>
      )}
    </NodeViewWrapper>
  );
}
