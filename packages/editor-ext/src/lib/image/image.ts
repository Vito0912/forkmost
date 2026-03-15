import Image from "@tiptap/extension-image";
import { ImageOptions as DefaultImageOptions } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  mergeAttributes,
  Range,
  ResizableNodeView,
} from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { normalizeFileUrl } from "../media-utils";
import type { ResizableNodeViewDirection } from "@tiptap/core";

export type ImageResizeOptions = {
  enabled: boolean;
  directions?: ResizableNodeViewDirection[];
  minWidth?: number;
  minHeight?: number;
  alwaysPreserveAspectRatio?: boolean;
  createCustomHandle?: (direction: ResizableNodeViewDirection) => HTMLElement;
  className?: {
    container?: string;
    wrapper?: string;
    handle?: string;
    resizing?: string;
  };
};

export interface ImageOptions extends DefaultImageOptions {
  view: any;
  resize: ImageResizeOptions | false;
}

export interface ImageAttributes {
  src?: string;
  alt?: string;
  align?: string;
  showCaption?: boolean;
  caption?: string;
  attachmentId?: string;
  size?: number;
  width?: number | string;
  height?: number;
  aspectRatio?: number;
  placeholder?: {
    id: string;
    name: string;
  };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageBlock: {
      setImage: (attributes: ImageAttributes) => ReturnType;
      setImageAt: (
        attributes: ImageAttributes & { pos: number | Range },
      ) => ReturnType;
      setImageAlign: (align: "left" | "center" | "right" | "floatLeft" | "floatRight") => ReturnType;
      setImageWidth: (width: number) => ReturnType;
      setImageSize: (width: number, height: number) => ReturnType;
      toggleImageCaption: () => ReturnType;
    };
  }
}

export const TiptapImage = Image.extend<ImageOptions>({
  name: "image",

  inline: false,
  group: "block",
  isolating: true,
  atom: true,
  defining: true,

  addOptions() {
    return {
      ...this.parent?.(),
      view: null,
      resize: false,
    };
  },

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => getImageFromElement(element)?.getAttribute("src"),
        renderHTML: (attributes) => ({
          src: attributes.src,
        }),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const raw = getImageFromElement(element)?.getAttribute("width");
          if (!raw) return null;
          if (raw.endsWith("%")) return raw;
          const num = parseFloat(raw);
          return isNaN(num) ? null : num;
        },
        renderHTML: (attributes: ImageAttributes) => ({
          width: attributes.width,
        }),
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const raw = getImageFromElement(element)?.getAttribute("height");
          if (!raw) return null;
          const num = parseFloat(raw);
          return isNaN(num) ? null : num;
        },
        renderHTML: (attributes: ImageAttributes) => ({
          height: attributes.height,
        }),
      },
      align: {
        default: "center",
        parseHTML: (element) => {
          if (element.tagName === "FIGURE") {
            return element.getAttribute("data-align");
          }
          return getImageFromElement(element)?.getAttribute("data-align");
        },
        renderHTML: (attributes: ImageAttributes) => ({
          "data-align": attributes.align,
        }),
      },
      alt: {
        default: undefined,
        parseHTML: (element) => getImageFromElement(element)?.getAttribute("alt"),
        renderHTML: (attributes: ImageAttributes) => ({
          alt: attributes.alt,
        }),
      },
      showCaption: {
        default: false,
        parseHTML: (element) =>
          element.tagName === "FIGURE" ||
          element.getAttribute("data-show-caption") === "true",
        renderHTML: (attributes: ImageAttributes) =>
          attributes.showCaption ? { "data-show-caption": "true" } : {},
      },
      caption: {
        default: "",
        parseHTML: (element) => {
          const fig = element.closest("figure");
          const figcaption = fig?.querySelector("figcaption");
          return figcaption?.textContent || "";
        },
        renderHTML: (attributes: ImageAttributes) => ({
          "data-caption": attributes.caption || "",
        }),
      },
      attachmentId: {
        default: undefined,
        parseHTML: (element) =>
          getImageFromElement(element)?.getAttribute("data-attachment-id"),
        renderHTML: (attributes: ImageAttributes) => ({
          "data-attachment-id": attributes.attachmentId,
        }),
      },
      size: {
        default: null,
        parseHTML: (element) =>
          getImageFromElement(element)?.getAttribute("data-size"),
        renderHTML: (attributes: ImageAttributes) => ({
          "data-size": attributes.size,
        }),
      },
      aspectRatio: {
        default: null,
        parseHTML: (element) =>
          getImageFromElement(element)?.getAttribute("data-aspect-ratio"),
        renderHTML: (attributes: ImageAttributes) => ({
          "data-aspect-ratio": attributes.aspectRatio,
        }),
      },
      placeholder: {
        default: null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure",
        getAttrs: (node) => {
          if (!(node instanceof Element)) return false;

          const img = node.querySelector("img");
          if (!img) return false;

          return {
            src: img.getAttribute("src"),
            alt: img.getAttribute("alt"),
            width: img.getAttribute("width"),
            height: img.getAttribute("height"),
            align: node.getAttribute("data-align") || img.getAttribute("data-align"),
            attachmentId: img.getAttribute("data-attachment-id"),
            size: img.getAttribute("data-size"),
            aspectRatio: img.getAttribute("data-aspect-ratio"),
            showCaption: true,
            caption: node.querySelector("figcaption")?.textContent || "",
          };
        },
      },
      {
        tag: "img[src]",
        getAttrs: (node) => {
          if (!(node instanceof Element)) return false;
          if (node.closest("figure")) return false;
          return null;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const mergedAttributes = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
    );

    const showCaption = node.attrs.showCaption === true;
    const caption = node.attrs.caption || "";
    const align = node.attrs.align;

    const imgAttrs = { ...mergedAttributes };
    delete imgAttrs["data-show-caption"];
    delete imgAttrs["data-caption"];
    if (showCaption) {
      delete imgAttrs["data-align"];
    }

    if (showCaption) {
      const figureAttrs: Record<string, string> = { "data-show-caption": "true" };
      if (align) {
        figureAttrs["data-align"] = String(align);
      }

      return [
        "figure",
        figureAttrs,
        ["img", imgAttrs],
        ["figcaption", {}, caption],
      ];
    }

    return ["img", imgAttrs];
  },

  addCommands() {
    return {
      setImage:
        (attrs: ImageAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "image",
            attrs: attrs,
          });
        },

      setImageAt:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContentAt(attrs.pos, {
            type: "image",
            attrs: attrs,
          });
        },

      setImageAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes("image", { align }),

      setImageWidth:
        (width) =>
        ({ commands }) =>
          commands.updateAttributes("image", { width }),

      setImageSize:
        (width, height) =>
        ({ commands }) =>
          commands.updateAttributes("image", { width, height }),

      toggleImageCaption:
        () =>
        ({ state, commands }) => {
          if (!(state.selection instanceof NodeSelection)) {
            return false;
          }

          const { node } = state.selection;
          if (node.type.name !== this.name) {
            return false;
          }

          return commands.updateAttributes("image", {
            showCaption: !node.attrs.showCaption,
          });
        },
    };
  },

  addNodeView() {
    const resize = this.options.resize;

    if (!resize || !resize.enabled) {
      // Fallback to React node view (existing behavior)
      this.editor.isInitialized = true;
      return ReactNodeViewRenderer(this.options.view);
    }

    const {
      directions,
      minWidth,
      minHeight,
      alwaysPreserveAspectRatio,
      createCustomHandle,
      className,
    } = resize;

    return (props) => {
      const { node, getPos, HTMLAttributes, editor } = props;

      if (node.attrs.showCaption) {
        editor.isInitialized = true;
        const reactView = ReactNodeViewRenderer(this.options.view);
        return reactView(props);
      }

      // If no src yet (placeholder/uploading), use React view for loading UI
      if (!HTMLAttributes.src) {
        editor.isInitialized = true;
        const reactView = ReactNodeViewRenderer(this.options.view);
        const view = reactView(props);

        // When the node gets a src, return false from update to force rebuild
        const originalUpdate = view.update?.bind(view);
        view.update = (updatedNode, decorations, innerDecorations) => {
          if (updatedNode.attrs.src && !node.attrs.src) {
            return false;
          }
          if (originalUpdate) {
            return originalUpdate(updatedNode, decorations, innerDecorations);
          }
          return true;
        };

        return view;
      }

      // Has src — use ResizableNodeView
      const el = document.createElement("img");

      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value != null) {
          switch (key) {
            case "width":
            case "height":
              break;
            default:
              el.setAttribute(key, String(value));
              break;
          }
        }
      });

      el.src = normalizeFileUrl(HTMLAttributes.src);
      el.style.display = "block";
      el.style.maxWidth = "100%";
      el.style.borderRadius = "8px";

      if (typeof node.attrs.width === "number" && node.attrs.width > 0) {
        el.style.width = `${node.attrs.width}px`;
        if (typeof node.attrs.height === "number" && node.attrs.height > 0) {
          el.style.height = `${node.attrs.height}px`;
        }
      }

      let currentNode = node;

      const nodeView = new ResizableNodeView({
        element: el,
        editor,
        node,
        getPos,
        onResize: (w, h) => {
          el.style.width = `${w}px`;
          el.style.height = `${h}px`;
        },
        onCommit: () => {
          const pos = getPos();
          if (pos === undefined) return;

          this.editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, {
              width: Math.round(el.offsetWidth),
              height: Math.round(el.offsetHeight),
            })
            .run();
        },
        onUpdate: (updatedNode, _decorations, _innerDecorations) => {
          if (updatedNode.type !== currentNode.type) {
            return false;
          }

          if (updatedNode.attrs.showCaption !== currentNode.attrs.showCaption) {
            return false;
          }

          if (updatedNode.attrs.src !== currentNode.attrs.src) {
            el.src = normalizeFileUrl(updatedNode.attrs.src);
          }

          if (updatedNode.attrs.alt !== currentNode.attrs.alt) {
            el.alt = updatedNode.attrs.alt || "";
          }

          const w = updatedNode.attrs.width;
          const h = updatedNode.attrs.height;
          if (w != null) {
            el.style.width = `${w}px`;
          }
          if (h != null) {
            el.style.height = `${h}px`;
          }

          // Update alignment on container
          const align = updatedNode.attrs.align || "center";
          const container = nodeView.dom as HTMLElement;
          applyAlignment(container, align);

          currentNode = updatedNode;
          return true;
        },
        options: {
          directions,
          min: {
            width: minWidth,
            height: minHeight,
          },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
          createCustomHandle,
          className,
        },
      });

      const dom = nodeView.dom as HTMLElement;

      // Apply initial alignment
      applyAlignment(dom, node.attrs.align || "center");

      // Handle percentage width backward compat
      const widthAttr = node.attrs.width;
      if (typeof widthAttr === "string" && widthAttr.endsWith("%")) {
        // Defer conversion until we can measure the container
        requestAnimationFrame(() => {
          const parentEl = dom.parentElement;
          if (parentEl) {
            const containerWidth = parentEl.clientWidth;
            const pctValue = parseInt(widthAttr, 10);
            if (!isNaN(pctValue) && containerWidth > 0) {
              const pxWidth = Math.round(
                containerWidth * (pctValue / 100),
              );
              el.style.width = `${pxWidth}px`;
              if (node.attrs.aspectRatio) {
                el.style.height = `${Math.round(pxWidth / node.attrs.aspectRatio)}px`;
              }
            }
          }
          dom.style.visibility = "";
          dom.style.pointerEvents = "";
        });
      }

      // Show skeleton background while image loads from server
      dom.style.pointerEvents = "none";
      dom.style.background =
        "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))";

      el.onload = () => {
        dom.style.pointerEvents = "";
        dom.style.background = "";
      };

      return nodeView;
    };
  },
});

function applyAlignment(container: HTMLElement, align: string) {
  if (align === "left") {
    container.style.justifyContent = "flex-start";
  } else if (align === "right") {
    container.style.justifyContent = "flex-end";
  } else {
    container.style.justifyContent = "center";
  }
}

function getImageFromElement(element: Element): Element | null {
  if (element.tagName === "FIGURE") {
    return element.querySelector("img");
  }

  if (element.tagName === "IMG") {
    return element;
  }

  return element.querySelector("img");
}
