import { OrbitControls, useAspect, useContextBridge } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import cn from 'clsx'
import { ASCIIEffect } from 'components/ascii-effect/index'
import tunnel from 'tunnel-rat'
import s from './ascii.module.scss'
import { AsciiContext } from './context'
import {
  AnimationMixer,
  Group,
  MeshBasicMaterial,
  MeshNormalMaterial,
  TextureLoader,
  VideoTexture,
} from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'

const ui = tunnel()

function Scene() {
  const ref = useRef()

  const [asset, setAsset] = useState('/global.glb')

  const gltfLoader = useMemo(() => {
    const loader = new GLTFLoader()

    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.140.0/examples/js/libs/draco/'
    )
    loader.setDRACOLoader(dracoLoader)

    return loader
  }, [])

  const [mixer, setMixer] = useState()

  useFrame((_, t) => {
    mixer?.update(t)
  })

  const gltf = useMemo(() => {
    if (!asset) return
    let src = asset

    if (
      src.startsWith('data:application/octet-stream;base64') ||
      src.includes('.glb')
    ) {
      const group = new Group()

      gltfLoader.load(src, ({ scene, animations }) => {
        const mixer = new AnimationMixer(scene)
        setMixer(mixer)
        const clips = animations

        clips.forEach((clip) => {
          mixer.clipAction(clip).play()
        })

        group.add(scene)
        scene.traverse((mesh) => {
          if (
            Object.keys(mesh.userData)
              .map((v) => v.toLowerCase())
              .includes('occlude')
          ) {
            mesh.material = new MeshBasicMaterial({ color: '#000000' })
          } else {
            mesh.material = new MeshNormalMaterial()
          }
        })
      })

      return group
    }
  }, [asset])

  const [texture, setTexture] = useState()

  useEffect(() => {
    if (gltf) setTexture(null)
  }, [gltf])

  useEffect(() => {
    let src = asset

    if (
      src.startsWith('data:video') ||
      src.includes('.mp4') ||
      src.includes('.webm') ||
      src.includes('.mov')
    ) {
      const video = document.createElement('video')

      function onLoad() {
        setTexture(new VideoTexture(video))
      }

      video.addEventListener('loadedmetadata', onLoad, { once: true })

      video.src = src
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.playsInline = true
      video.loop = true
      video.autoplay = true
      video.play()
    } else if (
      src.startsWith('data:image') ||
      src.includes('.jpg') ||
      src.includes('.png') ||
      src.includes('.jpeg')
    ) {
      new TextureLoader().load(src, (texture) => {
        setTexture(texture)
      })
    }
  }, [asset])

  const { viewport, camera } = useThree()

  const dimensions = useMemo(() => {
    if (!texture) return
    if (texture.isVideoTexture) {
      return [texture.image.videoWidth, texture.image.videoHeight]
    } else {
      return [texture.image.naturalWidth, texture.image.naturalHeight]
    }
  }, [texture])

  const scale = useAspect(
    dimensions?.[0] || viewport.width, // Pixel-width
    dimensions?.[1] || viewport.height, // Pixel-height
    1 // Optional scaling factor
  )

  const { fit } = useContext(AsciiContext)

  const [drag, setDrag] = useState(false)
  const dropzone = useRef()

  useEffect(() => {
    function onDragEnter(e) {
      setDrag(true)
    }

    function onDragLeave(e) {
      if (e.srcElement !== dropzone.current) return
      setDrag(false)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)

    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
    }
  }, [])

  useEffect(() => {
    if (texture) {
      camera.position.set(0, 0, 5)
      camera.rotation.set(0, 0, 0)
      camera.zoom = 1
    } else {
      camera.position.set(500, 250, 500)
    }

    camera.updateProjectionMatrix()
  }, [camera, texture])

  return (
    <>
      <ui.In>
        {drag && (
          <div
            ref={dropzone}
            className={s.dropzone}
            onDrop={(e) => {
              e.preventDefault()

              setDrag(false)

              const filename = e.dataTransfer.files[0].name
              const isFont =
                filename.endsWith('.ttf') ||
                filename.endsWith('.otf') ||
                filename.endsWith('.woff') ||
                filename.endsWith('.woff2')

              const reader = new FileReader()
              reader.addEventListener(
                'load',
                async function (event) {
                  if (isFont) {
                    const fontData = event.target.result
                    const fontName = 'CustomFont' // Choose a name for your custom font

                    const fontFace = `
                    @font-face {
                      font-family: '${fontName}';
                      src: url(${fontData});
                    }
                  `

                    const styleElement = document.createElement('style')
                    styleElement.innerHTML = fontFace

                    document.head.appendChild(styleElement)
                  } else {
                    setAsset(reader.result)
                  }
                },
                false
              )

              if (e.dataTransfer.files[0]) {
                reader.readAsDataURL(e.dataTransfer.files[0])
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
            }}
          />
        )}
      </ui.In>

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
  )
}

function Postprocessing() {
  const { gl, viewport } = useThree()
  const { set } = useContext(AsciiContext)

  useEffect(() => {
    set({ canvas: gl.domElement })
  }, [gl])

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
  } = useContext(AsciiContext)

  return (
    <EffectComposer>
      <ASCIIEffect
        charactersTexture={charactersTexture}
        granularity={granularity * viewport.dpr}
        charactersLimit={charactersLimit}
        fillPixels={fillPixels}
        color={color}
        fit={fit}
        greyscale={greyscale}
        invert={invert}
        matrix={matrix}
        time={time}
        background={background}
      />
    </EffectComposer>
  )
}

function Inner() {
  const ContextBridge = useContextBridge(AsciiContext)

  return (
    <>
      <div className={s.ascii}>
        <div className={cn(s.canvas)}>
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
      <ui.Out />
    </>
  )
}

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
}

export function ASCII({ children }) {
  const initialUrlParams = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  )

  const [charactersTexture, setCharactersTexture] = useState(null)
  const [canvas, setCanvas] = useState()

  const [settings, setSettings] = useState({
    characters: initialUrlParams.get('characters') || DEFAULT.characters,
    granularity: initialUrlParams.get('granularity') || DEFAULT.granularity,
    charactersLimit:
      initialUrlParams.get('charactersLimit') || DEFAULT.charactersLimit,
    fontSize: initialUrlParams.get('fontSize') || DEFAULT.fontSize,
    fillPixels:
      initialUrlParams.get('fillPixels') === 'true' || DEFAULT.fillPixels,
    setColor: !!initialUrlParams.get('color') || DEFAULT.setColor,
    color: initialUrlParams.get('color')
      ? '#' + initialUrlParams.get('color')
      : DEFAULT.color,
    fit: initialUrlParams.get('fit') || DEFAULT.fit,
    greyscale:
      initialUrlParams.get('greyscale') === 'true' || DEFAULT.greyscale,
    invert: initialUrlParams.get('invert') === 'true' || DEFAULT.invert,
    matrix: initialUrlParams.get('matrix') === 'true' || DEFAULT.matrix,
    setTime: !!initialUrlParams.get('time') || DEFAULT.setTime,
    time: parseFloat(initialUrlParams.get('time')) || DEFAULT.time,
    background: initialUrlParams.get('background')
      ? '#' + initialUrlParams.get('background')
      : DEFAULT.background,
  })

  const updateUrlParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('characters', settings.characters)
    params.set('granularity', settings.granularity)
    params.set('charactersLimit', settings.charactersLimit)
    params.set('fontSize', settings.fontSize)
    params.set('matrix', settings.matrix === true)
    params.set('invert', settings.invert === true)
    params.set('greyscale', settings.greyscale === true)
    params.set('fillPixels', settings.fillPixels === true)
    if (settings.setTime) {
      params.set('time', settings.time)
    } else {
      params.delete('time')
    }
    if (settings.setColor) {
      params.set('color', settings.color.replace('#', ''))
    } else {
      params.delete('color')
    }
    params.set('background', settings.background.replace('#', ''))
    return params
  }, [settings])

  useEffect(() => {
    const url = window.origin + '?' + updateUrlParams.toString()
    window.history.replaceState({}, null, url)
  }, [updateUrlParams])

  function set(newSettings) {
    setSettings((prevSettings) => ({ ...prevSettings, ...newSettings }))
    if (newSettings.charactersTexture) setCharactersTexture(newSettings.charactersTexture)
    if (newSettings.canvas) setCanvas(newSettings.canvas)
  }

  return (
    <AsciiContext.Provider
      value={{
        characters: settings.characters.toUpperCase(),
        granularity: settings.granularity,
        charactersTexture,
        charactersLimit: settings.charactersLimit,
        fontSize: settings.fontSize,
        fillPixels: settings.fillPixels,
        color: settings.setColor ? settings.color : undefined,
        fit: settings.fit,
        greyscale: settings.greyscale,
        invert: settings.invert,
        matrix: settings.matrix,
        time: settings.setTime ? settings.time : undefined,
        background: settings.background,
        set,
      }}
    >
      <Inner />
    </AsciiContext.Provider>
  )
}
