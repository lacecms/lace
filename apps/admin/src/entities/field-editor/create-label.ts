/**
 * The label inside a sentence such as "Create links": a leading capital is
 * lowered unless the word is an acronym ("SEO links" stays as it is).
 */
export function inSentence(label: string): string {
  const [first, second] = label;
  if (first === undefined || second === undefined) return label;
  return second === second.toLowerCase() && second !== second.toUpperCase()
    ? first.toLowerCase() + label.slice(1)
    : label;
}
