import { BubbleMenu, BubbleMenuProps } from "@tiptap/react/menus";
import { isNodeSelection, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { FC, useEffect, useRef, useState } from "react";
import {
  IconBold,
  IconCode,
  IconItalic,
  IconStrikethrough,
  IconUnderline,
  IconMessage,
  IconSubscript,
  IconSuperscript,
} from "@tabler/icons-react";
import clsx from "clsx";
import classes from "./bubble-menu.module.css";
import { ActionIcon, rem, Tooltip } from "@mantine/core";
import { ColorSelector } from "./color-selector";
import { NodeSelector } from "./node-selector";
import { TextAlignmentSelector } from "./text-alignment-selector";
import {
  draftCommentIdAtom,
  showCommentPopupAtom,
} from "@/features/comment/atoms/comment-atom";
import { useAtom } from "jotai";
import { v7 as uuid7 } from "uuid";
import { isCellSelection, isTextSelected } from "@docmost/editor-ext";
import { LinkSelector } from "@/features/editor/components/bubble-menu/link-selector.tsx";
import { useTranslation } from "react-i18next";
import { HighlightColorSelector } from "./highlight-color-selector";
import { showLinkMenuAtom } from "@/features/editor/atoms/editor-atoms";

export interface BubbleMenuItem {
  name: string;
  isActive: () => boolean;
  command: () => void;
  icon: typeof IconBold;
}

type EditorBubbleMenuProps = Omit<BubbleMenuProps, "children" | "editor"> & {
  editor: Editor | null;
};

export const EditorBubbleMenu: FC<EditorBubbleMenuProps> = (props) => {
  const { t } = useTranslation();
  const [showCommentPopup, setShowCommentPopup] = useAtom(showCommentPopupAtom);
  const [, setDraftCommentId] = useAtom(draftCommentIdAtom);
  const [showLinkMenu] = useAtom(showLinkMenuAtom);
  const showCommentPopupRef = useRef(showCommentPopup);
  const showLinkMenuRef = useRef(showLinkMenu);

  useEffect(() => {
    showCommentPopupRef.current = showCommentPopup;
  }, [showCommentPopup]);

  useEffect(() => {
    showLinkMenuRef.current = showLinkMenu;
  }, [showLinkMenu]);

  const editorState = useEditorState({
    editor: props.editor,
    selector: (ctx) => {
      if (!props.editor) {
        return null;
      }

      return {
        isBold: ctx.editor.isActive("bold"),
        isItalic: ctx.editor.isActive("italic"),
        isUnderline: ctx.editor.isActive("underline"),
        isStrike: ctx.editor.isActive("strike"),
        isSubscript: ctx.editor.isActive("subscript"),
        isSuperscript: ctx.editor.isActive("superscript"),
        isCode: ctx.editor.isActive("code"),
        isComment: ctx.editor.isActive("comment"),
      };
    },
  });

  const items: BubbleMenuItem[] = [
    {
      name: "Bold",
      isActive: () => editorState?.isBold,
      command: () => props.editor.chain().focus().toggleBold().run(),
      icon: IconBold,
    },
    {
      name: "Italic",
      isActive: () => editorState?.isItalic,
      command: () => props.editor.chain().focus().toggleItalic().run(),
      icon: IconItalic,
    },
    {
      name: "Underline",
      isActive: () => editorState?.isUnderline,
      command: () => props.editor.chain().focus().toggleUnderline().run(),
      icon: IconUnderline,
    },
    {
      name: "Strike",
      isActive: () => editorState?.isStrike,
      command: () => props.editor.chain().focus().toggleStrike().run(),
      icon: IconStrikethrough,
    },
    {
      name: "Subscript",
      isActive: () => editorState?.isSubscript,
      command: () => props.editor.chain().focus().toggleSubscript().run(),
      icon: IconSubscript,
    },
    {
      name: "Superscript",
      isActive: () => editorState?.isSuperscript,
      command: () => props.editor.chain().focus().toggleSuperscript().run(),
      icon: IconSuperscript,
    },
    {
      name: "Code",
      isActive: () => editorState?.isCode,
      command: () => props.editor.chain().focus().toggleCode().run(),
      icon: IconCode,
    },
  ];

  const commentItem: BubbleMenuItem = {
    name: "Comment",
    isActive: () => editorState?.isComment,
    command: () => {
      const commentId = uuid7();

      props.editor.chain().focus().setCommentDecoration().run();
      setDraftCommentId(commentId);
      setShowCommentPopup(true);
    },
    icon: IconMessage,
  };

  const bubbleMenuProps: EditorBubbleMenuProps = {
    ...props,
    shouldShow: ({ state, editor }) => {
      const { selection } = state;
      const { empty } = selection;

      if (
        !editor.isEditable ||
        editor.isActive("image") ||
        empty ||
        isNodeSelection(selection) ||
        isCellSelection(selection) ||
        showLinkMenuRef.current ||
        showCommentPopupRef?.current
      ) {
        return false;
      }
      return isTextSelected(editor);
    },
    options: {
      placement: "top",
      offset: 8,
      onHide: () => {
        setIsNodeSelectorOpen(false);
        setIsHighlightColorSelectorOpen(false);
        setIsTextAlignmentOpen(false);
        setIsColorSelectorOpen(false);
      },
    },
  };

  const [isNodeSelectorOpen, setIsNodeSelectorOpen] = useState(false);
  const [isTextAlignmentSelectorOpen, setIsTextAlignmentOpen] = useState(false);
  const [isHighlightColorSelectorOpen, setIsHighlightColorSelectorOpen] = useState(false);
  const [isColorSelectorOpen, setIsColorSelectorOpen] = useState(false);

  if (showLinkMenu) return;

  return (
    <BubbleMenu
      {...bubbleMenuProps}
      style={{ zIndex: 199, position: "relative" }}
    >
      <div className={classes.bubbleMenu}>
        <NodeSelector
          editor={props.editor}
          isOpen={isNodeSelectorOpen}
          setIsOpen={() => {
            setIsNodeSelectorOpen(!isNodeSelectorOpen);
            setIsTextAlignmentOpen(false);
            setIsColorSelectorOpen(false);
            setIsHighlightColorSelectorOpen(false);
          }}
        />

        <TextAlignmentSelector
          editor={props.editor}
          isOpen={isTextAlignmentSelectorOpen}
          setIsOpen={() => {
            setIsTextAlignmentOpen(!isTextAlignmentSelectorOpen);
            setIsNodeSelectorOpen(false);
            setIsColorSelectorOpen(false);
            setIsHighlightColorSelectorOpen(false);
          }}
        />

        <ActionIcon.Group>
          {items.map((item, index) => (
            <Tooltip key={index} label={t(item.name)} withArrow>
              <ActionIcon
                key={index}
                variant="default"
                size="lg"
                radius="0"
                aria-label={t(item.name)}
                className={clsx({ [classes.active]: item.isActive() })}
                style={{ border: "none" }}
                onClick={item.command}
              >
                <item.icon style={{ width: rem(16) }} stroke={2} />
              </ActionIcon>
            </Tooltip>
          ))}
        </ActionIcon.Group>

        <LinkSelector />

        <HighlightColorSelector
          editor={props.editor}
          isOpen={isHighlightColorSelectorOpen}
          setIsOpen={() => {
            setIsHighlightColorSelectorOpen(!isHighlightColorSelectorOpen);
            setIsNodeSelectorOpen(false);
            setIsTextAlignmentOpen(false);
            setIsColorSelectorOpen(false);
          }}
        />

        <ColorSelector
          editor={props.editor}
          isOpen={isColorSelectorOpen}
          setIsOpen={() => {
            setIsColorSelectorOpen(!isColorSelectorOpen);
            setIsNodeSelectorOpen(false);
            setIsTextAlignmentOpen(false);
            setIsHighlightColorSelectorOpen(false);
          }}
        />

        <Tooltip label={t(commentItem.name)} withArrow withinPortal={false}>
          <ActionIcon
            variant="default"
            size="lg"
            radius="6px"
            aria-label={t(commentItem.name)}
            style={{ border: "none" }}
            onClick={commentItem.command}
          >
            <IconMessage size={16} stroke={2} />
          </ActionIcon>
        </Tooltip>
      </div>
    </BubbleMenu>
  );
};
