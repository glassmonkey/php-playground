import * as esbuild from 'esbuild'

let options = {
    entryPoints: ['src/index.tsx'],
    bundle: true,
    outdir: 'public',
}

const context = await esbuild.context(options)
const result = await context.rebuild()
console.log(result)

if (process.env.WATCH !== "true") {
    context.dispose();

} else{
    console.log("begin: watch")
    await context.watch()
}
