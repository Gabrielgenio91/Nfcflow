'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';

export interface CartLine {
  product_id: string;
  quantity: number;
}

interface CartContextValue {
  items: CartLine[];
  count: number;
  add: (productId: string, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue>({
  items: [], count: 0, add: () => {}, setQuantity: () => {}, remove: () => {}, clear: () => {},
});

/** O carrinho guarda só IDs e quantidades (por usuário). Preços e estoque SEMPRE vêm do servidor. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartLine[]>([]);
  const loadedFor = useRef<string | null>(null);
  const key = user ? `nfcflow:cart:${user.id}` : null;

  useEffect(() => {
    if (!key) { setItems([]); loadedFor.current = null; return; }
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      setItems(
        Array.isArray(parsed)
          ? parsed.filter((l) => l && typeof l.product_id === 'string' && Number.isInteger(l.quantity) && l.quantity > 0)
          : []
      );
    } catch {
      setItems([]);
    }
    loadedFor.current = key;
  }, [key]);

  useEffect(() => {
    if (!key || loadedFor.current !== key) return;
    try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* storage cheio/indisponível */ }
  }, [items, key]);

  const add = useCallback((productId: string, quantity: number) => {
    setItems((prev) => {
      const found = prev.find((l) => l.product_id === productId);
      if (found) return prev.map((l) => (l.product_id === productId ? { ...l, quantity: l.quantity + quantity } : l));
      return [...prev, { product_id: productId, quantity }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.product_id !== productId)
        : prev.map((l) => (l.product_id === productId ? { ...l, quantity } : l))
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((l) => l.product_id !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, count: items.reduce((s, l) => s + l.quantity, 0), add, setQuantity, remove, clear }),
    [items, add, setQuantity, remove, clear]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
