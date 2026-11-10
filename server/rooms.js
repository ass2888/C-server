const { Room } = require("colyseus");
const { Schema, MapSchema, type, ArraySchema } = require("@colyseus/schema");
const fs = require("node:fs/promises");
const Player = require("./player");
const { weapon } = Player;
const { vector } = Player;

let gameData = null;

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
  speed: 8,              // سرعة اللاعب الأفقية (متر/ثانية)
  gravity: -16,          // قوة الجاذبية (متر/ثانية²)
  terminalVelocity: 40,  // أقصى سرعة سقوط (متر/ثانية)
  maxDt: 0.1,            // أقصى زمن إطار (ثانية) حتى لا يقفز اللاعب عند تأخر السيرفر
  maxStep: 0.15,         // أقصى مسافة في الخطوة الفرعية الواحدة (لمنع الاختراق)
  maxSteps: 16,          // أقصى عدد خطوات فرعية في الإطار الواحد
  maxIterations: 6,      // عدد محاولات دفع اللاعب خارج الأجسام في كل خطوة
  skin: 0.001,           // فراغ صغير يُترك بين اللاعب والجسم بعد الدفع
  eps: 1e-6,             // أقل تداخل يُعتبر تصادماً
  stepUp: 0.35,          // أقصى ارتفاع عتبة/درجة يصعدها اللاعب تلقائياً (متر)
  snapDown: 0.4,         // أقصى مسافة "لصق بالأرض" عند النزول على منحدر أو درجة (متر)
  walkableNy: 0.65,      // أقل قيمة لـ normal.y ليُعتبر السطح قابلاً للمشي (≈ منحدر 49° كحد أقصى)
  minHorizontal: 0.3,    // أقل مركبة أفقية للـ normal لاعتبار السطح جداراً
  voidY: -50,            // أسفل هذا الارتفاع يُعاد اللاعب إلى نقطة ظهوره
  obbTolerance: 0.02     // سماحية فحص صحة بيانات الدوران (انظر buildCollider)
};

// يجب أن تطابق أبعاد getBounds() في player.js (نصف العرض والارتفاع والعمق)
const PLAYER_HALF = { x: 0.4, y: 0.95, z: 0.3 };

// ---------------------------------------------------------------------
//  معلومات التلامس بين صندوق اللاعب و collider (SAT):
//   lift : أقل رفع للأعلى يفصل اللاعب عن الجسم عبر سطح قابل للمشي (أرضية/منحدر/درجة)
//   down : أقل خفض للأسفل (سقف)
//   hs   : أقل دفع أفقي يفصلهما، بالاتجاه (hx, hz)  (جدار)
// ---------------------------------------------------------------------
const _ct = { lift: Infinity, down: Infinity, hs: Infinity, hx: 0, hz: 0 };

function contactInfo(c, px, py, pz, ex, ey, ez) {
  if (px + ex <= c.minX || px - ex >= c.maxX ||
      py + ey <= c.minY || py - ey >= c.maxY ||
      pz + ez <= c.minZ || pz - ez >= c.maxZ) return false;

  const dx = px - c.cx, dy = py - c.cy, dz = pz - c.cz;
  const a = c.axes;
  let lift = Infinity, down = Infinity, hs = Infinity, hx = 0, hz = 0;

  for (let i = 0; i < a.length; i += 4) {
    const lx = a[i], ly = a[i + 1], lz = a[i + 2];
    const rA = ex * Math.abs(lx) + ey * Math.abs(ly) + ez * Math.abs(lz);
    const dist = dx * lx + dy * ly + dz * lz;
    const overlap = rA + a[i + 3] - Math.abs(dist);
    if (overlap <= MOVE.eps) return false;       // محور فاصل => لا تلامس

    const s = dist < 0 ? -1 : 1;                 // نوجّه الاتجاه من الجسم نحو اللاعب
    const nx = lx * s, ny = ly * s, nz = lz * s;

    if (ny >= MOVE.walkableNy) {
      const t = overlap / ny;
      if (t < lift) lift = t;
    } else if (ny <= -MOVE.walkableNy) {
      const t = overlap / -ny;
      if (t < down) down = t;
    }

    const hl = Math.hypot(nx, nz);
    if (hl >= MOVE.minHorizontal) {
      const t = overlap / hl;
      if (t < hs) { hs = t; hx = nx / hl; hz = nz / hl; }
    }
  }

  _ct.lift = lift; _ct.down = down; _ct.hs = hs; _ct.hx = hx; _ct.hz = hz;
  return true;
}

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

    async onCreate(){

        this.setState(new GameState());
        this.setMetadata({
          mode:"classicFFA",
          maxPlayers: 8
        });
        this.collisionBoxes = [];
        this.colliders = [];
        this.setCollisionBoxes();
        if (gameData === null) {
          let res = await fs.readFile(`./GameData.json`, "utf8");
          gameData = JSON.parse(res);
        }
        console.log("Room started");

        this.onMessage("selection", (client, data)=>{
          const player = this.state.players.get(client.sessionId);
          if (!player) return;

          let c = gameData.characters[data.char] ? data.char : "";
          player.char = c;
          player.weapons.main = new weapon(gameData.weapons[gameData.characters[data.char].main_weapon]);
          player.weapons.sec = new weapon(gameData.weapons[data.weapon]);
        })

        this.onMessage("switchWeapon", (client, data) => {
          const player = this.state.players.get(client.sessionId);
          if (!player) return;

          if (data.to === "main") {
            player.equiped = "main";
          }
          else if (data.to === "sec") {
            player.equiped = "sec";
          }
        });

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


            let weapon = player.weapons[player.equiped];
            let allowed = true;

            if (weapon.ammo <= 0) {
              player.reload();
              allowed = false;
            }

            if (player.reloading) {
              allowed = false;
            }

            if (player.lastFire/1000 <= 1/weapon.fire_rate) {
              player.lastFire = 0;
              allowed = false;
              return;
            }

            if (allowed === true) {

            weapon.ammo -= 1;

            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// "l4x8k2m9p" (حوالي 9-10 أحرف)
            
            let damage = data.atktype === 'atk' ? weapon.damage : weapon.damage2;
            let bullet = data.atktype === 'atk' ? gameData.bullet[weapon.bullet] : gameData.bullet[weapon.bullet2];
            let speed = bullet.speed;
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

        this.onMessage("jump", (client) => {
          const player = this.state.players.get(client.sessionId);
          if (player && player.grounded) { player.velY = 7; player.grounded = false; }
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
             b.distance += b.velocity.clone().length() * (deltaTime/1000);

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
        
             if (b.life <= 0 || b.position.isInfinity() || b.distance > b.maxDistance) {
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

        /*player.weapons.main = new weapon(weapons.electric_charger);
        player.weapons.sec = new weapon(weapons.thunderifle);
*/

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
        player.spawnPoint = spawnPoint;   // لإعادته إليها إن سقط خارج العالم
        player.velY = 0;
        player.grounded = false;
        
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

    // يدفع اللاعب خارج الأجسام المتداخلة معه:
    //  - سطح قابل للمشي (أرضية، منحدر، درجة ≤ maxLift): يُرفع اللاعب فوقه عمودياً (لا ينزلق عليه)
    //  - سقف: يُخفض
    //  - جدار (أو منحدر شديد): يُدفع أفقياً فيبقى انزلاقه المماسي فقط
    // يُرجع true عند النجاح. ويضبط this._supported / this._ceiling.
    resolvePosition(p, maxLift) {
      const ex = PLAYER_HALF.x, ey = PLAYER_HALF.y, ez = PLAYER_HALF.z;
      this._supported = false;
      this._ceiling = false;

      for (let iter = 0; iter <= MOVE.maxIterations; iter++) {
        let changed = false;

        for (const c of this.colliders) {
          if (!contactInfo(c, p.x, p.y, p.z, ex, ey, ez)) continue;

          const lift = _ct.lift, down = _ct.down, hs = _ct.hs;

          if (lift <= maxLift) {
            p.y += lift + MOVE.skin;
            this._supported = true;
          } else if (down < hs) {
            p.y -= down + MOVE.skin;
            this._ceiling = true;
          } else if (hs !== Infinity) {
            const push = hs + MOVE.skin;
            p.x += _ct.hx * push;
            p.z += _ct.hz * push;
          } else {
            continue; // لا مخرج معروف لهذا التلامس
          }
          changed = true;
        }

        if (!changed) return true;
      }
      return false;
    }

    movePlayer(player, dt) {
      if (player.isDead || player.respawning) return;

      // حالة الحركة الرأسية (غير متزامنة مع الكلاينت)
      if (player.velY === undefined) { player.velY = 0; player.grounded = false; }

      let ix = Number(player.inputX), iz = Number(player.inputZ);
      if (!Number.isFinite(ix)) ix = 0;
      if (!Number.isFinite(iz)) iz = 0;

      const len = Math.hypot(ix, iz);
      const moving = len >= 0.001;
      if (len > 1) { ix /= len; iz /= len; }      // الحركة القطرية بنفس سرعة المستقيمة

      // واقف على الأرض بدون أي حركة: لا حاجة لأي حساب
      if (!moving && player.grounded && player.velY === 0) return;

      const wasGrounded = !!player.grounded;

      const dx = moving ? ix * MOVE.speed * dt : 0;
      const dz = moving ? iz * MOVE.speed * dt : 0;

      // الجاذبية (تكامل شبه ضمني)
      let vy = player.velY + MOVE.gravity * dt;
      if (vy < -MOVE.terminalVelocity) vy = -MOVE.terminalVelocity;
      const dy = (player.velY + vy) * 0.5 * dt;

      // نقسم الحركة إلى خطوات صغيرة حتى لا يخترق اللاعب الأجسام الرقيقة
      const dist = Math.max(Math.hypot(dx, dz), Math.abs(dy));
      const steps = Math.max(1, Math.min(MOVE.maxSteps, Math.ceil(dist / MOVE.maxStep)));
      const sx = dx / steps, sy = dy / steps, sz = dz / steps;

      const pos = player.position;
      const p = { x: pos.x, y: pos.y, z: pos.z };

      let supported = false, hitCeiling = false;

      for (let i = 0; i < steps; i++) {
        const px = p.x, py = p.y, pz = p.z;
        p.x += sx; p.y += sy; p.z += sz;

        const maxLift = MOVE.stepUp + Math.max(0, -sy);
        if (!this.resolvePosition(p, maxLift)) {
          // تعذر الحل: نرجع لآخر موضع سليم ونتوقف
          p.x = px; p.y = py; p.z = pz;
          break;
        }
        supported = this._supported;               // الحالة في آخر خطوة
        if (this._ceiling) hitCeiling = true;
      }

      let grounded = supported;
      let newVy = vy;
      if (supported && newVy < 0) newVy = 0;       // هبوط على سطح
      if (hitCeiling && newVy > 0) newVy = 0;      // ارتطام الرأس بسقف

      // لصق بالأرض عند النزول على منحدر أو درجة بدل التقطّع في الهواء
      if (!grounded && wasGrounded && newVy <= 0) {
        const bx = p.x, by = p.y, bz = p.z;
        p.y -= MOVE.snapDown;
        if (this.resolvePosition(p, MOVE.snapDown + MOVE.skin * 2) && this._supported) {
          grounded = true;
          newVy = 0;
        } else {
          p.x = bx; p.y = by; p.z = bz;
        }
      }

      // سقط خارج العالم: نعيده إلى نقطة ظهوره
      if (p.y < MOVE.voidY) {
        const sp = player.spawnPoint;
        if (sp) { p.x = sp.x; p.y = sp.y; p.z = sp.z; }
        else { p.y = MOVE.voidY; }
        newVy = 0;
        grounded = false;
      }

      player.velY = newVy;
      player.grounded = grounded;

      // لا نكتب في الـ Schema إلا عند حدوث تغيير فعلي (يقلل بيانات الشبكة)
      let changed = false;
      if (Math.abs(p.x - pos.x) > 1e-6) { pos.x = p.x; changed = true; }
      if (Math.abs(p.y - pos.y) > 1e-6) { pos.y = p.y; changed = true; }
      if (Math.abs(p.z - pos.z) > 1e-6) { pos.z = p.z; changed = true; }
      if (changed) player.lastPosition.copy(pos);
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

    createBot() {
      
    }

    addBots() {
      
    }

    startMatch() {
      if (this.state.players < 8) {
        this.addBots();
      }
      this.state.gameStarted = true;
      this.setSpawnLocations()

      this.broadcast("matchStatus", {
        gameStarted: true
      });
    }

    
}





module.exports = classicRoom;