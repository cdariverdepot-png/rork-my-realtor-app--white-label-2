import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML shell for static web export.
 * 100dvh covers iOS Safari chrome so splash/root never leave a gap
 * above the browser bar (100% / 100vh alone fall short).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%", backgroundColor: "#000000" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: ROOT_CSS }} />
      </head>
      <body style={{ height: "100%", backgroundColor: "#000000", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}

const ROOT_CSS = `
html, body {
  height: 100%;
  min-height: 100%;
  min-height: 100dvh;
  height: 100dvh;
  margin: 0;
  padding: 0;
  background-color: #000000;
  overscroll-behavior: none;
}
body {
  overflow: hidden;
}
#root, #root > div {
  display: flex;
  flex: 1;
  min-height: 100%;
  min-height: 100dvh;
  height: 100%;
  height: 100dvh;
  background-color: #000000;
}
`;
