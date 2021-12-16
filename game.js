import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export class Game {

    OBSTACLE_PREFAB =  new THREE.BoxBufferGeometry(1, 1, 1);
    OBSTACLE_MATERIAL = new THREE.MeshBasicMaterial({color: 0xccdeee});
    BONUS_PREFAB = new THREE.SphereBufferGeometry(1, 12, 12);
    COLLISION_THRESHOLD = 0.5;

    constructor(scene, camera){
        this.running = false
        //DOM elements
        this.divDistance = document.getElementById('distance');
        this.divHealth = document.getElementById('health');
        this.divScore = document.getElementById('score');

        this.divGameOverScreen = document.getElementById('game-over-screen');
        this.divGameOverScore = document.getElementById('game-over-score');
        this.divGameOverDistance = document.getElementById('game-over-distance');

        this.divPauseScreen = document.getElementById('pause-screen');
        this.divPauseScore = document.getElementById('pause-score');
        this.divPauseDistance = document.getElementById('pause-distance');

        document.getElementById('start-button').onclick = () => {
            this.running = true;
            document.getElementById('intro-screen').style.display = 'none';
        }
        document.getElementById('replay-game-button').onclick = () => {
            this.running = true;
            this.divGameOverScreen.style.display = 'none';
        }
        document.getElementById('end-pause-button').onclick = () => {
            this.running = true;
            this.clock.start;
            this.objectsParent.position.z
            this.divPauseScreen.style.display = 'none';
        }
        this.scene = scene;
        this.camera = camera;
        this.reset(false);

        //bind event calls
        document.addEventListener('keydown', this.keyDown.bind(this));
        document.addEventListener('keyup', this.keyUp.bind(this));        
    }

    reset(replay) {
        //init variables
        this.speedZ = 20;
        this.speedX = 0; //0 = straight, -1 = left, 1 = right
        this.translateX = 0;
        this.gameTime = 0;
        this.clock = new THREE.Clock();
        this.health = 50;
        this.score = 0;
        //init DOMS with start values
        this.divScore.innerText = this.score;
        this.divHealth.value = this.health;
        this.divDistance.innerText = 0;
        //prepare 3D scene
        this.initScene(this.scene, this.camera, replay);
    }

    createGrid(scene) {
        
        let divisions = 30;
        let gridLimit = 200;
        this.grid = new THREE.GridHelper(gridLimit * 2, divisions, 0xccddee, 0xccddee);

        const moveableX = [];
        const moveableZ = [];
        for (let i = 0; i <= divisions; i++) {
        moveableX.push(0, 0, 1, 1);
        moveableZ.push(1, 1, 0, 0); // move horizontal lines only (1 - point is moveable)
        }
        this.grid.geometry.setAttribute('moveableX', new THREE.BufferAttribute(new Uint8Array(moveableX), 1));
        this.grid.geometry.setAttribute('moveableZ', new THREE.BufferAttribute(new Uint8Array(moveableZ), 1));

        this.grid.material = new THREE.ShaderMaterial({
        uniforms: {
            speedZ: {
                value: this.speedZ
            },
            translateX: {
                value: this.translateX
            },
            gridLimits: {
                value: new THREE.Vector2(-gridLimit, gridLimit)
            },
            time: {
                value: 0
            }
        },
        vertexShader: `
            uniform float time;
            uniform vec2 gridLimits;
            uniform float speedZ;
            uniform float translateX;
            
            attribute float moveableZ;
            attribute float moveableX;
            
            varying vec3 vColor;
        
            void main() {
            vColor = color;
            float limLen = gridLimits.y - gridLimits.x;
            vec3 pos = position;
            if (floor(moveableX + 0.5) > 0.5) {
                float xDist = translateX;
                float curXPos = mod((pos.x + xDist) - gridLimits.x, limLen) + gridLimits.x;
                pos.x = curXPos;
            }
            if (floor(moveableZ + 0.5) > 0.5) {
                float zDist = speedZ * time;
                float curZPos = mod((pos.z + zDist) - gridLimits.x, limLen) + gridLimits.x;
                pos.z = curZPos;
            }
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
        
            void main() {
            gl_FragColor = vec4(vColor, 1.);
            }
        `,
        vertexColors: THREE.VertexColors
        });

        scene.add(this.grid);

    }

    updateGrid() {
        //will update the grid to move backwards to seem like were moving forward in the world
        this.grid.material.uniforms.time.value = this.gameTime;
        this.objectsParent.position.z = this.speedZ * this.gameTime;

        this.grid.material.uniforms.translateX.value = this.translateX;
        this.objectsParent.position.x = this.translateX;

        this.objectsParent.traverse((child) => {
            if(child instanceof THREE.Mesh) {
                //checks if object is higher value than our z = 0 and resets if it needs to
                //z-position in world space
                const childZPos = child.position.z + this.objectsParent.position.z; //getting objects world position
                if(childZPos > 0){
                    //resets object
                    const params = [child, -this.translateX, -this.objectsParent.position.z]
                    if(child.userData.type === 'obstacle'){
                        this.setupObstacle(...params);
                    }
                    else {
                        const price = this.setupBonus(...params);
                        child.userData.price = price;
                    }
                }
            }
        });
    }

    recondition() {
        //event handle
        if(!this.running)
            return
        //updating the game state
        this.translateX += this.speedX * -0.5;

        this.deltaSeconds();
        this.updateGrid();
        this.checkCollisions();
        this.updateUserUI();
    }

    deltaSeconds() {
        const deltaTime = this.clock.getDelta(); //increments time variable 
        this.gameTime += deltaTime
        if ( this.mixer ) {
            this.mixer.update(deltaTime);
        }
    }

    keyDown(event) {
        //move object by checking key press
        let newSpeedX;
        switch (event.key) {
            case 'ArrowLeft':
                newSpeedX = -1
                break;
            case 'ArrowRight':
                newSpeedX = 1
                break;
            case 'ArrowUp':
                this.running = false;
                this.clock.running = false;
                 //show Paused UI
                 this.divPauseScreen.style.display = 'grid';
                 this.divPauseScore.innerText = this.score;
                 this.divPauseDistance.innerText = this.objectsParent.position.z.toFixed(0);
                 break
            case 'ArrowDown':
                this.running = true;
                this.clock.start;
                this.objectsParent.position.z
                this.divPauseScreen.style.display = 'none';
            default:
                return;
        }
        this.speedX = newSpeedX;
    }

    keyUp() {
        //reset object to idle 
        this.speedX = 0;
    }

    checkCollisions(){
        //this will be collision logic
        this.objectsParent.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                const childZPos = child.position.z + this.objectsParent.position.z;

                //threshold distances
                const thresholdX = this.COLLISION_THRESHOLD + child.scale.x / 2; // This distance is half the size of the Mesh + collision offset defined above
                const thresholdZ = this.COLLISION_THRESHOLD + child.scale.z / 2; 
                
                //checks for collision
                if (
                    childZPos > -thresholdZ && 
                    Math.abs(child.position.x + this.translateX) < thresholdX //Math.abs to always get a positive value & compare it to thresholdX
                ) {
                    //if collision reduce health
                    const params = [child, -this.translateX, -this.objectsParent.position.z];
                    if (child.userData.type === 'obstacle'){
                        this.health -= 10;
                        this.divHealth.value = this.health;
                        this.setupObstacle(...params);
                        if (this.health <= 0)
                            this.gameOver();
                    }
                    else {
                        //increase score
                        this.score += child.userData.price;
                        this.divScore.innerText = this.score;
                        child.userData.price = this.setupBonus(...params);
                    }
                }
            }
        })

        //checks power ups?
        //bonuses?
    }

    updateUserUI() {
        //this will update DOM elements to track and show
        //distance traveled
        this.divDistance.innerText = this.objectsParent.position.z.toFixed(0);
        //score?
        //current game state
        //lives?
    }

    gameOver() {
        //prepare end state
        this.running = false;
        //show UI
        this.divGameOverScore.innerText = this.score;
        this.divGameOverDistance.innerText = this.objectsParent.position.z.toFixed(0);
        setTimeout(() => {
            this.divGameOverScreen.style.display = 'grid';
            //reset variables 
            this.reset(true);
        //allows a 1 sec pause between game over and game over screen
        }, 1000)
    }

    createNeo(scene){
        //use this fucntion to load in model of runner
        const loader = new GLTFLoader();
            loader.load('/models/Neo.glb', (gltf) => {
                this.neo = gltf.scene;
                this.neo.scale.set(0.04, 0.04, 0.04);
                this.neo.position.x = 0;
                this.neo.position.y = 0;
                this.neo.position.z = 0;
                
                this.mixer = new THREE.AnimationMixer( this.neo );
                gltf.animations.forEach(( clip ) => {
                    this.mixer.clipAction(gltf.animations[1]).play();
                })
                this.scene.add(this.neo);
                
            }, function(xhr){ //function to give model loading progress
                console.log((xhr.loaded/xhr.total * 100) + '% loaded');
            }, function(error){
                console.log('An error occurred')
            })
    }

    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    }

    spawnObject() {
        const obj = new THREE.Mesh(
            this.OBSTACLE_PREFAB,
            this.OBSTACLE_MATERIAL
        );
        this.setupObstacle(obj);

        this.objectsParent.add(obj);
        obj.userData = { type: 'obstacle' };
    }

    setupObstacle(obj, refXpos = 0, refZpos = 0) {
        //random scale
        obj.scale.set(
            this.randomFloat(2, 3),
            this.randomFloat(2, 3),
            this.randomFloat(2, 3)
        );
        //random positioning
        obj.position.set(
            refXpos + this.randomFloat(-30, 30),
            obj.scale.y * 0.5,
            refZpos - 100 - this.randomFloat(0, 100)
        );
    }

    randomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    spawnBonus(){
        const obj = new THREE.Mesh(
            this.BONUS_PREFAB,
            new THREE.MeshBasicMaterial({color: 0x000000})
        );
        
        const price = this.setupBonus(obj);
        this.objectsParent.add(obj);

        obj.userData = {type: 'bonus', price};

    }

    setupBonus(obj, refXpos = 0, refZpos = 0) {
        const price = this.randomInt(5, 20);
        const ratio = price / 20;

        const size = ratio * 0.5;
        obj.scale.set(size, size, size);

        const hue = 0.5 + 0.5 * ratio;
        obj.material.color.setHSL(hue, 1, 0.5);

        obj.position.set(
            refXpos + this.randomFloat(-30, 30),
            obj.scale.y * 0.5,
            refZpos - 100 - this.randomFloat(0, 100)
        );

        return price;

    }

    initScene(scene, camera, replay) {
        // if (this.mixer) this.mixer.update(this.clock);
        
        if (!replay){
            //init 3D scene
            this.createNeo(scene);
            this.createGrid(scene);

            this.objectsParent = new THREE.Group();
            scene.add(this.objectsParent);

            //spawn 15 obstacles
            for (let i = 0; i < 50; i++)
                this.spawnObject();
            
            // spawn 15 Bonus Spheres
            for (let i = 0; i < 25; i++)
                this.spawnBonus();
            
            camera.rotateX(-20 * Math.PI / 180);
            camera.position.set(0, 1.5, 2);
        } else {
            this.objectsParent.traverse((child) => {
                if(child instanceof THREE.Mesh) {
                    //object insdide the anchor
                    if(child.userData.type === 'obstacle')
                        this.setupObstacle(child);
                    else
                        child.userData.price = this.setupBonus(child);
                }
                else {
                    //the anchor
                    child.position.set(0, 0, 0)
                }
            })
        }
    }
}