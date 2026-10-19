# Six

Six is a set of six short guitar lessons. You can hear each example on screen and try it on a standard-tuned guitar. The lessons cover strings and frets, chord shapes, pitch, chord recipes, moving a shape, and a first progression.

Six uses experimental names and notation. It calls strings "lanes" and numbers them from thickest (lane 1) to thinnest (lane 6), the opposite of conventional guitar string numbering. Height counts pitch in semitones above the open low E string. Recipe numbers describe distances from a chord's root; they are not fret positions.

Live: https://six-guitar.vercel.app

The lesson is in one file, `six.html`, with no build step or runtime network requests. Open it from disk or use the live site. Audio examples are quiet synthesized practice tones and start after a tap.

## Checks

`qa/` uses playwright-core to test the lesson in Chrome. The checks measure output pitch, chord recipes and playback; they also cover keyboard use, reduced motion, touch targets, and layout widths from 320 to 1920 px.

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
