import type { Editor } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { canJoin } from "@tiptap/pm/transform";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Solves the "stuck vertical spacing" problem with lists in Tiptap.
 *
 * When a user presses Enter twice at the end of a list item, they exit the list
 * and a new empty paragraph is created between two list blocks. Backspacing that
 * paragraph deletes it but does NOT merge the two list blocks back together,
 * leaving permanent visual spacing. This extension intercepts Backspace on empty
 * paragraphs between same-type lists and joins them.
 */
export const ListNormalization = Extension.create({
  name: "listNormalization",

  addKeyboardShortcuts() {
    const listTypes = ["bulletList", "orderedList", "taskList"];

    const handleBackspace = ({ editor }: { editor: Editor }) => {
      const { state, view } = editor;
      const { selection } = state;
      const { $from, empty } = selection;

      if (!empty) return false;
      if ($from.parentOffset !== 0) return false;

      const currentNode = $from.parent;

      if (
        currentNode.type.name !== "paragraph" ||
        currentNode.content.size > 0
      ) {
        return false;
      }

      const parentDepth = $from.depth - 1;
      if (parentDepth < 0) return false;

      const parent = $from.node(parentDepth);
      const indexInParent = $from.index(parentDepth);

      if (indexInParent === 0 || indexInParent >= parent.childCount - 1) {
        return false;
      }

      const nodeBefore = parent.child(indexInParent - 1);
      const nodeAfter = parent.child(indexInParent + 1);

      if (!listTypes.includes(nodeBefore.type.name)) return false;
      if (!listTypes.includes(nodeAfter.type.name)) return false;
      if (nodeBefore.type.name !== nodeAfter.type.name) return false;

      const startOfPara = $from.before(parentDepth + 1);
      const endOfPara = $from.after(parentDepth + 1);

      const $insideFirstList = state.doc.resolve(startOfPara - 1);
      const targetSelection = TextSelection.findFrom(
        $insideFirstList,
        -1,
        true,
      );

      if (!targetSelection) return false;

      const cursorTargetPos = targetSelection.from;
      const tr = state.tr;

      tr.delete(startOfPara, endOfPara);

      if (canJoin(tr.doc, startOfPara)) {
        tr.join(startOfPara);
      }

      const mappedPos = tr.mapping.map(cursorTargetPos);
      tr.setSelection(TextSelection.create(tr.doc, mappedPos));

      view.dispatch(tr);
      return true;
    };

    return {
      Backspace: handleBackspace,
    };
  },
});
