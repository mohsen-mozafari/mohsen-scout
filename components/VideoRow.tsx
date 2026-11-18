import { View, Text, Linking } from 'react-native';
import { router } from 'expo-router';
import { Button } from 'heroui-native';
import { ArrowUpRight, Bookmark } from 'lucide-react-native';
import { styles, Txt, Action, useOperation, SourceText } from './ScoutUI';
import { type Video } from '@/lib/types';
import { useScout } from '@/lib/store';
import { palette as p } from '@/lib/theme';
import { MediaPreview } from './MediaPreview';
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
            <MediaPreview uri={video.thumbnail} aspectRatio={16 / 9} alt={video.title} />
          )}
          <SourceText>{video.title}</SourceText>
          <Txt muted>
            {video.channel} · {new Date(video.publishedAt).toLocaleDateString('en-US')}
          </Txt>
          {(video.viewCount != null || video.likeCount != null) && (
            <Txt muted>{video.viewCount == null ? 'Views unavailable' : video.viewCount.toLocaleString() + ' views'} · {video.likeCount == null ? 'Likes unavailable' : video.likeCount.toLocaleString() + ' likes'}</Txt>
          )}
          <View style={styles.row}>
            <Text style={styles.badge}>YouTube</Text>
            <ArrowUpRight size={14} color={p.purple} />
          </View>
        </View>
      </Button>
      <Action secondary onPress={() => void Linking.openURL('https://www.youtube.com/watch?v=' + video.id).catch(() => {})}>
        Open on YouTube
      </Action>
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
