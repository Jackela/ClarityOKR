export type FeedbackRating = 'positive' | 'negative' | null;

export interface FeedbackSubmission {
  sessionId: string;
  okrId: string;
  rating: 'positive' | 'negative';
  comment: string;
  submittedAt: string;
}
