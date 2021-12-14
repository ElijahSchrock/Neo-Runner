import * as THREE from 'three';
import { Game } from './game.js';

window.onload = () => {

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  const renderer = new THREE.WebGL1Renderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  document.body.appendChild(renderer.domElement);

  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 3.0);
  light.position.set(0, 1, 0);
  scene.add(light)

  const gameInstance = new Game(scene, camera);

  function animate() {
    requestAnimationFrame(animate);
    gameInstance.update();
    renderer.render(scene, camera);  
  }
  animate();
}
