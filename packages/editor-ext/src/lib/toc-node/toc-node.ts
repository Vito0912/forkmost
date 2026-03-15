import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import { ComponentType } from "react";

export interface TocNodeOptions {
  HTMLAttributes: Record<string, unknown>;
  view: ComponentType<ReactNodeViewProps<HTMLElement>> | null;
}

export interface TocNodeAttributes {
  maxShowCount?: number;
  showTitle?: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tocNode: {
      insertTocNode: (attrs?: TocNodeAttributes) => ReturnType;
    };
  }
}

export const TocNode = Node.create<TocNodeOptions>({
  name: "tocNode",

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  group: "block",
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      maxShowCount: {
        default: 20,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-max-show-count");
          return value ? Number(value) : 20;
        },
        renderHTML: (attributes: TocNodeAttributes) => ({
          "data-max-show-count": attributes.maxShowCount,
        }),
      },
      showTitle: {
        default: true,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-show-title");
          if (value === null) {
            return true;
          }

          return value !== "false";
        },
        renderHTML: (attributes: TocNodeAttributes) => ({
          "data-show-title": attributes.showTitle,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toc-node"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "toc-node",
      }),
    ];
  },

  addCommands() {
    return {
      insertTocNode:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  addNodeView() {
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },
});
