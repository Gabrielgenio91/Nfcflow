import type { TicketStatus } from '@/lib/types';

export const TICKET_STATUSES: TicketStatus[] = ['ABERTO', 'EM_ATENDIMENTO', 'RESOLVIDO', 'FECHADO'];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  ABERTO: 'Aberto',
  EM_ATENDIMENTO: 'Em atendimento',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
};

export const TICKET_STATUS_CLASS: Record<TicketStatus, string> = {
  ABERTO: 'border-warning/30 text-warning',
  EM_ATENDIMENTO: 'border-blue-400/30 text-blue-400',
  RESOLVIDO: 'border-success/30 text-success',
  FECHADO: 'border-muted-foreground/30 text-muted-foreground',
};
