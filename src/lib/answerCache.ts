import { createHash } from "node:crypto";
/** Public excerpts only. Callers must supply a canonical source question, never user context. */
export class AnswerCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  constructor(
    private capacity = 300,
    private ttl = 86400000,
  ) {}
  key(publicQuestion: string, model: string, version: string) {
    return createHash("sha256")
      .update(
        JSON.stringify([
          publicQuestion.normalize("NFKC").trim(),
          model,
          version,
        ]),
      )
      .digest("hex");
  }
  get(key: string, now = Date.now()) {
    const entry = this.values.get(key);
    if (!entry) return;
    this.values.delete(key);
    if (entry.expires <= now) return;
    this.values.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, now = Date.now()) {
    this.values.delete(key);
    this.values.set(key, { value, expires: now + this.ttl });
    while (this.values.size > this.capacity)
      this.values.delete(this.values.keys().next().value!);
  }
}
