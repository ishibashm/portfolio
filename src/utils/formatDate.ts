import { format, parseISO } from 'date-fns';

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  return format(parseISO(dateString), 'MMMM d, yyyy');
};
