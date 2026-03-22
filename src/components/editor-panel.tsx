import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";

interface EditorPanelProps {
  filePath: string | null;
  value: string;
  onChange: (value: string) => void;
}

function resolveLanguageExtensions(filePath: string | null) {
  if (!filePath) {
    return [];
  }

  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx") || filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
    return [javascript({ typescript: true, jsx: true })];
  }

  if (filePath.endsWith(".json")) {
    return [json()];
  }

  if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
    return [markdown()];
  }

  if (filePath.endsWith(".css") || filePath.endsWith(".scss")) {
    return [css()];
  }

  if (filePath.endsWith(".html")) {
    return [html()];
  }

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return [yaml()];
  }

  return [];
}

export function EditorPanel({ filePath, value, onChange }: EditorPanelProps) {
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
        Select a file in the tree to start editing.
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <CodeMirror
        value={value}
        extensions={resolveLanguageExtensions(filePath)}
        height="100%"
        minHeight="100%"
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true
        }}
      />
    </div>
  );
}
