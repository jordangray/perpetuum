'use strict';


/* perpetuum - Generate and play a variation on a theme by
 *             Simon Jeffes in his piece Perpetuum Mobile.
 * 
 * Example usage:
 *
 *   const shortScore = {
 *     barsPerPart : 2,
 *     tempo       : 120,
 *     melody      : generate(),
 *     variation   : generate(),
 *     instrument  : 'piano'
 *   };
 *   
 *   play(shortScore);
 */


/* A list of notes that can be used for treble melody.
 * (Bass notes use treble / 2, i.e. an octave lower.)
 */
export const notes = {
  c4: 261.6,
  d4: 293.7,
  e4: 329.6,
  f4: 349.2,
  g4: 392.0,
  a4: 440.0,
  b4: 493.9,
  c5: 523.3
};

const audioCtx = new AudioContext;


/* Generate a melody of specified length. */
export function generate(len = 15) {
  const melody = [];
  const keys = Object.keys(notes);
  const max = keys.length;

  while (len--) {
    let rand = Math.floor(Math.random() * max);
    melody.push(keys[rand]);
  }

  return melody;
}


/* Play a "score":
 *   - barsPerPart : number of bars in each part of the piece.
 *   - tempo       : the tempo of the piece in beats per second.
 *   - melody      : The main melody of the piece.
 *   - variation   : The bass clef variation introduced in the final part.
 *   - instrument  : A named instrument with which to play the piece.
 */
export function play({
  barsPerPart = 4,
  tempo       = 90,
  melody      = generate(),
  variation   = generate(),
  instrument  = 'piano'
}) {
  
  const parts = 3;
  
  // Timings and bar counts
  const quaverDuration = 60 / (tempo * 4);
  const barDuration    = quaverDuration * melody.length;
  const partDuration   = barDuration * barsPerPart;
  const totalBars      = barsPerPart * parts;
  const lastPartBars   = totalBars - barsPerPart;
  
  // ADSR envelope (will eventually move into instrument JSON)
  const attack  = 0.05;
  const decay   = 0.8;
  const sustain = 0;
  const release = 0.05;
  
  // We use simple oscillators and a gain node to make notes
  const treble = audioCtx.createOscillator();
  const bass   = audioCtx.createOscillator();
  const gain   = audioCtx.createGain();
  
  for (let i = 0; i < totalBars * melody.length; i++) {
    
    const startTime = i * quaverDuration;
    const note      = melody[i % melody.length];
    const bar       = (i / melody.length) | 0;

    // Main melody
    treble.frequency.setValueAtTime(notes[note], startTime);

    // Bass plays main melody in second part
    if (bar >= barsPerPart  && bar < lastPartBars) {
      bass.frequency.setValueAtTime(notes[note] / 2, startTime);
    
    // Bass plays variation in third part
    } else if (bar >= lastPartBars) {
      const varNote = variation[i % variation.length];
      bass.frequency.setValueAtTime(notes[varNote] / 2, startTime);
    }
    
    // Tune gain to fit ADSR envelope
    const attackTime  = startTime + (quaverDuration * attack);
    const releaseTime = startTime + quaverDuration - (quaverDuration * release);
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, attackTime);
    gain.gain.setTargetAtTime(sustain, attackTime, quaverDuration * decay);
    gain.gain.cancelScheduledValues(releaseTime);
    gain.gain.setTargetAtTime(0, releaseTime, quaverDuration * release);
    
  }
  
  // Load the selected instrument's wave table
  getInstrument(instrument).then((waveTable) => {
    
    // Hook up an oscillator and start it playing
    function start(oscillator, startTime = 0) {
      oscillator.setPeriodicWave(waveTable);
      oscillator.connect(gain);
      oscillator.start(startTime);
      oscillator.stop(partDuration * parts);
    }
    
    // Get this party started!
    gain.connect(audioCtx.destination);
    start(treble);
    start(bass, partDuration);
  });
}


// No need to reload instruments after the first time.
const instrumentCache = {};


/* Load a named instrument's wave table.
 * Returns a Promise that resolves to the wave table.
 */
export function getInstrument(instrument) {
  return new Promise((resolve, reject) => {

    // Get it from the cache if it's already loaded
    if (instrument in instrumentCache) {
      resolve(instrumentCache[instrument]);
      return;
    }

    const url = `/instruments/${instrument}`;
    const xhr = new XMLHttpRequest;
    
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {

          const response = JSON.parse(xhr.responseText);

          const waveTable = audioCtx.createPeriodicWave(
            new Float32Array(response.imag),
            new Float32Array(response.real)
          );

          instrumentCache[instrument] = waveTable;

          resolve(waveTable);

        } else {
          reject({ error: xhr.responseText });
        }
      }
    };

    xhr.open('GET', url);
    xhr.send();

  });
}
