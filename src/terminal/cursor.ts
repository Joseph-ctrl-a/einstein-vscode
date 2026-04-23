export function createCursor() {
  let pos = 0;

  return {
    get pos() {
      return pos;
    },

    reset() {
      pos = 0;
    },
    advance(n = 1) {
      pos += n;
    },
    retreat(n = 1) {
      pos -= n;
    },
    moveTo(n: number) {
      pos = n;
    },

    canMoveLeft() {
      return pos > 0;
    },
    canMoveRight(lineLength: number) {
      return pos < lineLength;
    },
  };
}

export type Cursor = ReturnType<typeof createCursor>;
