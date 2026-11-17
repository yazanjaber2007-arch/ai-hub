/* Lightweight bloom: scene -> bright-pass (half res) -> separable blur, plus a wider quarter-res blur,
   then a composite pass with a hint of chromatic aberration, scanlines, soft tone-mapping and dither.
   Far cheaper than a full UnrealBloomPass, and all of it can be switched off by the quality manager. */
import {
  WebGLRenderTarget, HalfFloatType, UnsignedByteType, LinearFilter, RGBAFormat, Scene, OrthographicCamera, Mesh, BufferGeometry,
  Float32BufferAttribute, ShaderMaterial, Vector2,
} from "three";
import { FULLSCREEN_VERT, PREFILTER_FRAG, BLUR_FRAG, COMPOSITE_FRAG } from "./shaders.js";

export function createPost(renderer, msaa = 4) {
  const hasFloat = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
  const type = hasFloat ? HalfFloatType : UnsignedByteType;

  const tri = new BufferGeometry();
  tri.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new Mesh(tri); quad.frustumCulled = false;
  const qs = new Scene(); qs.add(quad);
  const qc = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const mk = (frag, uniforms) => new ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mPre = mk(PREFILTER_FRAG, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uThreshold: { value: 0.3 }, uKnee: { value: 0.55 } });
  const mBlur = mk(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new Vector2() } });
  const mComp = mk(COMPOSITE_FRAG, {
    tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, uBloomA: { value: 0.9 }, uBloomB: { value: 0.8 },
    uTime: { value: 0 }, uExposure: { value: 1.15 }, uAberration: { value: 0.006 }, uScan: { value: 0.06 }, uGrain: { value: 0.018 }, uRes: { value: new Vector2(1, 1) },
  });

  let rtScene = null, rtA, rtB, rtC, rtD, size = [1, 1], samples = msaa;
  const plain = () => ({ type, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, generateMipmaps: false });

  function build(w, h) {
    [rtScene, rtA, rtB, rtC, rtD].forEach(r => r && r.dispose());
    size = [w, h];
    rtScene = new WebGLRenderTarget(w, h, { ...plain(), depthBuffer: true, samples });
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    rtA = new WebGLRenderTarget(hw, hh, plain()); rtB = new WebGLRenderTarget(hw, hh, plain());
    rtC = new WebGLRenderTarget(qw, qh, plain()); rtD = new WebGLRenderTarget(qw, qh, plain());
    mComp.uniforms.uRes.value.set(w, h);
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qs, qc); }
  function blur(src, tmp, radius) {
    mBlur.uniforms.tSrc.value = src.texture; mBlur.uniforms.uDir.value.set(radius / src.width, 0); pass(mBlur, tmp);
    mBlur.uniforms.tSrc.value = tmp.texture; mBlur.uniforms.uDir.value.set(0, radius / src.height); pass(mBlur, src);
  }

  return {
    hasFloat,
    resize(w, h) { build(Math.max(2, w | 0), Math.max(2, h | 0)); },
    setSamples(n) { if (n !== samples) { samples = n; if (rtScene) build(size[0], size[1]); } },
    render(scene, camera, p) {
      renderer.autoClear = false;
      renderer.setRenderTarget(rtScene); renderer.clear(true, true, false); renderer.render(scene, camera);
      const bloom = p.bloom;
      if (bloom) {
        mPre.uniforms.tSrc.value = rtScene.texture; mPre.uniforms.uTexel.value.set(1 / rtScene.width, 1 / rtScene.height); pass(mPre, rtA);
        blur(rtA, rtB, 1.25);
        mBlur.uniforms.tSrc.value = rtA.texture; mBlur.uniforms.uDir.value.set(0, 0); pass(mBlur, rtC);   // bilinear downsample
        blur(rtC, rtD, 1.6);
      }
      const u = mComp.uniforms;
      u.tScene.value = rtScene.texture; u.tBloomA.value = bloom ? rtA.texture : rtScene.texture; u.tBloomB.value = bloom ? rtC.texture : rtScene.texture;
      u.uBloomA.value = bloom ? p.bloomA : 0; u.uBloomB.value = bloom ? p.bloomB : 0; u.uTime.value = p.time; u.uExposure.value = p.exposure;
      u.uAberration.value = p.aberration; u.uScan.value = p.scan; u.uGrain.value = p.grain;
      pass(mComp, null);
    },
    dispose() { [rtScene, rtA, rtB, rtC, rtD].forEach(r => r && r.dispose()); [mPre, mBlur, mComp].forEach(m => m.dispose()); tri.dispose(); },
  };
}
