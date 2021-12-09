import * as THREE from 'three';

export class Game {

    OBSTACLE_PREFAB =  new THREE.BoxBufferGeometry(1, 1, 1);
    OBSTACLE_MATERIAL = new THREE.MeshBasicMaterial({color: 0xccdeee});
    BONUS_PREFAB = new THREE.SphereBufferGeometry(1, 12, 12);

    constructor(scene, camera){
        //init variables
        //prepare 3D scene
        this.initScene(scene, camera);

        //bind event calls
        document.addEventListener('keydown', this.keyDown.bind(this));
        document.addEventListener('keyup', this.keyUp.bind(this));
    }

    update() {
        //event handle

        //updating the game state
        this.time += this.clock.getDelta(); //increments time variable 

        this.updateGrid();
        this.checkCollisions();
        this.updateUserUI();
    }

    keyDown(event) {
        //move object by checking key press
    }

    keyUp() {
        //reset object to idle 
    }

    updateGrid() {
        //will update the grid to move backwards to seem like were moving forward in the world
        this.grid.material.uniforms.time.value = this.time;
    }

    checkCollisions(){
        //this will be collision logic
        //checks for obstacles
        //checks power ups?
        //bonuses?
    }

    updateUserUI() {
        //this will update DOM elements to track and show
        //distance traveled?
        //score?
        //current game state
        //lives?
    }

    gameOver() {

    }

    createShip(scene){
        //use this fucntion to load in model of runner
        const shipBody = new THREE.Mesh(
            new THREE.TetrahedronBufferGeometry(0.4),
            new THREE.MeshBasicMaterial({color: 0xbbccdd}),
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
        this.objectsParent.add(obj);
    }

    setupObstacle(obj, refXpos = 0, refZpos = 0) {
        //random scale
        obj.scale.set(
            this.randomFloat(0.5, 2),
            this.randomFloat(0.5, 2),
            this.randomFloat(0.5, 2)
        );
        //random positioning
        obj.position.set(
            refXpos + this.randomFloat(-30, 30),
            obj.scale.y * 0.5,
            refZpos - 100 - this.randomFloat(0, 100)
        );
    }

    spawnBonus(){

    }

    createGrid(scene) {
        this.speedZ = 20;
        
        let divisions = 30;
        let gridLimit = 200;
        this.grid = new THREE.GridHelper(gridLimit * 2, divisions, 0xccddee, 0xccddee);

        const moveableZ = [];
        for (let i = 0; i <= divisions; i++) {
        moveableZ.push(1, 1, 0, 0); // move horizontal lines only (1 - point is moveable)
        }
        this.grid.geometry.setAttribute('moveableZ', new THREE.BufferAttribute(new Uint8Array(moveableZ), 1));

        this.grid.material = new THREE.ShaderMaterial({
        uniforms: {
            speedZ: {
                value: this.speedZ
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
            
            attribute float moveableZ;
            
            varying vec3 vColor;
        
            void main() {
            vColor = color;
            float limLen = gridLimits.y - gridLimits.x;
            vec3 pos = position;
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

    initScene(scene, camera) {
            //init 3D scene
            this.createShip(scene);
            this.createGrid(scene);

            this.objectsParent = new THREE.Group();
            scene.add(this.objectsParent);

            //spawn 15 obstacles
            for (let i = 0; i < 15; i++)
                this.spawnObject();

            camera.rotateX(-20 * Math.PI / 180);
            camera.position.set(0, 1.5, 2);
    }
}