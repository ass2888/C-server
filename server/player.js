const { Schema, type } = require("@colyseus/schema");


class Player extends Schema {

    constructor(){
        super();

        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.inputX = 0;
        this.inputZ = 0;

        this.rotation = {};
    }

}


type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("number")(Player.prototype, "z");
type("number")(Player.prototype, "inputX");
type("number")(Player.prototype, "inputZ");
type("object")(Player.prototype, "rotation");


module.exports = Player;