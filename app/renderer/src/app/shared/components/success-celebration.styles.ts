/**
 * Success Celebration Component Styles
 */

export const successCelebrationStyles = [
  `
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: var(--z-modal);
      pointer-events: none;
    }

    .celebration-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(8px);
      pointer-events: auto;
      animation: fade-in var(--duration-normal) var(--ease-out);
    }

    .celebration--dismissing {
      animation: fade-out var(--duration-normal) var(--ease-in) forwards;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    /* Confetti */
    .confetti-container {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .confetti-piece {
      position: absolute;
      left: 50%;
      top: 40%;
      width: var(--confetti-size);
      height: var(--confetti-size);
      background: var(--confetti-color);
      border-radius: 2px;
      animation: confetti-fall 3s var(--ease-out) forwards;
      animation-delay: calc(var(--confetti-delay) * 1ms);
      opacity: 0;
    }

    @keyframes confetti-fall {
      0% {
        transform: translate(0, 0) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translate(calc(var(--confetti-x) * 3), calc(var(--confetti-y) * 3 + 300px))
          rotate(calc(var(--confetti-rotation) * 3));
        opacity: 0;
      }
    }

    /* Main content card */
    .celebration-content {
      position: relative;
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: 28px;
      padding: var(--space-8) var(--space-6);
      text-align: center;
      box-shadow: var(--shadow-xl);
      max-width: 420px;
      width: 90%;
      animation: content-pop var(--duration-smooth) var(--ease-spring);
      will-change: transform;
    }

    @keyframes content-pop {
      0% { transform: scale(0.88); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }

    /* Checkmark */
    .checkmark-container {
      position: relative;
      width: 80px;
      height: 80px;
      margin: 0 auto var(--space-6);
    }

    .checkmark {
      width: 100%;
      height: 100%;
      display: block;
    }

    .checkmark__circle {
      stroke: var(--color-success);
      stroke-width: 3;
      stroke-dasharray: 166;
      stroke-dashoffset: 166;
      stroke-linecap: round;
      animation: checkmark-circle var(--duration-smooth) var(--ease-out) forwards;
    }

    @keyframes checkmark-circle {
      0% { stroke-dashoffset: 166; transform: rotate(-90deg); }
      100% { stroke-dashoffset: 0; transform: rotate(0); }
    }

    .checkmark__check {
      stroke: var(--color-success);
      stroke-width: 4;
      stroke-dasharray: 48;
      stroke-dashoffset: 48;
      stroke-linecap: round;
      stroke-linejoin: round;
      animation: checkmark-draw 0.35s var(--ease-spring) 0.35s forwards;
    }

    @keyframes checkmark-draw {
      0% { stroke-dashoffset: 48; }
      100% { stroke-dashoffset: 0; }
    }

    /* Pulse rings */
    .pulse-ring {
      position: absolute;
      inset: -10px;
      border: 3px solid var(--color-success);
      border-radius: var(--radius-full);
      opacity: 0;
      animation: pulse-ring 2s var(--ease-out) infinite;
    }

    .pulse-ring--delay {
      animation-delay: 0.5s;
    }

    @keyframes pulse-ring {
      0% { transform: scale(0.8); opacity: 0.5; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    /* Text content */
    .text-content {
      margin-bottom: var(--space-6);
    }

    .celebration-title {
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      margin: 0 0 var(--space-3) 0;
      line-height: var(--line-height-tight);
    }

    .celebration-message {
      font-size: var(--font-size-base);
      color: var(--color-text-secondary);
      margin: 0;
      line-height: var(--line-height-relaxed);
    }

    /* Progress bar */
    .progress-container {
      width: 100%;
      height: 4px;
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-full);
      overflow: hidden;
      margin-bottom: var(--space-6);
    }

    .progress-bar {
      height: 100%;
      background: var(--gradient-primary);
      border-radius: var(--radius-full);
      animation: progress-shrink linear forwards;
      transform-origin: left;
    }

    .progress-bar--paused {
      animation-play-state: paused;
    }

    @keyframes progress-shrink {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    /* Dismiss button */
    .dismiss-button {
      padding: var(--space-3) var(--space-6);
      background: var(--color-brand-primary);
      border: none;
      border-radius: var(--radius-full);
      color: white;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition:
        transform var(--duration-micro) var(--ease-snappy),
        background-color var(--duration-fast) var(--ease-snappy),
        box-shadow var(--duration-fast) var(--ease-snappy);
      box-shadow: var(--shadow-brand-sm);
    }

    .dismiss-button:hover {
      background: var(--color-brand-primary-hover);
      transform: translateY(-1px);
      box-shadow: var(--shadow-brand-md);
    }

    .dismiss-button:active {
      transform: scale(0.98);
    }

    .dismiss-button:focus-visible {
      outline: none;
      box-shadow: var(--shadow-focus-ring);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .celebration-container,
      .celebration-content,
      .checkmark__circle,
      .checkmark__check,
      .confetti-piece,
      .pulse-ring {
        animation: none;
      }

      .checkmark__circle { stroke-dashoffset: 0; }
      .checkmark__check { stroke-dashoffset: 0; }
      .confetti-piece { display: none; }
    }
  `,
];
