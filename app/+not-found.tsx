import { Link, Stack } from 'expo-router';
import { Page, Heading, Txt, styles } from '@/components/ScoutUI';
export default function NotFoundScreen() {
  return (
    <Page>
      <Stack.Screen options={{ title: 'Page not found' }} />
      <Heading>This page is not available.</Heading>
      <Txt muted>Your research desk is still here.</Txt>
      <Link href="/" style={styles.badge}>
        Go to Discover
      </Link>
    </Page>
  );
}
