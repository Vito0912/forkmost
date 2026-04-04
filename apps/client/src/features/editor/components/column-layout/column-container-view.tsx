import { NodeViewProps } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

export default function ColumnContainerView(props: NodeViewProps) {
  const { node, HTMLAttributes } = props;
  const { class: classNameProp, style: styleProp } = node.attrs;

  return (
    <NodeViewWrapper
      className={classNameProp || undefined}
    >
      <NodeViewContent
        className="flex-layout-content"
        as="div"
      />
    </NodeViewWrapper>
  );
}
