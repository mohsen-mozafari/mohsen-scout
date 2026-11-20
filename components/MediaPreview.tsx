import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { palette as p } from '@/lib/theme';

type Props = {
  uri?: string | null;
  aspectRatio?: number;
  viewer?: boolean;
  onPress?: () => void;
  alt?: string;
  placeholder?: string;
};

function validImageUri(uri?: string | null): uri is string {
  if (!uri) return false;
  try {
    return new URL(uri).protocol === 'https:';
  } catch {
    return false;
  }
}

export function MediaPreview({
  uri,
  aspectRatio = 16 / 9,
  viewer = false,
  onPress,
  alt = 'Media preview',
  placeholder = 'Preview unavailable',
}: Props) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;
  const imageHeight = containerWidth > 0
    ? Math.min(320, Math.max(150, Math.round(containerWidth / safeAspectRatio)))
    : 200;
  const safeUri = validImageUri(uri) && !failed ? uri : undefined;
  const usable = Boolean(safeUri);
  const press = onPress ?? (viewer ? () => setOpen(true) : undefined);

  return (
    <View
      style={{ width: '100%' }}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setContainerWidth((current) => Math.abs(current - width) < 1 ? current : width);
      }}
    >
      {usable ? (
        press ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={alt}
            onPress={press}
            style={{ width: '100%', overflow: 'hidden', borderRadius: 14 }}
          >
            <Image
              source={{ uri: safeUri }}
              resizeMode="cover"
              onError={() => setFailed(true)}
              style={{ width: '100%', height: imageHeight, backgroundColor: p.surfaceAlt }}
            />
          </Pressable>
        ) : (
          <Image
            source={{ uri: safeUri }}
            resizeMode="cover"
            onError={() => setFailed(true)}
            style={{ width: '100%', height: imageHeight, borderRadius: 14, backgroundColor: p.surfaceAlt }}
          />
        )
      ) : (
        <View
          style={{
            width: '100%',
            aspectRatio,
            borderRadius: 14,
            backgroundColor: p.surfaceAlt,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
          }}
        >
          <Text style={{ color: p.muted, fontSize: 12 }}>{placeholder}</Text>
        </View>
      )}
      {viewer && usable && (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: p.overlay,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close image preview"
              onPress={() => setOpen(false)}
              style={{
                position: 'absolute',
                top: 48,
                right: 20,
                zIndex: 2,
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: p.raised,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={22} color={p.text} />
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={{ width: '100%', height: '78%', justifyContent: 'center' }}>
              <Image
                source={{ uri: safeUri }}
                resizeMode="contain"
                onError={() => setFailed(true)}
                style={{ width: '100%', height: '100%', minHeight: 240 }}
              />
            </Pressable>
            <Text style={{ color: p.muted, fontSize: 12, marginTop: 12 }}>{alt}</Text>
          </View>
        </Modal>
      )}
    </View>
  );
}
