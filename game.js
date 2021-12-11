import * as THREE from 'three';

export class Game {

    OBSTACLE_PREFAB =  new THREE.BoxBufferGeometry(1, 1, 1);
    OBSTACLE_MATERIAL = new THREE.MeshBasicMaterial({color: 0xccdeee});
    BONUS_PREFAB = new THREE.SphereBufferGeometry(1, 12, 12);
    COLLISION_THRESHOLD = 0.5;

    constructor(scene, camera){
        //init variables
        this.speedZ = 20;
        this.speedX = 0; //0 = straight, -1 = left, 1 = right
        this.translateX = 0;
        this.health = 10;
        this.score = 0;
        this.running = false
        //DOM elements
        this.divDistance = document.getElementById('distance');
        this.divHealth = document.getElementById('health');
        this.divScore = document.getElementById('score');

        this.divGameOverScreen = document.getElementById('game-over-screen');
        this.divGameOverScore = document.getElementById('game-over-score');
        this.divGameOverDistance = document.getElementById('game-over-distance');

        document.getElementById('start-button').onclick = () => {
            this.running = true;
            document.getElementById('intro-screen').style.display = 'none';
        }
        //init DOMS with start values
        this.divScore.innerText = this.score;
        this.divHealth.value = this.health;
        this.divDistance.innerText = 0;
        //prepare 3D scene
        this.initScene(scene, camera);

        //bind event calls
        document.addEventListener('keydown', this.keyDown.bind(this));
        document.addEventListener('keyup', this.keyUp.bind(this));
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

        this.time = 0;
        this.clock = new THREE.Clock();
    }

    updateGrid() {
        //will update the grid to move backwards to seem like were moving forward in the world
        this.grid.material.uniforms.time.value = this.time;
        this.objectsParent.position.z = this.speedZ * this.time;

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

    update() {
        //event handle
        if(!this.running)
            return
        //updating the game state
        this.time += this.clock.getDelta(); //increments time variable 

        this.translateX += this.speedX * -0.5;

        this.updateGrid();
        this.checkCollisions();
        this.updateUserUI();
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
        //allows a 1 sec pause between game over and game over screen
        }, 1000)
    }

    createShip(scene){
        //use this fucntion to load in model of runner
        const shipBody = new THREE.Mesh(
            new THREE.TetrahedronBufferGeometry(0.4),
            new THREE.MeshBasicMaterial({color: 0x32CD32}),
        );

        shipBody.rotateX(45 * Math.PI / 180);
        shipBody.rotateY(45* Math.PI / 180);

        this.ship = new THREE.Group();
        this.ship.add(shipBody);

        scene.add(this.ship);

        const reactorSocketGeometry = new THREE.CylinderBufferGeometry(0.08, 0.08, 0.1, 16);
        const reactorSocketMaterial = new THREE.MeshBasicMaterial({ color: 0x99aacc });

        const reactorSocket1 = new THREE.Mesh(reactorSocketGeometry, reactorSocketMaterial);
        const reactorSocket2 = new THREE.Mesh(reactorSocketGeometry, reactorSocketMaterial);
        const reactorSocket3 = new THREE.Mesh(reactorSocketGeometry, reactorSocketMaterial);

        this.ship.add(reactorSocket1);
        this.ship.add(reactorSocket2);
        this.ship.add(reactorSocket3);

        reactorSocket1.rotateX(90 * Math.PI / 180);
        reactorSocket1.position.set(-0.15, 0, 0.1);
        reactorSocket2.rotateX(90 * Math.PI / 180);
        reactorSocket2.position.set(0.15, 0, 0.1);
        reactorSocket3.rotateX(90 * Math.PI / 180);
        reactorSocket3.position.set(0, -0.15, 0.1);

        const reactorLightGeometry = new THREE.CylinderBufferGeometry(0.055, 0.055, 0.1, 16);
        const reactorLightMaterial = new THREE.MeshBasicMaterial({ color: 0xaadeff });

        const reactorLight1 = new THREE.Mesh(reactorLightGeometry, reactorLightMaterial);
        const reactorLight2 = new THREE.Mesh(reactorLightGeometry, reactorLightMaterial);
        const reactorLight3 = new THREE.Mesh(reactorLightGeometry, reactorLightMaterial);
    
        this.ship.add(reactorLight1);
        this.ship.add(reactorLight2);
        this.ship.add(reactorLight3);
        reactorLight1.rotateX(90 * Math.PI / 180);
        reactorLight1.position.set(-0.15, 0, 0.11);
        reactorLight2.rotateX(90 * Math.PI / 180);
        reactorLight2.position.set(0.15, 0, 0.11);
        reactorLight3.rotateX(90 * Math.PI / 180);
        reactorLight3.position.set(0, -0.15, 0.11);
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

    initScene(scene, camera) {
            //init 3D scene
            this.createShip(scene);
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
    }
}