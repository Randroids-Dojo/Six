# Six

An experimental way to learn a standard-tuned six-string guitar by touch and sound, in six short scenes:
lanes, shapes, Height, chord recipes, moving a shape, and a first progression (Strike, Ring, Hush, Brush).

Live: https://six-guitar.vercel.app

Everything is in one file, `six.html`: HTML, CSS, JavaScript and Web Audio, with no libraries, network requests or build step.
Open it straight from disk or from the deployment. Sounds are quiet synthesized practice tones and only play after a tap.

## Checks

`qa/` drives real Google Chrome through playwright-core. `qa/instrument.js` logs every audio source start and stop and captures the final mix,
so the checks measure the actual sound: pitch against 82.406889 × 2^(Height/12), recipes, Ring starting nothing, Hush, Stop,
leaving a scene and Mute going silent, keyboard use, reduced motion, touch targets and overflow from 320 to 1920 px.

```sh
cd qa
npm install
node verify.mjs                                   # local six.html, about 2.5 minutes
SIX_URL=https://six-guitar.vercel.app/ node verify.mjs   # a deployment
node states.mjs                                   # state screenshots into qa/shots
node stress.mjs                                   # rapid input
node engines.mjs                                  # WebKit smoke test
```

Pushes to `main` deploy to Vercel automatically.
