/**
 * ARIA type definitions
 */

/** Base ARIA attributes interface */
export interface AriaProps {
  /** Accessible label */
  ariaLabel?: string;
  /** ID of element describing this element */
  ariaDescribedBy?: string;
  /** Busy state indicator */
  ariaBusy?: boolean;
  /** Expanded state for expandable elements */
  ariaExpanded?: boolean;
  /** Pressed state for toggle buttons */
  ariaPressed?: boolean;
}

/** Progress indicator ARIA attributes */
export interface ProgressAriaProps {
  /** Current value */
  ariaValueNow: number;
  /** Minimum value */
  ariaValueMin: number;
  /** Maximum value */
  ariaValueMax: number;
}
