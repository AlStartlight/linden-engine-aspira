
import * as THREE from 'three'

export default class TestScript {
  onInit(ctx: any) {
    ctx.log('TestScript init, THREE has:', typeof THREE.InstancedMesh)
  }
}
