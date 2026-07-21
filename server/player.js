const { Schema, type } = require("@colyseus/schema");


class Player extends Schema {

    constructor(){
        super();

        this.id = "";
        this.name = "";
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.inputX = 0;
        this.inputZ = 0;
        this.rotation = 0;
        this.weapons = new Weapons();
        this.equiped = 'main';
        this.reloading = false;
        this.reloadingfor = false;
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;
        this.respawning = false;
        this.points = 0;
        this.kills = 0;
        this.ka = 0;
        this.deaths = 0;
        this.lastHit = "";
        this.finalHit = "";
        this.effects = new effects();
        this.totalAffects = new totalAffects();
    }
}


class Weapons {
  constructor() {
    this.main = null;
    this.sec = null;
  }
}


class effects {
  constructor() {
    
  }
}

class totalAffects {
  constructor() {
    
  }
}


type("string")(Player.prototype, "id");
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("number")(Player.prototype, "z");
type("number")(Player.prototype, "inputX");
type("number")(Player.prototype, "inputZ");
type("string")(Player.prototype, "name");
type("boolean")(Player.prototype, "reloading");
type("boolean")(Player.prototype, "reloadingfor");
type("number")(Player.prototype, "health");
type("number")(Player.prototype, "maxHealth");
type("boolean")(Player.prototype, "isDead");
type("boolean")(Player.prototype, "respawning");
type("number")(Player.prototype, "points");
type("number")(Player.prototype, "kills");
type("number")(Player.prototype, "ka");
type("number")(Player.prototype, "deaths");
type("string")(Player.prototype, "lastHit");
type("string")(Player.prototype, "finalHit");


module.exports = Player;