import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import type { WebView as WebViewInstance } from 'react-native-webview';
import { Page, Panel, Heading, Txt, Field, Action } from '@/components/ScoutUI';
import { WebView } from '@/components/ui/primitives/WebView';
import { getBrowserFailureMessage, isAllowedBrowserNavigation, normalizeBrowserAddress } from '@/lib/browser';
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react-native';
import { openExternalUrl } from '@/lib/external-links';

export default function InternalBrowser() {
  const [address, setAddress] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef<WebViewInstance>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const navigate = () => {
    const next = normalizeBrowserAddress(address);
    if (!next) {
      setError('Enter a valid HTTP or HTTPS address, or a search phrase.');
      return;
    }
    setError('');
    setCurrentUrl(next);
    setCanGoBack(false);
    setCanGoForward(false);
    setWebViewKey((key) => key + 1);
    setAddress(next);
  };

  return (
    <Page title="Web Browser" eyebrow="IN-APP RESEARCH" showBack subtitle="Open and inspect public web pages without leaving your research workspace.">
      <Panel>
        <Heading>Open a website or search the web</Heading>
        <Field label="Website address or search phrase" value={address} onChange={setAddress} placeholder="example.org or a research question" />
        <Action disabled={!address.trim()} onPress={navigate}>Open page</Action>
        {currentUrl ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            <Action secondary disabled={!canGoBack} icon={ArrowLeft} onPress={() => webViewRef.current?.goBack()}>Back</Action>
            <Action secondary disabled={!canGoForward} icon={ArrowRight} onPress={() => webViewRef.current?.goForward()}>Forward</Action>
            <Action secondary icon={RefreshCw} onPress={() => { setError(''); setLoading(true); webViewRef.current?.reload(); }}>Refresh</Action>
          </View>
        ) : null}
        {currentUrl ? <Action secondary onPress={() => void openExternalUrl(currentUrl)}>{'Open in external browser'}</Action> : null}
        {error ? <Txt>{error}</Txt> : null}
        {error && currentUrl && Platform.OS !== 'web' ? (
          <Action secondary icon={RefreshCw} onPress={() => {
            setError('');
            setLoading(true);
            setWebViewKey((key) => key + 1);
          }}>Retry page</Action>
        ) : null}
        {loading ? <Txt muted>Loading page…</Txt> : null}
      </Panel>
      {currentUrl ? (
        Platform.OS === 'web' ? (
          <Panel>
            <Txt muted>The embedded browser is available in the Android app. Open this page in your system browser instead.</Txt>
            <Action onPress={() => void openExternalUrl(currentUrl)}>Continue in browser</Action>
          </Panel>
        ) : (
          <View style={{ height: 560, overflow: 'hidden', borderRadius: 14 }}>
            <WebView
              ref={webViewRef}
              key={webViewKey}
              source={{ uri: currentUrl }}
              originWhitelist={['https://*', 'http://*']}
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="never"
              allowFileAccess={false}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              javaScriptCanOpenWindowsAutomatically={false}
              setSupportMultipleWindows={false}
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              startInLoadingState
              cacheEnabled
              androidLayerType="hardware"
              onLoadStart={() => { setLoading(true); setError(''); }}
              onLoadEnd={() => setLoading(false)}
              onError={(event) => {
                setLoading(false);
                setError(getBrowserFailureMessage(event.nativeEvent.description, event.nativeEvent.code));
              }}
              onHttpError={(event) => {
                if (event.nativeEvent.statusCode >= 400) {
                  setLoading(false);
                  setError('The website returned HTTP ' + event.nativeEvent.statusCode + '. The host may block embedded browsers or require a different sign-in method.');
                }
              }}
              onRenderProcessGone={(event) => {
                setLoading(false);
                setError(event.nativeEvent.didCrash
                  ? 'Android System WebView crashed while rendering this page. Update Android System WebView and retry.'
                  : 'Android System WebView stopped unexpectedly. Retry the page.');
              }}
              onContentProcessDidTerminate={() => {
                setLoading(false);
                setError('The embedded browser process stopped. Retry the page.');
              }}
              onNavigationStateChange={(state) => {
                if (isAllowedBrowserNavigation(state.url)) {
                  setAddress(state.url);
                  setCurrentUrl(state.url);
                }
                setCanGoBack(state.canGoBack);
                setCanGoForward(state.canGoForward);
              }}
              onShouldStartLoadWithRequest={(request) => isAllowedBrowserNavigation(request.url)}
              style={{ flex: 1, backgroundColor: '#050505' }}
            />
          </View>
        )
      ) : (
        <Panel>
          <Txt muted>Navigation is limited to HTTP and HTTPS pages. Local files, JavaScript URLs and other app schemes are blocked.</Txt>
        </Panel>
      )}
    </Page>
  );
}
