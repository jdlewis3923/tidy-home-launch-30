// Tidy — small common-name diminutive lookup for review attribution.
// Maps a diminutive/nickname (lowercase) -> canonical first name(s) it maps to.
// Used bidirectionally: two first tokens "match" if they are equal, or if
// either appears in the other's canonical set.
export const DIMINUTIVES: Record<string, string[]> = {
  bob: ['robert'], rob: ['robert'], bobby: ['robert'], robbie: ['robert'],
  bill: ['william'], billy: ['william'], will: ['william'], liam: ['william'],
  dick: ['richard'], rich: ['richard'], richie: ['richard'], rick: ['richard'], ricky: ['richard'],
  jim: ['james'], jimmy: ['james'], jamie: ['james'],
  mike: ['michael'], mikey: ['michael'], mick: ['michael'],
  dave: ['david'], davey: ['david'],
  tom: ['thomas'], tommy: ['thomas'],
  tony: ['anthony'],
  chris: ['christopher', 'christine', 'christina'],
  matt: ['matthew'], matty: ['matthew'],
  nate: ['nathaniel', 'nathan'], nathan: ['nathaniel'],
  alex: ['alexander', 'alexandra', 'alexis'],
  sam: ['samuel', 'samantha'], sammy: ['samuel', 'samantha'],
  ben: ['benjamin'], benny: ['benjamin'],
  joe: ['joseph'], joey: ['joseph'],
  ed: ['edward', 'edmund'], eddie: ['edward'], teddy: ['theodore', 'edward'], ted: ['theodore', 'edward'],
  dan: ['daniel'], danny: ['daniel'],
  greg: ['gregory'],
  steve: ['steven', 'stephen'],
  ken: ['kenneth'], kenny: ['kenneth'],
  jon: ['jonathan'], johnny: ['john', 'jonathan'],
  andy: ['andrew'], drew: ['andrew'],
  pat: ['patrick', 'patricia'],
  larry: ['lawrence'],
  frank: ['francis', 'franklin'],
  gabe: ['gabriel'],
  zack: ['zachary'], zach: ['zachary'],
  liz: ['elizabeth'], beth: ['elizabeth'], eliza: ['elizabeth'], betty: ['elizabeth'], lisa: ['elizabeth'],
  kate: ['katherine', 'kathryn', 'katharine'], katie: ['katherine', 'kathryn'], kathy: ['katherine'], kat: ['katherine'],
  sue: ['susan'], susie: ['susan'],
  peggy: ['margaret'], maggie: ['margaret'], meg: ['margaret'],
  patty: ['patricia'], trish: ['patricia'],
  jen: ['jennifer'], jenny: ['jennifer'],
  cathy: ['catherine'], cat: ['catherine'],
  becky: ['rebecca'],
  cindy: ['cynthia'],
  debbie: ['deborah'], deb: ['deborah'],
  jess: ['jessica'], jessie: ['jessica'],
  nancy: ['ann', 'agnes'],
  vicky: ['victoria'],
  amy: ['amelia'],
  gabby: ['gabriela', 'gabrielle'],
  abby: ['abigail'],
  mandy: ['amanda'],
  cammy: ['camille', 'camilla'],
};

/** True if two first-name tokens are the same person via exact match or a known diminutive. */
export function isDiminutiveMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y || x === y) return false;
  const xCanon = DIMINUTIVES[x] ?? [];
  const yCanon = DIMINUTIVES[y] ?? [];
  if (xCanon.includes(y) || yCanon.includes(x)) return true;
  // both diminutives of the same canonical name (e.g. "liz" and "beth" -> elizabeth)
  if (xCanon.length && yCanon.length && xCanon.some((c) => yCanon.includes(c))) return true;
  return false;
}
