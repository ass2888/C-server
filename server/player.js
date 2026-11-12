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
        this.char = "";
        this.weapons = new Weapons();
        this.equiped = 'main';
        this.reloading = false;
        this.reloadingfor = 'main';
        this.lastFire = 0;
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;
        this.respawning = false;
        this.respawnTimer = 0;
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

      bounds.min = {
        x: this.position.x - 0.8/2,
        y: this.position.y - 1.8/2,
        z: this.position.z - 0.6/2
      }

      bounds.max = {
        x: this.position.x + 0.8/2,
        y: this.position.y + 1.8/2,
        z: this.position.z + 0.6/2,
      }
      
      return bounds;
    }

    reload() {
      let w = this.weapons[this.equiped];
      if (!w) return;

      this.reloading = true;
      this.reloadingfor = this.equiped;
      setTimeout(() => {
        this.reloading = false;
        this.reloadingfor = null;
        w.ammo = w.fullammo;
      }, w.reload * 1000)
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
    this.ammo -= num;
  }
}


type("string")(weapon.prototype, "name");
type("number")(weapon.prototype, "damage");
type("number")(weapon.prototype, "damage2");
type("number")(weapon.prototype, "fire_rate");
type("number")(weapon.prototype, "ammo");
type("number")(weapon.prototype, "fullammo");
type("number")(weapon.prototype, "reload");
type("string")(weapon.prototype, "bullet");
type("string")(weapon.prototype, "bullet2");
type("string")(weapon.prototype, "atk2type");
type("number")(weapon.prototype, "atk2time");


class Weapons extends Schema {
  constructor() {
    super();
    
    this.main = null;
    this.sec = null;
  }
}

type(weapon)(Weapons.prototype, "main");
type(weapon)(Weapons.prototype, "sec");

class effects {
  constructor() {
    
  }
}

class totalAffects {
  constructor() {
    
  }
}

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

  length() {
    return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
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

type("string")(Player.prototype, "id");
type("number")(vector.prototype, "x");
type("number")(vector.prototype, "y");
type("number")(vector.prototype, "z");
type(vector)(Player.prototype, "position");
type(vector)(Player.prototype, "lastPosition");
type("string")(Player.prototype, "char");
type(Weapons)(Player.prototype, "weapons");
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
type("string")(Player.prototype, "equiped");
type("number")(Player.prototype, "respawnTimer");

module.exports = Player;
module.exports.weapon = weapon;
module.exports.vector = vector;