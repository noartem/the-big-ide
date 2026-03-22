import { FormEvent, useMemo, useState } from "react";
import { Globe, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const QUICK_LINKS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://docs.docker.com",
  "https://opencode.ai"
];

function normalizeUrl(value: string) {
  if (!value.trim()) {
    return "about:blank";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://${value}`;
}

export function BrowserPanel() {
  const [draftUrl, setDraftUrl] = useState(QUICK_LINKS[0]);
  const [url, setUrl] = useState(QUICK_LINKS[0]);

  const currentHost = useMemo(() => {
    try {
      const parsed = new URL(url);
      return parsed.host;
    } catch {
      return "";
    }
  }, [url]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUrl(normalizeUrl(draftUrl));
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <form className="flex items-center gap-2" onSubmit={onSubmit}>
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} className="pl-8" />
        </div>
        <Button type="submit" size="sm">
          Open
        </Button>
      </form>

      <div className="flex items-center gap-2 overflow-auto pb-1">
        {QUICK_LINKS.map((quickLink) => (
          <Button
            key={quickLink}
            type="button"
            variant={quickLink === url ? "default" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => {
              setDraftUrl(quickLink);
              setUrl(quickLink);
            }}
          >
            {quickLink.replace(/^https?:\/\//, "")}
          </Button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        {url === "about:blank" ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Globe className="size-4" />
            Open a URL to start browsing.
          </div>
        ) : (
          <>
            <iframe src={url} title="The Big IDE Browser Panel" className="h-full w-full bg-white" />
            <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
              {currentHost || url}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
