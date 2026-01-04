export type Cmd<Msg> = {
  sub: (dispatch: (msg: Msg) => void) => Promise<void>
}

export namespace Cmd {
  export const ofSub = <Msg>(
    sub: (dispatch: (msg: Msg) => void) => Promise<void>,
  ): Cmd<Msg> => ({
    sub,
  })
}

export type ModelCmd<Model, Msg> =
  | Model
  | {
      model: Model
      cmd: Cmd<Msg>
    }
