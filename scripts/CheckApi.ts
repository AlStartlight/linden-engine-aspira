
export default class CheckApi {
  onInit(ctx: any) {
    const tr = ctx.entity.getTransform()
    const keys = Object.keys(tr)
    throw new Error("tr keys: " + JSON.stringify(keys) + " pos: " + JSON.stringify(tr.position))
  }
}
