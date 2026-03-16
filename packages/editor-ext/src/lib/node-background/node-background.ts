import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { findParentNodeClosestToPos } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

interface NodeWithPos {
  node: PMNode;
  pos: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    nodeBackground: {
      setNodeBackgroundColor: (backgroundColor: string) => ReturnType;
      unsetNodeBackgroundColor: () => ReturnType;
      toggleNodeBackgroundColor: (backgroundColor: string) => ReturnType;
    };
  }
}

export interface NodeBackgroundOptions {
  types: string[];
  useStyle?: boolean;
}

function getSelectedNodesOfType(
  selection: TextSelection | NodeSelection,
  allowedTypes: string[],
): NodeWithPos[] {
  const results: NodeWithPos[] = [];
  const allowed = new Set(allowedTypes);

  if (selection instanceof NodeSelection) {
    const { node } = selection;
    if (node && allowed.has(node.type.name)) {
      results.push({ node, pos: selection.from });
    }
    return results;
  }

  const { $anchor } = selection;

  const parentNode = findParentNodeClosestToPos($anchor, (node) =>
    allowed.has(node.type.name),
  );

  if (parentNode) {
    results.push({ node: parentNode.node, pos: parentNode.pos });
  }

  return results;
}

function updateNodesAttr(
  tr: Transaction,
  targets: readonly NodeWithPos[],
  attrName: string,
  next: string | null,
): boolean {
  if (!targets.length) return false;

  let changed = false;

  for (const { pos } of targets) {
    const currentNode = tr.doc.nodeAt(pos);
    if (!currentNode) continue;

    const prevValue = (currentNode.attrs as Record<string, unknown>)[attrName];
    if (prevValue === next) continue;

    const nextAttrs: Record<string, unknown> = { ...currentNode.attrs };
    nextAttrs[attrName] = next;

    tr.setNodeMarkup(pos, undefined, nextAttrs);
    changed = true;
  }

  return changed;
}

function getToggleColor(
  targets: NodeWithPos[],
  inputColor: string,
): string | null {
  if (targets.length === 0) return null;

  for (const target of targets) {
    const currentColor = target.node.attrs?.backgroundColor ?? null;
    if (currentColor !== inputColor) {
      return inputColor;
    }
  }

  return null;
}

export const NodeBackground = Extension.create<NodeBackgroundOptions>({
  name: "nodeBackground",

  addOptions() {
    return {
      types: [
        "paragraph",
        "heading",
        "blockquote",
        "taskList",
        "bulletList",
        "orderedList",
        "tableCell",
        "tableHeader",
      ],
      useStyle: true,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          backgroundColor: {
            default: null as string | null,

            parseHTML: (element: HTMLElement) => {
              const styleColor = element.style?.backgroundColor;
              if (styleColor) return styleColor;

              const dataColor = element.getAttribute("data-background-color");
              return dataColor || null;
            },

            renderHTML: (attributes: Record<string, unknown>) => {
              const color = attributes.backgroundColor as string | null;
              if (!color) return {};

              if (this.options.useStyle) {
                return {
                  style: `background-color: ${color}`,
                };
              } else {
                return {
                  "data-background-color": color,
                };
              }
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const executeBackgroundCommand = (
      getTargetColor: (
        targets: NodeWithPos[],
        inputColor?: string,
      ) => string | null,
    ) => {
      return (inputColor?: string) =>
        ({ state, tr }: { state: EditorState; tr: Transaction }) => {
          const targets = getSelectedNodesOfType(
            state.selection as TextSelection | NodeSelection,
            this.options.types,
          );

          if (targets.length === 0) return false;

          const targetColor = getTargetColor(targets, inputColor);

          return updateNodesAttr(tr, targets, "backgroundColor", targetColor);
        };
    };

    return {
      setNodeBackgroundColor: executeBackgroundCommand(
        (_, inputColor) => inputColor || null,
      ),

      unsetNodeBackgroundColor: executeBackgroundCommand(() => null),

      toggleNodeBackgroundColor: executeBackgroundCommand(
        (targets, inputColor) => getToggleColor(targets, inputColor || ""),
      ),
    };
  },
});
