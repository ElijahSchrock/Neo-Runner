import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {Howl} from 'howler';

// Use bundled assets locally; optionally point to a public Spaces/CDN URL.
const assetBaseUrl = (import.meta.env.VITE_ASSET_BASE_URL || `${import.meta.env.BASE_URL}assets`).replace(/\/$/, '');
const assetUrl = (filename) => `${assetBaseUrl}/${filename}`;

export class Game {

    OBSTACLE_PREFAB =  new THREE.BoxBufferGeometry(1, 1, 1);
    OBSTACLE_MATERIAL = new THREE.MeshBasicMaterial({color: 0xccdeee});
    BONUS_PREFAB = new THREE.SphereBufferGeometry(1, 12, 12);
    HEALTH_PREFAB = new THREE.SphereBufferGeometry(1, 12 ,12);
    COLLISION_THRESHOLD = 0.6
    ;

    constructor(scene, camera){
        this.running = false
        //DOM elements
        this.divDistance = document.getElementById('distance');
        this.divHealth = document.getElementById('health');
        this.divScore = document.getElementById('score');

        this.divIntroScreen = document.getElementById('intro-screen');


        this.divProgressElement = document.getElementById('progressElement');

        this.divGameOverScreen = document.getElementById('game-over-screen');
        this.divGameOverScore = document.getElementById('game-over-score');
        this.divGameOverDistance = document.getElementById('game-over-distance');

        this.divPauseScreen = document.getElementById('pause-screen');
        this.divPauseScore = document.getElementById('pause-score');
        this.divPauseDistance = document.getElementById('pause-distance');

        this.divInstructScreen = document.getElementById('instructions');
        this.divBackToPlay = document.getElementById('back-to-start-button');

        this.divLeftBtn = document.getElementById('left-button');
        // this.divRightBtn = document.getElementById('right-button');

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
        document.getElementById('instruct-button').onclick = () => {
            this.divIntroScreen.style.display = 'none';
            this.divInstructScreen.style.display = 'grid';
        }
        document.getElementById('back-to-start-button').onclick = () => {
            this.divInstructScreen.style.display = 'none';
            this.divIntroScreen.style.display = 'grid';
        }
        document.getElementById('new-player-button').onclick = () => {
            this.divGameOverScreen.style.display = 'none';
            this.divIntroScreen.style.display = 'grid';
            this.divInstructScreen.style.display = 'none';
        }
        // document.getElementsByClassName('mute-background-music').onclick = () => {
        //     this.musicAudio.fade(.75, 0, 100, musicId);
        // }
        // document.getElementsByClassName('play-background-music').onclick = () => {
        //     this.musicAudio.fade(0, 0.2, 5000, musicId);
        // }

        this.scene = scene;
        this.camera = camera;
        this.reset(false);
        this.getLeaderBoard();

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

    setupAudio() {
        //background audio
        this.musicAudio = new Howl ({
            src: [assetUrl('background-music.mp3')],
            autoplay: true,
            loop: true,
            volume: 0.07,
            id: 'background'
        });
        // const musicId = this.musicAudio.play();
        //     this.musicAudio.fade(0, 0.2, 5000, musicId)
        //crash audio
        this.crashAudio = new Howl ({
            src: [assetUrl('obst-hit-option2.wav')],
            volume: .3
        });
        //bonus audio
        this.bonusAudio = new Howl ({
            src: [assetUrl('bonus-7.wav')],
            volume: 0.2
        });
        //health bonus audio
        this.healthBonusAudio = new Howl ({
            src: [assetUrl('health-bonus.wav')],
            volume: .6
        });
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
        //increases game speed as game goes on
        this.speedZ += 0.002;
        this.grid.material.uniforms.speedZ.value = this.speedZ;
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
                    } else if (child.userData.type === 'health'){
                        this.setupHealth(...params);
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
        this.newSpeedX;
        switch (event.key) {
            case 'ArrowLeft':
                this.newSpeedX = -1
                break;
            case 'ArrowRight':
                this.newSpeedX = 1
                break;
            case 'ArrowUp':
                if(this.running === true){
                    this.running = false;
                    this.clock.running = false;
                        //show Paused UI
                    this.divPauseScreen.style.display = 'grid';
                    this.divPauseScore.innerText = this.score;
                    this.divPauseDistance.innerText = this.objectsParent.position.z.toFixed(0);
                }
                 break;
            case 'ArrowDown':
                if(this.running === false && this.divPauseScreen.style.display === 'grid'){
                    this.running = true;
                    this.clock.start;
                    this.objectsParent.position.z
                    this.divPauseScreen.style.display = 'none';
                }
            default:
                return;
        }
        this.speedX = this.newSpeedX;
    }

    keyUp() {
        //reset object to idle
        this.speedX = 0;

        document.addEventListener('keyup', function(event){
            if (event.key === 'Enter') {
                event.preventDefault();
                document.getElementById('start-button').onclick();
                document.getElementById('replay-game-button').onclick();
                document.getElementById('end-pause-button').onclick();
            }
        })

    }
 
    mobileLeft() {
        this.mobileSpeedX;
        this.mobileSpeedX = -1
        this.speedX = this.mobileSpeedX
        console.log('left')
    }

    mobileRight() {
        this.mobileSpeedX;
        this.mobileSpeedX = 1
        this.speedX = this.mobileSpeedX
        console.log('right')
    }

    mobileIdle() {
        this.speedX = 0
    }

    createMobile() {     
        this.leftBtn = document.createElement('button');
        this.leftBtn.id = 'left-button';
        this.leftBtn.innerHTML = 'Left'
        document.body.appendChild(this.leftBtn);
        
        this.rightBtn = document.createElement('button');
        this.rightBtn.id = 'right-button';
        this.rightBtn.innerHTML = 'Right'
        document.body.appendChild(this.rightBtn);    

        this.mobilePause = document.createElement('button');
        this.mobilePause.id = 'mobilePause-button';
        this.mobilePause.innerHTML = 'Pause'
        document.body.appendChild(this.mobilePause);

        document.getElementById('left-button').ontouchstart = (event) => {
            this.mobileLeft();
            event.preventDefault();
        }
        document.getElementById('right-button').ontouchstart = (event) => {
            this.mobileRight();
            event.preventDefault();
        }
        document.getElementById('left-button').ontouchend = (event) => {
            this.mobileIdle();
            event.preventDefault();
        }
        document.getElementById('right-button').ontouchend = (event) => {
            this.mobileIdle();
            event.preventDefault();
        }
        document.getElementById('mobilePause-button').onclick = () => {
            if(this.running === true){
                this.running = false;
                this.clock.running = false;
                    //show Paused UI
                this.divPauseScreen.style.display = 'grid';
                this.divPauseScore.innerText = this.score;
                this.divPauseDistance.innerText = this.objectsParent.position.z.toFixed(0);
            }
        }
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
                        //health popup
                        this.createHealthPopup();
                        //play crash audio
                        if (this.crashAudio) {
                            this.crashAudio.play();
                        }
                        // reduce health if collision detected
                        this.health -= 10;
                        this.divHealth.value = this.health;
                        this.setupObstacle(...params); //... is spread operator to take the array of params on line 197
                        if (this.health <= 0) {
                            this.server();
                            this.gameOver();
                        }
                    } else if (child.userData.type === 'health'){
                        //health bonus audio
                        if (this.health < 50){
                            //increases health
                            this.newHealth = this.health += 10;
                            //health bonus popup
                            this.createHealthBonusPopup();                            
                            if (this.healthBonusAudio) {
                                this.healthBonusAudio.play();
                            }                        
                            //increases healthbar
                            this.divHealth.value = this.newHealth;
                            child.userData.health = this.setupHealth(...params);                            
                        }
                    }
                    else {
                        //score popup
                        this.createScorePopup(child.userData.price);
                        //play bonus audio
                        if (this.bonusAudio) {
                            this.bonusAudio.play();
                        }
                        //increase score
                        this.score += child.userData.price;
                        this.divScore.innerText = this.score;
                        child.userData.price = this.setupBonus(...params);
                    }
                }
            }
        })
    }

    createScorePopup(score) {
        const scorePopup = document.createElement('div');
        scorePopup.innerText = `+${score}`;
        scorePopup.className = 'score-popup';
        document.body.appendChild(scorePopup);
        setTimeout(() => {
            scorePopup.remove();
        }, 1000);
    }

    createHealthPopup(){
        const healthPopup = document.createElement('div');
        healthPopup.innerText = '-10'
        healthPopup.className = 'health-popup';
        document.body.appendChild(healthPopup);
        setTimeout(() => {
            healthPopup.remove();
        }, 1000);
    }

    createHealthBonusPopup(){
        const healthBonusPopup = document.createElement('div');
        healthBonusPopup.innerText = '+10'
        healthBonusPopup.className = 'health-bonus-popup';
        document.body.appendChild(healthBonusPopup);
        setTimeout(() => {
            healthBonusPopup.remove();
        }, 1000)
    }

    updateUserUI() {
        //this will update DOM elements to track and show
        //distance traveled
        this.divDistance.innerText = this.objectsParent.position.z.toFixed(0);
        //score?
        //current game state
    }

    gameOver() {
        //prepare end state
        this.running = false;
        //show UI
        this.divGameOverScore.innerText = this.score;
        this.divGameOverDistance.innerText = this.objectsParent.position.z.toFixed(0);

        // this.leaderBoard(score);
        setTimeout(() => {
            this.divGameOverScreen.style.display = 'grid';
            //reset variables
            this.reset(true);
        //allows a 1 sec pause between game over and game over screen
        }, 1000)
    }

    async server() {
        const status = document.getElementById('leaderboard-status');
        const entry = {
            player: document.querySelector('#name').value.trim() || 'Player',
            score: this.score,
            distance: Math.round(this.objectsParent.position.z)
        };
        status.textContent = 'Saving score…';
        try {
            const response = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry),
                signal: AbortSignal.timeout(10000)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not save your score.');
            this.renderLeaderBoard(result);
            status.textContent = 'Score saved.';
        } catch (error) {
            console.warn('Could not save score.', error);
            status.textContent = 'Your score could not be saved. Please check your connection.';
            await this.getLeaderBoard();
        }
    }

    async getLeaderBoard() {
        try {
            const response = await fetch('/api/leaderboard', { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error('Leaderboard unavailable.');
            this.renderLeaderBoard(await response.json());
        } catch (error) {
            console.warn('Could not load leaderboard.', error);
        }
    }

    renderLeaderBoard(scores) {
        const body = document.querySelector('#score-table tbody');
        body.replaceChildren();
        scores.forEach((entry) => {
            const row = document.createElement('tr');
            ['player', 'score', 'distance', 'date'].forEach((key) => {
                const cell = document.createElement('td');
                cell.textContent = key === 'date' ? new Date(entry.date).toLocaleDateString() : entry[key];
                row.appendChild(cell);
            });
            body.appendChild(row);
        });
    }

    createNeo(scene){
        const loadingManager = new THREE.LoadingManager(() => {

            const loadingScreen = document.getElementById('loading-screen');
            if (this.neo) loadingScreen.classList.add('fade-out');
          });
        //use this fucntion to load in model of runner
        const loader = new GLTFLoader(loadingManager);

            loader.load(assetUrl('Neo.glb'), (gltf) => {
                this.neo = gltf.scene;
                this.neo.scale.set(0.04, 0.04, 0.04);
                this.neo.position.x = 0;
                this.neo.position.y = 0;
                this.neo.position.z = 0;
                // const mesh = this.neo.children[0].children[1];
                // mesh.material.metalness = 0;
                // mesh.material.needsUpdate = true;
                // mesh.material = new THREE.MeshStandardMaterial({
                //     color: "#00ff00",
                //     skinning: true,
                //     transparent: true,
                //     opacity: 0.5
                // })
                // const body = this.neo.children[0].children[2].children;
                // body.forEach((part) => {
                //     part.material.metalness = 0;
                //     part.material.needsUpdate = true
                //     part.material = new THREE.MeshStandardMaterial({
                //         color: "#00ff00",
                //         skinning: true,
                //         transparent: true,
                //         opacity: 0.5
                //     })
                // })
                this.mixer = new THREE.AnimationMixer( this.neo );
                gltf.animations.forEach(( clip ) => {
                    this.mixer.clipAction(gltf.animations[1]).play();
                })
                this.scene.add(this.neo);

            }, function(xhr){ //function to give model loading progress
                if ( xhr.lengthComputable ) {
                    var percentComplete = xhr.loaded / xhr.total * 100;
                    console.log( Math.round(percentComplete, 2) + '% downloaded')
                }
            }, function(error){
                console.error('Could not load Neo.', error);
                document.getElementById('loading-title').textContent = 'Could not load Neo. Check the asset URL and refresh to retry.';
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

    setupBonus(obj, refXpos = 0, refZpos = 0) {
        const price = this.randomInt(5, 20);
        this.ratio = price / 20;

        const size = this.ratio * 0.5;
        obj.scale.set(size, size, size);

        const hue = 1 + 0.3 * this.ratio;
        obj.material.color.setHSL(hue, 1, 0.5);

        obj.position.set(
            refXpos + this.randomFloat(-30, 30),
            obj.scale.y * 0.5,
            refZpos - 100 - this.randomFloat(0, 100)
        );

        return price;

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

    setupHealth(obj, refXpos = 0, refZpos = 0){
        const price = this.randomInt(5, 20);
        this.ratio = price / 20;

        const size = this.ratio * 0.5;
        obj.scale.set(size, size, size);

        const hue = 1; // to get red for health
        obj.material.color.setHSL(hue, 1, 0.5);

        obj.position.set(
            refXpos + this.randomFloat(-30, 30),
            obj.scale.y * 0.5,
            refZpos - 100 - this.randomFloat(0, 100)
        );

        return price;
    }

    spawnHealth(){
        const obj = new THREE.Mesh(
            this.BONUS_PREFAB,
            new THREE.MeshBasicMaterial({color: 0x000000})
        );

        const price = this.setupHealth(obj);
        this.objectsParent.add(obj);

        obj.userData = {type: 'health', price};
    }

    initScene(scene, camera, replay) {

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

            for (let i = 0; i < 2; i++)
                this.spawnHealth();

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