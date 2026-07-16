const { Room } = require("colyseus");
const { Schema, MapSchema, type } = require("@colyseus/schema");

const Player = require("./player");


class GameState extends Schema {

    constructor(){
        super();

        this.players = new MapSchema();
    }

}


type({ map: Player })(GameState.prototype, "players");



class GameRoom extends Room {


    onCreate(){

        this.setState(new GameState());

        console.log("Room started");


        this.onMessage("move", (client, data) => {

            const player = this.state.players.get(
                client.sessionId
            );

            if (!player) return;


            player.x += data.x;
            player.z += data.z;

        });

    }



    onJoin(client){

        const player = new Player();


        this.state.players.set(
            client.sessionId,
            player
        );


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

}


module.exports = GameRoom;