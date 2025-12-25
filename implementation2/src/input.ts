//bruh need paba naka effects to, kasi di ko alam pano
export type KeyboardInput = {
    up: boolean
    down: boolean
    left: boolean
    right: boolean
    space: boolean 
    w: boolean
    s: boolean
    a: boolean
    d: boolean
    x: boolean    
}
const currentInput: KeyboardInput = {
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
    w: false,
    s: false,
    a: false,
    d: false,
    x: false
}

window.addEventListener("keydown", (e) => {
    console.log("Key DOWN:", e.key)
    if (e.key === "ArrowUp") currentInput.up = true
    if (e.key === "ArrowDown") currentInput.down = true
    if (e.key === "ArrowLeft") currentInput.left = true
    if (e.key === "ArrowRight") currentInput.right = true
    if (e.key === " ") currentInput.space = true
    if (e.key.toLowerCase() === "w") currentInput.w = true
    if (e.key.toLowerCase() === "s") currentInput.s = true
    if (e.key.toLowerCase() === "a") currentInput.a = true
    if (e.key.toLowerCase() === "d") currentInput.d = true
    if (e.key.toLowerCase() === "x") currentInput.x = true
})

window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowUp") currentInput.up = false
    if (e.key === "ArrowDown") currentInput.down = false
    if (e.key === "ArrowLeft") currentInput.left = false
    if (e.key === "ArrowRight") currentInput.right = false
    if (e.key === " ") currentInput.space = false
    if (e.key.toLowerCase() === "w") currentInput.w = false
    if (e.key.toLowerCase() === "s") currentInput.s = false
    if (e.key.toLowerCase() === "a") currentInput.a = false
    if (e.key.toLowerCase() === "d") currentInput.d = false
    if (e.key.toLowerCase() === "x") currentInput.x = false

})

export const getInputKey = (): KeyboardInput => {
    return { ...currentInput }
}