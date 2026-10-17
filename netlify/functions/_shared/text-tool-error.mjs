/** A text tool failure whose message is safe to show the teacher as is. */
export class TextToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TextToolError';
  }
}
