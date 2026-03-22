import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function prettyPath(fullPath: string) {
  const home = typeof window === "undefined" ? "" : "";
  if (home && fullPath.startsWith(home)) {
    return fullPath.replace(home, "~");
  }
  return fullPath;
}
