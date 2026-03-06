/*
 * Derived from:
 * - pitchy 4.1.0, https://github.com/ianprime0509/pitchy, MIT
 * - fft.js 4.0.4, https://github.com/indutny/fft.js, MIT
 *
 * This file vendors the minimal browser runtime needed by the local tuner so
 * the static Hugo site does not depend on a CDN or JS bundler.
 */

function ceilPow2(value) {
  let next = value - 1;
  next |= next >> 1;
  next |= next >> 2;
  next |= next >> 4;
  next |= next >> 8;
  next |= next >> 16;
  next += 1;
  return next;
}

class FFT {
  constructor(size) {
    this.size = size | 0;
    if (this.size <= 1 || (this.size & (this.size - 1)) !== 0) {
      throw new Error('FFT size must be a power of two and bigger than 1');
    }

    this._csize = size << 1;

    const table = new Array(this.size * 2);
    for (let index = 0; index < table.length; index += 2) {
      const angle = Math.PI * index / this.size;
      table[index] = Math.cos(angle);
      table[index + 1] = -Math.sin(angle);
    }
    this.table = table;

    let power = 0;
    for (let count = 1; this.size > count; count <<= 1) {
      power += 1;
    }

    this._width = power % 2 === 0 ? power - 1 : power;
    this._bitrev = new Array(1 << this._width);
    for (let index = 0; index < this._bitrev.length; index += 1) {
      this._bitrev[index] = 0;
      for (let shift = 0; shift < this._width; shift += 2) {
        const revShift = this._width - shift - 2;
        this._bitrev[index] |= ((index >>> shift) & 3) << revShift;
      }
    }

    this._out = null;
    this._data = null;
    this._inv = 0;
  }

  completeSpectrum(spectrum) {
    const size = this._csize;
    const half = size >>> 1;
    for (let index = 2; index < half; index += 2) {
      spectrum[size - index] = spectrum[index];
      spectrum[size - index + 1] = -spectrum[index + 1];
    }
  }

  realTransform(out, data) {
    if (out === data) {
      throw new Error('Input and output buffers must be different');
    }

    this._out = out;
    this._data = data;
    this._inv = 0;
    this._realTransform4();
    this._out = null;
    this._data = null;
  }

  inverseTransform(out, data) {
    if (out === data) {
      throw new Error('Input and output buffers must be different');
    }

    this._out = out;
    this._data = data;
    this._inv = 1;
    this._transform4();
    for (let index = 0; index < out.length; index += 1) {
      out[index] /= this.size;
    }
    this._out = null;
    this._data = null;
  }

  _transform4() {
    const out = this._out;
    const size = this._csize;
    let width = this._width;
    let step = 1 << width;
    let len = (size / step) << 1;

    if (len === 4) {
      for (let outOff = 0, block = 0; outOff < size; outOff += len, block += 1) {
        this._singleTransform2(outOff, this._bitrev[block], step);
      }
    } else {
      for (let outOff = 0, block = 0; outOff < size; outOff += len, block += 1) {
        this._singleTransform4(outOff, this._bitrev[block], step);
      }
    }

    const inv = this._inv ? -1 : 1;
    const table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = (size / step) << 1;
      const quarterLen = len >>> 2;

      for (let outOff = 0; outOff < size; outOff += len) {
        const limit = outOff + quarterLen;
        for (let index = outOff, tableIndex = 0; index < limit; index += 2, tableIndex += step) {
          const A = index;
          const B = A + quarterLen;
          const C = B + quarterLen;
          const D = C + quarterLen;

          const Ar = out[A];
          const Ai = out[A + 1];
          const Br = out[B];
          const Bi = out[B + 1];
          const Cr = out[C];
          const Ci = out[C + 1];
          const Dr = out[D];
          const Di = out[D + 1];

          const tableBr = table[tableIndex];
          const tableBi = inv * table[tableIndex + 1];
          const MBr = Br * tableBr - Bi * tableBi;
          const MBi = Br * tableBi + Bi * tableBr;

          const tableCr = table[2 * tableIndex];
          const tableCi = inv * table[2 * tableIndex + 1];
          const MCr = Cr * tableCr - Ci * tableCi;
          const MCi = Cr * tableCi + Ci * tableCr;

          const tableDr = table[3 * tableIndex];
          const tableDi = inv * table[3 * tableIndex + 1];
          const MDr = Dr * tableDr - Di * tableDi;
          const MDi = Dr * tableDi + Di * tableDr;

          const T0r = Ar + MCr;
          const T0i = Ai + MCi;
          const T1r = Ar - MCr;
          const T1i = Ai - MCi;
          const T2r = MBr + MDr;
          const T2i = MBi + MDi;
          const T3r = inv * (MBr - MDr);
          const T3i = inv * (MBi - MDi);

          out[A] = T0r + T2r;
          out[A + 1] = T0i + T2i;
          out[B] = T1r + T3i;
          out[B + 1] = T1i - T3r;
          out[C] = T0r - T2r;
          out[C + 1] = T0i - T2i;
          out[D] = T1r - T3i;
          out[D + 1] = T1i + T3r;
        }
      }
    }
  }

  _singleTransform2(outOff, off, step) {
    const out = this._out;
    const data = this._data;

    const evenR = data[off];
    const evenI = data[off + 1];
    const oddR = data[off + step];
    const oddI = data[off + step + 1];

    out[outOff] = evenR + oddR;
    out[outOff + 1] = evenI + oddI;
    out[outOff + 2] = evenR - oddR;
    out[outOff + 3] = evenI - oddI;
  }

  _singleTransform4(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const inv = this._inv ? -1 : 1;
    const step2 = step * 2;
    const step3 = step * 3;

    const Ar = data[off];
    const Ai = data[off + 1];
    const Br = data[off + step];
    const Bi = data[off + step + 1];
    const Cr = data[off + step2];
    const Ci = data[off + step2 + 1];
    const Dr = data[off + step3];
    const Di = data[off + step3 + 1];

    const T0r = Ar + Cr;
    const T0i = Ai + Ci;
    const T1r = Ar - Cr;
    const T1i = Ai - Ci;
    const T2r = Br + Dr;
    const T2i = Bi + Di;
    const T3r = inv * (Br - Dr);
    const T3i = inv * (Bi - Di);

    out[outOff] = T0r + T2r;
    out[outOff + 1] = T0i + T2i;
    out[outOff + 2] = T1r + T3i;
    out[outOff + 3] = T1i - T3r;
    out[outOff + 4] = T0r - T2r;
    out[outOff + 5] = T0i - T2i;
    out[outOff + 6] = T1r - T3i;
    out[outOff + 7] = T1i + T3r;
  }

  _realTransform4() {
    const out = this._out;
    const size = this._csize;
    let width = this._width;
    let step = 1 << width;
    let len = (size / step) << 1;

    if (len === 4) {
      for (let outOff = 0, block = 0; outOff < size; outOff += len, block += 1) {
        this._singleRealTransform2(outOff, this._bitrev[block] >>> 1, step >>> 1);
      }
    } else {
      for (let outOff = 0, block = 0; outOff < size; outOff += len, block += 1) {
        this._singleRealTransform4(outOff, this._bitrev[block] >>> 1, step >>> 1);
      }
    }

    const inv = this._inv ? -1 : 1;
    const table = this.table;
    for (step >>= 2; step >= 2; step >>= 2) {
      len = (size / step) << 1;
      const halfLen = len >>> 1;
      const quarterLen = halfLen >>> 1;
      const hquarterLen = quarterLen >>> 1;

      for (let outOff = 0; outOff < size; outOff += len) {
        for (let index = 0, tableIndex = 0; index <= hquarterLen; index += 2, tableIndex += step) {
          const A = outOff + index;
          const B = A + quarterLen;
          const C = B + quarterLen;
          const D = C + quarterLen;

          const Ar = out[A];
          const Ai = out[A + 1];
          const Br = out[B];
          const Bi = out[B + 1];
          const Cr = out[C];
          const Ci = out[C + 1];
          const Dr = out[D];
          const Di = out[D + 1];

          const tableBr = table[tableIndex];
          const tableBi = inv * table[tableIndex + 1];
          const MBr = Br * tableBr - Bi * tableBi;
          const MBi = Br * tableBi + Bi * tableBr;

          const tableCr = table[2 * tableIndex];
          const tableCi = inv * table[2 * tableIndex + 1];
          const MCr = Cr * tableCr - Ci * tableCi;
          const MCi = Cr * tableCi + Ci * tableCr;

          const tableDr = table[3 * tableIndex];
          const tableDi = inv * table[3 * tableIndex + 1];
          const MDr = Dr * tableDr - Di * tableDi;
          const MDi = Dr * tableDi + Di * tableDr;

          const T0r = Ar + MCr;
          const T0i = Ai + MCi;
          const T1r = Ar - MCr;
          const T1i = Ai - MCi;
          const T2r = MBr + MDr;
          const T2i = MBi + MDi;
          const T3r = inv * (MBr - MDr);
          const T3i = inv * (MBi - MDi);

          out[A] = T0r + T2r;
          out[A + 1] = T0i + T2i;
          out[B] = T1r + T3i;
          out[B + 1] = T1i - T3r;

          if (index === 0) {
            out[C] = T0r - T2r;
            out[C + 1] = T0i - T2i;
            continue;
          }

          if (index === hquarterLen) {
            continue;
          }

          const ST0r = T1r;
          const ST0i = -T1i;
          const ST1r = T0r;
          const ST1i = -T0i;
          const ST2r = -inv * T3i;
          const ST2i = -inv * T3r;
          const ST3r = -inv * T2i;
          const ST3i = -inv * T2r;

          const SA = outOff + quarterLen - index;
          const SB = outOff + halfLen - index;
          out[SA] = ST0r + ST2r;
          out[SA + 1] = ST0i + ST2i;
          out[SB] = ST1r + ST3i;
          out[SB + 1] = ST1i - ST3r;
        }
      }
    }
  }

  _singleRealTransform2(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const evenR = data[off];
    const oddR = data[off + step];

    out[outOff] = evenR + oddR;
    out[outOff + 1] = 0;
    out[outOff + 2] = evenR - oddR;
    out[outOff + 3] = 0;
  }

  _singleRealTransform4(outOff, off, step) {
    const out = this._out;
    const data = this._data;
    const inv = this._inv ? -1 : 1;
    const step2 = step * 2;
    const step3 = step * 3;

    const Ar = data[off];
    const Br = data[off + step];
    const Cr = data[off + step2];
    const Dr = data[off + step3];

    const T0r = Ar + Cr;
    const T1r = Ar - Cr;
    const T2r = Br + Dr;
    const T3r = inv * (Br - Dr);

    out[outOff] = T0r + T2r;
    out[outOff + 1] = 0;
    out[outOff + 2] = T1r;
    out[outOff + 3] = -T3r;
    out[outOff + 4] = T0r - T2r;
    out[outOff + 5] = 0;
    out[outOff + 6] = T1r;
    out[outOff + 7] = T3r;
  }
}

function getKeyMaximumIndices(input) {
  const keyIndices = [];
  let lookingForMaximum = false;
  let max = -Infinity;
  let maxIndex = -1;

  for (let index = 1; index < input.length - 1; index += 1) {
    if (input[index - 1] <= 0 && input[index] > 0) {
      lookingForMaximum = true;
      maxIndex = index;
      max = input[index];
    } else if (input[index - 1] > 0 && input[index] <= 0) {
      lookingForMaximum = false;
      if (maxIndex !== -1) {
        keyIndices.push(maxIndex);
      }
    } else if (lookingForMaximum && input[index] > max) {
      max = input[index];
      maxIndex = index;
    }
  }

  return keyIndices;
}

function refineResultIndex(index, data) {
  const x0 = index - 1;
  const x1 = index;
  const x2 = index + 1;
  const y0 = data[x0];
  const y1 = data[x1];
  const y2 = data[x2];
  const a = y0 / 2 - y1 + y2 / 2;
  const b = -(y0 / 2) * (x1 + x2) + y1 * (x0 + x2) - (y2 / 2) * (x0 + x1);
  const c = (y0 * x1 * x2) / 2 - y1 * x0 * x2 + (y2 * x0 * x1) / 2;
  const xMax = -b / (2 * a);
  const yMax = a * xMax * xMax + b * xMax + c;
  return [xMax, yMax];
}

class Autocorrelator {
  static forFloat32Array(inputLength) {
    return new Autocorrelator(inputLength, (length) => new Float32Array(length));
  }

  constructor(inputLength, bufferSupplier) {
    if (inputLength < 1) {
      throw new Error('Input length must be at least one');
    }

    this._inputLength = inputLength;
    this._fft = new FFT(ceilPow2(2 * inputLength));
    this._bufferSupplier = bufferSupplier;
    this._paddedInputBuffer = this._bufferSupplier(this._fft.size);
    this._transformBuffer = this._bufferSupplier(2 * this._fft.size);
    this._inverseBuffer = this._bufferSupplier(2 * this._fft.size);
  }

  get inputLength() {
    return this._inputLength;
  }

  autocorrelate(input, output = this._bufferSupplier(input.length)) {
    if (input.length !== this._inputLength) {
      throw new Error(`Input must have length ${this._inputLength} but had length ${input.length}`);
    }

    for (let index = 0; index < input.length; index += 1) {
      this._paddedInputBuffer[index] = input[index];
    }
    for (let index = input.length; index < this._paddedInputBuffer.length; index += 1) {
      this._paddedInputBuffer[index] = 0;
    }

    this._fft.realTransform(this._transformBuffer, this._paddedInputBuffer);
    this._fft.completeSpectrum(this._transformBuffer);

    for (let index = 0; index < this._transformBuffer.length; index += 2) {
      const real = this._transformBuffer[index];
      const imag = this._transformBuffer[index + 1];
      this._transformBuffer[index] = real * real + imag * imag;
      this._transformBuffer[index + 1] = 0;
    }

    this._fft.inverseTransform(this._inverseBuffer, this._transformBuffer);
    for (let index = 0; index < input.length; index += 1) {
      output[index] = this._inverseBuffer[2 * index];
    }
    return output;
  }
}

export class PitchDetector {
  static forFloat32Array(inputLength) {
    return new PitchDetector(inputLength, (length) => new Float32Array(length));
  }

  constructor(inputLength, bufferSupplier) {
    this._autocorrelator = new Autocorrelator(inputLength, bufferSupplier);
    this._nsdfBuffer = bufferSupplier(inputLength);
    this._clarityThreshold = 0.9;
    this._minVolumeAbsolute = 0.0;
    this._maxInputAmplitude = 1.0;
  }

  set clarityThreshold(threshold) {
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      throw new Error('clarityThreshold must be a number in the range (0, 1]');
    }
    this._clarityThreshold = threshold;
  }

  set minVolumeDecibels(db) {
    if (!Number.isFinite(db) || db > 0) {
      throw new Error('minVolumeDecibels must be a number <= 0');
    }
    this._minVolumeAbsolute = this._maxInputAmplitude * 10 ** (db / 10);
  }

  findPitch(input, sampleRate) {
    if (this._belowMinimumVolume(input)) {
      return [0, 0];
    }

    this._nsdf(input);
    const keyMaximumIndices = getKeyMaximumIndices(this._nsdfBuffer);
    if (!keyMaximumIndices.length) {
      return [0, 0];
    }

    const nMax = Math.max(...keyMaximumIndices.map((index) => this._nsdfBuffer[index]));
    const resultIndex = keyMaximumIndices.find(
      (index) => this._nsdfBuffer[index] >= this._clarityThreshold * nMax,
    );
    const [refinedResultIndex, clarity] = refineResultIndex(resultIndex, this._nsdfBuffer);
    return [sampleRate / refinedResultIndex, Math.min(clarity, 1)];
  }

  _belowMinimumVolume(input) {
    if (this._minVolumeAbsolute === 0) {
      return false;
    }

    let squareSum = 0;
    for (let index = 0; index < input.length; index += 1) {
      squareSum += input[index] ** 2;
    }

    return Math.sqrt(squareSum / input.length) < this._minVolumeAbsolute;
  }

  _nsdf(input) {
    this._autocorrelator.autocorrelate(input, this._nsdfBuffer);
    let m = 2 * this._nsdfBuffer[0];
    let index = 0;

    for (; index < this._nsdfBuffer.length && m > 0; index += 1) {
      this._nsdfBuffer[index] = (2 * this._nsdfBuffer[index]) / m;
      m -= input[index] ** 2 + input[input.length - index - 1] ** 2;
    }

    for (; index < this._nsdfBuffer.length; index += 1) {
      this._nsdfBuffer[index] = 0;
    }
  }
}
