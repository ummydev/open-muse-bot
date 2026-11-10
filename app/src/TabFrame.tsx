// A custom tab on iOS and Android: the agent-written page in a WebView with no access to the app.
import { WebView } from "react-native-webview";

export default function TabFrame({ html }: { html: string }) {
  return (
    <WebView
      source={{ html, baseUrl: "about:blank" }}
      originWhitelist={["*"]}
      style={{ flex: 1, backgroundColor: "transparent" }}
      javaScriptEnabled
      domStorageEnabled={false}
      setSupportMultipleWindows={false}
    />
  );
}
