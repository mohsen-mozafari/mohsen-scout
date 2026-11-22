import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Page, Panel, Heading, Txt, Field, Action } from '@/components/ScoutUI';
import { WebView } from '@/components/ui/primitives/WebView';
import { isAllowedBrowserNavigation, normalizeBrowserAddress } from '@/lib/browser';

export default function InternalBrowser() {
  const [address, setAddress] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = () => {
    const next = normalizeBrowserAddress(address);
    if (!next) {
      setError('Enter a valid HTTP or HTTPS address, or a search phrase.');
      return;
    }
    setError('');
    setCurrentUrl(next);
    setAddress(next);
  };

  return (
    <Page title="Web Browser" eyebrow="IN-APP RESEARCH" showBack subtitle="Open and inspect public web pages without leaving your research workspace.">
      <Panel>
        <Heading>Open a website or search the web</Heading>
        <Field label="Website address or search phrase" value={address} onChange={setAddress} placeholder="example.org or a research question" />
        <Action disabled={!address.trim()} onPress={navigate}>Open page</Action>
        {currentUrl ? <Action secondary onPress={() => void Linking.openURL(currentUrl).catch(() => setError('Could not open the external browser.'))}>Open in external browser</Action> : null}
        {error ? <Txt>{error}</Txt> : null}
        {loading ? <Txt muted>Loading page…</Txt> : null}
      </Panel>
      {currentUrl ? (
        Platform.OS === 'web' ? (
          <Panel>
            <Txt muted>The embedded browser is available in the Android app. Open this page in your system browser instead.</Txt>
            <Action onPress={() => void Linking.openURL(currentUrl).catch(() => setError('Could not open the page.'))}>Continue in browser</Action>
          </Panel>
        ) : (
          <View style={{ height: 560, overflow: 'hidden', borderRadius: 14 }}>
            <WebView
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
              onLoadStart={() => { setLoading(true); setError(''); }}
              onLoadEnd={() => setLoading(false)}
              onError={(event) => {
                setLoading(false);
                setError(event.nativeEvent.description || 'The page could not be loaded.');
              }}
              onHttpError={(event) => {
                if (event.nativeEvent.statusCode >= 400) {
                  setError('The website returned HTTP ' + event.nativeEvent.statusCode + '.');
                }
              }}
              onNavigationStateChange={(state) => {
                if (isAllowedBrowserNavigation(state.url)) setAddress(state.url);
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
