const { Room } = require("colyseus");
const { Schema, MapSchema, type } = require("@colyseus/schema");

const Player = require("./player");


class GameState extends Schema {

    constructor(){
        super();

        this.players = new MapSchema();
        this.maxPlayers = 8;
        this.gameStarted = false;
        this.time = 0;
    }

}


type({ map: Player })(GameState.prototype, "players");
type("number")(GameState.prototype, "maxPlayers");
type("boolean")(GameState.prototype, "gameStarted");
type("number")(GameState.prototype, "time");

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

         this.setSimulationInterval((deltaTime)=>{

    const speed = 8;


    this.state.players.forEach((player)=>{

        player.x += player.inputX * speed * (deltaTime / 1000);

        player.z += player.inputZ * speed * (deltaTime / 1000);
       console.log("moving", "X", player.x, "Z", player.z, "Inputs:", "X", player.inputX, "Z", player.inputZ)
    });

        });
    }



    onJoin(client){

        const player = new Player();

        player.name = `Player ${this.state.players.size}`;
  
        this.state.players.set(
            client.sessionId,
            player
        );


        if (this.state.gameStarted === false) {
          if (this.state.players.size >= 2 && this.state.players.size <= this.state.maxPlayers) {
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


module.exports = classicRoom;