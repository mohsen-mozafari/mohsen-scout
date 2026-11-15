import { Image, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { ArrowUpRight, Bookmark } from 'lucide-react-native';
import { styles, Txt, Action, useOperation } from './ScoutUI';
import { type Video } from '@/lib/types';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
export function VideoRow({ video, topic }: { video: Video; topic: string }) {
  const op = useOperation();
  const saved = useScout((s) => s.data.links.some((l) => l.id === video.id));
  return (
    <View style={[styles.rule, { gap: 12 }]}>
      <Button
        variant="tertiary"
        onPress={() => router.push({ pathname: '/detail', params: { video: video.id } })}
        className="h-auto items-start justify-start p-0"
      >
        <View style={{ flex: 1, gap: 8 }}>
          {Boolean(video.thumbnail) && (
            <Image
              source={{ uri: video.thumbnail }}
              resizeMode="cover"
              style={{ width: '100%', height: 180, borderRadius: 14 }}
            />
          )}
          <Text style={styles.heading}>{video.title}</Text>
          <Txt muted>
            {video.channel} · {new Date(video.publishedAt).toLocaleDateString('en-US')}
          </Txt>
          <View style={styles.row}>
            <Text style={styles.badge}>YouTube</Text>
            <ArrowUpRight size={14} color={p.purple} />
          </View>
        </View>
      </Button>
      <Action
        icon={Bookmark}
        secondary
        disabled={saved}
        busy={op.busy}
        onPress={() => void op.run(() => useScout.getState().saveVideo(video, topic))}
      >
        {saved ? 'Saved to library' : 'Save video'}
      </Action>
      {Boolean(op.error) && <Txt>{op.error}</Txt>}
    </View>
  );
}
