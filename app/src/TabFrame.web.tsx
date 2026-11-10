// A custom tab on the web: a sandboxed iframe (scripts on, no same-origin), so the page can't reach the app's
// keys or storage.
import { createElement } from "react";

export default function TabFrame({ html }: { html: string }) {
  return createElement("iframe", {
    srcDoc: html,
    sandbox: "allow-scripts allow-popups",
    style: { border: "none", width: "100%", height: "100%", flex: 1, background: "transparent" },
    title: "tab",
  });
}
