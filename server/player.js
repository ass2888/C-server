const { Schema, type } = require("@colyseus/schema");



class Player extends Schema {

    constructor(){
        super();

        this.id = "";
        this.name = "";
        this.position = new vector(0, 0, 0)
        this.lastPosition = new vector(0, 0, 0)
        this.inputX = 0;
        this.inputZ = 0;
        this.rotation = 0;
        this.weapons = new Weapons();
        this.equiped = 'main';
        this.reloading = false;
        this.reloadingfor = 'main';
        this.lastFire = 0;
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

    getBounds() {
      let bounds = {};

      bounds.minX = this.x - 0.8/2;
      bounds.maxX = this.x + 0.8/2;

      bounds.minY = this.y - 1.8/2;
      bounds.maxY = this.y + 1.8/2;

      bounds.minZ = this.z - 0.6/2;
      bounds.maxZ = this.z + 0.6/2;
      
      return bounds;
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
    return new vector({ x: this.x, y: this.y, z: this.z });
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
type("string")(Player.prototype, "reloadingfor");
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