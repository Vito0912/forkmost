import { StarterKit } from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { Superscript } from '@tiptap/extension-superscript';
import SubScript from '@tiptap/extension-subscript';
import { Underline } from '@tiptap/extension-underline';
import { Highlight } from '@tiptap/extension-highlight';
import { Typography } from '@tiptap/extension-typography';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Youtube } from '@tiptap/extension-youtube';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import {
  Callout,
  Comment,
  CustomCodeBlock,
  Details,
  DetailsContent,
  DetailsSummary,
  LinkExtension,
  MathBlock,
  MathInline,
  TableHeader,
  TableCell,
  TableRow,
  CustomTable,
  TiptapImage,
  TiptapVideo,
  TiptapPdf,
  Audio,
  TrailingNode,
  Attachment,
  Drawio,
  Excalidraw,
  Embed,
  Mention,
  Subpages,
  Highlight,
  UniqueID,
  addUniqueIdsToDoc,
  htmlToMarkdown,
  TypstBlock,
  ColumnContainer,
  Column,
} from '@docmost/editor-ext';
import { generateText, getSchema, JSONContent } from '@tiptap/core';
import { generateHTML, generateJSON } from '../common/helpers/prosemirror/html';
// @tiptap/html library works best for generating prosemirror json state but not HTML
// see: https://github.com/ueberdosis/tiptap/issues/5352
// see:https://github.com/ueberdosis/tiptap/issues/4089
import { Node, Schema } from '@tiptap/pm/model';
import Heading, { Level } from '@tiptap/extension-heading';
//import { generateJSON } from '@tiptap/html';
import * as Y from 'yjs';
import { Logger } from '@nestjs/common';

export const tiptapExtensions = [
  StarterKit.configure({
    codeBlock: false,
    link: false,
    trailingNode: false,
    heading: false,
  }),
  Heading.extend({
    addOptions() {
      return {
        ...this.parent?.(),
        levels: [1, 2, 3, 4, 5, 6] as Level[],
      };
    },
  }).configure({
    levels: [1, 2, 3, 4, 5, 6],
  }),
  Comment,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  Underline,
  LinkExtension,
  Superscript,
  SubScript,
  Highlight,
  Typography,
  TrailingNode,
  TextStyle,
  Color,
  MathInline,
  MathBlock,
  Details,
  DetailsContent,
  DetailsSummary,
  CustomTable,
  TableCell,
  TableRow,
  TableHeader,
  Youtube,
  TiptapImage,
  TiptapVideo,
  TiptapPdf,
  Audio,
  Callout,
  Attachment,
  CustomCodeBlock,
  Drawio,
  Excalidraw,
  Embed,
  Mention,
  ColumnContainer,
  Column,
  Subpages,
  TypstBlock,
] as any;

export function jsonToHtml(tiptapJson: any) {
  return generateHTML(tiptapJson, tiptapExtensions);
}

export function htmlToJson(html: string) {}

export function jsonToText(tiptapJson: JSONContent) {
  return generateText(tiptapJson, tiptapExtensions);
}

export function jsonToNode(tiptapJson: JSONContent) {
  const schema = getSchema(tiptapExtensions);
  try {
    return Node.fromJSON(schema, tiptapJson);
  } catch (error) {
    if (
      error instanceof RangeError &&
      error.message.includes('Unknown node type')
    ) {
      Logger.warn('Stripping unknown node types from document:', error.message);
      const cleanedJson = stripUnknownNodes(tiptapJson, schema);
      return Node.fromJSON(schema, cleanedJson);
    }
    throw error;
  }
}

export function getPageId(documentName: string) {
  return documentName.split('.')[1];
}

function stripUnknownNodes(
  json: JSONContent,
  schema: Schema,
): JSONContent | null {
  if (!json || typeof json !== 'object') return json;

  // Recursively clean children first, flattening any unwrapped content
  if (json.content && Array.isArray(json.content)) {
    const newContent: JSONContent[] = [];
    for (const child of json.content) {
      const cleaned = stripUnknownNodes(child, schema);
      if (Array.isArray(cleaned)) {
        newContent.push(...cleaned);
      } else if (cleaned) {
        newContent.push(cleaned);
      }
    }
    json.content = newContent;
  }

  // Check if this node is unknown AFTER processing children
  if (json.type && !schema.nodes[json.type]) {
    // Unwrap: return cleaned children directly instead of wrapping
    return (
      json.content && json.content.length > 0 ? json.content : null
    ) as any;
  }

  return json;
}

export function prosemirrorNodeToYElement(node: any): Y.XmlElement | Y.XmlText {
  if (node.type === 'text') {
    const ytext = new Y.XmlText();
    ytext.insert(0, node.text || '');
    if (node.marks?.length > 0) {
      const attrs: Record<string, any> = {};
      for (const mark of node.marks) {
        attrs[mark.type] = mark.attrs || true;
      }
      ytext.format(0, node.text?.length || 0, attrs);
    }
    return ytext;
  }

  const element = new Y.XmlElement(node.type);
  if (node.attrs) {
    for (const [key, value] of Object.entries(node.attrs)) {
      if (value !== null && value !== undefined) {
        element.setAttribute(key, value as any);
      }
    }
  }
  if (node.content?.length > 0) {
    const children = node.content.map(prosemirrorNodeToYElement);
    element.insert(0, children);
  }
  return element;
}

export function jsonToMarkdown(tiptapJson: any): string {
  const html = jsonToHtml(tiptapJson);
  return htmlToMarkdown(html);
}
