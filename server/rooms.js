const { Room } = require("colyseus");
const { Schema, MapSchema, type, ArraySchema } = require("@colyseus/schema");
const fs = require("node:fs/promises");
const Player = require("./player");

let effects = {
  'Electrified': {
    name: 'Electrified',
    stackable: true,
    levels: {
      l1: 0,
      l2: 0.8,
      l3: 1.5,
      l4: 2.4,
      l5: 3.5
    },
    rate: {
      l1: 750,
      l2: 650,
      l3: 550,
      l4: 425,
      l5: 300
    },
    dmg: {
      l1: 3,
      l2: 4,
      l3: 5,
      l4: 6,
      l5: 8,
    },
    time: {
      l1: 4,
      l2: 5,
      l3: 6,
      l4: 7,
      l5: 8
    },
    speed: {
      l1: -0.5,
      l2: -1,
      l3: -2,
      l3: -3,
      l4: -4,
      l5: -5
    }
  }
}

const bulletType = {
  'electric': {
    name: 'Electric',
    range: 30,
    effect: {
      name: 'Electrified',
      intensity: 0.3,
    },
  },
  'thunder': {
    name: 'Thunder',
    range: 50,
    effect: {
      name: 'Electrified',
      intensity: 1,
    },
  },
  'thunder-grenade': {
    name: 'Thundernade',
    range: 25,
    effect: {
      name: 'Electrified',
      intensity: 1,
    },
    activationTime: 3.5
  },
  'electric-big': {
    name: 'Electric big',
    range: 45,
    effect: {
      name: 'Electrified',
      intensity: 0.8,
    },
  }
}

const weapons = {
    'electric_charger': {
        name: 'Electric charger',
        dmg: 15,
        dmg2: 35,
        fire_rate: 4.5,
        ammo: 20,
        fullammo: 20,
        reload: 2,
        bullet: 'electric',
        bullet2: 'electric-big',
        atk2type: 'hold',
        atk2time: 1.5
    },
    'thunderifle': {
        name: 'ThundeRifle',
        dmg: 40,
        dmg2: 75,
        fire_rate: 0.7,
        ammo: 4,
        fullammo: 4,
        reload: 4,
        bullet: 'thunder',
        bullet2: 'thunder-grenade',
        atk2type: 'grenade',
        
    }
};

const characters = {
    base: {
        health: 100,
        main_weapon: 'electric_charger',
    },
};

const maps = {
  containers: {
    boxesSrc: "containersBoxes.json",
  }
}

let delta;

class vector extends Schema {
  constructor(x, y, z) {
    super();
    
    this.x = x;
    this.y = y;
    this.z = z;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  multi(amount) {
    
    this.x = this.x * amount;
    this.y = this.y * amount;
    this.z = this.z * amount;
    
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;

    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;

    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;

    return this;
  }

  normalize() {
    const length = Math.sqrt(
      this.x ** 2 +
      this.y ** 2 +
      this.z ** 2
    );

    if (length === 0) return this;

    this.x /= length;
    this.y /= length;
    this.z /= length;

    return this;
  }

  

  isInfinity() {
    let value = false;
    if (!isFinite(this.x) || !isFinite(this.y) || !isFinite(this.z)) {
      value = true;
    }
    return value;
  }

  clone() {
    return new vector(this.x, this.y, this.z);
  }
}

type("number")(vector.prototype, "x");
type("number")(vector.prototype, "y");
type("number")(vector.prototype, "z");

//dir.clone().multiplyScalar(speed);

class createBullet extends Schema {
  constructor(dir, speed, life, bullet, dmg, owner, origin, atktype, id) {
        super();

        this.id = id;
        this.velocity = new vector(dir).clone().multi(speed);
        this.life = life;
        this.distance = 0;
        this.maxDistance = bullet.range || 30;
        this.damage = dmg || 15;
        this.owner = owner;
        this.type = bullet.name;
        this.isRemoving = false;
        this.position = new vector(origin);
        this.atktype = atktype;
        /*this.x = origin.x;
        this.y = origin.y;
        this.z = origin.z;*/
  }

  getBounds() {
      let bounds = {};

      bounds.min = {
        x: this.x - 0.30/2,
        y: this.y - 0.30/2,
        z: this.z - 0.30/2
      }

      bounds.max = {
        x: this.x + 0.30/2,
        y: this.y + 0.30/2,
        z: this.z + 0.30/2
      }
      
      return bounds;
  }
}

type("string")(createBullet.prototype, "id");
type(vector)(createBullet.prototype, "velocity");
type("number")(createBullet.prototype, "life");
type("number")(createBullet.prototype, "distance");
type("number")(createBullet.prototype, "maxDistance");
type("number")(createBullet.prototype, "damage");
type("string")(createBullet.prototype, "owner");
type("string")(createBullet.prototype, "type");
type("boolean")(createBullet.prototype, "isRemoving");
type(vector)(createBullet.prototype, "position");


class GameState extends Schema {

    constructor(){
        super();
      
        this.map = "containers";
        this.players = new MapSchema();
        this.maxPlayers = 8;
        this.gameReady = false;
        this.gameStarted = false;
        this.time = 0;
        this.startingTime = 0;
        this.bullets = new ArraySchema();
    }

}


type({ map: Player })(GameState.prototype, "players");
type("number")(GameState.prototype, "maxPlayers");
type("boolean")(GameState.prototype, "gameStarted");
type("number")(GameState.prototype, "time");
type([createBullet])(GameState.prototype, "bullets");


class classicRoom extends Room {

    onCreate(){

        this.setState(new GameState());
        this.setMetadata({
          mode:"classicFFA",
          maxPlayers: 8
        });
        this.collisionBoxes = [];
        this.setCollisionBoxes();

        console.log("Room started");


        this.onMessage("move", (client, data)=>{

    const player = this.state.players.get(
        client.sessionId
    );

    if(!player) return;


           player.inputX = data.x;
           player.inputZ = data.z;
           
     
         });

        this.onMessage("fire", (client, data)=>{
            const player = this.state.players.get(
        client.sessionId
    );
            if (!player) return;

            let weapon = player.weapons.main;
            let allowed = true;

            if (player.lastFire/1000 < 1/weapon.fire_rate) {
              player.lastfire = 0;
              allowed = false;
              return;
            }

            if (allowed === true) {

            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// "l4x8k2m9p" (حوالي 9-10 أحرف)
            
            let damage = data.atktype === 'atk' ? weapon.damage : weapon.damage2;
            let bullet = data.atktype === 'atk' ? bulletType[weapon.bullet] : bulletType[weapon.bullet2];
            let speed = 50;
            let dir = data.dir;
            let origin = {
              x: player.position.x,
              y: player.position.y + 1.2,
              z: player.position.z
            }

            

            let bulletData = new createBullet(dir, speed, 2.0, bullet, damage, player.id, origin, data.atktype, id)

          

          this.state.bullets.push(bulletData)
            }
        });
      
         this.setSimulationInterval((deltaTime)=>{

           delta = deltaTime;

           

           
    const speed = 8;


    this.state.players.forEach((player)=>{

        player.position.x += player.inputX * speed * (deltaTime / 1000);

        player.position.z += player.inputZ * speed * (deltaTime / 1000);

        let check = this.checkCollision(player.getBounds(), null);
        //console.log("==== check ====", check, player.getBounds())
        if (check) {
          let normal;
          let direction = player.position.clone().sub(player.lastPosition.clone()).normalize();
          let minXFace = player.lastPosition.x + 0.4 <= check.object.min.x && player.position.x + 0.4 > check.object.min.x;
          let maxXFace = player.lastPosition.x - 0.4 >= check.object.max.x && player.position.x - 0.4 < check.object.max.x;
          let minYFace = player.lastPosition.y + 0.6 <= check.object.min.y && player.position.y + 0.6 > check.object.min.y;
          let maxYFace = player.lastPosition.y - 0.6 >= check.object.max.y && player.position.y - 0.6 < check.object.max.y;
          let minZFace = player.lastPosition.z + 0.3 <= check.object.min.z && player.position.z + 0.3 > check.object.min.z;
          let maxZFace = player.lastPosition.z - 0.3 >= check.object.max.z && player.position.z - 0.3 < check.object.max.z;
          if (minXFace) normal = new vector(-1,0,0);
          if (maxXFace) normal = new vector(1,0,0);
          if (minYFace) normal = new vector(0,-1,0);
          if (maxYFace) normal = new vector(0, 1,0);
          if (minZFace) normal = new vector(0,0,-1);
          if (maxZFace) normal = new vector(0,0,1);

          let dot = direction.dot(normal);
          let slide = direction.clone().sub(normal.clone().multi(dot))
          
          player.position.copy(player.lastPosition);
          player.position.add(slide.clone().multi(deltaTime/1000).multi(speed));
        }
        else {
          player.lastPosition.copy(player.position)
        }

      player.lastFire += deltaTime;
      // console.log("moving", "X", player.x, "Z", player.z, "Inputs:", "X", player.inputX, "Z", player.inputZ)
    });

           for (let i = this.state.bullets.length - 1; i >= 0; i--) {
             let b = this.state.bullets[i];
             
             // ====== Update positions ====== \\

             b.position.add(b.velocity.clone().multi(deltaTime/1000));
             
b.life -= deltaTime/1000;

             this.state.players.forEach((player) => {
               if (b.owner === player.id) return;
               let targetA = player.getBounds();
               let targetB = b.getBounds();
               
               const hit =
    targetA.min.x <= targetB.max.x &&
    targetA.max.x >= targetB.min.x &&
    targetA.min.y <= targetB.max.y &&
    targetA.max.y >= targetB.min.y &&
    targetA.min.z <= targetB.max.z &&
    targetA.max.z >= targetB.min.z;

               if (hit) {
                 player.health -= b.damage;
                 console.log("==== Hit ====")
                 if (player.health <= 0) {
                   
                 }
               }
             });
        
             if (b.life <= 0 || b.position.isInfinity()) {
               if (b.position.isInfinity()) console.log("==== IT WAS AN INFINITE ====");
               this.state.bullets.splice(i, 1)
               console.log("Removed a bullet")
             }
           }
        });
    }

    onJoin(client){

        const player = new Player();

        player.name = `Player ${this.state.players.size}`;
        player.id = client.sessionId;
  
        this.state.players.set(
            client.sessionId,
            player
        );

        player.weapons.main = new weapon(weapons.electric_charger);
        player.weapons.sec = new weapon(weapons.thunderifle);


        if (this.state.gameStarted === false) {
          if (this.state.players.size >= 1 && this.state.players.size <= this.state.maxPlayers) {
            this.startMatch();
            
          } else {
            
          }
        }


        console.log(
            "Player joined:",
            client.sessionId
        );

    }

    onLeave(client, code){

        this.state.players.delete(
            client.sessionId
        );

      console.warn("[Server] Client left:", {
        sessionId: client.sessionId,
        code,
        time: new Date().toISOString()
    });

        /*console.log(
            "Player left:",
            client.sessionId
        );*/

    }

    onDrop(client, code) {
    console.warn("[Server] Client dropped:", {
        sessionId: client.sessionId,
        code,
        time: new Date().toISOString()
    });
}

    setSpawnLocations() {
      const spawnPositions = [
        { x: -7, z: -6 }, { x: 8, z: -3 }, { x: -5, z: 9 },
        { x: 7, z: 8 }, { x: -9, z: 3 }, { x: 10, z: -7 },
        { x: -2, z: -13 }, { x: 4, z: 12 }, { x: -11, z: -2 }
    ];

      let sid = 0;

      this.state.players.forEach((player)=>{
       let spawn = spawnPositions[sid];
      
       let spawnPoint = {
         x: spawn.x,
         y: 2,
         z: spawn.z
       }

        player.position.copy(spawnPoint);
        
        sid++
      })
      
    }

    async setCollisionBoxes() {
        let res = await fs.readFile(`./${maps[this.state.map].boxesSrc}`, "utf8")
        this.collisionBoxes = JSON.parse(res);
    }

    checkCollision(object, object2) {
      //console.log("=== check called ===", object, object2)
      if (object2 === null) {
        let done = false;
        this.collisionBoxes.forEach(box => {
          //console.log("=== debug reached collisionBoxes.forEach ===")
          done = true;
          let minX = object.min.x <= box.max.x;
          let maxX = object.max.x >= box.min.x;
          let minY = object.min.y <= box.max.y;
          let maxY = object.max.y >= box.min.y;
          let minZ = object.min.z <= box.max.z;
          let maxZ = object.max.z >= box.min.z;
          let normal;
          if (minX && maxX && minY && maxY && minZ && maxZ) {
            return {
              boolean: true,
              object: box,
            }
          } else { 
            return {
              boolean: false,
              object: null,
            }
          }
        })
        if (!done) {
          return {
            boolean: false,
            object: null
          }
        }
      } else {
        //console.log("=== debug object2 isnt null ===")
          let minX = object.min.x <= object2.max.x;
          let maxX = object.max.x >= object2.min.x;
          let minY = object.min.y <= object2.max.y;
          let maxY = object.max.y >= object2.min.y;
          let minZ = object.min.z <= object2.max.z;
          let maxZ = object.max.z >= object2.min.z;
          if (minX && maxX && minY && maxY && minZ && maxZ) {
            return {
              boolean: true,
              object: null
            }
          } else {
            return {
              boolean: false,
              object: null
            }
          }
      }
    }

    startMatch() {
      this.state.gameStarted = true;
      this.setSpawnLocations()

      this.broadcast("matchStatus", {
        gameStarted: true
      });
    }

    
}



class weapon extends Schema {
  constructor(w) {
    super();
    
    this.name = w.name;
    this.damage = w.dmg;
    this.damage2 = w.dmg2;
    this.fire_rate = w.fire_rate;
    this.ammo = w.ammo;
    this.fullammo = w.fullammo;
    this.reload = w.reload;
    this.bullet = w.bullet;
    this.bullet2 = w.bullet2;
    this.atk2type = w.atk2type;
    this.atk2time = w.atk2time;
  }

  refreshAmmo(num) {
    ammo -= num;
  }
}


module.exports = classicRoom;