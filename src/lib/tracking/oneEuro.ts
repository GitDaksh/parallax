/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012).
 *
 * A low-pass filter whose cutoff frequency rises with speed:
 * - when your head is still, it smooths heavily (no jitter);
 * - when you move quickly, it smooths lightly (no lag).
 */
export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly derivativeCutoff: number;
  private value: number | null = null;
  private derivative = 0;
  private lastTime = 0;

  /**
   * @param minCutoff Hz. Lower = smoother when still, but laggier.
   * @param beta How fast smoothing relaxes as speed rises. Higher = less lag when moving.
   * @param derivativeCutoff Hz. Smoothing for the speed estimate itself.
   */
  constructor(minCutoff = 1, beta = 0.08, derivativeCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
  }

  /** Feeds a new sample taken at `timeSeconds` and returns the smoothed value. */
  filter(sample: number, timeSeconds: number): number {
    if (this.value === null) {
      this.value = sample;
      this.lastTime = timeSeconds;
      return sample;
    }

    const dt = Math.max(timeSeconds - this.lastTime, 1e-3);
    this.lastTime = timeSeconds;

    const rawSpeed = (sample - this.value) / dt;
    this.derivative +=
      (rawSpeed - this.derivative) * alpha(dt, this.derivativeCutoff);

    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value += (sample - this.value) * alpha(dt, cutoff);
    return this.value;
  }

  /** Forgets the history, e.g. when the face is lost. */
  reset() {
    this.value = null;
    this.derivative = 0;
  }
}

/** Smoothing factor of an exponential low-pass filter with the given cutoff frequency. */
function alpha(dt: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}