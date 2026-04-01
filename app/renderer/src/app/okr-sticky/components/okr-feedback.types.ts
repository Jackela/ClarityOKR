/** Feedback rating type */
export type FeedbackRating = 'positive' | 'negative' | null;

/** Feedback submission payload */
export interface FeedbackSubmission {
  /** Associated session ID */
  sessionId: string;
  /** Associated OKR ID */
  okrId: string;
  /** User's rating (thumbs up/down) */
  rating: 'positive' | 'negative';
  /** Optional comment text */
  comment: string;
  /** Timestamp of submission */
  submittedAt: string;
}
