import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { Decoration, EditorView } from "@codemirror/view";
import { useMemo } from "react";

export function CodePane({
  code,
  activeLine,
  onChange,
}: {
  code: string;
  activeLine?: number;
  onChange(value: string): void;
}) {
  const lineExtension = useMemo(() => {
    if (!activeLine) return [];
    const lines = code.split("\n");
    const safeLine = Math.min(Math.max(activeLine, 1), lines.length);
    const offset = lines.slice(0, safeLine - 1).reduce((total, line) => total + line.length + 1, 0);
    return EditorView.decorations.of(
      Decoration.set([Decoration.line({ attributes: { class: "cm-trace-line" } }).range(offset)]),
    );
  }, [activeLine, code]);
  return (
    <section className="code-pane panel" aria-label="C++ source editor">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SOURCE</span>
          <strong>source.cpp</strong>
        </div>
        <span className="language-pill">C++20</span>
      </div>
      <CodeMirror
        value={code}
        height="100%"
        theme="dark"
        extensions={[
          cpp(),
          EditorView.lineWrapping,
          ...(Array.isArray(lineExtension) ? lineExtension : [lineExtension]),
        ]}
        onChange={onChange}
        basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: false }}
        onCreateEditor={(view) => {
          if (activeLine && activeLine <= view.state.doc.lines)
            view.dispatch({
              selection: { anchor: view.state.doc.line(activeLine).from },
              scrollIntoView: true,
            });
        }}
      />
      {activeLine ? <div className="active-line-chip">Executing line {activeLine}</div> : null}
    </section>
  );
}
