import { BubbleMenu as BaseBubbleMenu } from "@tiptap/react/menus";
import React, { useCallback } from "react";
import {
  EditorMenuProps,
  ShouldShowProps,
} from "@/features/editor/components/table/types/types.ts";
import { useTranslation } from "react-i18next";

export function AudioMenu({ editor }: EditorMenuProps) {
  const { t } = useTranslation();

  const shouldShow = useCallback(
    ({ state }: ShouldShowProps) => {
      if (!state) {
        return false;
      }
      return editor.isActive("audio");
    },
    [editor],
  );

  return (
    <BaseBubbleMenu
      editor={editor}
      pluginKey={`audio-menu`}
      updateDelay={0}
      options={{
        placement: "top",
        offset: 8,
      }}
      shouldShow={shouldShow}
    >
      <></>
    </BaseBubbleMenu>
  );
}

export default AudioMenu;
