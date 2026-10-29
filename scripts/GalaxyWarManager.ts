
import * as THREE from 'three'
import { SoundSystem } from './SoundSystem'

interface EnemyData {
  x: number
  y: number
  baseX: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  type: number // 0 = Drone, 1 = Interceptor, 2 = Cruiser
  wave: number
  active: boolean
  alive: boolean
  shootTimer: number
  phase: number
}

interface Bullet {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
}

interface Particle {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  r: number
  g: number
  b: number
}

interface Powerup {
  active: boolean
  x: number
  y: number
  vy: number
  type: 'heal' | 'upgrade' | 'bomb'
  rot: number
}

export default class GalaxyWarManager {
  private ctx: any
  private sound: SoundSystem = new SoundSystem()

  // 1000 Enemies Armada
  private totalEnemies: number = 1000
  private enemies: EnemyData[] = []
  private killedCount: number = 0
  private currentWave: number = 1
  private score: number = 0
  private gameEnded: boolean = false

  // Three.js Instanced Meshes
  private enemyMesh!: THREE.InstancedMesh
  private playerBulletMesh!: THREE.InstancedMesh
  private enemyBulletMesh!: THREE.InstancedMesh
  private particleMesh!: THREE.InstancedMesh
  private powerupMesh!: THREE.InstancedMesh
  private starfieldMesh!: THREE.InstancedMesh
  private bombShockwaveMesh!: THREE.Mesh

  // Bullet & Particle Pools
  private playerBullets: Bullet[] = []
  private enemyBullets: Bullet[] = []
  private particles: Particle[] = []
  private powerups: Powerup[] = []
  private stars: { x: number; y: number; speed: number }[] = []

  // Shockwave Animation
  private bombRadius: number = 0
  private bombActive: boolean = false
  private bombCenter: THREE.Vector2 = new THREE.Vector2(0, 0)

  // Dummy Object3D for matrix updates
  private dummy: THREE.Object3D = new THREE.Object3D()

  // Player cached reference
  private playerPos: THREE.Vector3 = new THREE.Vector3(0, -8, 0)
  private playerHp: number = 100
  private playerMaxHp: number = 100
  private playerWeapon: number = 1
  private playerBombReady: boolean = true

  onInit(ctx: any) {
    this.ctx = ctx

    this.initArmada()
    this.initGraphics()
    this.initUI()
    this.initEvents()
  }

  private initArmada() {
    this.enemies = []
    this.killedCount = 0
    this.currentWave = 1
    this.score = 0
    this.gameEnded = false

    // Total 1000 enemies divided into 5 waves:
    // Wave 1: 100 Drones (Fast sin-wave scouts)
    // Wave 2: 200 Interceptors (Twin assault wings)
    // Wave 3: 200 Drones + Interceptors (Flanking crossfire)
    // Wave 4: 250 Heavy Raiders (High density storm)
    // Wave 5: 250 Dreadnought Vanguard (The Final 1000 Armageddon)
    for (let i = 0; i < this.totalEnemies; i++) {
      let wave = 1
      let type = 0
      let hp = 1

      if (i < 100) {
        wave = 1
        type = 0
        hp = 1
      } else if (i < 300) {
        wave = 2
        type = (i % 3 === 0) ? 1 : 0
        hp = type === 1 ? 2 : 1
      } else if (i < 500) {
        wave = 3
        type = (i % 2 === 0) ? 1 : 0
        hp = type === 1 ? 2 : 1
      } else if (i < 750) {
        wave = 4
        type = (i % 4 === 0) ? 2 : ((i % 2 === 0) ? 1 : 0)
        hp = type === 2 ? 4 : (type === 1 ? 2 : 1)
      } else {
        wave = 5
        type = (i % 3 === 0) ? 2 : 1
        hp = type === 2 ? 4 : 2
      }

      const spawnX = (Math.random() - 0.5) * 26
      const spawnY = 14 + Math.random() * 30 + ((i % 50) * 1.5)

      this.enemies.push({
        x: spawnX,
        y: spawnY,
        baseX: spawnX,
        vx: 0,
        vy: -(3.5 + Math.random() * 2.5 + type * 0.5),
        hp: hp,
        maxHp: hp,
        type: type,
        wave: wave,
        active: wave === 1,
        alive: true,
        shootTimer: 1.5 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2
      })
    }
  }

  private initGraphics() {
    const parent = this.ctx.object3D
    if (!parent) return

    // 1. Starfield Background (300 stars scrolling down)
    const starGeo = new THREE.PlaneGeometry(0.12, 0.12)
    const starMat = new THREE.MeshBasicMaterial({ color: 0x93c5fd })
    this.starfieldMesh = new THREE.InstancedMesh(starGeo, starMat, 300)
    for (let i = 0; i < 300; i++) {
      const star = {
        x: (Math.random() - 0.5) * 36,
        y: (Math.random() - 0.5) * 26,
        speed: 2 + Math.random() * 8
      }
      this.stars.push(star)
      this.dummy.position.set(star.x, star.y, -3)
      this.dummy.scale.setScalar(0.5 + (star.speed / 10) * 1.2)
      this.dummy.updateMatrix()
      this.starfieldMesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.starfieldMesh.instanceMatrix.needsUpdate = true
    parent.add(this.starfieldMesh)

    // 2. 1000 Enemies InstancedMesh
    // Alien fighter shape: Faceted swept cone/prism
    const enemyGeo = new THREE.ConeGeometry(0.5, 1.2, 4)
    const enemyMat = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.8
    })
    this.enemyMesh = new THREE.InstancedMesh(enemyGeo, enemyMat, this.totalEnemies)
    const colDrone = new THREE.Color(0xf43f5e)      // Crimson Drone
    const colInterceptor = new THREE.Color(0xfbbf24) // Gold Interceptor
    const colCruiser = new THREE.Color(0xa855f7)     // Violet Heavy Cruiser

    for (let i = 0; i < this.totalEnemies; i++) {
      const e = this.enemies[i]
      this.dummy.position.set(e.x, e.y, 0)
      this.dummy.rotation.set(0, 0, Math.PI) // Facing down
      this.dummy.scale.set(0.9 + e.type * 0.3, 0.9 + e.type * 0.3, 0.9 + e.type * 0.3)
      this.dummy.updateMatrix()
      this.enemyMesh.setMatrixAt(i, this.dummy.matrix)

      const col = e.type === 2 ? colCruiser : (e.type === 1 ? colInterceptor : colDrone)
      this.enemyMesh.setColorAt(i, col)
    }
    this.enemyMesh.instanceMatrix.needsUpdate = true
    if (this.enemyMesh.instanceColor) this.enemyMesh.instanceColor.needsUpdate = true
    parent.add(this.enemyMesh)

    // 3. Player Bullets (150 instanced glowing laser bolts)
    const pBulletGeo = new THREE.BoxGeometry(0.18, 0.8, 0.1)
    const pBulletMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    this.playerBulletMesh = new THREE.InstancedMesh(pBulletGeo, pBulletMat, 150)
    for (let i = 0; i < 150; i++) {
      this.playerBullets.push({ active: false, x: 0, y: -999, vx: 0, vy: 38 })
      this.dummy.position.set(0, -999, 0)
      this.dummy.updateMatrix()
      this.playerBulletMesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.playerBulletMesh.instanceMatrix.needsUpdate = true
    parent.add(this.playerBulletMesh)

    // 4. Enemy Bullets (120 instanced red plasma orbs)
    const eBulletGeo = new THREE.SphereGeometry(0.2, 6, 6)
    const eBulletMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e })
    this.enemyBulletMesh = new THREE.InstancedMesh(eBulletGeo, eBulletMat, 120)
    for (let i = 0; i < 120; i++) {
      this.enemyBullets.push({ active: false, x: 0, y: -999, vx: 0, vy: -12 })
      this.dummy.position.set(0, -999, 0)
      this.dummy.updateMatrix()
      this.enemyBulletMesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.enemyBulletMesh.instanceMatrix.needsUpdate = true
    parent.add(this.enemyBulletMesh)

    // 5. Explosion Particles (250 spark fragments)
    const partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12)
    const partMat = new THREE.MeshBasicMaterial({ color: 0xfef08a })
    this.particleMesh = new THREE.InstancedMesh(partGeo, partMat, 250)
    for (let i = 0; i < 250; i++) {
      this.particles.push({
        active: false,
        x: 0, y: -999,
        vx: 0, vy: 0,
        life: 0, maxLife: 1,
        r: 1, g: 0.8, b: 0.2
      })
      this.dummy.position.set(0, -999, 0)
      this.dummy.updateMatrix()
      this.particleMesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.particleMesh.instanceMatrix.needsUpdate = true
    parent.add(this.particleMesh)

    // 6. Powerups (15 pickups: shield repair, upgrade, bomb)
    const powGeo = new THREE.OctahedronGeometry(0.4)
    const powMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.5,
      roughness: 0.2
    })
    this.powerupMesh = new THREE.InstancedMesh(powGeo, powMat, 15)
    for (let i = 0; i < 15; i++) {
      this.powerups.push({
        active: false,
        x: 0, y: -999,
        vy: -3.5,
        type: 'heal',
        rot: 0
      })
      this.dummy.position.set(0, -999, 0)
      this.dummy.updateMatrix()
      this.powerupMesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.powerupMesh.instanceMatrix.needsUpdate = true
    parent.add(this.powerupMesh)

    // 7. Shockwave Ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.5, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0
    })
    this.bombShockwaveMesh = new THREE.Mesh(ringGeo, ringMat)
    this.bombShockwaveMesh.position.set(0, -999, 0.5)
    parent.add(this.bombShockwaveMesh)
  }

  private initUI() {
    if (!this.ctx.ui) return

    // Bind reactive stats
    this.ctx.ui.bind('#enemies-left', () => Math.max(0, this.totalEnemies - this.killedCount))
    this.ctx.ui.bind('#score-display', () => this.score.toLocaleString())

    // Buttons
    this.ctx.ui.on('#btn-victory-restart', 'click', () => {
      this.restartGame()
    })
    this.ctx.ui.on('#btn-defeat-restart', 'click', () => {
      this.restartGame()
    })
  }

  private initEvents() {
    // Player shoot
    this.ctx.on('player_shoot', (data: { x: number; y: number; level: number }) => {
      this.spawnPlayerBullets(data.x, data.y, data.level)
    })

    // Player bomb
    this.ctx.on('player_bomb', (data: { x: number; y: number }) => {
      this.triggerBomb(data.x, data.y)
    })

    // Player HP
    this.ctx.on('player_hp_changed', (data: { hp: number; maxHp: number }) => {
      this.playerHp = data.hp
      this.playerMaxHp = data.maxHp
      this.updateHpUI()
    })

    // Player Weapon
    this.ctx.on('player_weapon_changed', (data: { level: number }) => {
      this.playerWeapon = data.level
      const el = document.getElementById('weapon-text')
      if (el) {
        const names = ['', 'PLASMA BLASTER (LVL 1)', 'TWIN CHARGED (LVL 2)', 'TRI-BEAM OVERDRIVE (LVL 3)']
        el.innerText = 'WEAPON: ' + (names[data.level] || 'MAX LVL')
      }
    })

    // Player Died
    this.ctx.on('player_died', () => {
      this.onGameOver()
    })
  }

  private updateHpUI() {
    const pct = Math.max(0, Math.min(100, (this.playerHp / this.playerMaxHp) * 100))
    const bar = document.getElementById('hp-bar')
    const txt = document.getElementById('hp-percent')
    if (bar) {
      bar.style.width = pct + '%'
      if (pct < 30) {
        bar.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)'
        bar.style.boxShadow = '0 0 10px #ef4444'
      } else if (pct < 60) {
        bar.style.background = 'linear-gradient(90deg, #d97706, #f59e0b)'
        bar.style.boxShadow = '0 0 10px #f59e0b'
      } else {
        bar.style.background = 'linear-gradient(90deg, #059669, #10b981)'
        bar.style.boxShadow = '0 0 10px #10b981'
      }
    }
    if (txt) {
      txt.innerText = Math.round(pct) + '%'
      txt.style.color = pct < 30 ? '#ef4444' : (pct < 60 ? '#f59e0b' : '#10b981')
    }
  }

  private spawnPlayerBullets(x: number, y: number, level: number) {
    if (level === 1) {
      // Twin lasers from cannons
      this.createPlayerBullet(x - 0.7, y, 0, 38)
      this.createPlayerBullet(x + 0.7, y, 0, 38)
    } else if (level === 2) {
      // Triple spread lasers
      this.createPlayerBullet(x - 0.75, y, -2.5, 38)
      this.createPlayerBullet(x, y + 0.3, 0, 40)
      this.createPlayerBullet(x + 0.75, y, 2.5, 38)
    } else {
      // 5-way spread blaster
      this.createPlayerBullet(x - 0.8, y, -5, 36)
      this.createPlayerBullet(x - 0.4, y + 0.2, -2, 38)
      this.createPlayerBullet(x, y + 0.4, 0, 42)
      this.createPlayerBullet(x + 0.4, y + 0.2, 2, 38)
      this.createPlayerBullet(x + 0.8, y, 5, 36)
    }
  }

  private createPlayerBullet(x: number, y: number, vx: number, vy: number) {
    for (const b of this.playerBullets) {
      if (!b.active) {
        b.active = true
        b.x = x
        b.y = y
        b.vx = vx
        b.vy = vy
        return
      }
    }
  }

  private createEnemyBullet(x: number, y: number, vx: number, vy: number) {
    for (const b of this.enemyBullets) {
      if (!b.active) {
        b.active = true
        b.x = x
        b.y = y
        b.vx = vx
        b.vy = vy
        return
      }
    }
  }

  private spawnExplosion(x: number, y: number, count: number = 10, isHeavy: boolean = false) {
    let spawned = 0
    for (const p of this.particles) {
      if (!p.active) {
        p.active = true
        p.x = x
        p.y = y
        const angle = Math.random() * Math.PI * 2
        const spd = 2 + Math.random() * (isHeavy ? 14 : 9)
        p.vx = Math.cos(angle) * spd
        p.vy = Math.sin(angle) * spd
        p.life = 0
        p.maxLife = 0.3 + Math.random() * 0.4
        spawned++
        if (spawned >= count) break
      }
    }
  }

  private spawnPowerup(x: number, y: number) {
    for (const p of this.powerups) {
      if (!p.active) {
        p.active = true
        p.x = x
        p.y = y
        p.vy = -3.5
        p.rot = 0
        const rnd = Math.random()
        p.type = rnd < 0.45 ? 'heal' : (rnd < 0.8 ? 'upgrade' : 'bomb')
        return
      }
    }
  }

  private triggerBomb(x: number, y: number) {
    this.bombActive = true
    this.bombRadius = 0.5
    this.bombCenter.set(x, y)
    this.bombShockwaveMesh.position.set(x, y, 0.5)
    this.bombShockwaveMesh.scale.set(1, 1, 1)
    if (this.bombShockwaveMesh.material instanceof THREE.Material) {
      (this.bombShockwaveMesh.material as any).opacity = 0.9
    }

    // Clear all enemy bullets on screen
    for (const b of this.enemyBullets) {
      if (b.active) {
        b.active = false
        b.y = -999
        this.spawnExplosion(b.x, b.y, 3, false)
      }
    }

    // Damage all nearby enemies
    let wiped = 0
    for (let i = 0; i < this.totalEnemies; i++) {
      const e = this.enemies[i]
      if (e.active && e.alive && e.y < 12 && e.y > -12) {
        const dx = e.x - x
        const dy = e.y - y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= 16) {
          e.hp = 0
          e.alive = false
          this.killedCount++
          wiped++
          this.score += 150
          this.spawnExplosion(e.x, e.y, 14, true)
        }
      }
    }

    this.checkWaveProgress()
  }

  private checkWaveProgress() {
    // 5 waves:
    // Wave 1 ends at 100 kills -> Wave 2 activates
    // Wave 2 ends at 300 kills -> Wave 3 activates
    // Wave 3 ends at 500 kills -> Wave 4 activates
    // Wave 4 ends at 750 kills -> Wave 5 activates
    // Wave 5 ends at 1000 kills -> Victory!
    let nextWave = 1
    if (this.killedCount >= 750) nextWave = 5
    else if (this.killedCount >= 500) nextWave = 4
    else if (this.killedCount >= 300) nextWave = 3
    else if (this.killedCount >= 100) nextWave = 2

    if (nextWave !== this.currentWave && nextWave <= 5) {
      this.currentWave = nextWave
      this.activateWave(nextWave)
    }

    if (this.killedCount >= this.totalEnemies && !this.gameEnded) {
      this.onVictory()
    }
  }

  private activateWave(wave: number) {
    // Activate all enemies in this wave
    for (let i = 0; i < this.totalEnemies; i++) {
      if (this.enemies[i].wave <= wave && this.enemies[i].alive) {
        this.enemies[i].active = true
      }
    }

    // Display wave toast
    const waveNames = [
      '',
      'WAVE 1 // THE VANGUARD',
      'WAVE 2 // SWARM CLOUD',
      'WAVE 3 // METEOR ASSAULT',
      'WAVE 4 // NEBULA VORTEX',
      'WAVE 5 // FINAL ARMADA (1000 TOTAL)'
    ]
    const badge = document.getElementById('wave-badge')
    if (badge) badge.innerText = waveNames[wave] || 'WAVE ' + wave

    const toast = document.getElementById('wave-toast')
    const tTitle = document.getElementById('toast-title')
    const tSub = document.getElementById('toast-sub')
    if (toast && tTitle && tSub) {
      tTitle.innerText = 'WAVE ' + wave
      tSub.innerText = waveNames[wave]
      toast.classList.add('show')
      setTimeout(() => {
        toast.classList.remove('show')
      }, 2500)
    }
  }

  private onVictory() {
    this.gameEnded = true
    this.sound.playPowerup()
    const modal = document.getElementById('victory-modal')
    const scoreVal = document.getElementById('victory-score')
    if (scoreVal) scoreVal.innerText = this.score.toLocaleString()
    if (modal) modal.classList.add('active')
  }

  private onGameOver() {
    this.gameEnded = true
    const modal = document.getElementById('defeat-modal')
    const killsVal = document.getElementById('defeat-kills')
    const scoreVal = document.getElementById('defeat-score')
    if (killsVal) killsVal.innerText = this.killedCount.toString()
    if (scoreVal) scoreVal.innerText = this.score.toLocaleString()
    if (modal) modal.classList.add('active')
  }

  private restartGame() {
    const vic = document.getElementById('victory-modal')
    const def = document.getElementById('defeat-modal')
    if (vic) vic.classList.remove('active')
    if (def) def.classList.remove('active')

    this.initArmada()
    this.updateHpUI()

    // Reset bullets and particles
    for (const b of this.playerBullets) { b.active = false; b.y = -999; }
    for (const b of this.enemyBullets) { b.active = false; b.y = -999; }
    for (const p of this.particles) { p.active = false; p.y = -999; }
    for (const pw of this.powerups) { pw.active = false; pw.y = -999; }

    this.ctx.emit('game_restart')
  }

  onUpdate(dt: number) {
    // 1. Update Parallax Starfield
    if (this.starfieldMesh) {
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i]
        s.y -= s.speed * dt
        if (s.y < -14) {
          s.y = 14
          s.x = (Math.random() - 0.5) * 36
        }
        this.dummy.position.set(s.x, s.y, -3)
        this.dummy.scale.setScalar(0.4 + (s.speed / 10) * 0.9)
        this.dummy.updateMatrix()
        this.starfieldMesh.setMatrixAt(i, this.dummy.matrix)
      }
      this.starfieldMesh.instanceMatrix.needsUpdate = true
    }

    // 2. Fetch Player position
    const players = this.ctx.scene.findByTag('Player')
    if (players && players[0]) {
      const ptr = players[0].getTransform()
      if (ptr) {
        this.playerPos.set(ptr.position[0], ptr.position[1], ptr.position[2])
      }
    }

    // 3. Update Bomb Shockwave
    if (this.bombActive) {
      this.bombRadius += 28 * dt
      this.bombShockwaveMesh.scale.set(this.bombRadius, this.bombRadius, 1)
      const op = Math.max(0, 1 - (this.bombRadius / 18))
      if (this.bombShockwaveMesh.material instanceof THREE.Material) {
        (this.bombShockwaveMesh.material as any).opacity = op
      }
      if (this.bombRadius >= 18) {
        this.bombActive = false
        this.bombShockwaveMesh.position.set(0, -999, 0)
      }
    }

    // 4. Update 1000 Enemies
    let updatedAnyEnemy = false
    const time = this.ctx.time ? this.ctx.time.elapsed : Date.now() * 0.001

    if (this.enemyMesh) {
      for (let i = 0; i < this.totalEnemies; i++) {
        const e = this.enemies[i]
        if (!e.active || !e.alive) {
          // Keep dead / inactive offscreen
          if (e.y !== -999) {
            e.y = -999
            this.dummy.position.set(0, -999, 0)
            this.dummy.updateMatrix()
            this.enemyMesh.setMatrixAt(i, this.dummy.matrix)
            updatedAnyEnemy = true
          }
          continue
        }

        // Active enemy movement
        e.y += e.vy * dt

        // Sinuous sweep based on type
        if (e.type === 0) {
          e.x = e.baseX + Math.sin(time * 3 + e.phase) * 2.2
        } else if (e.type === 1) {
          e.x = e.baseX + Math.cos(time * 2 + e.phase) * 3.5
        } else {
          // Heavy Cruiser tracks player slowly
          e.x += (this.playerPos.x - e.x) * dt * 0.8
        }

        // If falls past bottom of screen, loop back from top so no enemy is missed!
        if (e.y < -13) {
          e.y = 13 + Math.random() * 8
          e.baseX = (Math.random() - 0.5) * 26
        }

        // Enemy Shooting
        e.shootTimer -= dt
        if (e.shootTimer <= 0 && e.y < 11 && e.y > -8) {
          e.shootTimer = 2.5 + Math.random() * 3.5
          this.sound.playEnemyLaser()
          if (e.type === 2) {
            // Twin heavy bolts
            this.createEnemyBullet(e.x - 0.4, e.y - 0.8, -1, -12)
            this.createEnemyBullet(e.x + 0.4, e.y - 0.8, 1, -12)
          } else {
            // Aim slightly towards player
            const dx = this.playerPos.x - e.x
            const dy = this.playerPos.y - e.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const bvx = dist > 0 ? (dx / dist) * 4 : 0
            this.createEnemyBullet(e.x, e.y - 0.8, bvx, -13)
          }
        }

        // Collision with player (Ramming damage)
        const pdistX = Math.abs(e.x - this.playerPos.x)
        const pdistY = Math.abs(e.y - this.playerPos.y)
        if (pdistX < 1.4 && pdistY < 1.4) {
          // Rammed player
          e.hp = 0
          e.alive = false
          this.killedCount++
          this.spawnExplosion(e.x, e.y, 15, true)
          this.ctx.emit('player_hit', { damage: 25 })
          this.checkWaveProgress()
        }

        // Update instance matrix
        this.dummy.position.set(e.x, e.y, 0)
        this.dummy.rotation.set(0, 0, Math.PI + Math.sin(time * 4 + e.phase) * 0.15)
        const sc = 0.9 + e.type * 0.3
        this.dummy.scale.set(sc, sc, sc)
        this.dummy.updateMatrix()
        this.enemyMesh.setMatrixAt(i, this.dummy.matrix)
        updatedAnyEnemy = true
      }

      if (updatedAnyEnemy) {
        this.enemyMesh.instanceMatrix.needsUpdate = true
      }
    }

    // 5. Update Player Bullets & Collision Check
    if (this.playerBulletMesh) {
      let pbUpdated = false
      for (let i = 0; i < this.playerBullets.length; i++) {
        const b = this.playerBullets[i]
        if (!b.active) continue

        b.x += b.vx * dt
        b.y += b.vy * dt

        if (b.y > 14 || b.x < -18 || b.x > 18) {
          b.active = false
          b.y = -999
        } else {
          // Check collision against active alive enemies
          for (let j = 0; j < this.totalEnemies; j++) {
            const e = this.enemies[j]
            if (e.active && e.alive && e.y < 12 && e.y > -11) {
              const dx = Math.abs(b.x - e.x)
              const dy = Math.abs(b.y - e.y)
              const hitRadius = 0.6 + e.type * 0.25
              if (dx < hitRadius && dy < hitRadius) {
                // Bullet hit enemy!
                b.active = false
                b.y = -999
                e.hp--
                this.spawnExplosion(b.x, b.y, 4, false)

                if (e.hp <= 0) {
                  e.alive = false
                  this.killedCount++
                  this.score += e.type === 2 ? 300 : (e.type === 1 ? 150 : 100)
                  this.sound.playExplosion(e.type === 2)
                  this.spawnExplosion(e.x, e.y, 12, e.type === 2)

                  // Drop power-up chance (10%)
                  if (Math.random() < 0.10) {
                    this.spawnPowerup(e.x, e.y)
                  }

                  this.checkWaveProgress()
                }
                break
              }
            }
          }
        }

        this.dummy.position.set(b.x, b.y, 0)
        this.dummy.updateMatrix()
        this.playerBulletMesh.setMatrixAt(i, this.dummy.matrix)
        pbUpdated = true
      }
      if (pbUpdated) {
        this.playerBulletMesh.instanceMatrix.needsUpdate = true
      }
    }

    // 6. Update Enemy Bullets & Check Player Hit
    if (this.enemyBulletMesh) {
      let ebUpdated = false
      for (let i = 0; i < this.enemyBullets.length; i++) {
        const b = this.enemyBullets[i]
        if (!b.active) continue

        b.x += b.vx * dt
        b.y += b.vy * dt

        if (b.y < -14 || b.x < -18 || b.x > 18) {
          b.active = false
          b.y = -999
        } else {
          // Check collision with player
          const dx = Math.abs(b.x - this.playerPos.x)
          const dy = Math.abs(b.y - this.playerPos.y)
          if (dx < 0.9 && dy < 1.1) {
            b.active = false
            b.y = -999
            this.spawnExplosion(b.x, b.y, 6, false)
            this.ctx.emit('player_hit', { damage: 12 })
          }
        }

        this.dummy.position.set(b.x, b.y, 0)
        this.dummy.updateMatrix()
        this.enemyBulletMesh.setMatrixAt(i, this.dummy.matrix)
        ebUpdated = true
      }
      if (ebUpdated) {
        this.enemyBulletMesh.instanceMatrix.needsUpdate = true
      }
    }

    // 7. Update Particles
    if (this.particleMesh) {
      let pUpdated = false
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i]
        if (!p.active) continue

        p.life += dt
        if (p.life >= p.maxLife) {
          p.active = false
          p.y = -999
        } else {
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vx *= 0.96
          p.vy *= 0.96
        }

        const sc = Math.max(0.01, 1 - (p.life / p.maxLife))
        this.dummy.position.set(p.x, p.y, 0)
        this.dummy.scale.setScalar(sc)
        this.dummy.updateMatrix()
        this.particleMesh.setMatrixAt(i, this.dummy.matrix)
        pUpdated = true
      }
      if (pUpdated) {
        this.particleMesh.instanceMatrix.needsUpdate = true
      }
    }

    // 8. Update Powerups
    if (this.powerupMesh) {
      let pwUpdated = false
      for (let i = 0; i < this.powerups.length; i++) {
        const pw = this.powerups[i]
        if (!pw.active) continue

        pw.y += pw.vy * dt
        pw.rot += dt * 3

        if (pw.y < -13) {
          pw.active = false
          pw.y = -999
        } else {
          // Check player pickup
          const dx = Math.abs(pw.x - this.playerPos.x)
          const dy = Math.abs(pw.y - this.playerPos.y)
          if (dx < 1.4 && dy < 1.4) {
            pw.active = false
            pw.y = -999
            this.ctx.emit('player_powerup', { type: pw.type })
            this.spawnExplosion(pw.x, pw.y, 8, false)
          }
        }

        this.dummy.position.set(pw.x, pw.y, 0)
        this.dummy.rotation.set(pw.rot, pw.rot, pw.rot)
        this.dummy.scale.setScalar(1)
        this.dummy.updateMatrix()
        this.powerupMesh.setMatrixAt(i, this.dummy.matrix)
        pwUpdated = true
      }
      if (pwUpdated) {
        this.powerupMesh.instanceMatrix.needsUpdate = true
      }
    }
  }
}
