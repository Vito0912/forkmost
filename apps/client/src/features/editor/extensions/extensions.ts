import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Underline } from "@tiptap/extension-underline";
import { Superscript } from "@tiptap/extension-superscript";
import SubScript from "@tiptap/extension-subscript";
import { Highlight } from "@tiptap/extension-highlight";
import { Typography } from "@tiptap/extension-typography";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Table from "@tiptap/extension-table";
import SlashCommand from "@/features/editor/extensions/slash-command";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCursor } from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  Comment,
  Details,
  DetailsContent,
  DetailsSummary,
  MathBlock,
  MathInline,
  TableCell,
  TableRow,
  TableHeader,
  TrailingNode,
  TiptapImage,
  Callout,
  TiptapVideo,
  Audio,
  LinkExtension,
  Selection,
  Attachment,
  CustomCodeBlock,
  Drawio,
  Excalidraw,
  Embed,
  SearchAndReplace,
  Mention,
  ExtraLigatures,
  ColumnContainer,
  Column,
} from "@docmost/editor-ext";
import {
  randomElement,
  userColors,
} from "@/features/editor/extensions/utils.ts";
import { IUser } from "@/features/user/types/user.types.ts";
import MathInlineView from "@/features/editor/components/math/math-inline.tsx";
import MathBlockView from "@/features/editor/components/math/math-block.tsx";
import GlobalDragHandle from "tiptap-extension-global-drag-handle";
import { Youtube } from "@tiptap/extension-youtube";
import ImageView from "@/features/editor/components/image/image-view.tsx";
import CalloutView from "@/features/editor/components/callout/callout-view.tsx";
import { common, createLowlight } from "lowlight";
import VideoView from "@/features/editor/components/video/video-view.tsx";
import AudioView from "@/features/editor/components/audio/audio-view.tsx";
import AttachmentView from "@/features/editor/components/attachment/attachment-view.tsx";
import CodeBlockView from "@/features/editor/components/code-block/code-block-view.tsx";
import DrawioView from "../components/drawio/drawio-view";
import ExcalidrawView from "@/features/editor/components/excalidraw/excalidraw-view.tsx";
import EmbedView from "@/features/editor/components/embed/embed-view.tsx";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import abap from "highlightjs-sap-abap";
import elixir from "highlight.js/lib/languages/elixir";
import erlang from "highlight.js/lib/languages/erlang";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import clojure from "highlight.js/lib/languages/clojure";
import fortran from "highlight.js/lib/languages/fortran";
import haskell from "highlight.js/lib/languages/haskell";
import scala from "highlight.js/lib/languages/scala";
import mentionRenderItems from "@/features/editor/components/mention/mention-suggestion.ts";
import { ReactNodeViewRenderer } from "@tiptap/react";
import MentionView from "@/features/editor/components/mention/mention-view.tsx";
import i18n from "@/i18n.ts";
import { MarkdownClipboard } from "@/features/editor/extensions/markdown-clipboard.ts";
import EmojiCommand from "./emoji-command";
import { CharacterCount } from "@tiptap/extension-character-count";
import Heading from "@tiptap/extension-heading";
import HeadingView from "../components/heading/heading-view";
import { countWords } from "alfaaz";
import ColumnContainerView from "@/features/editor/components/column-layout/column-container-view";
import ColumnView from "@/features/editor/components/column-layout/column-view";

const lowlight = createLowlight(common);
lowlight.register("mermaid", plaintext);
lowlight.register("powershell", powershell);
lowlight.register("abap", abap);
lowlight.register("erlang", erlang);
lowlight.register("elixir", elixir);
lowlight.register("dockerfile", dockerfile);
lowlight.register("clojure", clojure);
lowlight.register("fortran", fortran);
lowlight.register("haskell", haskell);
lowlight.register("scala", scala);

export const mainExtensions = [
  StarterKit.configure({
    history: false,
    heading: false,
    dropcursor: {
      width: 3,
      color: "#70CFF8",
    },
    codeBlock: false,
    code: {
      HTMLAttributes: {
        spellcheck: false,
      },
    },
  }),
  Heading.extend({
    addNodeView() {
      return ReactNodeViewRenderer(HeadingView);
    }
  }),
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === "heading") {
        return i18n.t("Heading {{level}}", { level: node.attrs.level });
      }
      if (node.type.name === "detailsSummary") {
        return i18n.t("Toggle title");
      }
      if (node.type.name === "paragraph") {
        return i18n.t('Write anything. Enter "/" for commands');
      }
    },
    includeChildren: true,
    showOnlyWhenEditable: true,
  }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  Underline,
  LinkExtension.configure({
    openOnClick: false,
  }),
  Superscript,
  SubScript,
  Highlight.configure({
    multicolor: true,
  }),
  Typography,
  ExtraLigatures,
  TrailingNode,
  GlobalDragHandle,
  TextStyle,
  Color,
  SlashCommand,
  EmojiCommand,
  Comment.configure({
    HTMLAttributes: {
      class: "comment-mark",
    },
  }),
  Mention.configure({
    suggestion: {
      allowSpaces: true,
      items: () => {
        return [];
      },
      // @ts-ignore
      render: mentionRenderItems,
    },
    HTMLAttributes: {
      class: "mention",
    },
  }).extend({
    addNodeView() {
      return ReactNodeViewRenderer(MentionView);
    },
  }),
  Table.configure({
    resizable: true,
    lastColumnResizable: false,
    allowTableNodeSelection: true,
  }),
  TableRow,
  // Full credit for this change goes to https://github.com/docmost/docmost/pull/679/commits/8014e0876bb5baa8f7c4b6b7c280224609dd393c. Fore more infos see https://prosemirror.net/docs/guide/#schema.content_expressions
  TableCell.extend({
    content: "block+",
  }),
  TableHeader,
  MathInline.configure({
    view: MathInlineView,
  }),
  MathBlock.configure({
    view: MathBlockView,
  }),
  Details,
  DetailsSummary,
  DetailsContent,
  Youtube.configure({
    addPasteHandler: false,
    controls: true,
    nocookie: true,
  }),
  TiptapImage.configure({
    view: ImageView,
    allowBase64: false,
  }),
  TiptapVideo.configure({
    view: VideoView,
  }),
  Audio.configure({
    view: AudioView,
  }),
  Callout.configure({
    view: CalloutView,
  }),
  CustomCodeBlock.configure({
    view: CodeBlockView,
    lowlight,
    HTMLAttributes: {
      spellcheck: false,
    },
  }),
  Selection,
  Attachment.configure({
    view: AttachmentView,
  }),
  Drawio.configure({
    view: DrawioView,
  }),
  Excalidraw.configure({
    view: ExcalidrawView,
  }),
  Embed.configure({
    view: EmbedView,
  }),
  MarkdownClipboard.configure({
    transformPastedText: true,
  }),
  CharacterCount.configure({
    wordCounter: (text) => countWords(text),
  }),
  ColumnContainer.configure({
    view: ColumnContainerView,
  }),
  Column.configure({
    view: ColumnView,
  }),
  SearchAndReplace.extend({
    addKeyboardShortcuts() {
      return {
        'Mod-f': () => {
          const event = new CustomEvent("openFindDialogFromEditor", {});
          document.dispatchEvent(event);
          return true;
        },
        'Mod-h': () => {
          const event = new CustomEvent("openFindAndReplaceDialogFromEditor", {});
          document.dispatchEvent(event);
          return true;
        },
        'Alt-c': () => {
          const event = new CustomEvent("matchCaseToggle", {});
          document.dispatchEvent(event);
          return true;
        },
        'Escape': () => {
          const event = new CustomEvent("closeFindDialogFromEditor", {});
          document.dispatchEvent(event);
          return true;
        },
      }
    },
  }).configure(),
] as any;

type CollabExtensions = (provider: HocuspocusProvider, user: IUser) => any[];

export const collabExtensions: CollabExtensions = (provider, user) => [
  Collaboration.configure({
    document: provider.document,
  }),
  CollaborationCursor.configure({
    provider,
    user: {
      name: user.name,
      color: randomElement(userColors),
    },
  }),
];
