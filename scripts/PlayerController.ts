
import * as THREE from 'three'
import { SoundSystem } from './SoundSystem'

export default class PlayerController {
  speed: number = 16
  hp: number = 100
  maxHp: number = 100
  weaponLevel: number = 1
  bombCooldown: number = 0
  maxBombCooldown: number = 8

  private ctx: any
  private fireTimer: number = 0
  private fireRate: number = 0.15
  private invulnerableTimer: number = 0
  private sound: SoundSystem = new SoundSystem()
  private isDead: boolean = false
  private currentBank: number = 0

  onInit(ctx: any) {
    this.ctx = ctx

    // Listen for damage from enemies or bullets
    ctx.on('player_hit', (data: { damage: number }) => {
      this.takeDamage(data ? data.damage || 15 : 15)
    })

    // Listen for powerups
    ctx.on('player_powerup', (data: { type: string }) => {
      if (data && data.type) this.applyPowerup(data.type)
    })

    // Listen for restart
    ctx.on('game_restart', () => {
      this.reset()
    })
  }

  takeDamage(amount: number) {
    if (this.isDead || this.invulnerableTimer > 0) return
    this.hp = Math.max(0, this.hp - amount)
    this.invulnerableTimer = 0.8
    this.sound.playExplosion(false)

    this.ctx.emit('player_hp_changed', { hp: this.hp, maxHp: this.maxHp })

    if (this.hp <= 0) {
      this.isDead = true
      this.sound.playExplosion(true)
      this.ctx.emit('player_died')
    }
  }

  applyPowerup(type: string) {
    this.sound.playPowerup()
    if (type === 'heal') {
      this.hp = Math.min(this.maxHp, this.hp + 35)
      this.ctx.emit('player_hp_changed', { hp: this.hp, maxHp: this.maxHp })
    } else if (type === 'upgrade') {
      this.weaponLevel = Math.min(3, this.weaponLevel + 1)
      this.ctx.emit('player_weapon_changed', { level: this.weaponLevel })
    } else if (type === 'bomb') {
      this.bombCooldown = 0
      this.ctx.emit('player_bomb_ready')
    }
  }

  reset() {
    this.hp = this.maxHp
    this.isDead = false
    this.weaponLevel = 1
    this.bombCooldown = 0
    this.invulnerableTimer = 0
    const tr = this.ctx.entity.getTransform()
    if (tr && tr.position) {
      tr.position.x = 0
      tr.position.y = -8
      tr.position.z = 0
      if (tr.rotation) {
        tr.rotation.x = 0
        tr.rotation.y = 0
        tr.rotation.z = 0
      }
    }
    this.ctx.emit('player_hp_changed', { hp: this.hp, maxHp: this.maxHp })
    this.ctx.emit('player_weapon_changed', { level: this.weaponLevel })
  }

  onUpdate(dt: number) {
    if (this.isDead) return

    // Cooldown timers
    if (this.bombCooldown > 0) {
      this.bombCooldown -= dt
      if (this.bombCooldown < 0) this.bombCooldown = 0
    }
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt
      if (this.ctx.object3D) {
        this.ctx.object3D.visible = Math.floor(this.invulnerableTimer * 12) % 2 === 0
      }
    } else if (this.ctx.object3D && !this.ctx.object3D.visible) {
      this.ctx.object3D.visible = true
    }

    if (this.fireTimer > 0) {
      this.fireTimer -= dt
    }

    // Movement
    const move = this.ctx.input.getVector('Move') || { x: 0, y: 0 }
    const tr = this.ctx.entity.getTransform()
    if (tr && tr.position) {
      let x = tr.position.x + move.x * this.speed * dt
      let y = tr.position.y + move.y * this.speed * dt

      // Clamp inside 2D orthographic screen view
      x = Math.max(-15, Math.min(15, x))
      y = Math.max(-10, Math.min(8, y))
      tr.position.x = x
      tr.position.y = y

      // Bank ship when moving left/right
      const targetBank = -move.x * 0.45
      this.currentBank += (targetBank - this.currentBank) * Math.min(1, dt * 10)
      if (tr.rotation) {
        tr.rotation.y = this.currentBank
      }

      // Shooting
      const firing = this.ctx.input.isActionPressed('Attack')
      if (firing && this.fireTimer <= 0) {
        this.fireTimer = this.fireRate
        this.sound.playLaser()
        this.ctx.emit('player_shoot', {
          x: x,
          y: y + 1.2,
          level: this.weaponLevel
        })
      }

      // Nova EMP Bomb
      const bombPressed = this.ctx.input.isActionJustPressed('Bomb')
      if (bombPressed && this.bombCooldown <= 0) {
        this.bombCooldown = this.maxBombCooldown
        this.sound.playBomb()
        this.ctx.emit('player_bomb', {
          x: x,
          y: y
        })
      }
    }
  }
}
