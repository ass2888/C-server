const { Room } = require("colyseus");
const { Schema, MapSchema, type, ArraySchema } = require("@colyseus/schema");
const fs = require("node:fs/promises");
const Player = require("./player");
const { weapon } = Player;
const { vector } = Player;

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


// =====================================================================
//  إعدادات الحركة والتصادم
// =====================================================================
const MOVE = {
  speed: 8,              // سرعة اللاعب (متر/ثانية)
  maxDt: 0.1,            // أقصى زمن إطار (ثانية) حتى لا يقفز اللاعب عند تأخر السيرفر
  maxStep: 0.15,         // أقصى مسافة في الخطوة الواحدة (أقل من نصف عرض اللاعب) لمنع الاختراق
  maxSteps: 8,           // أقصى عدد خطوات فرعية في الإطار الواحد
  maxIterations: 6,      // عدد محاولات دفع اللاعب خارج الأجسام في كل خطوة
  skin: 0.001,           // فراغ صغير يُترك بين اللاعب والجسم بعد الدفع
  eps: 1e-6,             // أقل تداخل يُعتبر تصادماً
  floorNormalY: 0.7,     // سطح عموده Y أكبر من هذا يُعتبر أرضية/سقفاً ولا يمنع الحركة الأفقية
  obbTolerance: 0.02     // سماحية فحص صحة بيانات الدوران (انظر buildCollider)
};

// يجب أن تطابق أبعاد getBounds() في player.js (نصف العرض والارتفاع والعمق)
const PLAYER_HALF = { x: 0.4, y: 0.9, z: 0.3 };

// ---------------------------------------------------------------------
//  تحويل صندوق من ملف JSON إلى "collider" جاهز للفحص السريع
//  - الصناديق المحاذية للمحاور تُعامل كـ AABB.
//  - الصناديق المائلة تُعامل كـ OBB (صندوق مدوّر) باستخدام center و halfSize و quaternion.
// ---------------------------------------------------------------------
function axesFromRaw(raw) {
  const q = raw.quaternion;
  if (Array.isArray(q) && q.length === 4) {
    let x = Number(q[0]), y = Number(q[1]), z = Number(q[2]), w = Number(q[3]);
    const n = Math.hypot(x, y, z, w);
    if (n > 1e-9 && Number.isFinite(n)) {
      x /= n; y /= n; z /= n; w /= n;
      return [
        [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
        [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
        [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]
      ];
    }
  }
  const e = raw.rotation && raw.rotation.elements;
  if (Array.isArray(e) && e.length === 9) {
    // مصفوفة بترتيب الأعمدة (column-major) كما في Three.js
    return [[e[0], e[1], e[2]], [e[3], e[4], e[5]], [e[6], e[7], e[8]]];
  }
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}

function finishCollider(raw, cx, cy, cz, ext, obb) {
  // ext = نصف أبعاد الصندوق في العالم (AABB محيط). obb = { u, half } أو null إذا كان محاذياً للمحاور
  const axes = [];
  const addAxis = (ax, ay, az, u, half) => {
    const len = Math.hypot(ax, ay, az);
    if (len < 1e-4) return; // محور منعدم (متوازيان)
    ax /= len; ay /= len; az /= len;
    const dot = (v) => Math.abs(v[0] * ax + v[1] * ay + v[2] * az);
    const rB = half[0] * dot(u[0]) + half[1] * dot(u[1]) + half[2] * dot(u[2]);
    axes.push(ax, ay, az, rB);
  };

  if (!obb) {
    const W = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    addAxis(1, 0, 0, W, ext); addAxis(0, 1, 0, W, ext); addAxis(0, 0, 1, W, ext);
  } else {
    const W = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const { u, half } = obb;
    for (const a of W) addAxis(a[0], a[1], a[2], u, half);
    for (const a of u) addAxis(a[0], a[1], a[2], u, half);
    for (const a of W) {
      for (const b of u) {
        addAxis(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], u, half);
      }
    }
  }

  return {
    name: raw.name,
    raw,
    cx, cy, cz,
    minX: cx - ext[0], maxX: cx + ext[0],
    minY: cy - ext[1], maxY: cy + ext[1],
    minZ: cz - ext[2], maxZ: cz + ext[2],
    axes,
    rotated: !!obb
  };
}

function buildCollider(raw) {
  if (!raw || !raw.min || !raw.max) return null;
  const mn = raw.min, mx = raw.max;

  // صندوق AABB من min/max (يُستخدم كاحتياط)
  const fallback = () => finishCollider(
    raw,
    (mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2,
    [(mx.x - mn.x) / 2, (mx.y - mn.y) / 2, (mx.z - mn.z) / 2],
    null
  );

  if (!raw.center || !raw.halfSize) return fallback();

  const c = raw.center, h = raw.halfSize;
  const half = [Number(h.x), Number(h.y), Number(h.z)];
  if (half.some((v) => !Number.isFinite(v))) return fallback();

  const u = axesFromRaw(raw);
  const ext = [0, 1, 2].map((i) => Math.abs(u[0][i]) * half[0] + Math.abs(u[1][i]) * half[1] + Math.abs(u[2][i]) * half[2]);

  // فحص صحة: الـ AABB المحيط بالصندوق المدوّر يجب أن يقع داخل min/max المحفوظين في الملف
  const tol = MOVE.obbTolerance;
  const consistent =
    c.x - ext[0] >= mn.x - tol && c.x + ext[0] <= mx.x + tol &&
    c.y - ext[1] >= mn.y - tol && c.y + ext[1] <= mx.y + tol &&
    c.z - ext[2] >= mn.z - tol && c.z + ext[2] <= mx.z + tol;
  if (!consistent) {
    console.warn("[collision] box data mismatch, using min/max instead:", raw.name);
    return fallback();
  }

  // هل كل محور من محاور الصندوق ينطبق على محور من محاور العالم؟
  const aligned = u.every((a) => a.some((v) => Math.abs(v) > 0.9999));
  if (aligned) return finishCollider(raw, c.x, c.y, c.z, ext, null);

  return finishCollider(raw, c.x, c.y, c.z, ext, { u, half });
}

// ---------------------------------------------------------------------
//  فحص تداخل صندوق اللاعب (AABB) مع collider بطريقة SAT
//  يُرجع true ويملأ _hit بأقل عمق تداخل واتجاه الدفع (من الجسم نحو اللاعب)
// ---------------------------------------------------------------------
const _hit = { depth: 0, nx: 0, ny: 0, nz: 0 };

function penetration(c, px, py, pz, ex, ey, ez) {
  // فحص سريع أولاً بالـ AABB المحيط
  if (px + ex <= c.minX || px - ex >= c.maxX ||
      py + ey <= c.minY || py - ey >= c.maxY ||
      pz + ez <= c.minZ || pz - ez >= c.maxZ) return false;

  const dx = px - c.cx, dy = py - c.cy, dz = pz - c.cz;
  const a = c.axes;
  let best = Infinity, bx = 0, by = 0, bz = 0;

  for (let i = 0; i < a.length; i += 4) {
    const lx = a[i], ly = a[i + 1], lz = a[i + 2];
    const rA = ex * Math.abs(lx) + ey * Math.abs(ly) + ez * Math.abs(lz);
    const dist = dx * lx + dy * ly + dz * lz;
    const overlap = rA + a[i + 3] - Math.abs(dist);
    if (overlap <= MOVE.eps) return false; // يوجد محور فاصل => لا تصادم
    if (overlap < best) {
      best = overlap;
      const s = dist < 0 ? -1 : 1;
      bx = lx * s; by = ly * s; bz = lz * s;
    }
  }

  _hit.depth = best; _hit.nx = bx; _hit.ny = by; _hit.nz = bz;
  return true;
}



//dir.clone().multiplyScalar(speed);

class createBullet extends Schema {
  constructor(dir, speed, life, bullet, dmg, owner, origin, atktype, id) {
        super();

        this.id = id;
        this.velocity = new vector(dir.x, dir.y, dir.z).clone().multi(speed);
        this.life = life;
        this.distance = 0;
        this.maxDistance = bullet.range || 30;
        this.damage = dmg || 15;
        this.owner = owner;
        this.type = bullet.name;
        this.isRemoving = false;
        this.position = new vector(origin.x, origin.y, origin.z);
        this.atktype = atktype;
        /*this.x = origin.x;
        this.y = origin.y;
        this.z = origin.z;*/
  }

  getBounds() {
      let bounds = {};

      bounds.min = {
        x: this.position.x - 0.30/2,
        y: this.position.y - 0.30/2,
        z: this.position.z - 0.30/2
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
        this.colliders = [];
        this.setCollisionBoxes();

        console.log("Room started");


        this.onMessage("move", (client, data)=>{

          const player = this.state.players.get(client.sessionId);
          if (!player) return;

          // تحقق من المدخلات: أرقام صالحة فقط وضمن [-1, 1] (يمنع غش السرعة)
          const x = Number(data && data.x);
          const z = Number(data && data.z);
          player.inputX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
          player.inputZ = Number.isFinite(z) ? Math.max(-1, Math.min(1, z)) : 0;

        });

        this.onMessage("fire", (client, data)=>{
            const player = this.state.players.get(
        client.sessionId
    );
            if (!player) return;

            let weapon = player.weapons.main;
            let allowed = true;

            if (player.lastFire/1000 < 1/weapon.fire_rate) {
              player.lastFire = 0;
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

           // نحدّ زمن الإطار حتى لا يقفز اللاعب عند تأخر السيرفر
           const dt = Math.min(deltaTime / 1000, MOVE.maxDt);

           this.state.players.forEach((player)=>{
             this.movePlayer(player, dt);
             player.lastFire += deltaTime;
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
        player.lastPosition.copy(player.position);
        
        sid++
      })
      
    }

    async setCollisionBoxes() {
        try {
          let res = await fs.readFile(`./${maps[this.state.map].boxesSrc}`, "utf8");
          let parsed = JSON.parse(res);
          this.collisionBoxes = Array.isArray(parsed) ? parsed : (parsed.boxes || []);
          this.colliders = this.collisionBoxes.map(buildCollider).filter(Boolean);
          const rotated = this.colliders.filter((c) => c.rotated).length;
          console.log(`[collision] loaded ${this.colliders.length} boxes (${rotated} rotated)`);
        } catch (err) {
          console.error("[collision] failed to load boxes:", err);
        }
    }

    // يدفع اللاعب خارج الأجسام المتداخلة معه (انزلاق طبيعي على الجدران المائلة)
    // يُرجع true عند النجاح، و false إن بقي متداخلاً بعد كل المحاولات
    resolvePosition(p) {
      const ex = PLAYER_HALF.x, ey = PLAYER_HALF.y, ez = PLAYER_HALF.z;

      for (let iter = 0; iter <= MOVE.maxIterations; iter++) {
        let found = false, depth = 0, nx = 0, nz = 0;

        for (const c of this.colliders) {
          if (!penetration(c, p.x, p.y, p.z, ex, ey, ez)) continue;
          // الأسطح شبه الأفقية (أرضية/سقف) لا تمنع الحركة الأفقية
          if (Math.abs(_hit.ny) > MOVE.floorNormalY) continue;
          // نأخذ أعمق تداخل
          if (_hit.depth > depth) {
            found = true; depth = _hit.depth; nx = _hit.nx; nz = _hit.nz;
          }
        }

        if (!found) return true;
        if (iter === MOVE.maxIterations) break;

        // ندفع اللاعب أفقياً على امتداد عمود السطح (الجزء الأفقي منه)
        const hl = Math.hypot(nx, nz);
        if (hl < 1e-6) return true;
        const push = (depth + MOVE.skin) / hl;
        p.x += (nx / hl) * push;
        p.z += (nz / hl) * push;
      }
      return false;
    }

    movePlayer(player, dt) {
      if (player.isDead || player.respawning) return;

      let ix = Number(player.inputX), iz = Number(player.inputZ);
      if (!Number.isFinite(ix)) ix = 0;
      if (!Number.isFinite(iz)) iz = 0;

      const len = Math.hypot(ix, iz);
      if (len < 0.001) return;                    // واقف: لا حاجة لأي حساب
      if (len > 1) { ix /= len; iz /= len; }      // الحركة القطرية بنفس سرعة المستقيمة

      const dx = ix * MOVE.speed * dt;
      const dz = iz * MOVE.speed * dt;

      // نقسم الحركة إلى خطوات صغيرة حتى لا يخترق اللاعب الجدران الرقيقة
      const steps = Math.max(1, Math.min(MOVE.maxSteps, Math.ceil(Math.hypot(dx, dz) / MOVE.maxStep)));
      const sx = dx / steps, sz = dz / steps;

      const p = { x: player.position.x, y: player.position.y, z: player.position.z };

      for (let i = 0; i < steps; i++) {
        const px = p.x, pz = p.z;
        p.x += sx;
        p.z += sz;
        if (!this.resolvePosition(p)) {
          // تعذر الحل: نرجع لآخر موضع سليم ونتوقف
          p.x = px; p.z = pz;
          break;
        }
      }

      // لا نكتب في الـ Schema إلا عند حدوث تغيير فعلي (يقلل بيانات الشبكة)
      if (Math.abs(p.x - player.position.x) > 1e-6 || Math.abs(p.z - player.position.z) > 1e-6) {
        player.position.x = p.x;
        player.position.z = p.z;
        player.lastPosition.copy(player.position);
      }
    }

    // فحص تداخل صندوق (min/max) مع صناديق العالم. تُرجع أول صندوق متداخل.
    checkCollision(object, object2) {
      if (object2 === null || object2 === undefined) {
        const ex = (object.max.x - object.min.x) / 2;
        const ey = (object.max.y - object.min.y) / 2;
        const ez = (object.max.z - object.min.z) / 2;
        const px = object.min.x + ex, py = object.min.y + ey, pz = object.min.z + ez;
        for (const c of this.colliders) {
          if (penetration(c, px, py, pz, ex, ey, ez)) {
            return { boolean: true, object: c.raw };
          }
        }
        return { boolean: false, object: null };
      }

      const hit =
        object.min.x <= object2.max.x && object.max.x >= object2.min.x &&
        object.min.y <= object2.max.y && object.max.y >= object2.min.y &&
        object.min.z <= object2.max.z && object.max.z >= object2.min.z;
      return { boolean: hit, object: null };
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