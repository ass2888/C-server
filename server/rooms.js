const { Room } = require("colyseus");
const { Schema, MapSchema, type, ArraySchema } = require("@colyseus/schema");

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

class vector extends Schema {
  constructor(v) {
    super();
    
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
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

  isInfinity() {
    let value = false;
    if (isFinite(this.x) || isFinite(this.y) || isFinite(this.z)) {
      value = true;
    }
    return value;
  }
}

type("number")(vector.prototype, "x");
type("number")(vector.prototype, "y");
type("number")(vector.prototype, "z");

//dir.clone().multiplyScalar(speed);

class createBullet extends Schema {
  constructor(dir, speed, life, bullet, dmg, owner, origin) {
        super();
    
        this.velocity = new vector(dir).multi(speed);
        this.life = life;
        this.distance = 0;
        this.maxDistance = bullet.range || 30;
        this.damage = dmg || 15;
        this.owner = owner;
        this.type = bullet.name;
        this.isRemoving = false;
        this.position = new vector(origin);
        /*this.x = origin.x;
        this.y = origin.y;
        this.z = origin.z;*/
  }
}

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

        this.players = new MapSchema();
        this.maxPlayers = 8;
        this.gameStarted = false;
        this.time = 0;
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
            let damage = data.atktype === 'atk' ? weapon.damage : weapon.damage2;
            let bullet = data.atktype === 'atk' ? bulletType[weapon.bullet] : bulletType[weapon.bullet2];
            let speed = 50;
            let dir = data.dir;
            let origin = {
              x: player.x,
              y: player.y + 1.2,
              z: player.z
            }

            let bulletData = new createBullet(dir, speed, 2.0, bullet, damage, player.id, origin)

          this.state.bullets.push(bulletData)
        });
      
         this.setSimulationInterval((deltaTime)=>{

    const speed = 8;


    this.state.players.forEach((player)=>{

        player.x += player.inputX * speed * (deltaTime / 1000);

        player.z += player.inputZ * speed * (deltaTime / 1000);
      // console.log("moving", "X", player.x, "Z", player.z, "Inputs:", "X", player.inputX, "Z", player.inputZ)
    });

           for (let i = this.state.bullets.length - 1; i >= 0; i--) {
             let b = this.state.bullets[i];
             
             // ====== Update positions ====== \\

             console.log("========== BULLET ==========", "position", b.position.x, b.position.y, b.position.z, "velocity", b.velocity.x, b.velocity.y, b.velocity.z, 'life', b.life, "delta", deltaTime)
             b.position.add(b.velocity.multi(deltaTime/1000));
b.life -= deltaTime/1000;
             if (b.life <= 0 || b.position.isInfinity) {
               if (b.position.isInfinity) console.log("==== IT WAS AN INFINITE ====");
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



    onLeave(client){

        this.state.players.delete(
            client.sessionId
        );


        console.log(
            "Player left:",
            client.sessionId
        );

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
         y: 1,
         z: spawn.z
       }

        player.x = spawnPoint.x;
        player.y = spawnPoint.y;
        player.z = spawnPoint.z;
        
        sid++
      })
      
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