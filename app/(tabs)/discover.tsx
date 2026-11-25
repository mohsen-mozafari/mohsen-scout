import { router } from 'expo-router';
import { View } from 'react-native';
import { Activity, BookOpen, Compass, Search, TrendingUp, Youtube, FileSearch, FlaskConical } from 'lucide-react-native';
import { Page, Panel, Heading, Txt, Action, ScreenIntro } from '@/components/ScoutUI';

export default function Discover() {
  return (
    <Page title="Research Discovery" eyebrow="DISCOVER & RESEARCH" subtitle="A single entry point for search, analysis, verification and research follow-up.">
      <ScreenIntro
        eyebrow="RESEARCH DESK"
        title="From question to evidence-backed brief"
        subtitle="Start with official YouTube evidence, then investigate independent web and publisher sources, audit evidence and develop editorial angles."
        icon={Compass}
      />
      <Panel>
        <Heading>Start a research run</Heading>
        <Txt muted>Enter a topic or question. The research engine gathers and evaluates YouTube signals and independent sources.</Txt>
        <Action icon={FlaskConical} onPress={() => router.push('/deep-research')}>Start Deep Research</Action>
        <Action secondary icon={Youtube} onPress={() => router.push('/youtube')}>Search and sample YouTube</Action>
      </Panel>
      <Panel>
        <Heading>Research brief and verification</Heading>
        <View style={{ gap: 8 }}>
          <Action secondary icon={BookOpen} onPress={() => router.push('/deep-research')}>Research brief and findings</Action>
          <Action secondary icon={FileSearch} onPress={() => router.push('/deep-research')}>Evidence quality and source audit</Action>
          <Action secondary icon={Search} onPress={() => router.push('/deep-research')}>Editorial angles and verification checklist</Action>
          <Txt muted>These sections are available in the Deep Research dossier after a run.</Txt>
        </View>
      </Panel>
      <Panel>
        <Heading>Additional research tools</Heading>
        <Action secondary icon={Search} onPress={() => router.push('/browser')}>DeepSearch and research browser</Action>
        <Action secondary icon={TrendingUp} onPress={() => router.push('/trend-intelligence')}>Trend Intelligence</Action>
        <Action secondary icon={Activity} onPress={() => router.push('/search-demand')}>Search demand and attention signals</Action>
      </Panel>
      <Panel>
        <Heading>Recent research and saved results</Heading>
        <Action secondary icon={Activity} onPress={() => router.push('/research-activity')}>Recent research activity</Action>
        <Action secondary icon={BookOpen} onPress={() => router.push('/opportunities')}>Ideas and saved results</Action>
        <Action secondary icon={Compass} onPress={() => router.push('/')}>Dashboard and featured idea</Action>
      </Panel>
    </Page>
  );
}
