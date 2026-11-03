import { Badge } from '@/components/ui/badge';
import { ORDER_STATUS_CLASS, ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/orders';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={ORDER_STATUS_CLASS[status] ?? ''}>
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
