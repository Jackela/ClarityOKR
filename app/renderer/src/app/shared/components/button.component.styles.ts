export const buttonStyles = [
  `
    :host {
      display: inline-block;
    }

    .btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      border: none;
      border-radius: var(--radius-full);
      font-family: var(--font-family-sans);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      overflow: hidden;
      isolation: isolate;
      transition: all var(--duration-fast) var(--ease-out);
    }

    .btn:focus-visible {
      outline: none;
      box-shadow: var(--shadow-focus-ring);
    }

    .btn:disabled, .btn--disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .btn--loading { cursor: wait; }

    .btn__spinner {
      position: absolute;
      width: 20px;
      height: 20px;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-right-color: currentColor;
      border-radius: var(--radius-full);
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .btn__content--hidden { opacity: 0; }

    /* Sizes */
    .btn--sm {
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-size-sm);
      min-height: 36px;
    }

    .btn--md {
      padding: var(--space-3) var(--space-5);
      font-size: var(--font-size-base);
      min-height: 44px;
    }

    .btn--lg {
      padding: var(--space-4) var(--space-6);
      font-size: var(--font-size-lg);
      min-height: 52px;
    }

    /* Primary Variant */
    .btn--primary {
      background: var(--gradient-primary);
      color: white;
      box-shadow: var(--shadow-sm), 0 4px 6px -1px rgba(37, 99, 235, 0.2);
    }

    .btn--primary::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, transparent 50%);
      opacity: 0;
      transition: opacity var(--duration-fast);
      z-index: 1;
    }

    .btn--primary::after {
      content: '';
      position: absolute;
      inset: -2px;
      background: var(--gradient-primary);
      border-radius: var(--radius-full);
      opacity: 0;
      filter: blur(12px);
      z-index: -1;
      transition: opacity var(--duration-fast);
    }

    .btn--primary:not(:disabled):hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg), 0 0 30px rgba(37, 99, 235, 0.4);
    }

    .btn--primary:not(:disabled):hover::before { opacity: 1; }
    .btn--primary:not(:disabled):hover::after { opacity: 0.5; }
    .btn--primary:not(:disabled):active { transform: translateY(0); box-shadow: var(--shadow-sm); }

    /* Secondary Variant */
    .btn--secondary {
      background: var(--color-brand-primary-alpha);
      color: var(--color-brand-primary-hover);
      border: 1px solid transparent;
    }

    .btn--secondary::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, transparent 50%);
      opacity: 0;
      transition: opacity var(--duration-fast);
    }

    .btn--secondary:not(:disabled):hover {
      background: var(--color-brand-primary-alpha);
      border-color: var(--color-brand-primary-alpha);
      transform: translateY(-1px);
      box-shadow: var(--shadow-brand-sm);
    }

    .btn--secondary:not(:disabled):hover::before { opacity: 1; }
    .btn--secondary:not(:disabled):active { transform: translateY(0); }

    /* Danger Variant */
    .btn--danger {
      background: var(--color-error);
      color: white;
      box-shadow: var(--shadow-sm);
    }

    .btn--danger::after {
      content: '';
      position: absolute;
      inset: -2px;
      background: var(--color-error);
      border-radius: var(--radius-full);
      opacity: 0;
      filter: blur(12px);
      z-index: -1;
      transition: opacity var(--duration-fast);
    }

    .btn--danger:not(:disabled):hover {
      background: var(--color-error-hover);
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg), 0 0 30px rgba(239, 68, 68, 0.4);
    }

    .btn--danger:not(:disabled):hover::after { opacity: 0.5; }
    .btn--danger:not(:disabled):active { transform: translateY(0); }

    /* Ghost Variant */
    .btn--ghost {
      background: transparent;
      color: var(--color-text-secondary);
      border: 1px solid var(--color-gray-200);
    }

    .btn--ghost:not(:disabled):hover {
      background: var(--color-gray-50);
      border-color: var(--color-gray-300);
      color: var(--color-text-primary);
      transform: translateY(-1px);
    }

    .btn--ghost:not(:disabled):active {
      transform: translateY(0);
      background: var(--color-gray-100);
    }

    /* Ripple Effect */
    .btn__ripple-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      border-radius: inherit;
    }

    .ripple {
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      transform: scale(0);
      animation: ripple-animation 0.6s linear;
      pointer-events: none;
    }

    @keyframes ripple-animation {
      to { transform: scale(4); opacity: 0; }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .btn, .btn::before, .btn::after { transition: none; }
      .btn:not(:disabled):hover { transform: none; }
      .ripple { animation: none; opacity: 0.3; transform: scale(2); }
    }
  `,
];
