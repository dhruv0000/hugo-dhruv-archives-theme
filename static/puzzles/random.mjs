function toUint32(value) {
  return value >>> 0;
}

export function hashString(value) {
  const input = `${value ?? ''}`;
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return toUint32(hash);
}

function mulberry32(seed) {
  let state = toUint32(seed);

  return () => {
    state = toUint32(state + 0x6d2b79f5);
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeededRandom(seed) {
  const next = mulberry32(hashString(seed));

  return {
    nextFloat() {
      return next();
    },
    nextInt(maxExclusive) {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) {
        return 0;
      }

      return Math.floor(next() * maxExclusive);
    },
    pick(values) {
      if (!Array.isArray(values) || !values.length) {
        return undefined;
      }

      return values[this.nextInt(values.length)];
    },
    shuffle(values) {
      const nextValues = Array.isArray(values) ? values.slice() : [];
      for (let index = nextValues.length - 1; index > 0; index -= 1) {
        const swapIndex = this.nextInt(index + 1);
        [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
      }
      return nextValues;
    },
  };
}
