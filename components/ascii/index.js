import { OrbitControls, useAspect } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ASCIIEffect } from 'components/ascii-effect/index'
import { AsciiContext } from './context'
import s from './ascii.module.scss'

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

  return (
    <EffectComposer>
      <ASCIIEffect
        granularity={8 * viewport.dpr}
        charactersLimit={16}
        fillPixels={false}
        color="#ffffff"
        fit={true}
        greyscale={false}
        invert={false}
        matrix={false}
        time={0}
        background="#cd9bff"
      />
    </EffectComposer>
  )
}

export function ASCII() {
  const [canvas, setCanvas] = useState()

  function set({ canvas }) {
    if (canvas) setCanvas(canvas)
  }

  return (
    <AsciiContext.Provider value={{ set }}>
      <div className={s.ascii}>
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
          <Scene />
          <Postprocessing />
        </Canvas>
      </div>
    </AsciiContext.Provider>
  )
}
