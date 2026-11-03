'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AddressFields {
  recipient_name: string;
  phone: string;
  zip_code: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement: string;
}

export const EMPTY_ADDRESS: AddressFields = {
  recipient_name: '', phone: '', zip_code: '', state: '', city: '',
  neighborhood: '', street: '', number: '', complement: '',
};

export const BR_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export function formatZip(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function AddressForm({
  value, onChange, disabled,
}: { value: AddressFields; onChange: (v: AddressFields) => void; disabled?: boolean }) {
  const set = (k: keyof AddressFields, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-6 space-y-1.5">
        <Label htmlFor="recipient_name">Nome do destinatário</Label>
        <Input id="recipient_name" autoComplete="name" value={value.recipient_name} disabled={disabled}
          onChange={(e) => set('recipient_name', e.target.value)} className="h-12" />
      </div>
      <div className="col-span-6 space-y-1.5 sm:col-span-3">
        <Label htmlFor="phone">Telefone</Label>
        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={value.phone} disabled={disabled}
          onChange={(e) => set('phone', formatPhone(e.target.value))} className="h-12" />
      </div>
      <div className="col-span-3 space-y-1.5 sm:col-span-2">
        <Label htmlFor="zip_code">CEP</Label>
        <Input id="zip_code" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={value.zip_code} disabled={disabled}
          onChange={(e) => set('zip_code', formatZip(e.target.value))} className="h-12" />
      </div>
      <div className="col-span-3 space-y-1.5 sm:col-span-1">
        <Label htmlFor="state">Estado</Label>
        <select id="state" value={value.state} disabled={disabled} onChange={(e) => set('state', e.target.value)}
          className="flex h-12 w-full rounded-xl border border-input bg-white/[0.03] px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">UF</option>
          {BR_STATES.map((s) => <option key={s} value={s} className="bg-card">{s}</option>)}
        </select>
      </div>
      <div className="col-span-6 space-y-1.5 sm:col-span-3">
        <Label htmlFor="city">Cidade</Label>
        <Input id="city" autoComplete="address-level2" value={value.city} disabled={disabled}
          onChange={(e) => set('city', e.target.value)} className="h-12" />
      </div>
      <div className="col-span-6 space-y-1.5 sm:col-span-3">
        <Label htmlFor="neighborhood">Bairro</Label>
        <Input id="neighborhood" value={value.neighborhood} disabled={disabled}
          onChange={(e) => set('neighborhood', e.target.value)} className="h-12" />
      </div>
      <div className="col-span-4 space-y-1.5 sm:col-span-4">
        <Label htmlFor="street">Rua</Label>
        <Input id="street" autoComplete="address-line1" value={value.street} disabled={disabled}
          onChange={(e) => set('street', e.target.value)} className="h-12" />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="number">Número</Label>
        <Input id="number" value={value.number} disabled={disabled}
          onChange={(e) => set('number', e.target.value)} className="h-12" />
      </div>
      <div className="col-span-6 space-y-1.5">
        <Label htmlFor="complement">Complemento (opcional)</Label>
        <Input id="complement" autoComplete="address-line2" value={value.complement} disabled={disabled}
          onChange={(e) => set('complement', e.target.value)} className="h-12" />
      </div>
    </div>
  );
}
