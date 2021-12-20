import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {Howl, Howler} from 'howler';

export class Game {

    OBSTACLE_PREFAB =  new THREE.BoxBufferGeometry(1, 1, 1);
    OBSTACLE_MATERIAL = new THREE.MeshBasicMaterial({color: 0xccdeee});
    BONUS_PREFAB = new THREE.SphereBufferGeometry(1, 12, 12);
    HEALTH_PREFAB = new THREE.SphereBufferGeometry(1, 12 ,12);
    COLLISION_THRESHOLD = 0.7;

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

    setupAudio() {
        //background audio
        const musicAudio = new Howl ({
            src: ['https://neorunner.s3.us-west-1.amazonaws.com/background-music.mp3'],
            autoplay: true,
            loop: true,
            volume: 0.75
        });
        const musicId = musicAudio.play();
            musicAudio.fade(0, 0.2, 5000, musicId)
        //crash audio
        this.crashAudio = new Howl ({
            src: ['https://neorunner.s3.us-west-1.amazonaws.com/obst-hit-option2.wav'],
            volume: .4
        });
        //bonus audio
        this.bonusAudio = new Howl ({
            src: ['https://neorunner.s3.us-west-1.amazonaws.com/bonus-7.wav'],
            volume: 0.2
        });
        //health bonus audio
        this.healthBonusAudio = new Howl ({
            src: ['https://neorunner.s3.us-west-1.amazonaws.com/health-bonus.wav'],
            volume: .7
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
        let newSpeedX;
        switch (event.key) {
            case 'ArrowLeft':
                newSpeedX = -1
                break;
            case 'ArrowRight':
                newSpeedX = 1
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
        this.speedX = newSpeedX;
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
                        if (this.crashAudio)
                            this.crashAudio.play();
                        // reduce health if collision detected
                        this.health -= 10;
                        this.divHealth.value = this.health;
                        this.setupObstacle(...params); //... is spread operator to take the array of params on line 197
                        if (this.health <= 0)
                            this.gameOver();
                    } else if (child.userData.type === 'health'){
                        //health bonus audio
                        if (this.health < 50){
                        //increases health
                        if(this.health < 50){
                            this.newHealth = this.health += 10;
                        }
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

        this.leaderBoard(score);
        setTimeout(() => {
            this.divGameOverScreen.style.display = 'grid';
            //reset variables
            this.reset(true);
        //allows a 1 sec pause between game over and game over screen
        }, 1000)
    }

    leaderBoard() {
        this.NO_OF_HIGH_SCORES = 10;
        this.HIGH_SCORES = 'highScores';
        this.USER_NAME = document.getElementById('name').value

        const highScoreString = localStorage.getItem(this.HIGH_SCORES);
        const highScores = JSON.parse(highScoreString) ?? []; // ?? nullish coalescing operator returns its right hand operand when left-hand side is null or undefined and otherwise returns left hand side operand.
        const lowestScore = highScores[this.NO_OF_HIGH_SCORES]?.this.score ?? 0;

        if (this.score > lowestScore) {
            this.saveHighScore(score, highScores);
            this.showHighScore();
        }
    }

    saveHighScore(score, highScores) {
        // const name = prompt('Neo has reached a highscore! Enter your name:');
        const newScore = {score: this.score, distance: this.objectsParent.position.z.toFixed(0), name: this.USER_NAME};
        //adds to the list
        highScores.push(newScore);
        //sorts list
        highScores.sort((a, b) => b.score - a.score);
        //select new list
        highScores.splice(this.NO_OF_HIGH_SCORES);
        //save to local storage
        localStorage.setItem(this.HIGH_SCORES, JSON.stringify(highScores));
    }

    showHighScore() {
        const highScores = JSON.parse(localStorage.getItem(this.HIGH_SCORES)) ?? [];
        const highScoreList = document.getElementById('highscore');

        highScoreList.innerHTML = highScores.map((score) =>
          `<li> ${score.name} Scored ${score.score} Points & Traveled ${score.distance} Feet`).join('');
    }

    createNeo(scene){
        const loadingManager = new THREE.LoadingManager(() => {

            const loadingScreen = document.getElementById('loading-screen');
            loadingScreen.classList.add('fade-out');
          });
        //use this fucntion to load in model of runner
        const loader = new GLTFLoader(loadingManager);
            loader.load('https://neorunner.s3.us-west-1.amazonaws.com/Neo.glb', (gltf) => {
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
                if ( xhr.lengthComputable ) {
                    var percentComplete = xhr.loaded / xhr.total * 100;
                    console.log( Math.round(percentComplete, 2) + '% downloaded')
                }
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