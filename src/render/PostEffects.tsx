import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useLabStore } from '../state/labStore';

export function PostEffects() {
  const quality = useLabStore((s) => s.graphics.quality);
  const bloom = useLabStore((s) => s.graphics.bloom);

  if (!bloom || quality === 'low') return null;

  return (
    <EffectComposer multisampling={quality === 'high' ? 2 : 0} enableNormalPass={false}>
      <Bloom
        mipmapBlur
        levels={3}
        luminanceThreshold={1.08}
        luminanceSmoothing={0.22}
        intensity={0.34}
      />
    </EffectComposer>
  );
}
