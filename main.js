import * as THREE from 'three';
import { Game } from './game.js';

window.onload = () => {

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const renderer = new THREE.WebGL1Renderer();
  // High-DPI phones otherwise render up to nine times as many pixels.
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1,
    window.matchMedia('(pointer: coarse)').matches ? 1 : 2);
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);

  document.body.appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 3.0);
  light.position.set(0, 1, 0);
  scene.add(light)

  const gameInstance = new Game(scene, camera);

  gameInstance.setupAudio();
  gameInstance.createMobile();

  window.addEventListener( 'resize', onWindowResize, false );

  function onWindowResize(){

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(pixelRatio());
    renderer.setSize( window.innerWidth, window.innerHeight );
}


  function animate() {
    requestAnimationFrame(animate);
    gameInstance.recondition();
    renderer.render(scene, camera);  
  }
  animate();
}
