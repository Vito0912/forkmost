import { useEffect, useRef, useState } from "react";
import { Menu, UnstyledButton, Group, Text } from "@mantine/core";
import { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import {
  IconPlus,
  IconTransform,
  IconTypography,
  IconH1,
  IconH2,
  IconH3,
  IconList,
  IconListNumbers,
  IconCheckbox,
  IconBlockquote,
  IconCode,
  IconInfoCircle,
  IconCopy,
  IconTrash,
  IconChevronRight,
} from "@tabler/icons-react";
import classes from "./drag-context-menu.module.css";

interface DragContextMenuProps {
  editor: Editor;
}

function resolveBlockNode(editor: Editor, clientX: number, clientY: number) {
  const coords = { left: clientX + 50, top: clientY };
  const pos = editor.view.posAtCoords(coords);
  if (!pos) return null;

  const $pos = editor.state.doc.resolve(pos.pos);
  for (let i = $pos.depth; i >= 0; i--) {
    const node = $pos.node(i);
    if (node && node.isBlock && node.type.name !== "doc") {
      return { pos: $pos.before(i), node };
    }
  }
  return null;
}

export default function DragContextMenu({ editor }: DragContextMenuProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const nodePosRef = useRef<number | null>(null);
  const hoveredHandleRef = useRef<HTMLElement | null>(null);
  const addButtonZoneWidth = 22;

  const handleAddBlockFromHandle = (handleRect: DOMRect) => {
    const block = resolveBlockNode(
      editor,
      handleRect.right + 30,
      handleRect.top + handleRect.height / 2,
    );
    if (!block) return;

    const insertPos = block.pos + block.node.nodeSize;
    editor.chain().focus().insertContentAt(insertPos, { type: "paragraph" }).run();
    editor.chain().focus().setTextSelection(insertPos + 1).insertContent("/").run();
  };

  useEffect(() => {
    const handleDragHandleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const handleEl = target.closest(".drag-handle") as HTMLElement | null;
      if (!handleEl) return;

      e.preventDefault();
      e.stopPropagation();

      const handleRect = handleEl.getBoundingClientRect();
      const isAddButtonZone =
        e.clientX >= handleRect.left - addButtonZoneWidth &&
        e.clientX <= handleRect.left &&
        e.clientY >= handleRect.top &&
        e.clientY <= handleRect.bottom;

      if (isAddButtonZone) {
        handleAddBlockFromHandle(handleRect);
        return;
      }

      const block = resolveBlockNode(editor, e.clientX, e.clientY);
      if (block) {
        nodePosRef.current = block.pos;
        setPosition({ x: e.clientX, y: e.clientY });
        setOpened(true);
      }
    };

    document.addEventListener("click", handleDragHandleClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleDragHandleClick, { capture: true });
    };
  }, [editor]);

  useEffect(() => {
    const clearHoveredHandle = () => {
      if (hoveredHandleRef.current) {
        delete hoveredHandleRef.current.dataset.hoverZone;
        hoveredHandleRef.current = null;
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const handleEl = target?.closest(".drag-handle") as HTMLElement | null;

      if (!handleEl) {
        clearHoveredHandle();
        return;
      }

      if (hoveredHandleRef.current && hoveredHandleRef.current !== handleEl) {
        delete hoveredHandleRef.current.dataset.hoverZone;
      }

      hoveredHandleRef.current = handleEl;

      const rect = handleEl.getBoundingClientRect();
      handleEl.dataset.hoverZone = e.clientX < rect.left ? "add" : "grip";
    };

    const handlePointerLeave = () => {
      clearHoveredHandle();
    };

    document.addEventListener("mousemove", handlePointerMove, { capture: true });
    document.addEventListener("mouseout", handlePointerLeave, { capture: true });

    return () => {
      clearHoveredHandle();
      document.removeEventListener("mousemove", handlePointerMove, { capture: true });
      document.removeEventListener("mouseout", handlePointerLeave, { capture: true });
    };
  }, []);

  const handleClose = () => {
    setOpened(false);
  };

  const handleAddBlockBelow = () => {
    const pos = nodePosRef.current;
    if (pos === null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    
    const insertPos = pos + node.nodeSize;
    editor.chain().focus().insertContentAt(insertPos, { type: "paragraph" }).run();
    editor.chain().focus().setTextSelection(insertPos + 1).insertContent("/").run();
    handleClose();
  };

  const handleTransform = (type: string, attrs?: Record<string, unknown>) => {
    const pos = nodePosRef.current;
    if (pos === null) return;

    // Place cursor inside the block so toggle commands work
    const chain = editor.chain().focus().setTextSelection(pos + 1);

    switch (type) {
      case "paragraph":
        chain.setParagraph().run();
        break;
      case "heading":
        chain.toggleHeading(attrs as { level: 1 | 2 | 3 | 4 | 5 | 6 }).run();
        break;
      case "bulletList":
        chain.toggleBulletList().run();
        break;
      case "orderedList":
        chain.toggleOrderedList().run();
        break;
      case "taskList":
        chain.toggleTaskList().run();
        break;
      case "blockquote":
        chain.toggleBlockquote().run();
        break;
      case "codeBlock":
        chain.toggleCodeBlock().run();
        break;
      case "callout":
        chain.toggleCallout().run();
        break;
    }
    handleClose();
  };

  const handleDuplicate = () => {
    const pos = nodePosRef.current;
    if (pos === null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    
    editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run();
    handleClose();
  };

  const handleCopyToClipboard = () => {
    const pos = nodePosRef.current;
    if (pos === null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    
    const slice = editor.state.doc.slice(pos, pos + node.nodeSize);
    const text = slice.content.textBetween(0, slice.content.size, "\n\n");
    navigator.clipboard.writeText(text);
    handleClose();
  };

  const handleDelete = () => {
    const pos = nodePosRef.current;
    if (pos === null) return;
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
    handleClose();
  };

  return (
    <>
    <Menu
      opened={opened}
      onChange={setOpened}
      onClose={handleClose}
      position="bottom-start"
      withinPortal
      shadow="md"
      width={220}
    >
      <Menu.Target>
        <div
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        />
      </Menu.Target>

      <Menu.Dropdown className={classes.dropdown}>
        <Menu.Item
          leftSection={<IconPlus size={16} />}
          onClick={handleAddBlockBelow}
        >
          {t("Add block below")}
        </Menu.Item>

        <Menu.Divider />

        <Menu
          position="right-start"
          trigger="hover"
          openDelay={100}
          closeDelay={150}
          withinPortal
          shadow="md"
          width={200}
          offset={4}
        >
          <Menu.Target>
            <UnstyledButton className={classes.transformTarget}>
              <Group justify="space-between" wrap="nowrap" style={{ width: '100%' }}>
                <Group gap={12} wrap="nowrap">
                  <IconTransform size={16} />
                  <Text size="sm">{t("Transform to")}</Text>
                </Group>
                <IconChevronRight size={14} />
              </Group>
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconTypography size={16} />}
              onClick={() => handleTransform("paragraph")}
            >
              {t("Text")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconH1 size={16} />}
              onClick={() => handleTransform("heading", { level: 1 })}
            >
              {t("Heading 1")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconH2 size={16} />}
              onClick={() => handleTransform("heading", { level: 2 })}
            >
              {t("Heading 2")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconH3 size={16} />}
              onClick={() => handleTransform("heading", { level: 3 })}
            >
              {t("Heading 3")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconList size={16} />}
              onClick={() => handleTransform("bulletList")}
            >
              {t("Bullet list")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconListNumbers size={16} />}
              onClick={() => handleTransform("orderedList")}
            >
              {t("Numbered list")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCheckbox size={16} />}
              onClick={() => handleTransform("taskList")}
            >
              {t("To-do list")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconBlockquote size={16} />}
              onClick={() => handleTransform("blockquote")}
            >
              {t("Quote")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconCode size={16} />}
              onClick={() => handleTransform("codeBlock")}
            >
              {t("Code block")}
            </Menu.Item>
            <Menu.Item
              leftSection={<IconInfoCircle size={16} />}
              onClick={() => handleTransform("callout")}
            >
              {t("Callout")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu.Divider />

        <Menu.Item
          leftSection={<IconCopy size={16} />}
          onClick={handleDuplicate}
        >
          {t("Duplicate")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconCopy size={16} />}
          onClick={handleCopyToClipboard}
        >
          {t("Copy to clipboard")}
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          color="red"
          leftSection={<IconTrash size={16} />}
          onClick={handleDelete}
        >
          {t("Delete")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
    </>
  );
}
