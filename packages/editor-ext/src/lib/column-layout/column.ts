import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface ColumnOptions {
  view: any;
}

export const Column = Node.create<ColumnOptions>({
  name: "columnLayoutColumn",
  group: 'columnItem',
  content: "block+",
  draggable: true,

  addAttributes() {
    return {
      class: {
        default: null,
      },
      style: {
        default: null,
      },
      xs: {
        default: 12,
        parseHTML: (element) => element.getAttribute("data-col-xs"),
        renderHTML: (attributes) => ({
          "data-col-xs": attributes.xs,
        }),
      },
      md: {
        default: 0,
        parseHTML: (element) => element.getAttribute("data-col-md"),
        renderHTML: (attributes) => ({
          "data-col-md": attributes.md,
        }),
      },
      lg: {
        default: 0,
        parseHTML: (element) => element.getAttribute("data-col-lg"),
        renderHTML: (attributes) => ({
          "data-col-lg": attributes.lg,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[data-type="${this.name}"]`,
      },
      {
        // Backwards compatibility: old documents used data-type="column" for column-layout columns.
        // Distinguish from upstream's column by checking for the data-col-xs attribute.
        tag: `div[data-type="column"][data-col-xs]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": this.name }, HTMLAttributes),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(this.options.view);
  },
});
