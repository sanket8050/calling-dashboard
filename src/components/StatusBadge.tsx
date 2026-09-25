import type { ContactStatus } from '../types';

const STATUS_LABELS: Record<ContactStatus, string> = {
  NEW: 'New',
  ASKED_FOR_RESUME: 'Asked for Resume',
  INTERESTED: 'Interested',
  CALLBACK: 'Callback',
  NO_ANSWER: 'No Answer',
  NOT_INTERESTED: 'Not Interested',
  WRONG_NUMBER: 'Wrong Number',
  NOT_RELEVANT: 'Not Relevant',
};

interface StatusBadgeProps {
  status: ContactStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`badge badge-${status}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export { STATUS_LABELS };
