import { OrbitControls, useAspect, useContextBridge } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import { ASCIIEffect } from 'components/ascii-effect/index';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimationMixer,
  Group,
  MeshBasicMaterial,
  MeshNormalMaterial,
  TextureLoader,
  VideoTexture,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import s from './ascii.module.scss';
import { AsciiContext } from './context';

const DEFAULT = {
  characters: ' *,    ./O#RL',
  granularity: 8,
  charactersLimit: 16,
  fontSize: 72,
  fillPixels: false,
  setColor: true,
  color: '#ffffff',
  background: '#cd9bff',
  greyscale: false,
  invert: false,
  matrix: false,
  setTime: false,
  time: 0,
  fit: true,
};

function Scene() {
  const ref = useRef();

  const [asset, setAsset] = useState('/global.glb');

  const gltfLoader = useMemo(() => {
    const loader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.140.0/examples/js/libs/draco/'
    );
    loader.setDRACOLoader(dracoLoader);

    return loader;
  }, []);

  const [mixer, setMixer] = useState();

  useFrame((_, t) => {
    mixer?.update(t);
  });

  const gltf = useMemo(() => {
    if (!asset) return;
    let src = asset;

    if (
      src.startsWith('data:application/octet-stream;base64') ||
      src.includes('.glb')
    ) {
      const group = new Group();

      gltfLoader.load(src, ({ scene, animations }) => {
        const mixer = new AnimationMixer(scene);
        setMixer(mixer);
        const clips = animations;

        clips.forEach((clip) => {
          mixer.clipAction(clip).play();
        });

        group.add(scene);
        scene.traverse((mesh) => {
          if (
            Object.keys(mesh.userData)
              .map((v) => v.toLowerCase())
              .includes('occlude')
          ) {
            mesh.material = new MeshBasicMaterial({ color: '#000000' });
          } else {
            mesh.material = new MeshNormalMaterial();
          }
        });
      });

      return group;
    }
  }, [asset]);

  const [texture, setTexture] = useState();

  useEffect(() => {
    if (gltf) setTexture(null);
  }, [gltf]);

  useEffect(() => {
    let src = asset;

    if (
      src.startsWith('data:video') ||
      src.includes('.mp4') ||
      src.includes('.webm') ||
      src.includes('.mov')
    ) {
      const video = document.createElement('video');

      function onLoad() {
        setTexture(new VideoTexture(video));
      }

      video.addEventListener('loadedmetadata', onLoad, { once: true });

      video.src = src;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.autoplay = true;
      video.play();
    } else if (
      src.startsWith('data:image') ||
      src.includes('.jpg') ||
      src.includes('.png') ||
      src.includes('.jpeg')
    ) {
      new TextureLoader().load(src, (texture) => {
        setTexture(texture);
      });
    }
  }, [asset]);

  const { viewport, camera } = useThree();

  const dimensions = useMemo(() => {
    if (!texture) return;
    if (texture.isVideoTexture) {
      return [texture.image.videoWidth, texture.image.videoHeight];
    } else {
      return [texture.image.naturalWidth, texture.image.naturalHeight];
    }
  }, [texture]);

  const scale = useAspect(
    dimensions?.[0] || viewport.width, // Pixel-width
    dimensions?.[1] || viewport.height, // Pixel-height
    1 // Optional scaling factor
  );

  const { fit } = useContext(AsciiContext);

  useEffect(() => {
    if (texture) {
      camera.position.set(0, 0, 5);
      camera.rotation.set(0, 0, 0);
      camera.zoom = 1;
    } else {
      camera.position.set(500, 250, 500);
    }

    camera.updateProjectionMatrix();
  }, [camera, texture]);

  return (
    <>
      <group ref={ref}>
        {gltf && (
          <>
            <OrbitControls makeDefault />
            <group scale={200}>
              <primitive object={gltf} />
            </group>
          </>
        )}

        {texture && (
          <mesh scale={fit ? scale : [viewport.width, viewport.height, 1]}>
            <planeBufferGeometry />
            <meshBasicMaterial map={texture} />
          </mesh>
        )}
      </group>
    </>
  );
}

function Postprocessing() {
  const { gl, viewport } = useThree();
  const { set } = useContext(AsciiContext);

  useEffect(() => {
    set({ canvas: gl.domElement });
  }, [gl]);

  const {
    charactersTexture,
    granularity,
    charactersLimit,
    fillPixels,
    color,
    greyscale,
    invert,
    matrix,
    time,
    background,
  } = useContext(AsciiContext);

  return (
    <EffectComposer>
      <ASCIIEffect
        charactersTexture={charactersTexture}
        granularity={granularity * viewport.dpr}
        charactersLimit={charactersLimit}
        fillPixels={fillPixels}
        color={color}
        fit={DEFAULT.fit}
        greyscale={greyscale}
        invert={invert}
        matrix={matrix}
        time={time}
        background={background}
      />
    </EffectComposer>
  );
}

function Inner() {
  const ContextBridge = useContextBridge(AsciiContext);

  return (
    <>
      <div className={s.ascii}>
        <div className={s.canvas}>
          <Canvas
            flat
            linear
            orthographic
            camera={{ position: [0, 0, 500], near: 0.1, far: 10000 }}
            resize={{ debounce: 100 }}
            gl={{
              antialias: false,
              alpha: true,
              depth: false,
              stencil: false,
              powerPreference: 'high-performance',
            }}
          >
            <ContextBridge>
              <Scene />
              <Postprocessing />
            </ContextBridge>
          </Canvas>
        </div>
      </div>
    </>
  );
}

export function ASCII() {
  const [charactersTexture, setCharactersTexture] = useState(null);
  const [canvas, setCanvas] = useState(DEFAULT);

  function set({ charactersTexture, canvas, ...props }) {
    if (charactersTexture) setCharactersTexture(charactersTexture);
    if (canvas) setCanvas(canvas);
    Object.assign(DEFAULT, props);
  }

  return (
    <AsciiContext.Provider
      value={{
        characters: DEFAULT.characters.toUpperCase(),
        granularity: DEFAULT.granularity,
        charactersTexture,
        charactersLimit: DEFAULT.charactersLimit,
        fontSize: DEFAULT.fontSize,
        fillPixels: DEFAULT.fillPixels,
        color: DEFAULT.setColor ? DEFAULT.color : undefined,
        fit: DEFAULT.fit,
        greyscale: DEFAULT.greyscale,
        invert: DEFAULT.invert,
        matrix: DEFAULT.matrix,
        time: DEFAULT.setTime ? DEFAULT.time : undefined,
        background: DEFAULT.background,
        set,
      }}
    >
      <Inner />
    </AsciiContext.Provider>
  );
}
