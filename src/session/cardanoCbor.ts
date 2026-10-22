// CIP-30 signTx returns a CBOR witness set, while submitTx needs the whole transaction.
function cborEnd(hex: string, start: number): number {
  const head = parseInt(hex.slice(start, start + 2), 16);
  if (!Number.isFinite(head)) throw new Error("Invalid Cardano CBOR");
  const major = head >> 5, info = head & 31;
  let at = start + 2;
  let count = info;
  if (info >= 24 && info <= 27) {
    const bytes = 2 ** (info - 24);
    count = parseInt(hex.slice(at, at + bytes * 2), 16);
    at += bytes * 2;
  } else if (info === 31) {
    while (hex.slice(at, at + 2) !== "ff") {
      if (at >= hex.length) throw new Error("Truncated Cardano CBOR");
      at = cborEnd(hex, at);
    }
    return at + 2;
  }
  if (!Number.isSafeInteger(count)) throw new Error("Invalid Cardano CBOR length");
  if (major === 2 || major === 3) at += count * 2;
  if (major === 4 || major === 5) for (let i = 0; i < count * (major === 5 ? 2 : 1); i++) at = cborEnd(hex, at);
  if (major === 6) at = cborEnd(hex, at);
  if (at > hex.length) throw new Error("Truncated Cardano CBOR");
  return at;
}

export function attachCardanoWitness(txHex: string, witnessHex: string): string {
  const head = parseInt(txHex.slice(0, 2), 16);
  if (head >> 5 !== 4 || (head & 31) < 2) throw new Error("Invalid Cardano transaction array");
  const bodyStart = head < 0x98 ? 2 : head === 0x98 ? 4 : 6;
  const witnessStart = cborEnd(txHex, bodyStart);
  const witnessEnd = cborEnd(txHex, witnessStart);
  if (txHex.slice(witnessStart, witnessEnd) !== "a0") throw new Error("Cardano transaction already has witnesses");
  if (!witnessHex || cborEnd(witnessHex, 0) !== witnessHex.length) throw new Error("Invalid Cardano witness set");
  return txHex.slice(0, witnessStart) + witnessHex + txHex.slice(witnessEnd);
}

