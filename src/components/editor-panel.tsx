import { useEffect, useMemo, useRef } from "react";
import * as monaco from "monaco-editor";
import { configureMonacoYaml } from "monaco-yaml";

import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

import YamlWorker from "@/lib/yaml.worker?worker";

interface EditorPanelProps {
  filePath: string | null;
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  registerFocusTarget?: (focusTarget: (() => void) | null) => void;
}

const MONACO_THEME_NAME = "bigide-theme";

let monacoConfigured = false;

function readThemeToken(variableName: string, fallback: string) {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

function hslTokenToHex(token: string) {
  const sanitized = token.trim().replace(/^hsl\(/i, "").replace(/\)$/u, "").split("/")[0]?.trim() ?? "";
  const parts = sanitized.split(/[\s,]+/).filter(Boolean);

  if (parts.length < 3) {
    return null;
  }

  const hue = Number(parts[0].replace(/deg$/i, ""));
  const saturation = Number(parts[1].replace("%", ""));
  const lightness = Number(parts[2].replace("%", ""));

  if (![hue, saturation, lightness].every((value) => Number.isFinite(value))) {
    return null;
  }

  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100;
  const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100;

  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const huePrime = normalizedHue / 60;
  const secondComponent = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime < 1) {
    red = chroma;
    green = secondComponent;
  } else if (huePrime < 2) {
    red = secondComponent;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondComponent;
  } else if (huePrime < 4) {
    green = secondComponent;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondComponent;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondComponent;
  }

  const matchLightness = normalizedLightness - chroma / 2;
  const toHexChannel = (value: number) => Math.round((value + matchLightness) * 255).toString(16).padStart(2, "0");

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function toMonacoColor(variableName: string, fallback: string) {
  return hslTokenToHex(readThemeToken(variableName, fallback)) ?? hslTokenToHex(fallback) ?? "#000000";
}

function inferBaseTheme() {
  const backgroundToken = readThemeToken("--background", "39 58% 95%");
  const lightness = Number(backgroundToken.split(/\s+/).at(-1)?.replace("%", ""));
  return Number.isFinite(lightness) && lightness < 50 ? "vs-dark" : "vs";
}

function applyMonacoTheme() {
  monaco.editor.defineTheme(MONACO_THEME_NAME, {
    base: inferBaseTheme(),
    inherit: true,
    rules: [],
    colors: {
      "editor.background": toMonacoColor("--card", "0 0% 100%"),
      "editor.foreground": toMonacoColor("--foreground", "210 30% 13%"),
      "editor.lineHighlightBackground": toMonacoColor("--muted", "42 35% 90%"),
      "editor.selectionBackground": toMonacoColor("--secondary", "35 50% 85%"),
      "editor.inactiveSelectionBackground": toMonacoColor("--muted", "42 35% 90%"),
      "editorCursor.foreground": toMonacoColor("--primary", "193 63% 34%"),
      "editorLineNumber.foreground": toMonacoColor("--muted-foreground", "213 14% 36%"),
      "editorLineNumber.activeForeground": toMonacoColor("--foreground", "210 30% 13%"),
      "editorIndentGuide.background1": toMonacoColor("--border", "38 32% 79%"),
      "editorIndentGuide.activeBackground1": toMonacoColor("--primary", "193 63% 34%"),
      "editorGutter.background": toMonacoColor("--card", "0 0% 100%"),
      "editorWidget.background": toMonacoColor("--card", "0 0% 100%"),
      "editorWidget.border": toMonacoColor("--border", "38 32% 79%"),
      "input.background": toMonacoColor("--background", "39 58% 95%"),
      "input.foreground": toMonacoColor("--foreground", "210 30% 13%"),
      "input.border": toMonacoColor("--border", "38 32% 79%"),
      "focusBorder": toMonacoColor("--ring", "193 63% 34%")
    }
  });
  monaco.editor.setTheme(MONACO_THEME_NAME);
}

function ensureMonacoConfigured() {
  if (monacoConfigured) {
    applyMonacoTheme();
    return;
  }

  const monacoEnvironment = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker: (_moduleId: string, label: string) => Worker;
    };
  };

  monacoEnvironment.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      switch (label) {
        case "css":
        case "less":
        case "scss":
          return new CssWorker();
        case "handlebars":
        case "html":
        case "razor":
          return new HtmlWorker();
        case "json":
          return new JsonWorker();
        case "javascript":
        case "typescript":
          return new TsWorker();
        case "yaml":
          return new YamlWorker();
        default:
          return new EditorWorker();
      }
    }
  };

  configureMonacoYaml(monaco, {
    completion: true,
    enableSchemaRequest: false,
    format: true,
    hover: true,
    validate: true,
    yamlVersion: "1.2"
  });

  applyMonacoTheme();
  monacoConfigured = true;
}

function resolveMonacoLanguage(filePath: string | null) {
  if (!filePath) {
    return "plaintext";
  }

  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
    return "typescript";
  }

  if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
    return "javascript";
  }

  if (filePath.endsWith(".json")) {
    return "json";
  }

  if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
    return "markdown";
  }

  if (filePath.endsWith(".scss")) {
    return "scss";
  }

  if (filePath.endsWith(".css")) {
    return "css";
  }

  if (filePath.endsWith(".html")) {
    return "html";
  }

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return "yaml";
  }

  return "plaintext";
}

export function EditorPanel({ filePath, value, onChange, onSave, registerFocusTarget }: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modelChangeRef = useRef<monaco.IDisposable | null>(null);
  const syncingRef = useRef(false);
  const pendingFocusRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  const language = useMemo(() => resolveMonacoLanguage(filePath), [filePath]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    registerFocusTarget?.(() => {
      pendingFocusRef.current = true;

      const tryFocus = (remainingAttempts: number) => {
        if (editorRef.current && modelRef.current) {
          pendingFocusRef.current = false;
          editorRef.current.focus();
          return;
        }

        if (remainingAttempts > 0) {
          window.requestAnimationFrame(() => tryFocus(remainingAttempts - 1));
        }
      };

      window.requestAnimationFrame(() => tryFocus(60));
    });

    return () => {
      registerFocusTarget?.(null);
    };
  }, [registerFocusTarget]);

  useEffect(() => {
    if (!filePath || !containerRef.current) {
      return;
    }

    ensureMonacoConfigured();

    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      fontFamily: "IBM Plex Mono, monospace",
      fontSize: 12,
      lineNumbers: "on",
      minimap: { enabled: false },
      model: null,
      padding: { top: 12, bottom: 12 },
      renderLineHighlight: "all",
      roundedSelection: false,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      theme: MONACO_THEME_NAME
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSaveRef.current?.();
    });

    editorRef.current = editor;

    const observer = new MutationObserver(() => {
      applyMonacoTheme();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    });

    return () => {
      observer.disconnect();
      modelChangeRef.current?.dispose();
      modelChangeRef.current = null;
      modelRef.current?.dispose();
      modelRef.current = null;
      editor.dispose();
      editorRef.current = null;
    };
  }, [filePath]);

  useEffect(() => {
    if (!filePath || !editorRef.current) {
      return;
    }

    const uri = monaco.Uri.from({
      scheme: "file",
      path: filePath
    });
    const model = monaco.editor.createModel(value, language, uri);

    modelChangeRef.current?.dispose();
    modelChangeRef.current = model.onDidChangeContent(() => {
      if (syncingRef.current) {
        return;
      }

      onChangeRef.current(model.getValue());
    });

    editorRef.current.setModel(model);
    modelRef.current = model;

    if (pendingFocusRef.current) {
      window.requestAnimationFrame(() => {
        if (!pendingFocusRef.current || editorRef.current?.getModel() !== model) {
          return;
        }

        pendingFocusRef.current = false;
        editorRef.current.focus();
      });
    }

    return () => {
      modelChangeRef.current?.dispose();
      modelChangeRef.current = null;

      if (editorRef.current?.getModel() === model) {
        editorRef.current.setModel(null);
      }

      model.dispose();
      if (modelRef.current === model) {
        modelRef.current = null;
      }
    };
  }, [filePath, language]);

  useEffect(() => {
    const model = modelRef.current;
    if (!model || model.getValue() === value) {
      return;
    }

    syncingRef.current = true;
    model.setValue(value);
    syncingRef.current = false;
  }, [value]);

  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Select a file in the tree to start editing.
      </div>
    );
  }

  return <div ref={containerRef} className="monaco-editor-container h-full min-h-0 w-full overflow-hidden" />;
}
