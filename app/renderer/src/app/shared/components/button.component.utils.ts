/**
 * Button component utility functions.
 */

/**
 * Create ripple animation at click position.
 *
 * @param buttonElement - The native button element
 * @param event - The mouse event triggering the ripple
 */
export function createRipple(buttonElement: HTMLButtonElement, event: MouseEvent): void {
  const rect = buttonElement.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  const ripple = document.createElement('span');
  ripple.classList.add('ripple');
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  const container = buttonElement.querySelector('.btn__ripple-container');
  if (container) {
    container.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
      ripple.remove();
    }, 600);
  }
}
